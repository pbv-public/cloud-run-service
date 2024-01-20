import assert from 'node:assert'

export function getServiceHost (serviceName) {
  if (isLocalhost()) {
    const port = {
      api: 9100,
      'api-internal': 9101,
      'data-extraction': 9102
    }[serviceName]
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
