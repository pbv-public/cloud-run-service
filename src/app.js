import { makeService } from '@pbvision/fastify-firestore-service'

import { TestAPI } from './placeholder.js'
import { isProd } from './utils.js'

export async function makePBVService (customizePinoOpts) {
  const isProdEnv = isProd()
  return makeService({
    service: process.env.SERVICE,
    components: { TestAPI },
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
      servers: [`http://localhost:${process.env.PORT ?? 8080}`],
      routePrefix: '/app/docs'
    }
  })
}
