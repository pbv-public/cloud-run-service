import { track } from '../src/analytics.js'

import { AppTest, runTests } from './base-test.js'

class AnalyticsTest extends AppTest {
  async testTrack () {
    const fakeRequest = {
      headers: {},
      ip: '127.0.0.222'
    }
    track(fakeRequest, 'some_user_id', 'some_event', { cool: 1 })
    expect(this.mixpanelMock.track.mock.calls).toHaveLength(1)
  }
}

runTests(AnalyticsTest)
