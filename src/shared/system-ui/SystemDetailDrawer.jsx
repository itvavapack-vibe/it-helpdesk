import { ChevronRight } from 'lucide-react';

export default function SystemDetailDrawer({ open, title, eyebrow = 'รายละเอียด', onClose, children, footer }) {
    if (!open) return null;
    return (
        <div className="tap-detail-layer" role="dialog" aria-modal="true" aria-label={title}>
            <button type="button" className="tap-detail-backdrop" aria-label="ปิดรายละเอียด" onClick={onClose} />
            <aside className="tap-detail-panel">
                <header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="ปิด"><ChevronRight size={21} /></button></header>
                <div className="tap-detail-body">{children}</div>
                {footer && <footer>{footer}</footer>}
            </aside>
        </div>
    );
}
