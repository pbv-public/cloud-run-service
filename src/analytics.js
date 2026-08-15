import assert from 'node:assert'
import crypto, { randomUUID } from 'node:crypto'

import { DatabaseAPI } from '@pbvision/fastify-firestore-service'
import * as Sentry from '@sentry/node'
import UAParser from 'ua-parser-js'

import { isProd } from './utils.js'

// istanbul ignore next
export const mixpanelToken = isProd ? '78c48e38f59ab21c1850740e2bb4ecff' : '52bd993b07bdba759c2f141345e7c32a'

const mixpanelTrackURL = 'https://api.mixpanel.com/track'
const mixpanelUpdateProfileURLs = {
  $set: 'https://api.mixpanel.com/engage#profile-set',
  $set_once: 'https://api.mixpanel.com/engage#profile-set-once'
}

// How long to wait before re-sending a Mixpanel request that failed in a way a
// retry could fix. Short and few on purpose: this runs inside a live request,
// so the caller waits out every retry.
const MIXPANEL_RETRY_DELAYS_MS = [100, 300]

// At most one Sentry report per failure kind per window, per process. A
// Mixpanel outage affects every request we serve, so reporting each one would
// exhaust the error budget in minutes.
const ANALYTICS_FAILURE_REPORT_WINDOW_MS = 5 * 60 * 1000

const analyticsFailureLastReportedAtMs = new Map()

/**
 * Whether a Mixpanel failure should be reported to Sentry now, or suppressed
 * because an identical one was reported recently. Recording and deciding are
 * one step: a suppressed failure does not extend the window.
 *
 * @param {String} key identifies the kind of failure; failures sharing a key
 *   are suppressed as duplicates of each other
 * @param {Number} [nowMs=Date.now()] current time (injectable for tests)
 * @returns {Boolean} true if this failure should be sent to Sentry
 */
export function shouldReportAnalyticsFailure (key, nowMs = Date.now()) {
  const lastReportedAtMs = analyticsFailureLastReportedAtMs.get(key)
  if (lastReportedAtMs !== undefined &&
      nowMs - lastReportedAtMs < ANALYTICS_FAILURE_REPORT_WINDOW_MS) {
    return false
  }
  analyticsFailureLastReportedAtMs.set(key, nowMs)
  return true
}

