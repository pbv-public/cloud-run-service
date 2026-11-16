import { makeService } from '@pbvision/fastify-firestore-service'

import { port } from './port.js'
import { isLocalhost, isProd } from './utils.js'

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
      // a crash's text and stack go back to the caller only on localhost
      // (where unit tests run too); dev serves partners and test accounts, so
      // it gets the same generic crash response as prod. Logs and Sentry keep
      // the full detail everywhere.
      reportErrorDetail: isLocalhost,
      reportAllErrors: true,
      sentryDSN: process.env.SENTRY_DSN
    },
    swagger: {
      disabled: isProd,
      servers: [`http://localhost:${port}`],
      routePrefix: '/app/docs'
    }
  })
}
