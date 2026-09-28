import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { ensureGlpiAssetSyncStatusTable } from '../lib/glpi-asset-sync.js'

dotenv.config()

try {
  await ensureGlpiAssetSyncStatusTable()
  console.log('Migration OK: system sync status table is ready')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
} finally {
  await getPool().end()
}
