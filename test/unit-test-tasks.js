import crypto from 'node:crypto'

import { CloudTasksClient } from '@google-cloud/tasks'
import { expect, jest } from '@jest/globals'

import { enqueueCloudTask } from '../src/tasks.js'

import { BaseTest, runTests } from './base-test.js'

class TestTasks extends BaseTest {
  async beforeAll () {
    await super.beforeAll()

    process.env.LOCAL_SERVICE_PORT_MAP = JSON.stringify({ internal: 8888 })

    // mock GoogleAuth because we can't actually get a token during testing
    this.createTaskReturnValue = new Promise(resolve => resolve())
    jest.spyOn(CloudTasksClient.prototype, 'createTask').mockImplementation(
      () => this.createTaskReturnValue)
  }

  async beforeEach () {
    await super.beforeEach()
    CloudTasksClient.prototype.createTask.mockClear()
  }

  async afterAll () {
    await super.afterAll()
    jest.restoreAllMocks()
  }

  async check (args, taskExpectations = {}, expRejectionMsg = null) {
    const promise = enqueueCloudTask({
      queue: 'test-queue',
      ...args
    })
    if (expRejectionMsg) {
      await expect(promise).rejects.toThrow(expRejectionMsg)
    } else {
      await promise
    }
    expect(CloudTasksClient.prototype.createTask).toHaveBeenCalledWith({
      // assuming values for project (localhost-emulator) and region (us-central1) and
      // service (tbd)
      parent: 'projects/localhost-emulator/locations/us-central1/queues/test-queue',
      task: {
        httpRequest: {
          body: Buffer.from(JSON.stringify(args.payload)).toString('base64'),
          headers: { 'Content-Type': 'application/json' },
          httpMethod: 'POST',
          oidcToken: {
            serviceAccountEmail: 'cr-tbd@localhost-emulator.iam.gserviceaccount.com'
          },
          url: 'http://localhost:8888/test_queue'
        },
        ...taskExpectations
      }
    })
  }

  async testEnqueueTask () {
    await this.check({ payload: { x: 3 } })
  }

  async testEnqueueTaskWithDelay () {
    const now = new Date().getTime() / 1000
    await this.check(
      { payload: { x: 3 }, delaySecs: 10 },
      { scheduleTime: { seconds: expect.closeTo(now + 10, -0.7) } })
  }

  async testEnqueueTaskWithSchedule () {
    const target = 100 + Math.floor(new Date().getTime() / 1000)
    await this.check(
      { payload: { x: 3 }, scheduledEpoch: target },
      { scheduleTime: { seconds: target } })
  }

  async testEnqueueTaskWithName () {
    await this.check(
      { name: 'x', payload: { x: 3 } },
      { name: 'projects/localhost-emulator/locations/us-central1/queues/test-queue/tasks/x' })
  }

  async testEnqueueTaskWithHashName () {
    const partsToCheck = [
      [], ['x'], ['x', 'yyy', '']
    ]
    for (const hashNameParts of partsToCheck) {
      const expName = crypto.createHash('md5').update(
        ['test-queue'].concat(hashNameParts).join('|')).digest('hex')
      await this.check(
        { hashNameParts, payload: { x: 3 } },
        { name: 'projects/localhost-emulator/locations/us-central1/queues/test-queue/tasks/' + expName })
    }
  }

  async testEnqueueTaskWithNameThatWasRecentlyUsedNOTOkay () {
    this.createTaskReturnValue = new Promise((resolve, reject) => {
      const err = new Error('6 ALREADY_EXISTS and other random details')
      err.code = 6
      reject(err)
    })
    await this.check(
      { name: 'x', payload: { x: 3 }, ignoreNameAlreadyUsedError: true },
      { name: 'projects/localhost-emulator/locations/us-central1/queues/test-queue/tasks/x' })
  }

  async testEnqueueTaskWithNameThatWasRecentlyUsedAndThatsOkay () {
    this.createTaskReturnValue = new Promise((resolve, reject) => {
      const err = new Error('6 ALREADY_EXISTS and other random details')
      err.code = 6
      reject(err)
    })
    await this.check(
      { name: 'x', payload: { x: 3 } },
      { name: 'projects/localhost-emulator/locations/us-central1/queues/test-queue/tasks/x' },
      'task name already used recently: x')
  }

  async testEnqueueTaskThrowsUnknownExceptions () {
    this.createTaskReturnValue = new Promise((resolve, reject) => {
      const err = new Error('ALREADY_EXISTS but not in right format')
      reject(err)
    })
    await this.check(
      { name: 'x', payload: { x: 3 } },
      { name: 'projects/localhost-emulator/locations/us-central1/queues/test-queue/tasks/x' },
      'not in right format')
  }
}

runTests(TestTasks)
