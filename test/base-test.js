import { BaseAppTest, BaseTest, runTests } from '../node_modules/@pbvision/fastify-firestore-service/test/base-test.js'

const { TestAnalyticsAPI, TestAPI, TestCallServiceAPI } = await import('../src/placeholder.js')
export {
  BaseTest, runTests
}

export class AppTest extends BaseAppTest {
  async getMakeServiceFunc () {
    const { makeService } = await import('../src/main.js')
    return () => makeService({
      TestAnalyticsAPI,
      TestAPI,
      TestCallServiceAPI
    })
  }
}
