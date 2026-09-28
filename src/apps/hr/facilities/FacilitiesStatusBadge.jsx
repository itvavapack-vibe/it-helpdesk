import { FACILITIES_STATUS } from './facilitiesConstants'

const FacilitiesStatusBadge = ({ status }) => {
  const config = FACILITIES_STATUS[status] || { label: status || '-', badge: 'border-slate-200 bg-slate-50 text-slate-600' }
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${config.badge}`}>{config.label}</span>
}

export default FacilitiesStatusBadge
