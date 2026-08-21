import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import { getPool } from '../lib/db.js'
import { deleteTable, getTable, insertTable, updateTable } from '../lib/handlers.js'

dotenv.config()

const issueId = `TST-${String(Date.now()).slice(-10)}`
let inserted = false

try {
  await insertTable('issues', [{
    id: issueId,
    name: 'Assignee integration test',
    department: 'IT',
    category: 'Other',
    severity: 'Low',
    description: 'Temporary record for first-assignee protection',
    status: 'Pending',
    repair_details: '',
    assigned_admin: null,
    attachments_json: '[]',
    created_at: new Date(),
  }])
  inserted = true

  await updateTable('issues', {
    assigned_admin: 'First Receiver',
    status: 'In Progress',
  }, { eq: { id: issueId } })

  await updateTable('issues', {
    assigned_admin: 'Second Updater',
    repair_details: 'Updated by another administrator',
  }, { eq: { id: issueId } })

  const result = await getTable('issues', {
    select: 'id,assigned_admin,repair_details',
    eq: { id: issueId },
    limit: 1,
  })
  const issue = result.data?.[0]

  assert.equal(issue?.assigned_admin, 'First Receiver')
  assert.equal(issue?.repair_details, 'Updated by another administrator')
  console.log('First issue assignee integration test passed')
} finally {
  try {
    if (inserted) {
      await deleteTable('issues', { eq: { id: issueId } })
    }
  } finally {
    await getPool().end()
  }
}
