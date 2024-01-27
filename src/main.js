import assert from 'node:assert'

import { API } from '@pbvision/fastify-firestore-service'

import { makePBVService } from './app.js'
import { callServiceAPI } from './call-service-api.js'
import { port } from './port.js'
import { isLocalhost } from './utils.js'

API.prototype.callServiceAPI = callServiceAPI

let service
const project = process.env.PROJECT

function verifyEnvironmentVariables () {
  const requiredEnvKeys = [
    'GIT_HASH', 'K_REVISION', 'NODE_ENV', 'PROJECT', 'REGION', 'SERVICE']
  for (const k of requiredEnvKeys) {
    assert(process.env[k], `${k} environment variable must be set`)
  }
  assert(['localhost', 'dev', 'prod'].indexOf(process.env.NODE_ENV) !== -1,
    `invalid NODE_ENV: ${process.env.NODE_ENV}`)
}

function makeCustomizeLoggingOptionsFunction () {
  return options => {
    options.formatters = {
      level (label) {
        return { severity: label }
      },
      // set messageKey to "message" for automatic parsing by GCP logs
      messageKey: 'message'
    }
    const originalReqSerializer = options.serializers.req
    options.serializers.req = req => {
      const reqLog = originalReqSerializer(req)

      // include the trace ID so logging can coordinate multiple logs from the
      // same request per: https://github.com/GoogleCloudPlatform/cloud-run-microservice-template-nodejs/blob/main/utils/logging.js
      const traceHeader = req.headers['X-Cloud-Trace-Context']
      let trace
      // istanbul ignore if
      if (traceHeader) {
        const [traceId] = traceHeader.split('/')
        trace = `projects/${project}/traces/${traceId}`
        reqLog['logging.googleapis.com/trace'] = trace
      }
      return reqLog
    }
    return options
  }
}

export async function makeService (components) {
  verifyEnvironmentVariables()
  return makePBVService(components, makeCustomizeLoggingOptionsFunction())
}

// istanbul ignore next
export async function runService (components) {
  if (!isLocalhost()) {
    // if the instance tells us it will shutdown, try to shut down gracefully (for
    // example flushing logs)
    process.on('SIGTERM', () => {
      if (!service) {
        return
      }
      // cloud run sends SIGTERM 10sec before killing the instance, so give the
      // instance a little more time to finish any current requests then close
      // the fastify instance (which kills any remaining requests, and should
      // flush the logs and other clean up, if time permits)
      setTimeout(() =>
        service.close().then(() => {
          console.log('successfully closed!')
        }, (err) => {
          console.log('an error happened', err)
        }), 7000)
    })
    // start the server
    service = await makeService(components)
    service.listen({ port, host: '0.0.0.0' })
  }
}
