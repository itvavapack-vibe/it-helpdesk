import { cn } from '../../lib/utils';

export default function SystemPanel({ title, description, action, children, className, bodyClassName }) {
    return (
        <section className={cn('tap-card system-panel', className)}>
            {(title || action) && <header className="tap-card-heading system-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>}
            <div className={cn('system-panel-body', bodyClassName)}>{children}</div>
        </section>
    );
}
