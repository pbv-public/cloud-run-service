import { API, DatabaseAPI } from '@pbvision/fastify-firestore-service'
import Mixpanel from 'mixpanel'
import UAParser from 'ua-parser-js'

import { isLocalhost, isProd } from './utils.js'

let mixpanel
function getMixpanelInstance () {
  if (!mixpanel) {
    const mixpanelToken = isProd ? '78c48e38f59ab21c1850740e2bb4ecff' : '52bd993b07bdba759c2f141345e7c32a'
    mixpanel = Mixpanel.init(mixpanelToken, {
      debug: isLocalhost,
      test: isLocalhost
    })
  }
  return mixpanel
}

export function track (req, mixpanelUserId, eventName, inputProperties) {
  const parser = new UAParser(req.headers['User-Agent'])
  const parsed = parser.getResult()
  const propsToLog = {
    ...inputProperties,
    $browser: parsed.browser,
    $device: parsed.device,
    $os: parsed.os,
    $ip: req.ip
  }
  const mp = getMixpanelInstance()
  mp.track(mixpanelUserId, eventName, propsToLog)
}

export function updateUserProfile (mixpanelUserId, method, ...args) {
  const mp = getMixpanelInstance()
  mp.identify(mixpanelUserId)
  mp.people[method](...args)
}
