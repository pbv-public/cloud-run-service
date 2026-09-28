import assert from 'node:assert'
import crypto from 'node:crypto'

import { CloudTasksClient } from '@google-cloud/tasks'
import { credentials, status } from '@grpc/grpc-js'

import { getServiceProtocolAndHost, usingEmulator } from './utils.js'

const tasksClient = (() => {
  // istanbul ignore else
  if (usingEmulator) {
    return new CloudTasksClient({
      port: process.env.CLOUD_TASKS_EMULATOR_PORT,
      servicePath: 'localhost',
      sslCreds: credentials.createInsecure()
    })
  }
  // istanbul ignore next
  return new CloudTasksClient()
})()

// the client library never retries createTask since it isn't idempotent
const CREATE_TASK_RETRY_DELAYS_MS = [100, 300]

/**
 * Add a Task to a Cloud Tasks queue.
 *
 * The task will be routed to the internal API service on a path that matches
 * the queue name (with hyphens replaced by underscores).
 *
 * A transient UNAVAILABLE error (e.g., a connection reset) is retried a couple
 * of times. The failed attempt may have created the task anyway, so a retry
 * can enqueue a duplicate unnamed task; handlers must tolerate that already
 * since Cloud Tasks delivers at least once. A named task whose retry finds its
 * name taken counts as added.
 *
 * @param {Object} task the task to enqueue
 * @param {string} queue the name of the queue to add the task to
 * @param {any} payload the data to convert to JSON add send as the task's body
 * @param {string} [name] if provided, a name that is reused (on the same queue)
 *   within about an hour will be rejected (TaskNameAlreadyExistsError)
 * @param {Array<string>} [hashNameParts] if provided, the name param will be
 *   generated from the combination of the queue name (namespacing this name)
 *   and the name part(s) in this argument; the task name will be an md5 hash
 *   of all this
 * @param {string} [service="internal"] the service name that the task request
 *   will be routed to
 * @param {boolean} [ignoreNameAlreadyUsedError=false] if true, no error is
 *   thrown due to a name already having been used
 * @returns {boolean} true if a new task was added; false if the task name was
 *   already recently used (no new task added, but a task was recently added
 *   with this name)
 */
export async function enqueueCloudTask ({
  queue, payload,
  service = 'internal',
  name = undefined,
  hashNameParts = undefined,
  ignoreNameAlreadyUsedError = false,
  delaySecs = 0,
  scheduledEpoch = undefined // can only be up to 30 days from now
}) {
  const project = process.env.GCLOUD_PROJECT
  const region = process.env.REGION
  const parent = tasksClient.queuePath(project, region, queue)
  const protocolAndHost = getServiceProtocolAndHost(service)
  const task = {
    httpRequest: {
      headers: {
        'Content-Type': 'application/json'
      },
      httpMethod: 'POST',
      url: `${protocolAndHost}/${queue.replace(/-/g, '_')}`,
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: `cr-${process.env.SERVICE}@${project}.iam.gserviceaccount.com`
      }
    }
  }
  const currentEpoch = new Date().getTime() / 1000
  if (delaySecs) {
    task.scheduleTime = {
      seconds: Math.ceil(currentEpoch + delaySecs)
    }
    assert(!scheduledEpoch, 'cannot specify both delaysSecs and scheduledEpoch')
  }
  if (scheduledEpoch) {
    scheduledEpoch = Math.floor(scheduledEpoch)
    task.scheduleTime = { seconds: Math.floor(scheduledEpoch) }
  }
  if (task.scheduleTime) {
    assert(task.scheduleTime.seconds <= currentEpoch + 30 * 86400, 'cannot delay for more than 30 days')
  }
  if (hashNameParts) {
    assert(Array.isArray(hashNameParts))
    assert(!name, 'cannot specify both name and hashNameParts')
    const namespacedName = [queue, ...hashNameParts].join('|')
    name = crypto.createHash('md5').update(namespacedName).digest('hex')
  }
  if (name) {
    const fqName = tasksClient.taskPath(project, region, queue, name)
    task.name = fqName
  }
  const request = { parent, task }
  try {
    await createTaskWithRetries(request)
    return true
  } catch (e) {
    if (isAlreadyExistsError(e)) {
      if (ignoreNameAlreadyUsedError) {
        return false
      } else {
        throw new TaskNameAlreadyExistsError(name, e)
      }
    }
    throw e
  }
}

async function createTaskWithRetries (request) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tasksClient.createTask(request)
    } catch (e) {
      if (attempt > 0 && isAlreadyExistsError(e)) {
        return // an earlier attempt created it before its connection failed
      }
      if (e.code !== status.UNAVAILABLE || attempt >= CREATE_TASK_RETRY_DELAYS_MS.length) {
        throw e
      }
      await new Promise(resolve => setTimeout(resolve, CREATE_TASK_RETRY_DELAYS_MS[attempt]))
    }
  }
}

function isAlreadyExistsError (e) {
  return e.code === status.ALREADY_EXISTS && e.message.startsWith('6 ALREADY_EXISTS')
}

export class TaskNameAlreadyExistsError extends Error {
  constructor (name, e) {
    super(`task name already used recently: ${name}`)
    this.taskName = name
    this.originalError = e
  }
}
