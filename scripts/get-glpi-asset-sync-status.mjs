import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { getGlpiAssetSyncStatus } from '../lib/glpi-asset-sync.js'

dotenv.config()

try {
  console.log(JSON.stringify(await getGlpiAssetSyncStatus(), null, 2))
} catch (error) {
  console.error('Read GLPI asset sync status failed:', error.message)
  process.exitCode = 1
} finally {
  await getPool().end()
}
