export const FACILITIES_AUTH_STORAGE_KEY = 'hr-facilities-auth'

export const FACILITIES_ROLE_LABELS = {
  requester: 'ผู้แจ้งงาน',
  staff: 'เจ้าหน้าที่ธุรการ',
  admin: 'ผู้ดูแลระบบ HR',
}

export const FACILITIES_BRANCHES = [
  'บริษัท วาวา แพค จำกัด สาขา 1',
  'บริษัท วาวา แพค จำกัด สาขา 2',
  'บริษัท วาวา แพค จำกัด สาขา 3',
]

export const FACILITIES_CATEGORIES = {
  Electrical: 'ระบบไฟฟ้า',
  Plumbing: 'ประปาและท่อน้ำ',
  AirConditioning: 'เครื่องปรับอากาศ',
  Building: 'อาคารและโครงสร้าง',
  Furniture: 'เฟอร์นิเจอร์และอุปกรณ์',
  Sanitary: 'สุขาภิบาลและความสะอาด',
  Safety: 'ความปลอดภัย',
  Other: 'อื่น ๆ',
}

export const FACILITIES_PRIORITIES = {
  Low: { label: 'ต่ำ', className: 'text-slate-600 dark:text-slate-300' },
  Normal: { label: 'ปกติ', className: 'text-sky-700 dark:text-sky-300' },
  High: { label: 'สูง', className: 'text-orange-700 dark:text-orange-300' },
  Urgent: { label: 'เร่งด่วน', className: 'text-rose-700 dark:text-rose-300' },
}

export const FACILITIES_STATUS = {
  Pending: { label: 'รอรับเรื่อง', badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
  Accepted: { label: 'รับเรื่องแล้ว', badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
  In_Progress: { label: 'กำลังดำเนินการ', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  Waiting: { label: 'รออะไหล่ / ผู้รับเหมา', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300' },
  Completed: { label: 'เสร็จสิ้น', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  Cancelled: { label: 'ยกเลิก', badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200' },
}

export const formatFacilitiesDate = (value, options = {}) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date)
}
