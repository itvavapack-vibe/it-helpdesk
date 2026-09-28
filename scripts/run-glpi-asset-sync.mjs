import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { runGlpiAssetSync } from '../lib/glpi-asset-sync.js'

dotenv.config()

try {
  const result = await runGlpiAssetSync({ triggerSource: 'command' })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error('GLPI asset sync failed:', error.message)
  process.exitCode = 1
} finally {
  await getPool().end()
}
