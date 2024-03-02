import { AppTest, runTests } from './base-test.js'

class PlaceholderTest extends AppTest {
  async testTime () {
    const ret = await this.app.get('/time').expect(200)
    expect(Object.keys(ret.body)).toEqual(['epoch'])
  }
}

runTests(PlaceholderTest)
