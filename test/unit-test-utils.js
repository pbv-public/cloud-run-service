import { jest } from '@jest/globals'

import { BaseTest, runTests } from '../node_modules/@pbvision/fastify-firestore-service/test/base-test.js'
import { isDev, isLocalhost, isProd } from '../src/utils.js'

const ORIG_ENV = process.env

class TestNodeEnv extends BaseTest {
  beforeEach () {
    jest.resetModules()
    process.env = { ...ORIG_ENV }
  }

  afterAll () {
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
}

runTests(TestNodeEnv)
