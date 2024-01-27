import { CloudTasksClient } from '@google-cloud/tasks'
import { credentials } from '@grpc/grpc-js'

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

/**
 * Add a Task to a Cloud Tasks queue.
 *
 * The task will be routed to the internal API service on a path that matches
 * the queue name (with hyphens replaced by underscores).
 *
 * @param {Object} task the task to enqueue
 * @param {string} queue the name of the queue to add the task to
 * @param {any} payload the data to convert to JSON add send as the task's body
 * @param {string} [name] if provided, a name that is reused (on the same queue)
 *   within about an hour will be rejected (TaskNameAlreadyExistsError)
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
  name = undefined, ignoreNameAlreadyUsedError = false
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
  if (name) {
    const fqName = tasksClient.taskPath(project, region, queue, name)
    task.name = fqName
  }
  const request = { parent, task }
  try {
    await tasksClient.createTask(request)
    return true
  } catch (e) {
    if (e.code === 6 && e.message.startsWith('6 ALREADY_EXISTS')) {
      if (ignoreNameAlreadyUsedError) {
        return false
      } else {
        throw new TaskNameAlreadyExistsError(name, e)
      }
    }
    throw e
  }
}

export class TaskNameAlreadyExistsError extends Error {
  constructor (name, e) {
    super(`task name already used recently: ${name}`)
    this.taskName = name
    this.originalError = e
  }
}
