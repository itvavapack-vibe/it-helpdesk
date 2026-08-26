import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Building2, CalendarDays, ChevronRight, Clock3, Download, Loader2, RotateCcw, Search } from 'lucide-react'
import { secretaryGetDepartmentOverview } from './secretaryApi'
import { formatSecretaryDate, SECRETARY_DEPARTMENT_OPTIONS, SECRETARY_IMPACTS, SECRETARY_STATUS } from './secretaryConstants'
import SecretaryIssueReadOnlyModal from './SecretaryIssueReadOnlyModal'
import SecretaryStatusBadge from './SecretaryStatusBadge'

const emptySummary = { open: 0, pending: 0, in_progress: 0 }
const formatDamageValue = (value) => value == null || value === ''
  ? '-'
  : `${new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} บาท`

const SecretaryDepartmentOverview = () => {
  const [overview, setOverview] = useState({ summary: emptySummary, departments: [] })
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [issues, setIssues] = useState([])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const detailRef = useRef(null)
  const detailRequestIdRef = useRef(0)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError('')
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น')
      setIsLoading(false)
      return undefined
    }
    setSelectedDepartment('')
    setIssues([])
    secretaryGetDepartmentOverview('', { from: dateFrom, to: dateTo })
      .then((data) => {
        if (active) setOverview(data)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (!selectedDepartment) return undefined
    const frameId = window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [selectedDepartment])

  const departments = useMemo(() => {
    const dynamicByName = new Map((overview.departments || []).map((item) => [item.department, item]))
    const names = [...new Set([
      ...SECRETARY_DEPARTMENT_OPTIONS,
      ...dynamicByName.keys(),
    ])]
    return names
      .map((department) => dynamicByName.get(department) || {
        department,
        open_count: 0,
        pending_count: 0,
        in_progress_count: 0,
        last_updated_at: null,
      })
      .sort((left, right) => right.open_count - left.open_count || left.department.localeCompare(right.department, 'th'))
  }, [overview.departments])

  const visibleDepartments = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('th')
    if (!keyword) return departments
    return departments.filter((item) => item.department.toLocaleLowerCase('th').includes(keyword))
  }, [departments, search])

  const selectDepartment = async (department) => {
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    setSelectedDepartment(department)
    setIssues([])
    setIsDetailLoading(true)
    setError('')
    try {
      const data = await secretaryGetDepartmentOverview(department, { from: dateFrom, to: dateTo })
      if (detailRequestIdRef.current === requestId) setIssues(data.issues || [])
    } catch (requestError) {
      if (detailRequestIdRef.current === requestId) setError(requestError.message)
    } finally {
      if (detailRequestIdRef.current === requestId) setIsDetailLoading(false)
    }
  }

  const exportDepartmentReport = async () => {
    setIsExporting(true)
    setError('')
    try {
      const xlsxModule = await import('xlsx-js-style')
      const XLSX = xlsxModule.default || xlsxModule
      const data = await secretaryGetDepartmentOverview('', { includeIssues: true, from: dateFrom, to: dateTo })
      const openIssues = data.issues || []
      const issuesByDepartment = openIssues.reduce((groups, issue) => {
        const department = issue.department || 'ไม่ระบุแผนก'
        if (!groups.has(department)) groups.set(department, [])
        groups.get(department).push(issue)
        return groups
      }, new Map())
      const rows = [
        ['รายงานรายการที่ยังไม่เสร็จสิ้น แยกตามแผนก'],
        [`ช่วงวันที่ ${dateFrom ? formatSecretaryDate(dateFrom) : 'เริ่มต้น'} ถึง ${dateTo ? formatSecretaryDate(dateTo) : 'ปัจจุบัน'}`],
        [`วันที่ออกรายงาน ${formatSecretaryDate(new Date(), { hour: '2-digit', minute: '2-digit' })}`],
        [],
      ]
      const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }]
      const tableSections = []

      ;[...issuesByDepartment.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'th'))
        .forEach(([department, departmentIssues]) => {
          const departmentRow = rows.length
          rows.push([`แผนก: ${department}`, `รายการที่ยังไม่เสร็จสิ้น ${departmentIssues.length} รายการ`])
          merges.push({ s: { r: departmentRow, c: 1 }, e: { r: departmentRow, c: 11 } })
          const headerRow = rows.length
          rows.push(['ลำดับ', 'เลขที่', 'วันที่แจ้ง', 'หัวข้อ', 'หมวดหมู่', 'ผู้แจ้ง', 'ระดับผลกระทบ', 'สถานะ', 'ผู้ดำเนินการ', 'กำหนดแล้วเสร็จ', 'มูลค่าความเสียหาย', 'รายละเอียด'])
          const firstDataRow = rows.length
          departmentIssues.forEach((issue, index) => {
            rows.push([
              index + 1,
              issue.issue_number,
              formatSecretaryDate(issue.created_at),
              issue.title,
              issue.category,
              issue.reporter_name,
              SECRETARY_IMPACTS[issue.impact_level]?.label || issue.impact_level,
              SECRETARY_STATUS[issue.status]?.label || issue.status,
              issue.assigned_name || '',
              formatSecretaryDate(issue.expected_completion_date),
              issue.damage_value == null ? '' : Number(issue.damage_value),
              issue.description || '',
            ])
          })
          tableSections.push({ departmentRow, headerRow, firstDataRow, lastDataRow: rows.length - 1 })
          rows.push([])
        })

      if (!openIssues.length) rows.push(['ไม่มีรายการที่ยังไม่เสร็จสิ้น'])
      const worksheet = XLSX.utils.aoa_to_sheet(rows)
      worksheet['!merges'] = merges
      worksheet['!cols'] = [8, 18, 15, 36, 30, 24, 16, 20, 24, 18, 18, 48].map((wch) => ({ wch }))
      worksheet['!rows'] = rows.map((_, index) => ({ hpt: index === 0 ? 26 : 22 }))

      const border = {
        top: { style: 'thin', color: { rgb: '94A3B8' } },
        bottom: { style: 'thin', color: { rgb: '94A3B8' } },
        left: { style: 'thin', color: { rgb: '94A3B8' } },
        right: { style: 'thin', color: { rgb: '94A3B8' } },
      }
      const getCell = (row, column) => {
        const address = XLSX.utils.encode_cell({ r: row, c: column })
        if (!worksheet[address]) worksheet[address] = { t: 's', v: '' }
        return worksheet[address]
      }
      const styleRow = (row, style) => {
        for (let column = 0; column < 12; column += 1) {
          getCell(row, column).s = style
        }
      }

      getCell(0, 0).s = {
        font: { bold: true, sz: 16, color: { rgb: '1E293B' } },
        alignment: { vertical: 'center' },
      }
      getCell(1, 0).s = { font: { color: { rgb: '475569' } } }
      getCell(2, 0).s = { font: { color: { rgb: '64748B' } } }
      tableSections.forEach(({ departmentRow, headerRow, firstDataRow, lastDataRow }) => {
        styleRow(departmentRow, {
          border,
          fill: { patternType: 'solid', fgColor: { rgb: '4F46E5' } },
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { vertical: 'center', wrapText: true },
        })
        styleRow(headerRow, {
          border,
          fill: { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } },
          font: { bold: true, color: { rgb: '1E293B' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        })
        for (let row = firstDataRow; row <= lastDataRow; row += 1) {
          styleRow(row, {
            border,
            alignment: { vertical: 'top', wrapText: true },
          })
        }
        worksheet['!rows'][departmentRow] = { hpt: 24 }
        worksheet['!rows'][headerRow] = { hpt: 32 }
      })

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'รายการค้างรายแผนก')
      XLSX.writeFile(workbook, `Secretary_Department_Open_Issues_${new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) {
    return <div className="grid min-h-80 place-items-center text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
  }

  const summary = overview.summary || emptySummary

  return (
    <section>
      <div className="mb-6">
        <div>
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">DEPARTMENT OVERVIEW</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">แผนผังภาพรวม</h2>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-y border-slate-200 py-3 dark:border-slate-700">
          <span className="mb-2 hidden h-5 w-5 shrink-0 text-slate-400 xl:block"><CalendarDays className="h-5 w-5" /></span>
          <label className="w-[calc(50%-0.25rem)] min-w-0 sm:w-48 sm:flex-none">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">วันที่เริ่มต้น</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-950/60" />
          </label>
          <label className="w-[calc(50%-0.25rem)] min-w-0 sm:w-48 sm:flex-none">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">วันที่สิ้นสุด</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-950/60" />
          </label>
          {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo('') }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-500 shadow-sm hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300" title="ล้างช่วงวันที่" aria-label="ล้างช่วงวันที่"><RotateCcw className="h-4 w-4" /></button>}
          <label className="relative block min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาแผนก" className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-950/60" />
          </label>
          <button type="button" onClick={exportDepartmentReport} disabled={isExporting} className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Report
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Building2 className="h-5 w-5" /></span>
          <span><span className="block text-xs font-semibold text-slate-500">ยังไม่เสร็จสิ้น</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-white">{summary.open}</strong></span>
        </div>
        <div className="flex min-h-24 items-center gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm dark:border-rose-800 dark:bg-rose-950/40">
          <AlertCircle className="h-7 w-7 shrink-0 text-rose-600 dark:text-rose-300" />
          <span><span className="block text-xs font-semibold text-rose-700 dark:text-rose-300">รอดำเนินการ</span><strong className="mt-1 block text-2xl text-rose-800 dark:text-rose-200">{summary.pending}</strong></span>
        </div>
        <div className="flex min-h-24 items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-800 dark:bg-amber-950/40">
          <Clock3 className="h-7 w-7 shrink-0 text-amber-600 dark:text-amber-300" />
          <span><span className="block text-xs font-semibold text-amber-700 dark:text-amber-300">กำลังดำเนินการ</span><strong className="mt-1 block text-2xl text-amber-800 dark:text-amber-200">{summary.in_progress}</strong></span>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
        {visibleDepartments.map((item) => {
          const isSelected = selectedDepartment === item.department
          const hasOpenIssues = item.open_count > 0
          const statusStyle = hasOpenIssues
            ? 'border-rose-200/80 border-b-rose-400/70 bg-gradient-to-br from-rose-50/85 via-white/55 to-rose-100/70 text-rose-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.90),0_8px_24px_rgba(244,63,94,0.10)] hover:border-rose-300/90 hover:border-b-rose-500/80 hover:from-rose-100/90 hover:via-white/65 hover:to-rose-200/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_12px_28px_rgba(244,63,94,0.16)] dark:border-rose-700/45 dark:border-b-rose-500/65 dark:from-rose-950/70 dark:via-slate-900/45 dark:to-rose-900/50 dark:text-rose-100 dark:hover:border-rose-600/60 dark:hover:border-b-rose-400/75 dark:hover:from-rose-950/80 dark:hover:via-slate-900/50 dark:hover:to-rose-800/55'
            : 'border-emerald-200/80 border-b-emerald-400/70 bg-gradient-to-br from-emerald-50/85 via-white/55 to-emerald-100/70 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.90),0_8px_24px_rgba(16,185,129,0.10)] hover:border-emerald-300/90 hover:border-b-emerald-500/80 hover:from-emerald-100/90 hover:via-white/65 hover:to-emerald-200/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_12px_28px_rgba(16,185,129,0.16)] dark:border-emerald-700/45 dark:border-b-emerald-500/65 dark:from-emerald-950/65 dark:via-slate-900/45 dark:to-emerald-900/45 dark:text-emerald-100 dark:hover:border-emerald-600/60 dark:hover:border-b-emerald-400/75 dark:hover:from-emerald-950/75 dark:hover:via-slate-900/50 dark:hover:to-emerald-800/50'
          const selectedStyle = isSelected
            ? hasOpenIssues
              ? 'ring-2 ring-rose-400 shadow-md shadow-rose-100 dark:ring-rose-500 dark:shadow-rose-950/40'
              : 'ring-2 ring-emerald-400 shadow-md shadow-emerald-100 dark:ring-emerald-500 dark:shadow-emerald-950/40'
            : ''
          return (
            <button key={item.department} type="button" onClick={() => selectDepartment(item.department)} className={`relative min-h-24 overflow-hidden rounded-lg border border-b-2 p-3 text-left backdrop-blur-xl ring-1 ring-inset ring-white/70 transition-[background-color,border-color,box-shadow] dark:ring-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${statusStyle} ${selectedStyle}`}>
              <span aria-hidden="true" className="absolute inset-x-4 top-0 h-px bg-white/95 dark:bg-white/25" />
              {hasOpenIssues && <span className="absolute right-2.5 top-2.5 inline-flex min-w-11 items-center justify-center rounded-full border border-white/80 bg-rose-600 px-3 py-1 text-center text-xs font-bold text-white shadow-md shadow-rose-200/70 after:absolute after:-bottom-1 after:right-3 after:h-2 after:w-2 after:rotate-45 after:border-b after:border-r after:border-white/80 after:bg-rose-600 dark:border-rose-300/30 dark:shadow-rose-950/40 dark:after:border-rose-300/30">{item.open_count}</span>}
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${hasOpenIssues ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300'}`}><Building2 className="h-4 w-4" /></span>
              <strong className="mt-2 block pr-9 text-sm leading-5">{item.department}</strong>
              <span className={`mt-1.5 flex items-center gap-2.5 text-[11px] font-medium ${hasOpenIssues ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}><span>รอ {item.pending_count}</span><span>กำลังทำ {item.in_progress_count}</span></span>
            </button>
          )
        })}
      </div>

      {selectedDepartment && (
        <div ref={detailRef} className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 dark:border-slate-700">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-slate-500">รายการที่ยังไม่เสร็จสิ้น</p><h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{selectedDepartment}</h3></div>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">{issues.length} รายการ</span>
          </div>

          {isDetailLoading ? (
            <div className="grid min-h-44 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>
          ) : issues.length ? (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80 md:block">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-400"><tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">แผนก</th><th className="px-4 py-3">รายการปัญหา</th><th className="px-4 py-3">ผู้แจ้ง</th><th className="px-4 py-3">ผลกระทบ</th><th className="px-4 py-3">มูลค่าความเสียหาย</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">วันที่คาดว่าจะแล้วเสร็จ</th><th className="px-4 py-3">วันที่แจ้ง</th><th className="w-12 px-3 py-3" /></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {issues.map((issue) => <tr key={issue.id} role="button" tabIndex={0} onClick={() => setSelectedIssue(issue)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedIssue(issue) } }} className="cursor-pointer hover:bg-indigo-50/60 focus:bg-indigo-50/60 focus:outline-none dark:hover:bg-indigo-950/20 dark:focus:bg-indigo-950/20"><td className="whitespace-nowrap px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-300">{issue.issue_number}</td><td className="max-w-48 px-4 py-3 text-slate-600 dark:text-slate-300">{issue.department || '-'}</td><td className="max-w-md px-4 py-3"><strong className="block text-slate-800 dark:text-slate-100">{issue.title}</strong><span className="mt-1 block truncate text-xs text-slate-500">{issue.category}</span></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{issue.reporter_name}</td><td className={`whitespace-nowrap px-4 py-3 font-semibold ${SECRETARY_IMPACTS[issue.impact_level]?.className || ''}`}>{SECRETARY_IMPACTS[issue.impact_level]?.label || issue.impact_level}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDamageValue(issue.damage_value)}</td><td className="px-4 py-3"><SecretaryStatusBadge status={issue.status} /></td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{issue.expected_completion_date ? formatSecretaryDate(issue.expected_completion_date) : '-'}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatSecretaryDate(issue.created_at)}</td><td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-400" /></td></tr>)}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {issues.map((issue) => <button key={issue.id} type="button" onClick={() => setSelectedIssue(issue)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-indigo-700"><span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{issue.issue_number}</span><strong className="mt-1 block text-sm text-slate-800 dark:text-slate-100">{issue.title}</strong></span><span className="flex shrink-0 items-center gap-2"><SecretaryStatusBadge status={issue.status} /><ChevronRight className="h-4 w-4 text-slate-400" /></span></span><span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-500"><span><span className="block text-[10px]">แผนก</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{issue.department || '-'}</strong></span><span><span className="block text-[10px]">ผู้แจ้ง</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{issue.reporter_name}</strong></span><span><span className="block text-[10px]">มูลค่าความเสียหาย</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{formatDamageValue(issue.damage_value)}</strong></span><span><span className="block text-[10px]">วันที่คาดว่าจะแล้วเสร็จ</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{issue.expected_completion_date ? formatSecretaryDate(issue.expected_completion_date) : '-'}</strong></span></span><span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{formatSecretaryDate(issue.created_at)}</span><span className={SECRETARY_IMPACTS[issue.impact_level]?.className}>{SECRETARY_IMPACTS[issue.impact_level]?.label || issue.impact_level}</span></span></button>)}
              </div>
            </>
          ) : <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">ไม่มีรายการที่ยังไม่เสร็จสิ้น</div>}
        </div>
      )}

      {selectedIssue && <SecretaryIssueReadOnlyModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />}
    </section>
  )
}

export default SecretaryDepartmentOverview
