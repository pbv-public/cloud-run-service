import { mixpanelToken } from '../src/analytics.js'

import { AppTest, runTests } from './base-test.js'

class AnalyticsTest extends AppTest {
  async beforeEach () {
    await super.beforeEach()
    // mock using node-fetch to request the mixpanel APIs
    this.fetchMock.mockResp()
  }

  async testNoAnalyticsLogged () {
    await this.app.post('/analytics')
      .send({})
      .expect(200)
    expect(this.fetchMock).not.toHaveBeenCalled()
  }

  async testSendingEvents () {
    await this.sendBasicEvent()
    expect(this.fetchMock).toHaveBeenCalledWith(
      'https://api.mixpanel.com/track',
      expect.objectContaining({
        headers: { accept: 'text/plain', 'content-type': 'application/json' },
        method: 'POST',
        compress: true
      }))
    const calls = this.fetchMock.mock.calls
    expect(calls.length).toBe(1)
    const actualBody = JSON.parse(calls[0][1].body)
    expect(actualBody).toEqual([{
      event: 'some event',
      properties: expect.objectContaining({
        cool: 1,
        hi: 'world',
        distinct_id: 'some uid',
        token: mixpanelToken
      })
    }])
    const props = actualBody[0].properties
    expect(typeof props.ip).toBe('string')
    expect(new Date().getTime() - props.time).toBeLessThan(5000)
    expect(props.$insert_id).toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)
  }

  async sendBasicEvent (userAgent) {
    const req = this.app.post('/analytics')
    if (userAgent) {
      req.set('User-Agent', userAgent)
    }
    await req.send({
      eventCalls: [
        ['some uid', 'some event', { cool: 1, hi: 'world' }]
      ]
    }).expect(200)
  }

  async testUserAgent () {
    await this.sendBasicEvent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    const calls = this.fetchMock.mock.calls
    expect(calls.length).toBe(1)
    const actualBody = JSON.parse(calls[0][1].body)
    const props = actualBody[0].properties
    expect(props.$browser).toBe('Chrome 122.0.0.0')
    expect(props.$device).toBe(undefined)
    expect(props.$os).toBe('Windows 10')
  }

  async testUserAgentWithDevice () {
    await this.sendBasicEvent('Mozilla/5.0 (PlayBook; U; RIM Tablet OS 1.0.0; en-US) AppleWebKit/534.11 (KHTML, like Gecko) Version/7.1.0.7 Safari/534.11')
    const calls = this.fetchMock.mock.calls
    expect(calls.length).toBe(1)
    const actualBody = JSON.parse(calls[0][1].body)
    const props = actualBody[0].properties
    expect(props.$browser).toBe('Safari 7.1.0.7')
    expect(props.$device).toBe('RIM PlayBook tablet')
    expect(props.$os).toBe('RIM Tablet OS 1.0.0')
  }

  async sendUserProfileUpdate (profileUpdates) {
    const req = this.app.post('/analytics')
    await req.send({ profileUpdates }).expect(200)
  }

  async testUserProfileUpdates () {
    const uids = ['uid0', 'uid1']
    await this.sendUserProfileUpdate([
      [uids[0], 'p1', true],
      [uids[0], 'p2', 5],
      [uids[1], 'p2', 6],
      [uids[1], 'p1', 'nope', '$set'],
      [uids[1], 'p1', 'cool'],
      [uids[1], 'p1', 'once', '$set_once'],
      [uids[0], 'p1', false],
      [uids[0], 'p3', 'hi']
    ])
    const calls = this.fetchMock.mock.calls
    expect(calls.length).toBe(2)
    const setURL = 'https://api.mixpanel.com/engage#profile-set'
    const setOnceURL = 'https://api.mixpanel.com/engage#profile-set-once'
    expect(this.fetchMock).toHaveBeenCalledWith(
      setURL,
      expect.objectContaining({
        headers: { accept: 'text/plain', 'content-type': 'application/json' },
        method: 'POST',
        compress: true
      }))
    expect(this.fetchMock).toHaveBeenCalledWith(
      setOnceURL,
      expect.objectContaining({
        headers: { accept: 'text/plain', 'content-type': 'application/json' },
        method: 'POST',
        compress: true
      }))
    // sort $set first, then $set_once (just so we have a consistent order for
    // the test to check)
    calls.sort((a, b) => a[0].localeCompare(b[0]))

    // check $set updates
    const actualSetUpdates = JSON.parse(calls[0][1].body)
    actualSetUpdates.sort((a, b) => a.$distinct_id.localeCompare(b.$distinct_id))
    const expectedSets = [
      { p1: false, p2: 5, p3: 'hi' },
      { p1: 'cool', p2: 6 }
    ]
    for (let i = 0; i < actualSetUpdates.length; i++) {
      const actualArgs = actualSetUpdates[i]
      expect(actualArgs).toEqual({
        $token: mixpanelToken,
        $distinct_id: uids[i],
        $set: expectedSets[i]
      })
    }

    // check $set_once updates
    const actualSetOnceUpdates = JSON.parse(calls[1][1].body)
    const expectedSetOnces = [
      { p1: 'once' }
    ]
    for (let i = 0; i < actualSetOnceUpdates.length; i++) {
      const actualArgs = actualSetOnceUpdates[i]
      expect(actualArgs).toEqual({
        $token: mixpanelToken,
        $distinct_id: uids[1],
        $set_once: expectedSetOnces[i]
      })
    }
  }
}

runTests(AnalyticsTest)
