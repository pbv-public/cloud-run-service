// add helper method to call APIs on this or other services; if the service is
// internal then we'll make the request with our authorization token (only
// works if this service has been granted access to the target service!)
import { GoogleAuth } from 'google-auth-library'

import { getServiceHost } from './utils.js'

const auth = new GoogleAuth()

// This function will be added to the API class.
export async function callServiceAPI ({
  path, service: serviceName,
  body = undefined, qsParams = undefined,
  method = 'POST', headers = {}, isServiceInternal = true
}) {
  const host = getServiceHost(serviceName)
  // istanbul ignore next
  const protocol = host === 'localhost' ? 'https' : 'http'
  const url = `${protocol}://${host}${path}`
  if (isServiceInternal) {
    const targetAudience = `https://${host}/`
    const client = await auth.getIdTokenClient(targetAudience)
    const token = await client.idTokenProvider.fetchIdToken(targetAudience)
    headers.Authorization = `Bearer ${token}`
  }
  return this.callAPI({ method, headers, url, body, qsParams })
}
