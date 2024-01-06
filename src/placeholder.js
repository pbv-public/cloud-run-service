import { API } from '@pbvision/fastify-firestore-service'
import S from '@pbvision/schema'

import { now } from './utils/utils.js'

export class TestAPI extends API {
  static METHOD = 'GET'
  static PATH = '/time'
  static DESC = 'Just for testing'
  static RESPONSE = {
    epoch: S.int
  }

  async computeResponse () {
    return { epoch: now() }
  }
}
