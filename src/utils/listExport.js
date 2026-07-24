import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

const DEFAULT_PDF_ROWS_PER_PAGE = 8;

const formatExportDate = () => new Date().toISOString().slice(0, 10);

const createSafeText = (value) => String(value ?? '').trim() || '-';

export const exportRowsToExcel = ({ rows = [], columns = [], sheetName = 'Report', filePrefix = 'Report' }) => {
    const dataForExport = rows.map((row, index) => {
        const exportRow = {};
        columns.forEach((column) => {
            exportRow[column.header] = column.value(row, index);
        });
        return exportRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${filePrefix}_${formatExportDate()}.xlsx`);
};

export const exportRowsToPdf = async ({
    rows = [],
    columns = [],
    title,
    subtitle = '',
    filePrefix = 'Report',
    rowsPerPage = DEFAULT_PDF_ROWS_PER_PAGE,
    filterSummary = '',
}) => {
    const printRoot = document.createElement('div');
    printRoot.style.cssText = 'position:fixed;left:-100000px;top:0;width:1123px;background:#fff;z-index:-1;';
    document.body.appendChild(printRoot);

    const pages = Array.from(
        { length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) },
        (_, index) => rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage)
    );

    const createCell = (text, width, { header = false, align = 'left' } = {}) => {
        const cell = document.createElement(header ? 'th' : 'td');
        cell.style.cssText = [
            `width:${width}%`,
            'border:1px solid #cbd5e1',
            'padding:6px 7px',
            `text-align:${align}`,
            'vertical-align:top',
            header ? 'background:#e2e8f0;font-weight:700;color:#1e293b;' : 'color:#334155;',
        ].join(';');
        const content = document.createElement('div');
        content.textContent = createSafeText(text);
        content.style.cssText = header
            ? 'line-height:1.2;'
            : 'line-height:1.35;word-break:break-word;white-space:pre-wrap;';
        cell.appendChild(content);
        return cell;
    };

    try {
        await document.fonts?.ready;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
            const page = document.createElement('section');
            page.style.cssText = [
                'width:1123px',
                'height:794px',
                'box-sizing:border-box',
                'padding:34px 38px 28px',
                'background:#fff',
                'font-family:Sarabun,Tahoma,"Segoe UI",sans-serif',
                'position:relative',
                'overflow:hidden',
            ].join(';');

            const heading = document.createElement('div');
            heading.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;';
            const titleGroup = document.createElement('div');
            const titleNode = document.createElement('div');
            titleNode.textContent = title;
            titleNode.style.cssText = 'font-size:22px;font-weight:700;color:#0f172a;';
            const subtitleNode = document.createElement('div');
            subtitleNode.textContent = subtitle || `จำนวนทั้งหมด ${rows.length} รายการ`;
            subtitleNode.style.cssText = 'font-size:12px;color:#64748b;margin-top:3px;';
            const filterNode = document.createElement('div');
            filterNode.textContent = filterSummary;
            filterNode.style.cssText = 'font-size:11px;color:#475569;margin-top:4px;max-width:820px;line-height:1.35;';
            titleGroup.append(titleNode, subtitleNode);
            if (filterSummary) titleGroup.appendChild(filterNode);

            const generated = document.createElement('div');
            generated.textContent = `วันที่พิมพ์ ${new Date().toLocaleDateString('th-TH')}`;
            generated.style.cssText = 'font-size:12px;color:#475569;text-align:right;';
            heading.append(titleGroup, generated);
            page.appendChild(heading);

            const table = document.createElement('table');
            table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;';
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            columns.forEach((column) => {
                headerRow.appendChild(createCell(column.header, column.width, { header: true, align: column.align || 'center' }));
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            pages[pageIndex].forEach((row, rowIndex) => {
                const tr = document.createElement('tr');
                columns.forEach((column) => {
                    tr.appendChild(createCell(column.value(row, pageIndex * rowsPerPage + rowIndex), column.width, { align: column.align || 'left' }));
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            page.appendChild(table);

            const footer = document.createElement('div');
            footer.textContent = `หน้า ${pageIndex + 1} / ${pages.length}`;
            footer.style.cssText = 'position:absolute;left:38px;right:38px;bottom:14px;text-align:center;font-size:11px;color:#64748b;';
            page.appendChild(footer);
            printRoot.replaceChildren(page);

            const canvas = await html2canvas(page, {
                scale: 1.5,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });
            if (pageIndex > 0) pdf.addPage('a4', 'landscape');
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 297, 210);
        }

        pdf.save(`${filePrefix}_${formatExportDate()}.pdf`);
    } finally {
        printRoot.remove();
    }
};
