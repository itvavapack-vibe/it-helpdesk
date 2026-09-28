import { getPool } from './db.js'

export const ACCESS_ACKNOWLEDGEMENT_WAIT_DAYS = 3
export const ACCESS_ACKNOWLEDGEMENT_CHECK_INTERVAL_MS = 60 * 60 * 1000

let jobRunning = false

export async function completeOverdueAccessRequestAcknowledgements() {
  const pool = getPool()
  const [result] = await pool.query(`
    UPDATE access_requests
    SET
      user_acknowledge_sign = CASE
        WHEN user_acknowledge_sign IS NULL OR TRIM(user_acknowledge_sign) = '' THEN requester_sign
        ELSE user_acknowledge_sign
      END,
      user_acknowledge_date = COALESCE(user_acknowledge_date, NOW()),
      status = 'Completed'
    WHERE status = 'Pending_User_Acknowledgement'
      AND requester_sign IS NOT NULL
      AND TRIM(requester_sign) <> ''
      AND COALESCE(it_manager_date, updated_at) <= DATE_SUB(NOW(), INTERVAL ${ACCESS_ACKNOWLEDGEMENT_WAIT_DAYS} DAY)
  `)

  return result.affectedRows
}

export function startAccessRequestAutoAcknowledgementJob() {
  const run = async () => {
    if (jobRunning) return
    jobRunning = true
    try {
      const completed = await completeOverdueAccessRequestAcknowledgements()
      if (completed > 0) {
        console.log(`Auto-completed ${completed} overdue access request acknowledgement(s)`)
      }
    } catch (error) {
      console.error('Access request auto-acknowledgement failed:', error.message)
    } finally {
      jobRunning = false
    }
  }

  void run()
  const timer = setInterval(run, ACCESS_ACKNOWLEDGEMENT_CHECK_INTERVAL_MS)
  timer.unref?.()
  return timer
}
