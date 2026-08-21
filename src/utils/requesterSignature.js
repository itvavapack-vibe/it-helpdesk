import { mysql } from '../mysqlClient'

const asText = (value) => String(value || '').trim()

const asTimestamp = (value) => {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const makeCandidate = (signature, position, signedAt, source) => {
  const normalizedSignature = asText(signature)
  if (!normalizedSignature) return null
  return {
    signature: normalizedSignature,
    position: asText(position),
    signedAt: signedAt || null,
    source,
  }
}

const collectIssueCandidates = (row) => [
  makeCandidate(row?.borrow_returner_sign, row?.borrow_returner_position, row?.borrow_returned_at, 'issue_borrow_return'),
  makeCandidate(row?.user_close_sign, row?.user_close_position, row?.user_closed_at, 'issue_close'),
  makeCandidate(row?.waiting_parts_user_sign, row?.waiting_parts_user_position, row?.waiting_parts_signed_at, 'issue_waiting_parts'),
].filter(Boolean)

const collectAccessRequestCandidates = (row) => [
  makeCandidate(row?.user_acknowledge_sign, row?.position, row?.user_acknowledge_date, 'access_acknowledgement'),
  makeCandidate(row?.requester_sign, row?.position, row?.created_at, 'access_request'),
].filter(Boolean)

const collectChangeRequestCandidates = (row) => [
  makeCandidate(row?.user_accept_sign, row?.requester_position, row?.user_accept_date, 'change_acceptance'),
  makeCandidate(row?.requester_sign, row?.requester_position, row?.created_at, 'change_request'),
].filter(Boolean)

const selectRecentRows = async ({ table, columns, identityColumn, identityValue }) => {
  if (!identityColumn || !asText(identityValue)) return []

  const { data, error } = await mysql
    .from(table)
    .select(columns)
    .eq(identityColumn, asText(identityValue))
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error(`Error loading reusable requester signatures from ${table}:`, error)
    return []
  }
  return Array.isArray(data) ? data : []
}

export const findReusableRequesterSignature = async ({
  employeeId,
  name,
  currentSignatures = [],
} = {}) => {
  const embeddedSignature = currentSignatures
    .map((candidate) => makeCandidate(candidate?.signature, candidate?.position, candidate?.signedAt, candidate?.source || 'current_record'))
    .find(Boolean)

  if (embeddedSignature) return embeddedSignature

  const normalizedEmployeeId = asText(employeeId)
  const normalizedName = asText(name)
  if (!normalizedEmployeeId && !normalizedName) return null

  const [issueRows, accessRows, changeRows] = await Promise.all([
    normalizedName
      ? selectRecentRows({
          table: 'issues',
          columns: 'id,name,user_close_position,user_close_sign,user_closed_at,waiting_parts_user_position,waiting_parts_user_sign,waiting_parts_signed_at,borrow_returner_position,borrow_returner_sign,borrow_returned_at,created_at',
          identityColumn: 'name',
          identityValue: normalizedName,
        })
      : [],
    selectRecentRows({
      table: 'access_requests',
      columns: 'id,name_th,employee_id,position,requester_sign,user_acknowledge_sign,user_acknowledge_date,created_at',
      identityColumn: normalizedEmployeeId ? 'employee_id' : 'name_th',
      identityValue: normalizedEmployeeId || normalizedName,
    }),
    selectRecentRows({
      table: 'change_requests',
      columns: 'id,requester_name,employee_id,requester_position,requester_sign,user_accept_sign,user_accept_date,created_at',
      identityColumn: normalizedEmployeeId ? 'employee_id' : 'requester_name',
      identityValue: normalizedEmployeeId || normalizedName,
    }),
  ])

  return [
    ...issueRows.flatMap(collectIssueCandidates),
    ...accessRows.flatMap(collectAccessRequestCandidates),
    ...changeRows.flatMap(collectChangeRequestCandidates),
  ].sort((left, right) => asTimestamp(right.signedAt) - asTimestamp(left.signedAt))[0] || null
}
