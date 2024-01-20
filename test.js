import { enqueueCloudTask } from './src/utils/tasks.js'

try {
  const ret = await enqueueCloudTask({
    queue: 'upp-video-download-by-url',
    payload: { test: 3 }
  })
  console.log(ret)
} catch (e) {
  console.error('error', e)
}
