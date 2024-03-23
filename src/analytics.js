import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

import { DatabaseAPI } from '@pbvision/fastify-firestore-service'
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
    this.__analyticsSent = false
  }

  async postCommit (respData) {
    // send analytics events after committing
    await this.sendAnalyticsEvents()
    return super.postCommit(respData)
  }

  logAnalyticsEvent (mixpanelUserId, eventName, inputProperties) {
    assert(this.__analyticsSent === false)
    this.__analyticsEvents.push({
      event: eventName,
      properties: {
        ...inputProperties,
        token: mixpanelToken,
        time: new Date().getTime(),
        distinct_id: mixpanelUserId,
        $insert_id: randomUUID(),
        ip: this.req.ip
      }
    })
  }

  updateAnalyticsUserProfile (mixpanelUserId, key, value, method = '$set') {
    assert(mixpanelUpdateProfileURLs[method])
    if (!this.__analyticsUserProfileUpdates[method]) {
      this.__analyticsUserProfileUpdates[method] = {}
    }
    const updatesByUser = this.__analyticsUserProfileUpdates[method]
    if (!updatesByUser[mixpanelUserId]) {
      updatesByUser[mixpanelUserId] = {}
    }
    updatesByUser[mixpanelUserId][key] = value
  }

  async sendAnalyticsEvents () {
    // istanbul ignore if
    if (this.__analyticsSent) {
      return
    }
    this.__analyticsSent = true

    const promises = []
    if (this.__analyticsEvents.length) {
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

      for (const x of this.__analyticsEvents) {
        Object.assign(x.properties, uaData)
      }
      // send all the events in one Mixpanel API call
      promises.push(this.callAPI({
        method: 'POST',
        url: 'https://api.mixpanel.com/track',
        headers: { accept: 'text/plain' },
        body: this.__analyticsEvents
      }))
    }
    for (const type of Object.keys(this.__analyticsUserProfileUpdates)) {
      const updatesByUser = this.__analyticsUserProfileUpdates[type]
      const body = []
      for (const mixpanelUserId of Object.keys(updatesByUser)) {
        const updates = updatesByUser[mixpanelUserId]
        body.push({
          $token: mixpanelToken,
          $distinct_id: mixpanelUserId,
          [type]: updates
        })
      }
      promises.push(this.__sendUserProfileUpdates(type, body))
    }
    return Promise.all(promises)
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
