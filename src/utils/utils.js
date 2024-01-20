import assert from 'node:assert'

const ALL_SERVICES = new Set(['api', 'internal', 'data-extraction'])

export function getServiceHost (serviceName) {
  assert(ALL_SERVICES.has(serviceName), `unknown service ${serviceName}`)
  if (isLocalhost()) {
    const port = {
      api: 9100,
      'api-internal': 9101,
      'data-extraction': 9102
    }[serviceName]
    assert(port, `unknown service or missing port for localhost ${serviceName}`)
    return `localhost:${port}`
  } else {
    // TODO: don't have prod host yet
    const hostSuffix = isProd() ? undefined : '-ko3kowqi6a-uc.a.run.app'
    return serviceName + hostSuffix
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

export function isTest () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'dev'
}

export const now = () => Math.floor(new Date().getTime() / 1000)
