import { cn } from '../../lib/utils';

const TONES = {
    indigo: { accent: 'bg-indigo-500', icon: 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300' },
    sky: { accent: 'bg-sky-500', icon: 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
    violet: { accent: 'bg-violet-500', icon: 'border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300' },
    emerald: { accent: 'bg-emerald-500', icon: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    amber: { accent: 'bg-amber-500', icon: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    rose: { accent: 'bg-rose-500', icon: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' },
};

const DashboardStatCard = ({ icon: Icon, label, value, detail, tone = 'indigo', className }) => {
    const colors = TONES[tone] || TONES.indigo;
    return (
        <article className={cn('relative min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600', className)}>
            <span className={cn('absolute inset-y-0 left-0 w-1 opacity-80', colors.accent)} />
            <div className="flex items-start justify-between gap-4 pl-1">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                    <strong className="mt-2 block text-3xl font-bold text-slate-900 dark:text-white">{value}</strong>
                    {detail && <p className="mt-2 truncate text-xs font-medium text-slate-500 dark:text-slate-400" title={detail}>{detail}</p>}
                </div>
                {Icon && <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg border', colors.icon)}><Icon className="h-5 w-5" strokeWidth={2} /></span>}
            </div>
        </article>
    );
};

export default DashboardStatCard;
