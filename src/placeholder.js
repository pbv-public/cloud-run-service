// APIs in this file are not included in Docker builds so they never are
// shipped to Cloud Run. They only exist for local testing.
import assert from 'node:assert'

import { API, DatabaseAPI } from '@pbvision/fastify-firestore-service'
import db from '@pbvision/firestore-orm'
import S from '@pbvision/schema'

import { isUnitTesting } from './utils.js'

class Test extends db.Model {
  static KEY = { id: S.str }
  static FIELDS = { x: S.int }
}

export class TestAPI extends DatabaseAPI {
  static METHOD = 'GET'
  static PATH = '/time'
  static DESC = 'Just for testing'
  static RESPONSE = {
    epoch: S.int
  }

  async computeResponse () {
    const doesNotExist = await this.tx.get(Test, 'abc')
    assert(doesNotExist === undefined)
    return { epoch: Math.floor(new Date().getTime() / 1000) }
  }
}

export class TestCallServiceAPI extends API {
  static PATH = '/callService'
  static DESC = 'This is used by unit tests only to test callServiceAPI.'
  static BODY = S.obj()
  static RESPONSE = { code: S.int, body: S.str }

  async computeResponse () {
    assert(isUnitTesting)
    const resp = await this.callServiceAPI(this.req.body)
    return {
      code: resp.code,
      body: typeof resp.data === 'object' ? JSON.stringify(resp.data) : (resp.data ?? '')
    }
  }
}
