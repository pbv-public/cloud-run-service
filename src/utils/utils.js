import assert from 'node:assert'

export function isLocalhost () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'localhost'
}

export function isProd () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'prod'
}

export function isTest () {
  assert(process.env.NODE_ENV)
  return process.env.NODE_ENV === 'dev'
}

export const now = () => Math.floor(new Date().getTime() / 1000)
