import React from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = {
  default: 'app-primary-button text-white shadow-sm',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  destructive: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
  outline: 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200',
  ghost: 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
  link: 'text-indigo-600 dark:text-indigo-400 underline-offset-4 hover:underline',
};

const buttonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3 text-xs',
  lg: 'h-11 px-8 py-3',
  icon: 'h-10 w-10',
};

const Button = React.forwardRef(({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950 [&_svg]:shrink-0',
      buttonVariants[variant] || buttonVariants.default,
      buttonSizes[size] || buttonSizes.default,
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
