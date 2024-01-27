import { makeService } from '@pbvision/fastify-firestore-service'

import { port } from './port.js'
import { isProd } from './utils.js'

export async function makePBVService (components, customizePinoOpts) {
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
      disabled: isProd
    },
    logging: {
      customizePinoOpts,
      reportErrorDetail: !isProd,
      reportAllErrors: true,
      sentryDSN: process.env.sentryDSN
    },
    swagger: {
      disabled: isProd,
      servers: [`http://localhost:${port}`],
      routePrefix: '/app/docs'
    }
  })
}
