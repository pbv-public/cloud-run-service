import { jest } from '@jest/globals'

import { BaseTest, runTests } from '../node_modules/@pbvision/fastify-firestore-service/test/base-test.js'
import { port } from '../src/port.js'
import { getServiceHost, isDev, isLocalhost, isProd } from '../src/utils.js'

const ORIG_ENV = process.env

class TestUtils extends BaseTest {
  beforeEach () {
    jest.resetModules()
    process.env = { ...ORIG_ENV }
  }

  afterEach () {
    process.env = ORIG_ENV
  }

  testEnv () {
    expect(process.env.K_REVISION).toBe('unittest')
    expect(process.env.NODE_ENV).toBe('localhost')
    expect(isLocalhost()).toBe(true)
    expect(isProd()).toBe(false)
    expect(isDev()).toBe(false)

    process.env.NODE_ENV = 'dev'
    expect(isLocalhost()).toBe(false)
    expect(isProd()).toBe(false)
    expect(isDev()).toBe(true)

    process.env.NODE_ENV = 'prod'
    expect(isLocalhost()).toBe(false)
    expect(isProd()).toBe(true)
    expect(isDev()).toBe(false)
  }

  testGetServiceHost () {
    expect(getServiceHost(process.env.SERVICE)).toBe(`localhost:${port}`)
    expect(() => getServiceHost('unknown')).toThrow()
    process.env.LOCAL_SERVICE_PORT_MAP = JSON.stringify({ unknown: 8088 })
    expect(getServiceHost('unknown')).toBe('localhost:8088')
    expect(() => getServiceHost('actually_unknown')).toThrow()

    process.env.NODE_ENV = 'dev'
    const testSuffix = '-tbd-uc.a.run.app'
    process.env.CLOUD_RUN_HOSTNAME_SUFFIX = testSuffix
    expect(getServiceHost('unknown')).toBe('unknown' + testSuffix)
  }
}

runTests(TestUtils)
