import { makeService, runService } from './main.js'
import { enqueueCloudTask } from './tasks.js'
import { isCloud, isDev, isProd, isLocalhost, isUnitTesting } from './utils.js'

export {
  enqueueCloudTask,
  makeService, // for use with unit testing
  runService,

  isCloud, isDev, isProd, isLocalhost, isUnitTesting
}
