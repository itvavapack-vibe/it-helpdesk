export default function SystemDataTable({ columns, rows, rowKey = 'id', loading, empty, minWidth = 850 }) {
    return (
        <div className="tap-table-scroll">
            <table className="tap-issue-table" style={{ minWidth }}>
                <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>
                    {rows.map((row, index) => <tr key={typeof rowKey === 'function' ? rowKey(row, index) : row[rowKey] || index}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key]}</td>)}</tr>)}
                    {!loading && !rows.length && <tr><td colSpan={columns.length}>{empty}</td></tr>}
                    {loading && <tr><td colSpan={columns.length} className="tap-empty">กำลังโหลดข้อมูล...</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
