import { makeService } from '@pbvision/fastify-firestore-service'

import { TestAPI } from './placeholder.js'
import { isProdEnv } from './utils/utils.js'

export async function makeAPIService (customizePinoOpts) {
  const isProd = isProdEnv()
  return makeService({
    service: 'api',
    components: { TestAPI },
    cookie: {
      // TODO: change and move into secrets manager
      secret: 'HeD5kfDCP52ekV9qw5XDFw'
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
      sentryDSN: 'https://de6c41e5bf07fd6c04d5bcf26c837f1a@o4506498659254272.ingest.sentry.io/4506498679373824'
    },
    swagger: {
      disabled: isProd,
      servers: ['http://localhost:8080'],
      routePrefix: '/app/docs'
    }
  })
}
