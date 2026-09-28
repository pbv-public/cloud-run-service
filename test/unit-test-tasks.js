import crypto from 'node:crypto'

import { CloudTasksClient } from '@google-cloud/tasks'
import { expect, jest } from '@jest/globals'

import { enqueueCloudTask, TaskNameAlreadyExistsError } from '../src/tasks.js'

import { BaseTest, runTests } from './base-test.js'

const NAMED_TASK = 'projects/localhost-emulator/locations/us-central1/queues/test-queue/tasks/x'

function grpcError (code, message) {
  const err = new Error(message)
  err.code = code
  return err
}
const unavailableError = () => grpcError(14, '14 UNAVAILABLE: read ECONNRESET')
const alreadyExistsError = () => grpcError(6, '6 ALREADY_EXISTS: Requested entity already exists')

class TestTasks extends BaseTest {
  async beforeAll () {
    await super.beforeAll()

    process.env.LOCAL_SERVICE_PORT_MAP = JSON.stringify({ internal: 8888 })

    // mock GoogleAuth because we can't actually get a token during testing
    jest.spyOn(CloudTasksClient.prototype, 'createTask')
  }

  async beforeEach () {
    await super.beforeEach()
    this.createTaskReturnValue = new Promise(resolve => resolve())
    CloudTasksClient.prototype.createTask.mockReset().mockImplementation(
      () => this.createTaskReturnValue)
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

  /**
   * Queues one createTask outcome per attempt (an Error rejects), then enqueues
   * a task under fake timers so the retry backoff takes no real time.
   * @returns {Object} { value, error, elapsedMs } of the enqueueCloudTask call
   */
  async enqueueWithOutcomes (args, ...outcomes) {
    for (const outcome of outcomes) {
      CloudTasksClient.prototype.createTask.mockImplementationOnce(
        () => outcome ? Promise.reject(outcome) : Promise.resolve())
    }
    jest.useFakeTimers()
    try {
      const start = jest.now()
      const settled = enqueueCloudTask({ queue: 'test-queue', payload: { x: 3 }, ...args })
        .then(value => ({ value }), error => ({ error }))
      await jest.runAllTimersAsync()
      return { ...await settled, elapsedMs: jest.now() - start }
    } finally {
      jest.useRealTimers()
    }
  }

  async testEnqueueTaskRetriesWhenUnavailable () {
    const ret = await this.enqueueWithOutcomes({}, unavailableError(), null)
    expect(ret).toEqual({ value: true, elapsedMs: 100 })
    const calls = CloudTasksClient.prototype.createTask.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[1][0]).toBe(calls[0][0])
  }

  async testEnqueueTaskRethrowsWhenStillUnavailable () {
    const lastError = unavailableError()
    const ret = await this.enqueueWithOutcomes(
      {}, unavailableError(), unavailableError(), lastError)
    expect(ret).toEqual({ error: lastError, elapsedMs: 400 })
    expect(CloudTasksClient.prototype.createTask).toHaveBeenCalledTimes(3)
  }

  async testEnqueueTaskDoesNotRetryOtherErrors () {
    const err = grpcError(4, '4 DEADLINE_EXCEEDED: took too long')
    const ret = await this.enqueueWithOutcomes({}, err)
    expect(ret).toEqual({ error: err, elapsedMs: 0 })
    expect(CloudTasksClient.prototype.createTask).toHaveBeenCalledTimes(1)
  }

  async testEnqueueNamedTaskThatExistsAfterRetryWasAdded () {
    for (const ignoreNameAlreadyUsedError of [false, true]) {
      CloudTasksClient.prototype.createTask.mockClear()
      const ret = await this.enqueueWithOutcomes(
        { name: 'x', ignoreNameAlreadyUsedError },
        unavailableError(), alreadyExistsError())
      expect(ret).toEqual({ value: true, elapsedMs: 100 })
      expect(CloudTasksClient.prototype.createTask).toHaveBeenCalledTimes(2)
      expect(CloudTasksClient.prototype.createTask.mock.calls[1][0].task.name).toBe(NAMED_TASK)
    }
  }

  async testEnqueueNamedTaskThatAlreadyExistsIsNotRetried () {
    let ret = await this.enqueueWithOutcomes({ name: 'x' }, alreadyExistsError())
    expect(ret.error).toBeInstanceOf(TaskNameAlreadyExistsError)
    expect(ret.error.taskName).toBe('x')

    ret = await this.enqueueWithOutcomes(
      { name: 'x', ignoreNameAlreadyUsedError: true }, alreadyExistsError())
    expect(ret).toEqual({ value: false, elapsedMs: 0 })
    expect(CloudTasksClient.prototype.createTask).toHaveBeenCalledTimes(2)
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
