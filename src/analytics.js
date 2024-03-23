import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

import { DatabaseAPI, EXCEPTIONS } from '@pbvision/fastify-firestore-service'
import UAParser from 'ua-parser-js'

import { isProd } from './utils.js'

// istanbul ignore next
export const mixpanelToken = isProd ? '78c48e38f59ab21c1850740e2bb4ecff' : '52bd993b07bdba759c2f141345e7c32a'

const mixpanelUpdateProfileURLs = {
  $set: 'https://api.mixpanel.com/engage#profile-set',
  $set_once: 'https://api.mixpanel.com/engage#profile-set-once'
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

  logAnalyticsEvent (mixpanelUserId, eventName, inputProperties, deviceId = null) {
    this.__analyticsEvents.push({
      event: eventName,
      properties: addSenderId(mixpanelUserId, {
        ...inputProperties,
        token: mixpanelToken,
        time: new Date().getTime(),
        $insert_id: randomUUID(),
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

  async sendAnalyticsEvents () {
    const events = this.__analyticsEvents
    this.__analyticsEvents = []
    const userProfileUpdates = this.__analyticsUserProfileUpdates
    this.__analyticsUserProfileUpdates = {}

    const promises = []
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
      promises.push(this.callAPI({
        method: 'POST',
        url: 'https://api.mixpanel.com/track',
        headers: { accept: 'text/plain' },
        body: events
      }))
    }
    const sent = []
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
      promises.push(this.__sendUserProfileUpdates(type, body))
      sent.push({ type, body })
    }
    const responses = await Promise.all(promises)
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i]
      if (!resp.isOk || resp.data !== 1) {
        console.log('error response from mixpanel', resp, sent)
        throw new EXCEPTIONS.RequestError(
          'failed to log analytics', { resp, sent }, 551)
      }
    }
  }

  async __sendUserProfileUpdates (type, body) {
    const mixpanelApiURL = mixpanelUpdateProfileURLs[type]
    assert(mixpanelApiURL) // make sure a valid type was passed
    return this.callAPI({
      method: 'POST',
      url: mixpanelApiURL,
      headers: { accept: 'text/plain' },
      body
    })
  }
}

function addSenderId (mixpanelUserId, properties, deviceId) {
  if (mixpanelUserId.startsWith('$device:')) {
    properties.$device_id = mixpanelUserId
  } else {
    properties.$user_id = mixpanelUserId
    if (deviceId) {
      properties.$device_id = deviceId
    }
  }
  return properties
}
