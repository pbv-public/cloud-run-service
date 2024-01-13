import assert from 'node:assert'

import { API } from '@pbvision/fastify-firestore-service'
import { GoogleAuth } from 'google-auth-library'

import { makePBVService } from './app.js'

let service
const project = process.env.PROJECT
const auth = new GoogleAuth()

// add helper method to call internal APIs with our authorization token
// istanbul ignore next
API.prototype.callInternalAPI = async function ({ method = 'POST', headers = {}, url, body, qsParams }) {
  assert(url.substring(0, 8) === 'https://')
  const rest = url.substring(8)
  const hostname = rest.split('/', 1)[0]
  const targetAudience = `https://${hostname}/`
  const client = await auth.getIdTokenClient(targetAudience)
  const token = await client.idTokenProvider.fetchIdToken(targetAudience)
  headers.Authorization = `Bearer ${token}`
  return this.callAPI({ method, headers, url, body, qsParams })
}

export async function makeService () {
  verifyEnvironmentVariables()
  return makePBVService(makeCustomizeLoggingOptionsFunction())
}

function verifyEnvironmentVariables () {
  const requiredEnvKeys = ['K_REVISION', 'PROJECT']
  for (const k of requiredEnvKeys) {
    assert(process.env[k], `${k} environment variable must be set`)
  }
  // istanbul ignore else
  if (['localhost', 'unittest'].indexOf(process.env.K_REVISION) !== -1) {
    process.env.NODE_ENV = 'localhost'
  } else {
    process.env.NODE_ENV = project.split('-')[1]
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

// istanbul ignore next
if (process.env.K_REVISION !== 'unittest') {
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
  service = await makeService()
  service.listen({ port: process.env.PORT ?? 8080, host: '0.0.0.0' })
}
