import { jest } from '@jest/globals'
import { GoogleAuth } from 'google-auth-library'

import { AppTest, runTests } from './base-test.js'

class TestCallServiceAPI extends AppTest {
  async beforeAll () {
    await super.beforeAll()

    // mock GoogleAuth because we can't actually get a token during testing
    this.fetchIdToken = jest.fn().mockReturnValue('fake-token')
    jest.spyOn(GoogleAuth.prototype, 'getIdTokenClient').mockImplementation(() => ({
      idTokenProvider: {
        fetchIdToken: this.fetchIdToken
      }
    }))
  }

  async beforeEach () {
    await super.beforeEach()
    // mock using node-fetch to request an API
    this.fetchMock.mockResp()
    this.fetchIdToken.mockClear()
    GoogleAuth.prototype.getIdTokenClient.mockClear()
  }

  async afterAll () {
    await super.afterAll()
    jest.restoreAllMocks()
  }

  async check (args, respBody = '', expCode = 200, expPort = 8080) {
    const result = await this.app.post('/callService').send(args).expect(200)
    const resp = result.body
    expect(resp.code).toBe(expCode)
    expect(resp.body).toEqual(respBody)

    const shouldHaveToken = args.isServiceInternal ?? true
    const expHeaders = args.headers ?? {}
    if (shouldHaveToken) {
      expHeaders.Authorization = 'Bearer fake-token'
    }
    expect(this.fetchMock).toHaveBeenCalledWith(
      `http://localhost:${expPort}${args.path}`, {
        body: args.body,
        headers: expHeaders,
        method: args.method ?? 'POST',
        compress: false
      })

    // make sure Google Auth was called with appropriate arguments (or not, if
    // this wasn't an internal call)
    if (shouldHaveToken) {
      const targetAudience = `http://localhost:${expPort}/`
      expect(GoogleAuth.prototype.getIdTokenClient).toHaveBeenCalledWith(targetAudience)
      expect(this.fetchIdToken).toHaveBeenCalledWith(targetAudience)
    } else {
      expect(GoogleAuth.prototype.getIdTokenClient).not.toHaveBeenCalled()
    }
  }

  async testServiceCallingItsOwnInternalAPI () {
    await this.check({
      service: process.env.SERVICE,
      path: '/someAPI',
      isServiceInternal: true
    })
  }

  async testServiceCallingItsOwnPublicAPI () {
    await this.check({
      service: process.env.SERVICE,
      path: '/someAPI',
      isServiceInternal: false
    })
  }

  async testServiceCallingAnotherOneOfItsAPIs () {
    this.fetchMock.mockResp({ x: 3 })
    await this.check({
      service: process.env.SERVICE,
      path: '/x/y/z'
    }, JSON.stringify({ x: 3 }))
  }

  async testServiceCallingAnotherService () {
    process.env.LOCAL_SERVICE_PORT_MAP = JSON.stringify({ notMe: 9999 })
    this.fetchMock.mockResp('test resp', 222)
    await this.check({
      service: 'notMe',
      path: '/x'
    }, 'test resp', 222, 9999)
  }
}

runTests(TestCallServiceAPI)
