import assert from 'node:assert'

import { port as portForThisService } from './port.js'

export function getServiceHost (serviceName) {
  if (isLocalhost()) {
    if (process.env.SERVICE === serviceName) {
      return `localhost:${portForThisService}`
    }
    const portMapping = JSON.parse(process.env.LOCAL_SERVICE_PORT_MAP ?? 'null')
    const port = portMapping[serviceName]
    assert(port, `unknown service or missing port for localhost ${serviceName}`)
    return `localhost:${port}`
  } else {
    return serviceName + process.env.CLOUD_RUN_HOSTNAME_SUFFIX
  }
}

export function isLocalhost () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'localhost'
}

export function isProd () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'prod'
}

export function isDev () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'dev'
}

export const now = () => Math.floor(new Date().getTime() / 1000)
