import { CloudTasksClient } from '@google-cloud/tasks'

import { getServiceHost } from './utils.js'

const tasksClient = new CloudTasksClient()

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
export async function enqueueCloudTask ({ queue, payload, name, ignoreNameAlreadyUsedError = false, service = 'internal' }) {
  const parent = tasksClient.queuePath(
    process.env.PROJECT, process.env.REGION, queue)
  const task = {
    httpRequest: {
      headers: {
        'Content-Type': 'application/json'
      },
      httpMethod: 'POST',
      url: `https://${getServiceHost(service)}/${queue.replace(/-/g, '_')}`,
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: `cr-${process.env.SERVICE}@${process.env.PROJECT}.iam.gserviceaccount.com`
      }
    }
  }
  if (name) {
    const fqName = tasksClient.taskPath(process.env.PROJECT, process.env.REGION, queue, name)
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
