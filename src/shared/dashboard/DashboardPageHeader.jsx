import { cn } from '../../lib/utils';

const DashboardPageHeader = ({
    eyebrow,
    eyebrowIcon: EyebrowIcon,
    title,
    description,
    meta,
    actions,
    className,
}) => (
    <header className={cn('flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between', className)}>
        <div className="min-w-0">
            {eyebrow && (
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {EyebrowIcon && <EyebrowIcon className="h-4 w-4 text-indigo-500" />}
                    <span>{eyebrow}</span>
                </div>
            )}
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
            {meta && <div className="mt-3">{meta}</div>}
        </div>
        {actions && <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>}
    </header>
);

export default DashboardPageHeader;
