import assert from 'node:assert'

export function getServiceHost (serviceName) {
  if (isLocalhost()) {
    const portMapping = JSON.parse(process.env.LOCAL_SERVICE_PORT_MAP ?? '{}')
    const port = portMapping[serviceName]
    assert(port, `unknown service or missing port for localhost ${serviceName}`)
    if (process.env.SERVICE === serviceName) {
      return `0.0.0.0:${port}`
    } else {
      return `${serviceName}:8080`
    }
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
