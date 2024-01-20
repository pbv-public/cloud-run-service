import assert from 'node:assert'

import { API } from '@pbvision/fastify-firestore-service'
import { GoogleAuth } from 'google-auth-library'

import { makePBVService } from './app.js'
import { isLocalhost, isProd } from './utils/utils.js'

let service
const project = process.env.PROJECT
const auth = new GoogleAuth()

// add helper method to call APIs on this or other services; if the service is
// internal then we'll make the request with our authorization token (only
// works if this service has been granted access to the target service!)
// istanbul ignore next
API.prototype.callServiceAPI = async function ({ method = 'POST', headers = {}, service: serviceName, path, body, qsParams }) {
  let host
  if (isLocalhost()) {
    const port = {
      api: 9100,
      'api-internal': 9101,
      'data-extraction': 9102
    }[serviceName]
    assert(port, `unknown service or missing port for localhost ${serviceName}`)
    host = `localhost:${port}`
  } else {
    // TODO: don't have prod host yet
    const hostSuffix = isProd() ? undefined : '-ko3kowqi6a-uc.a.run.app'
    host = serviceName + hostSuffix
  }

  const url = `https://${host}${path}`
  const isServiceInternal = serviceName !== 'api'
  if (isServiceInternal) {
    const targetAudience = `https://${host}/`
    const client = await auth.getIdTokenClient(targetAudience)
    const token = await client.idTokenProvider.fetchIdToken(targetAudience)
    headers.Authorization = `Bearer ${token}`
  }
  return this.callAPI({ method, headers, url, body, qsParams })
}

export async function makeService () {
  verifyEnvironmentVariables()
  return makePBVService(makeCustomizeLoggingOptionsFunction())
}

function verifyEnvironmentVariables () {
  const requiredEnvKeys = ['GIT_HASH', 'K_REVISION', 'PROJECT', 'REGION']
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
