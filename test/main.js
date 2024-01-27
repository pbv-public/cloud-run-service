import { runService } from '../src/index.js'
const { TestAPI, TestCallServiceAPI } = await import('../src/placeholder.js')

await runService({ TestAPI, TestCallServiceAPI })
