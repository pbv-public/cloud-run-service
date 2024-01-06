import assert from 'node:assert'

import { makeAPIService } from './app.js'

let service

const main = async () => {
  verifyEnvironmentVariables()
  // Start server listening on PORT env var
  service = await makeAPIService(
    makeCustomizeLoggingOptionsFunction(process.env.PROJECT))
  service.listen({ port: process.env.PORT ?? 8080, host: '0.0.0.0' })
}

function verifyEnvironmentVariables () {
  const requiredEnvKeys = ['K_REVISION', 'PROJECT']
  for (const k of requiredEnvKeys) {
    assert(process.env[k], `${k} environment variable must be set`)
  }
  if ('K_REVISION' === 'localhost') {
    process.env.NODE_ENV = 'localhost'
  } else {
    process.env.NODE_ENV = project.split('-')[1]
  }
  assert(['localhost', 'dev', 'prod'].indexOf(process.env.NODE_ENV) !== -1,
    `invalid NODE_ENV: ${process.env.NODE_ENV}`)
}

function makeCustomizeLoggingOptionsFunction (project) {
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

main()
