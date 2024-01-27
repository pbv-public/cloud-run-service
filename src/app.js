import { makeService } from '@pbvision/fastify-firestore-service'

import { port } from './port.js'
import { isProd, isUnitTesting } from './utils.js'

export async function makePBVService (customizePinoOpts) {
  const isProdEnv = isProd()
  const components = {}
  // istanbul ignore else
  if (isUnitTesting()) {
    const { TestAPI, TestCallServiceAPI } = await import('./placeholder.js')
    Object.assign(components, { TestAPI, TestCallServiceAPI })
  }
  return makeService({
    service: process.env.SERVICE,
    components,
    cookie: {
      secret: process.env.COOKIE_SECRET
    },
    healthCheck: {
      path: '/_healthcheck'
    },
    latencyTracker: {
      disabled: isProdEnv
    },
    logging: {
      customizePinoOpts,
      reportErrorDetail: !isProdEnv,
      reportAllErrors: true,
      sentryDSN: process.env.sentryDSN
    },
    swagger: {
      disabled: isProdEnv,
      servers: [`http://localhost:${port}`],
      routePrefix: '/app/docs'
    }
  })
}
