export const SECRETARY_AUTH_STORAGE_KEY = 'secretary-center-auth'

export const SECRETARY_STATUS = {
  Pending: {
    label: 'รอดำเนินการ',
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  In_Progress: {
    label: 'กำลังดำเนินการ',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  Completed: {
    label: 'เสร็จสิ้น',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  Cancelled: {
    label: 'ยกเลิก',
    badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    dot: 'bg-slate-500',
  },
}

export const SECRETARY_IMPACTS = {
  Low: { label: 'ต่ำ', className: 'text-slate-600 dark:text-slate-300' },
  Medium: { label: 'ปานกลาง', className: 'text-sky-700 dark:text-sky-300' },
  High: { label: 'สูง', className: 'text-orange-700 dark:text-orange-300' },
  Critical: { label: 'วิกฤต', className: 'text-rose-700 dark:text-rose-300' },
}

export const SECRETARY_CATEGORIES = [
  'ปัญหาด้านการผลิต',
  'ปัญหาด้านการขาย',
  'ปัญหาด้านการบัญชี',
  'ปัญหาด้านการซื้อ',
  'ปัญหาด้านการตรวจสอบ',
  'ปัญหาด้านการเทคโนโลยีและสารสนเทศ',
  'ปัญหาด้านการวิศวกรรม',
  'ปัญหาด้านคุณภาพงาน',
  'ปัญหาข้อร้องเรียนลูกค้า',
  'ปัญหาด้านความปลอดภัย',
  'ปัญหาด้านสาธารณูปโภค น้ำประปา ไฟฟ้า',
  'ปัญหาเกี่ยวกับเครื่องจักร',
  'ปัญหาซ่อมบำรุง',
  'ปัญหาการส่งมอบ/การจัดส่ง',
  'อื่น ๆ',
]

export const SECRETARY_ROLE_LABELS = {
  reporter: 'ผู้แจ้งปัญหา',
  receiver: 'ผู้รับแจ้ง / เลขานุการ',
  super_admin: 'Super Admin',
}

export const isSecretaryReceiverRole = (role) => role === 'receiver' || role === 'super_admin'
export const isSecretarySuperAdmin = (role) => role === 'super_admin'

export const SECRETARY_BRANCH_OPTIONS = [
  'บริษัท วาวา แพค จำกัด สาขา 1',
  'บริษัท วาวา แพค จำกัด สาขา 2',
  'บริษัท วาวา แพค จำกัด สาขา 3',
]

export const SECRETARY_DEPARTMENT_OPTIONS = [
  'แอดมิน',
  'บุคคลและธุรการ',
  'วิศวกรรม',
  'การตลาดและขาย(ในประเทศ)',
  'การตลาดและขาย(ต่างประเทศ)',
  'แอดมินการตลาด',
  'บัญชี',
  'การเงิน',
  'จัดซื้อ',
  'เทคโนโลยีสารสนเทศ และ ERP',
  'วางแผน',
  'ฝ่ายผลิต',
  'ตรวจสอบคุณภาพ',
  'ควบคุมคุณภาพ',
  'บริหารระบบ และ จป.',
  'ออกแบบ',
  'วิจัยและพัฒนาผลิตภัณฑ์',
  'คลังพัสดุและจัดส่ง',
  'ตรวจสอบ',
  'ซ่อมบำรุง',
  'สำนักกรรมการ',
  'อื่น ๆ',
]

export const formatSecretaryDate = (value, options = {}) => {
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
