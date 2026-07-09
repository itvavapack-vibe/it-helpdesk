const STATUS_TONES = {
  Pending: 'amber',
  Pending_Manager: 'amber',
  Pending_IT: 'sky',
  Pending_IT_Supervisor: 'cyan',
  Pending_IT_Manager: 'violet',
  Pending_User_Acknowledgement: 'teal',
  Pending_User_Acceptance: 'teal',
  'In Progress': 'indigo',
  In_Progress: 'indigo',
  In_Development: 'sky',
  'External Repair': 'violet',
  'Waiting for Parts': 'pink',
  Resolved: 'emerald',
  Closed: 'teal',
  Completed: 'emerald',
  Approved: 'emerald',
  Rejected: 'rose',
  Cancelled: 'slate',
};

const TONE_CLASSES = {
  amber: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:!border-amber-700/50 dark:!bg-amber-950/55 dark:!text-amber-200',
    icon: 'bg-amber-100 text-amber-600 dark:!bg-amber-950/55 dark:!text-amber-200 dark:ring-1 dark:ring-amber-700/40',
  },
  sky: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:!border-sky-700/50 dark:!bg-sky-950/55 dark:!text-sky-200',
    icon: 'bg-sky-100 text-sky-600 dark:!bg-sky-950/55 dark:!text-sky-200 dark:ring-1 dark:ring-sky-700/40',
  },
  cyan: {
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:!border-cyan-700/50 dark:!bg-cyan-950/55 dark:!text-cyan-200',
    icon: 'bg-cyan-100 text-cyan-600 dark:!bg-cyan-950/55 dark:!text-cyan-200 dark:ring-1 dark:ring-cyan-700/40',
  },
  violet: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:!border-violet-700/50 dark:!bg-violet-950/55 dark:!text-violet-200',
    icon: 'bg-violet-100 text-violet-600 dark:!bg-violet-950/55 dark:!text-violet-200 dark:ring-1 dark:ring-violet-700/40',
  },
  teal: {
    badge: 'border-teal-200 bg-teal-50 text-teal-700 dark:!border-teal-700/50 dark:!bg-teal-950/55 dark:!text-teal-200',
    icon: 'bg-teal-100 text-teal-600 dark:!bg-teal-950/55 dark:!text-teal-200 dark:ring-1 dark:ring-teal-700/40',
  },
  indigo: {
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:!border-indigo-700/50 dark:!bg-indigo-950/60 dark:!text-indigo-200',
    icon: 'bg-indigo-100 text-indigo-600 dark:!bg-indigo-950/60 dark:!text-indigo-200 dark:ring-1 dark:ring-indigo-700/40',
  },
  pink: {
    badge: 'border-pink-200 bg-pink-50 text-pink-700 dark:!border-pink-700/50 dark:!bg-pink-950/55 dark:!text-pink-200',
    icon: 'bg-pink-100 text-pink-600 dark:!bg-pink-950/55 dark:!text-pink-200 dark:ring-1 dark:ring-pink-700/40',
  },
  emerald: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:!border-emerald-700/50 dark:!bg-emerald-950/55 dark:!text-emerald-200',
    icon: 'bg-emerald-100 text-emerald-600 dark:!bg-emerald-950/55 dark:!text-emerald-200 dark:ring-1 dark:ring-emerald-700/40',
  },
  rose: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:!border-rose-700/50 dark:!bg-rose-950/55 dark:!text-rose-200',
    icon: 'bg-rose-100 text-rose-600 dark:!bg-rose-950/55 dark:!text-rose-200 dark:ring-1 dark:ring-rose-700/40',
  },
  slate: {
    badge: 'border-slate-200 bg-slate-100 text-slate-700 dark:!border-slate-600/70 dark:!bg-slate-800 dark:!text-slate-200',
    icon: 'bg-slate-100 text-slate-600 dark:!bg-slate-800 dark:!text-slate-200 dark:ring-1 dark:ring-slate-600/50',
  },
};

const getTone = (status) => STATUS_TONES[status] || 'slate';

export const getStatusBadgeClass = (status) => TONE_CLASSES[getTone(status)].badge;

export const getStatusIconClass = (status) => TONE_CLASSES[getTone(status)].icon;
