import { SECRETARY_STATUS } from './secretaryConstants'

const SecretaryStatusBadge = ({ status, className = '' }) => {
  const config = SECRETARY_STATUS[status] || SECRETARY_STATUS.Pending
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold whitespace-nowrap ${config.badge} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}

export default SecretaryStatusBadge
