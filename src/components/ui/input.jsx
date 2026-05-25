import React from 'react';
import { cn } from '../../lib/utils';

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input ref={ref} type={type} className={cn('w-full input-modern', className)} {...props} />
));
Input.displayName = 'Input';

export { Input };
