import { runService } from '../src/index.js'
const { TestAnalyticsAPI, TestAPI, TestCallServiceAPI } = await import('../src/placeholder.js')

await runService({ TestAnalyticsAPI, TestAPI, TestCallServiceAPI })
