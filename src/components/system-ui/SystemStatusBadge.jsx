import { cn } from '../../lib/utils';

const TONES = {
    warning: 'warning',
    info: 'info',
    success: 'success',
    neutral: 'neutral',
    danger: 'danger',
};

export default function SystemStatusBadge({ tone = 'neutral', children, className }) {
    return <span className={cn('tap-status', TONES[tone] || TONES.neutral, className)}>{children}</span>;
}
