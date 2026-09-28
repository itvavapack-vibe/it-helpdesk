import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { completeOverdueAccessRequestAcknowledgements } from '../lib/access-request-auto-acknowledgement.js'

dotenv.config()

try {
  const completed = await completeOverdueAccessRequestAcknowledgements()
  console.log(`Auto-completed ${completed} overdue access request acknowledgement(s)`)
} catch (error) {
  console.error('Access request auto-acknowledgement failed:', error.message)
  process.exitCode = 1
} finally {
  await getPool().end()
}
