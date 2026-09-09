export default function SystemStatCard({ icon: Icon, label, value, detail, tone = 'blue' }) {
    return (
        <article className="tap-card tap-metric">
            <div className={`tap-metric-icon ${tone}`}>{Icon && <Icon size={23} strokeWidth={1.8} />}</div>
            <div><span>{label}</span><strong>{value}</strong></div>
            {detail && <small className={tone}>{detail}</small>}
        </article>
    );
}
