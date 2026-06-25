import Swal from 'sweetalert2'

/** URL สาธารณะของแอป (ตั้ง VITE_PUBLIC_URL สำหรับ LAN เช่น http://192.168.10.213:5173) */
const buildWorkflowLink = (path, queryKey, id) => {
  const configured = import.meta.env.VITE_PUBLIC_URL?.trim()
  const origin =
    configured ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  const base = origin.replace(/\/+$/, '')
  return `${base}${path}?${queryKey}=${encodeURIComponent(id)}`
}

export function buildCloseIssueLink(issueId) {
  return buildWorkflowLink('/close-issue', 'closeIssue', issueId)
}

export function buildBorrowReturnIssueLink(issueId) {
  return buildWorkflowLink('/return-borrow', 'returnBorrowIssue', issueId)
}

export function buildAcceptChangeRequestLink(requestId) {
  return buildWorkflowLink('/accept-change-request', 'acceptChangeReq', requestId)
}

export function buildAcknowledgeAccessRequestLink(requestId) {
  return buildWorkflowLink('/acknowledge-access-request', 'ackAccessReq', requestId)
}

export function buildManagerApprovalLink(requestId, requestType = 'access') {
  return requestType === 'change'
    ? buildWorkflowLink('/approve/change', 'approveChangeReq', requestId)
    : buildWorkflowLink('/approve/access', 'approveRequest', requestId)
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

export async function showBorrowReturnIssueLinkDialog(issue) {
  const link = buildBorrowReturnIssueLink(issue.id)
  const result = await Swal.fire({
    title: 'ส่งลิงก์บันทึกส่งคืน',
    html: `
      <p class="text-sm text-slate-600 mb-3">ส่งลิงก์ให้ <b>${issue.name}</b> เพื่อลงนามส่งคืนคอมพิวเตอร์/อุปกรณ์ IT</p>
      <input id="borrow-return-link" readonly value="${link.replace(/"/g, '&quot;')}"
        class="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 font-mono text-indigo-700" />
    `,
    icon: 'success',
    showCancelButton: true,
    confirmButtonText: 'คัดลอกลิงก์',
    cancelButtonText: 'ปิด',
    didOpen: () => {
      const input = document.getElementById('borrow-return-link')
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

export async function showAcceptChangeRequestLinkDialog(request) {
  const link = buildAcceptChangeRequestLink(request.id)
  const result = await Swal.fire({
    title: 'ส่งลิงก์เซ็นรับมอบงาน',
    html: `
      <p class="text-sm text-slate-600 mb-3">ส่งลิงก์ให้ <b>${request.requester_name}</b> เพื่อเซ็นยืนยันรับมอบและปิดจบคำร้องขอพัฒนา</p>
      <input id="accept-change-request-link" readonly value="${link.replace(/"/g, '&quot;')}"
        class="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 font-mono text-indigo-700" />
    `,
    icon: 'success',
    showCancelButton: true,
    confirmButtonText: 'คัดลอกลิงก์',
    cancelButtonText: 'ปิด',
    didOpen: () => {
      const input = document.getElementById('accept-change-request-link')
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

export async function showAcknowledgeAccessRequestLinkDialog(request) {
  const link = buildAcknowledgeAccessRequestLink(request.id)
  const result = await Swal.fire({
    title: 'ส่งลิงก์ให้ผู้แจ้งรับทราบ',
    html: `
      <p class="text-sm text-slate-600 mb-3">ส่งลิงก์ให้ <b>${request.name_th}</b> เพื่อเซ็นรับทราบผลการดำเนินการคำร้องขอสิทธิ์</p>
      <input id="ack-access-request-link" readonly value="${link.replace(/"/g, '&quot;')}"
        class="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 font-mono text-indigo-700" />
    `,
    icon: 'success',
    showCancelButton: true,
    confirmButtonText: 'คัดลอกลิงก์',
    cancelButtonText: 'ปิด',
    didOpen: () => {
      const input = document.getElementById('ack-access-request-link')
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
