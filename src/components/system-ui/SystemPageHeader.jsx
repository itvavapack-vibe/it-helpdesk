import { cn } from '../../lib/utils';

export default function SystemPageHeader({ breadcrumb, title, meta, actions, className }) {
    return (
        <header className={cn('tap-page-heading', className)}>
            <div><p>{breadcrumb}</p><h1>{title}</h1></div>
            {actions || (meta && <span>{meta}</span>)}
        </header>
    );
}
