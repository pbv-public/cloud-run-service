import { makeService } from '@pbvision/fastify-firestore-service'

import { TestAPI } from './placeholder.js'
import { isProd } from './utils.js'

export async function makePBVService (customizePinoOpts) {
  const isProdEnv = isProd()
  return makeService({
    service: 'api',
    components: { TestAPI },
    cookie: {
      // could move this into secrets manager
      secret: 'HeD5kfDCP52ekV9qw5XDFw'
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
      sentryDSN: 'https://de6c41e5bf07fd6c04d5bcf26c837f1a@o4506498659254272.ingest.sentry.io/4506498679373824'
    },
    swagger: {
      disabled: isProdEnv,
      servers: [`http://localhost:${process.env.PORT ?? 8080}`],
      routePrefix: '/app/docs'
    }
  })
}
