import { cn } from '../../lib/utils';

const DashboardTable = ({ columns, rows, rowKey = 'id', emptyMessage = 'ไม่พบข้อมูล', minWidth = 760, className }) => {
    if (!rows.length) return <div className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</div>;
    return (
        <div className={cn('overflow-x-auto', className)}>
            <table className="w-full text-left text-sm" style={{ minWidth }}>
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>{columns.map((column) => <th key={column.key} className={cn('px-5 py-3', column.headerClassName)}>{column.header}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {rows.map((row, rowIndex) => (
                        <tr key={typeof rowKey === 'function' ? rowKey(row, rowIndex) : row[rowKey]} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
                            {columns.map((column) => (
                                <td key={column.key} className={cn('px-5 py-3.5', column.cellClassName)}>
                                    {column.render ? column.render(row, rowIndex) : row[column.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default DashboardTable;