// Exported for tests: the suppression window outlives a single test case.
export function resetAnalyticsFailureReporting () {
  analyticsFailureLastReportedAtMs.clear()
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Analytics are only sent if the transaction commits. Aborting or throwing an
// exception from the tx will result in analytics NOT being sent to mixpanel.
export class DatabaseAPIWithAnalytics extends DatabaseAPI {
  constructor (fastify, req, reply) {
    super(fastify, req, reply)
    this.__analyticsEvents = []
    this.__analyticsUserProfileUpdates = {} // uid to $set/$set_once to changes
  }

  async postCommit (respData) {
    // send analytics events after committing
    await this.sendAnalyticsEvents()
    return super.postCommit(respData)
  }

  logAnalyticsEvent (mixpanelUserId, eventName, inputProperties = {}, deviceId = null, insertId = null) {
    if (insertId) {
      // insert id must be <= 36 chars & only have alphanumeric & hyphen chars
      insertId = crypto.createHash('md5').update(insertId).digest('hex')
    } else {
      insertId = randomUUID()
    }

    this.__analyticsEvents.push({
      event: eventName,
      properties: addSenderId(mixpanelUserId, {
        ...inputProperties,
        token: mixpanelToken,
        time: new Date().getTime(),
        $insert_id: insertId,
        ip: this.req.ip
      }, deviceId)
    })
  }

  updateAnalyticsUserProfile (uid, key, value, method = '$set') {
    assert(mixpanelUpdateProfileURLs[method])
    // should be our user id not a device id... profile data is not recommended
    // for anonymous users
    assert(!uid.startsWith('$device:'))
    if (!this.__analyticsUserProfileUpdates[method]) {
      this.__analyticsUserProfileUpdates[method] = {}
    }
    const updatesByUser = this.__analyticsUserProfileUpdates[method]
    if (!updatesByUser[uid]) {
      updatesByUser[uid] = {}
    }
    updatesByUser[uid][key] = value
  }

  /**
   * Flushes everything queued by logAnalyticsEvent() and
   * updateAnalyticsUserProfile() to Mixpanel.
   *
   * Never throws. This normally runs from postCommit(), i.e. after the
   * transaction has already committed, so a Mixpanel failure here means the
   * request did its work and only the telemetry about it was lost. It used to
   * reject instead, which handed the caller a 500 (transport failure) or a 551
   * (bad response) for a request that had succeeded: the write landed and the
   * app still showed an error, and Mixpanel answering "temporary error ... try
   * again in 30 seconds" was enough to do it. Failures are retried, then
   * reported to Sentry as a warning and dropped.
   */
  async sendAnalyticsEvents () {
    const events = this.__analyticsEvents
    this.__analyticsEvents = []
    const userProfileUpdates = this.__analyticsUserProfileUpdates
    this.__analyticsUserProfileUpdates = {}

    const calls = []
    if (events.length) {
      const uaData = {}
      const parser = new UAParser(this.req.headers['user-agent'])
      const browser = parser.getBrowser()
      if (browser.name) {
        uaData.$browser = browser.name
        // istanbul ignore else
        if (browser.version) {
          uaData.$browser += ` ${browser.version}`
        }
      }
      const device = parser.getDevice()
      const $device = [device.vendor, device.model, device.type].filter(x => !!x).join(' ')
      if ($device) {
        uaData.$device = $device
      }
      const os = parser.getOS()
      if (os.name) {
        uaData.$os = os.name
        // istanbul ignore else
        if (os.version) {
          uaData.$os += ` ${os.version}`
        }
      }

      for (const x of events) {
        Object.assign(x.properties, uaData)
      }
      // send all the events in one Mixpanel API call
      calls.push(this.__makeMixpanelCall('track', mixpanelTrackURL, events))
    }
    for (const type of Object.keys(userProfileUpdates)) {
      const updatesByUser = userProfileUpdates[type]
      const body = []
      for (const uid of Object.keys(updatesByUser)) {
        const updates = updatesByUser[uid]
        body.push({
          $distinct_id: uid,
          $token: mixpanelToken,
          [type]: updates
        })
      }
      const url = mixpanelUpdateProfileURLs[type]
      assert(url) // make sure a valid type was passed
      calls.push(this.__makeMixpanelCall(type, url, body))
    }

    const results = await Promise.all(
      calls.map(call => this.__sendToMixpanel(call)))
    const failures = results.filter(Boolean)
    if (failures.length) {
      this.__reportAnalyticsFailures(failures)
    }
  }

  __makeMixpanelCall (type, url, body) {
    return {
      sent: { type, body },
      request: {
        method: 'POST',
        url,
        headers: { accept: 'text/plain' },
        body
      }
    }
  }

  /**
   * Sends one Mixpanel request, retrying the failures a retry can fix.
   *
   * @returns {Object|undefined} undefined if the call succeeded, otherwise a
   *   description of the final failure
   * @private
   */
  async __sendToMixpanel ({ request, sent }) {
    const maxAttempts = MIXPANEL_RETRY_DELAYS_MS.length + 1
    for (let attempt = 1; ; attempt++) {
      const failure = await this.__attemptMixpanelCall(request, sent)
      if (!failure) {
        return undefined
      }
      if (!failure.retryable || attempt === maxAttempts) {
        return { ...failure, attempts: attempt }
      }
      await sleep(MIXPANEL_RETRY_DELAYS_MS[attempt - 1])
    }
  }

  /**
   * Makes one attempt at a Mixpanel request.
   *
   * A rejected fetch (ECONNRESET, socket hang up) and a 5xx from Mixpanel are
   * both transient, so they are worth another attempt. Anything else means
   * Mixpanel understood us and said no -- a 4xx, or the `1` we expect in the
   * body coming back as `0` -- which would fail identically on a retry.
   *
   * @returns {Object|undefined} undefined if the call succeeded, otherwise a
   *   description of the failure
   * @private
   */
  async __attemptMixpanelCall (request, sent) {
    let resp
    try {
      resp = await this.callAPI(request)
    } catch (err) {
      return { url: request.url, sent, err: String(err), retryable: true }
    }
    if (resp.isOk && resp.data === 1) {
      return undefined
    }
    return {
      url: request.url,
      sent,
      resp,
      retryable: !resp.isOk && resp.code >= 500
    }
  }

  __reportAnalyticsFailures (failures) {
    // One key per kind of failure, so an outage and a payload Mixpanel refuses
    // are suppressed (and grouped in Sentry) separately.
    const key = failures
      .map(f => `${f.url} ${f.err ? 'transport error' : f.resp.code}`)
      .sort().join(', ')
    console.log('failed to send analytics to mixpanel', key, failures)
    if (!shouldReportAnalyticsFailure(key)) {
      return
    }
    Sentry.withScope(scope => {
      // a warning, not an error: the request itself succeeded
      scope.setLevel('warning')
      scope.setFingerprint(['mixpanel-egress-failed', key])
      scope.setTags({ method: this.req.method, url: this.req.url })
      scope.setExtras({ failures, reqId: this.req.id })
      Sentry.captureException(new Error(`failed to log analytics: ${key}`))
    })
  }
}

function addSenderId (mixpanelUserId, properties, deviceId) {
  if (mixpanelUserId.startsWith('$device:')) {
    properties.$device_id = mixpanelUserId.substring(8)
  } else {
    properties.$user_id = mixpanelUserId
    if (deviceId) {
      // istanbul ignore else
      if (deviceId.startsWith('$device')) {
        properties.$device_id = deviceId.substring(8)
      } else {
        properties.$device_id = deviceId
      }
    }
  }
  properties.distinct_id = mixpanelUserId
  return properties
}
