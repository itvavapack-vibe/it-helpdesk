import React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = {
  default: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  destructive: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  secondary: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  outline: 'bg-white/50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700',
};

function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
        badgeVariants[variant] || badgeVariants.default,
        className,
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
