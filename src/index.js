import { makeService, runService } from './main.js'
import { enqueueCloudTask } from './tasks.js'
import { isCloud, isDev, isProd, isLocalhost, isUnitTesting, getServiceProtocolAndHost } from './utils.js'

export {
  enqueueCloudTask,
  makeService, // for use with unit testing
  runService,

  getServiceProtocolAndHost,
  isCloud, isDev, isProd, isLocalhost, isUnitTesting
}
