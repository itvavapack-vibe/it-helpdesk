import { cn } from '../../lib/utils';

const DashboardPanel = ({
    title,
    description,
    icon: Icon,
    action,
    children,
    className,
    contentClassName,
}) => (
    <section className={cn('min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800', className)}>
        {(title || action) && (
            <header className="flex min-w-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
                <div className="flex min-w-0 items-start gap-2.5">
                    {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />}
                    <div className="min-w-0">
                        {title && <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>}
                        {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </header>
        )}
        <div className={cn('p-5', contentClassName)}>{children}</div>
    </section>
);

export default DashboardPanel;
