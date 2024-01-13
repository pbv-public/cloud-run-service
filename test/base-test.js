import { BaseAppTest, BaseTest, runTests } from '../node_modules/@pbvision/fastify-firestore-service/test/base-test.js'
export {
  BaseTest, runTests
}

export class AppTest extends BaseAppTest {
  async getMakeServiceFunc () {
    const { makePBVService } = await import('../src/app.js')
    return makePBVService
  }
}
