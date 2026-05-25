import Swal from 'sweetalert2'

/** URL สาธารณะของแอป (ตั้ง VITE_PUBLIC_URL สำหรับ LAN เช่น http://192.168.10.213:5173) */
export function buildCloseIssueLink(issueId) {
  const configured = import.meta.env.VITE_PUBLIC_URL?.trim()
  const origin =
    configured ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  const path =
    typeof window !== 'undefined' ? window.location.pathname : '/'
  const base = origin.replace(/\/+$/, '')
  const route = path.startsWith('/') ? path : `/${path}`
  return `${base}${route}?closeIssue=${encodeURIComponent(issueId)}`
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

export async function showCloseIssueLinkDialog(issue) {
  const link = buildCloseIssueLink(issue.id)
  const result = await Swal.fire({
    title: 'ส่งลิงก์เซ็นปิดจบงาน',
    html: `
      <p class="text-sm text-slate-600 mb-3">สถานะ <b>เสร็จสิ้น</b> แล้ว — ส่งลิงก์ให้ <b>${issue.name}</b> เพื่อเซ็นยืนยันปิดงาน</p>
      <input id="close-issue-link" readonly value="${link.replace(/"/g, '&quot;')}"
        class="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 font-mono text-indigo-700" />
    `,
    icon: 'success',
    showCancelButton: true,
    confirmButtonText: 'คัดลอกลิงก์',
    cancelButtonText: 'ปิด',
    didOpen: () => {
      const input = document.getElementById('close-issue-link')
      input?.addEventListener('click', () => input.select())
    },
  })

  if (result.isConfirmed) {
    await copyText(link)
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'คัดลอกลิงก์แล้ว',
      showConfirmButton: false,
      timer: 2000,
    })
  }
  return link
}
