import { jest } from '@jest/globals'
import Mixpanel from 'mixpanel'

import { BaseAppTest, BaseTest, runTests } from '../node_modules/@pbvision/fastify-firestore-service/test/base-test.js'
const { TestAPI, TestCallServiceAPI } = await import('../src/placeholder.js')
export {
  BaseTest, runTests
}

export class AppTest extends BaseAppTest {
  async getMakeServiceFunc () {
    const { makeService } = await import('../src/main.js')
    return () => makeService({ TestAPI, TestCallServiceAPI })
  }

  async beforeAll () {
    await super.beforeAll()
    jest.spyOn(Mixpanel, 'init').mockImplementation(() => this.mixpanelMock)
  }

  async beforeEach () {
    await super.beforeEach()
    this.mixpanelMock = {
      track: jest.fn(),
      identify: jest.fn(),
      people: jest.fn()
    }
  }
}
