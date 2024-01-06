export function isProdEnv () {
  return process.env.NODE_ENV === 'prod'
}

export const now = () => Math.floor(new Date().getTime() / 1000)
