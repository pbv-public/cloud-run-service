import assert from 'node:assert'

import { port as portForThisService } from './port.js'

// this refers to where the code is running; the database and other services
// we are connected to depends on GCLOUD_PROJECT
export const isLocalhost = process.env.NODE_ENV === 'localhost'
export const isCloud = !isLocalhost
export const isDev = process.env.NODE_ENV === 'dev'
export const isProd = process.env.NODE_ENV === 'prod'
// istanbul ignore next
assert(isLocalhost || isDev || isProd,
  'invalid NODE_ENV: must be on localhost, dev or prod')

export const isUnitTesting = process.env.K_REVISION === 'unittest'
assert(!isUnitTesting || isLocalhost, 'must be on localhost if unit testing')

export const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST
assert(!usingEmulator || process.env.CLOUD_TASKS_EMULATOR_PORT,
  'both firestore and tasks need to be either emulated or not')
assert(usingEmulator === (process.env.GCLOUD_PROJECT === 'localhost-emulator'),
  'when using the emulator, GCLOUD_PROJECT should be set to localhost-emulator')

export function getServiceProtocolAndHost (serviceName) {
  const host = getServiceHost(serviceName)
  // istanbul ignore next
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}

export function getServiceHost (serviceName) {
  // manually check NODE_ENV for testing purposes
  if (process.env.NODE_ENV === 'localhost') {
    if (process.env.SERVICE === serviceName) {
      return `localhost:${portForThisService}`
    }
    const portMapping = JSON.parse(process.env.LOCAL_SERVICE_PORT_MAP)
    const port = portMapping[serviceName]
    assert(port, `unknown service or missing port for localhost ${serviceName}`)
    return `localhost:${port}`
  } else {
    return serviceName + process.env.CLOUD_RUN_HOSTNAME_SUFFIX
  }
}

export const now = () => Math.floor(new Date().getTime() / 1000)
