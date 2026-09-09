import React from 'react';
import { cn } from '../../lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('input-modern resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export { Textarea };
