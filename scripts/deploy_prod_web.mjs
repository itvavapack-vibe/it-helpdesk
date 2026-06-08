import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(__dirname, '..')
const configPath = path.join(__dirname, '.deploy-prod-web.local.json')
const host = process.env.DEPLOY_WEB_HOST || '127.0.0.1'
const port = Number(process.env.DEPLOY_WEB_PORT || 4783)
const token = process.env.DEPLOY_WEB_TOKEN || crypto.randomBytes(16).toString('hex')
const npmCommand = os.platform() === 'win32' ? 'npm.cmd' : 'npm'
const defaultMigrations = [
  'scripts/run-migrate-computermodels.mjs',
  'scripts/run-migrate-change-request-attachments.mjs',
  'scripts/run-migrate-issue-report.mjs',
  'scripts/run-migrate-change-request-category.mjs',
  'scripts/run-migrate-admin-position.mjs',
  'scripts/run-migrate-admin-signature.mjs',
  'scripts/run-migrate-admin-security.mjs',
  'scripts/run-migrate-access-request-acknowledgement.mjs',
]

let isDeploying = false
const clients = new Set()

function sendEvent(payload) {
  for (const client of clients) {
    client.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
}

function sendLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  console.log(line)
  sendEvent({ type: 'log', line })
}

function sendStep(id, label, status, detail = '') {
  sendEvent({
    type: 'step',
    id,
    label,
    status,
    detail,
    time: new Date().toLocaleTimeString(),
  })
}

function sendDeployState(status, message) {
  sendEvent({
    type: 'deploy',
    status,
    message,
    time: new Date().toLocaleTimeString(),
  })
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function readEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function htmlResponse(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(html)
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 100_000) {
        reject(new Error('Request body is too large'))
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function requireToken(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const supplied = url.searchParams.get('token') || req.headers['x-deploy-token']
  if (supplied === token) return true
  jsonResponse(res, 401, { error: 'Invalid deploy token' })
  return false
}

function spawnCommand(command, args, options) {
  if (os.platform() === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], options)
  }
  return spawn(command, args, options)
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const display = `${command} ${args.join(' ')}`
    sendLog(`> ${display}`)
    let child
    try {
      child = spawnCommand(command, args, {
        cwd,
        shell: false,
        env: process.env,
        windowsHide: true,
      })
    } catch (error) {
      reject(new Error(`Cannot start command "${display}": ${error.message}`))
      return
    }

    child.stdout.on('data', chunk => {
      for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) sendLog(line)
    })
    child.stderr.on('data', chunk => {
      for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) sendLog(line)
    })
    child.on('error', error => reject(new Error(`Cannot start command "${display}": ${error.message}`)))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed (${code}): ${display}`))
    })
  })
}

function output(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const display = `${command} ${args.join(' ')}`
    let child
    try {
      child = spawnCommand(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
      })
    } catch (error) {
      reject(new Error(`Cannot start command "${display}": ${error.message}`))
      return
    }
    let text = ''
    child.stdout.on('data', chunk => {
      text += chunk
    })
    child.stderr.on('data', chunk => {
      text += chunk
    })
    child.on('error', error => reject(new Error(`Cannot start command "${display}": ${error.message}`)))
    child.on('close', code => {
      if (code === 0) resolve(text.trim())
      else reject(new Error(text.trim() || `Command failed (${code}): ${display}`))
    })
  })
}

async function stopWindowsPorts(ports) {
  if (os.platform() !== 'win32') return

  const text = await output('netstat', ['-ano', '-p', 'tcp'], appRoot)
  const pids = new Set()
  for (const line of text.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/)
    if (columns.length < 5 || columns.at(-2)?.toUpperCase() !== 'LISTENING') continue
    const localAddress = columns[1]
    const localPort = Number(localAddress.split(':').pop())
    const pid = Number(columns.at(-1))
    if (ports.includes(localPort) && pid && pid !== process.pid) pids.add(pid)
  }

  for (const pid of [...pids].sort((a, b) => a - b)) {
    await run('taskkill', ['/PID', String(pid), '/T', '/F'], appRoot)
  }
}

function startProduction(productionPath) {
  sendLog('> npm run lan')
  if (os.platform() === 'win32') {
    spawn('cmd.exe', ['/k', 'npm run lan'], {
      cwd: productionPath,
      detached: true,
      stdio: 'ignore',
    }).unref()
  } else {
    spawn(npmCommand, ['run', 'lan'], {
      cwd: productionPath,
      detached: true,
      stdio: 'ignore',
    }).unref()
  }
  sendLog('Production started in a new terminal window.')
}

function validateDeployPayload(payload) {
  const sourcePath = path.resolve(payload.sourcePath || appRoot)
  const productionPath = path.resolve(payload.productionPath || '')
  const branch = String(payload.branch || 'main').trim()
  const commitMessage = String(payload.commitMessage || 'deploy: update helpdesk').trim()
  const runMigrations = Boolean(payload.runMigrations)
  const stopPorts = payload.stopPorts !== false
  const stashProductionChanges = payload.stashProductionChanges !== false
  const migrations = Array.isArray(payload.migrations) ? payload.migrations : []

  if (!fs.existsSync(path.join(sourcePath, 'package.json'))) {
    throw new Error('Test project folder is invalid.')
  }
  if (!fs.existsSync(path.join(productionPath, 'package.json'))) {
    throw new Error('Production project folder is invalid.')
  }
  if (sourcePath === productionPath) {
    throw new Error('Test and production folders must be different.')
  }
  if (!fs.existsSync(path.join(productionPath, '.env'))) {
    throw new Error('Production .env is missing.')
  }
  if (!branch) throw new Error('Git branch is required.')
  if (!commitMessage) throw new Error('Commit message is required.')

  return {
    sourcePath,
    productionPath,
    branch,
    commitMessage,
    runMigrations,
    stopPorts,
    stashProductionChanges,
    migrations,
  }
}

async function deploy(payload) {
  if (isDeploying) throw new Error('A deploy is already running.')
  isDeploying = true
  let activeStep = null

  const step = async (id, label, action) => {
    activeStep = { id, label }
    sendStep(id, label, 'running')
    try {
      const detail = await action()
      sendStep(id, label, 'success', detail || '')
      activeStep = null
      return detail
    } catch (error) {
      sendStep(id, label, 'error', error.message)
      activeStep = null
      throw error
    }
  }

  try {
    sendDeployState('running', 'กำลัง Deploy Production...')
    let values
    let productionStatus
    let sourceStatus
    await step('validate', 'ตรวจสอบโปรเจกต์และการตั้งค่า', async () => {
      values = validateDeployPayload(payload)
      writeJson(configPath, values)

      const sourceBranch = await output('git', ['branch', '--show-current'], values.sourcePath)
      if (sourceBranch !== values.branch) {
        throw new Error(`Test project is on branch '${sourceBranch}', not '${values.branch}'.`)
      }

      productionStatus = await output('git', ['status', '--short'], values.productionPath)
      if (productionStatus && !values.stashProductionChanges) {
        throw new Error(`Production has uncommitted files:\n${productionStatus}`)
      }
      sourceStatus = await output('git', ['status', '--short'], values.sourcePath)
      return `Branch: ${values.branch}\nChanged files: ${sourceStatus ? sourceStatus.split(/\r?\n/).length : 0}`
    })

    sendLog('Starting production deploy...')
    if (sourceStatus) {
      sendLog(`Changed files:\n${sourceStatus}`)
      await step('commit', 'บันทึกการเปลี่ยนแปลงจากฝั่งทดสอบ', async () => {
        await run('git', ['add', '-A'], values.sourcePath)
        await run('git', ['commit', '-m', values.commitMessage], values.sourcePath)
        return sourceStatus
      })
    } else {
      sendLog('No local test-project changes to commit.')
      sendStep('commit', 'บันทึกการเปลี่ยนแปลงจากฝั่งทดสอบ', 'skipped', 'ไม่มีไฟล์ใหม่ที่ต้อง commit')
    }

    await step('push', 'ส่งโค้ดขึ้น GitHub', async () => {
      await run('git', ['push', 'origin', values.branch], values.sourcePath)
      return `Pushed branch: ${values.branch}`
    })

    if (productionStatus) {
      sendLog(`Production has uncommitted files. Backing them up before deploy:\n${productionStatus}`)
      await step('backup', 'สำรองไฟล์ที่ค้างใน Production', async () => {
        const stashMessage = `pre-deploy backup ${new Date().toISOString()}`
        await run('git', ['stash', 'push', '--include-untracked', '-m', stashMessage], values.productionPath)
        sendLog(`Production local changes were saved in git stash: ${stashMessage}`)
        sendLog('The backup will stay in git stash and will not overwrite the deployed version.')
        return `${stashMessage}\n${productionStatus}`
      })
    } else {
      sendStep('backup', 'สำรองไฟล์ที่ค้างใน Production', 'skipped', 'Production ไม่มีไฟล์ที่ยังไม่ commit')
    }

    await step('update-production', 'อัปเดตโค้ด Production', async () => {
      await run('git', ['checkout', values.branch], values.productionPath)
      await run('git', ['pull', '--ff-only', 'origin', values.branch], values.productionPath)
      return `Production updated from origin/${values.branch}`
    })

    await step('install', 'ติดตั้งแพ็กเกจ Production', async () => {
      await run(npmCommand, ['install'], values.productionPath)
      return 'npm install completed'
    })

    if (values.runMigrations) {
      sendLog('Running production database migrations...')
      await step('migrations', 'อัปเดตฐานข้อมูล Production', async () => {
        if (!values.migrations.length) {
          throw new Error('Run database migrations is checked, but no migrations were selected.')
        }
        for (const migration of values.migrations) {
          const migrationPath = path.join(values.productionPath, migration)
          if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file does not exist in production: ${migration}`)
          }
          await run('node', [migration], values.productionPath)
        }
        return values.migrations.join('\n')
      })
    } else {
      sendLog('Database migrations skipped.')
      sendStep('migrations', 'อัปเดตฐานข้อมูล Production', 'skipped', 'ไม่ได้เลือกให้อัปเดตฐานข้อมูล')
    }

    await step('restart', 'รีสตาร์ตเว็บและ API Production', async () => {
      const env = readEnvFile(path.join(values.productionPath, '.env'))
      const webPort = Number(env.VITE_WEB_PORT || 5173)
      const apiPort = Number(env.API_PORT || 4000)
      if (values.stopPorts) {
        await stopWindowsPorts([webPort, apiPort])
      }
      startProduction(values.productionPath)
      return `Web port: ${webPort}\nAPI port: ${apiPort}`
    })

    sendLog('Deploy completed successfully.')
    sendDeployState('success', 'Deploy Production สำเร็จ')
  } catch (error) {
    if (activeStep) {
      sendStep(activeStep.id, activeStep.label, 'error', error.message)
    }
    sendDeployState('error', error.message)
    throw error
  } finally {
    isDeploying = false
  }
}

function pageHtml(saved) {
  const escapedSaved = JSON.stringify({
    sourcePath: saved.sourcePath || saved.source_dir || appRoot,
    productionPath: saved.productionPath || saved.production_dir || '',
    branch: saved.branch || 'main',
    commitMessage: saved.commitMessage || saved.commit_message || 'deploy: update helpdesk',
    stopPorts: saved.stopPorts ?? saved.stop_ports ?? true,
    stashProductionChanges: saved.stashProductionChanges ?? true,
    runMigrations: saved.runMigrations || false,
    migrations: saved.migrations || defaultMigrations,
  }).replaceAll('<', '\\u003c')

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Deploy ระบบ IT Helpdesk</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; }
    body { margin: 0; background: #0f172a; color: #e2e8f0; }
    main { max-width: 980px; margin: 0 auto; padding: 28px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 18px; padding: 22px; box-shadow: 0 20px 70px #02061766; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    p { color: #94a3b8; }
    label { display: block; margin: 14px 0 6px; color: #cbd5e1; font-weight: 650; }
    input[type="text"] { width: 100%; box-sizing: border-box; border: 1px solid #475569; border-radius: 10px; padding: 11px 12px; background: #020617; color: #f8fafc; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .hidden-field { display: none; }
    .check { display: flex; gap: 10px; align-items: center; margin: 14px 0; }
    .check label { margin: 0; font-weight: 500; }
    button { width: 100%; border: 0; border-radius: 12px; padding: 13px 16px; background: #38bdf8; color: #082f49; font-weight: 800; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    .danger { color: #fca5a5; }
    .summary { margin-top: 20px; border: 1px solid #334155; border-radius: 14px; overflow: hidden; background: #0b1220; }
    .summary-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #334155; font-weight: 800; }
    .summary-head.running { color: #7dd3fc; }
    .summary-head.success { color: #6ee7b7; }
    .summary-head.error { color: #fda4af; }
    .steps { display: grid; gap: 1px; background: #334155; }
    .step { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: start; padding: 12px 14px; background: #111827; }
    .step-icon { width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; font-size: 14px; font-weight: 900; }
    .step.running .step-icon { color: #082f49; background: #38bdf8; }
    .step.success .step-icon { color: #052e16; background: #4ade80; }
    .step.error .step-icon { color: #450a0a; background: #fb7185; }
    .step.skipped .step-icon { color: #1e293b; background: #94a3b8; }
    .step-title { color: #e2e8f0; font-weight: 750; }
    .step-detail { margin-top: 4px; color: #94a3b8; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .step-status { color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 800; }
    .step.running .step-status { color: #7dd3fc; }
    .step.success .step-status { color: #6ee7b7; }
    .step.error .step-status { color: #fda4af; }
    pre { min-height: 260px; max-height: 420px; overflow: auto; white-space: pre-wrap; background: #020617; border: 1px solid #334155; border-radius: 14px; padding: 16px; color: #d1fae5; }
    .muted { color: #94a3b8; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>Deploy ระบบ IT Helpdesk</h1>
      <p>ส่งโค้ดจากก้อนเทสขึ้นก้อนจริง และเปิดระบบก้อนจริงใหม่ให้อัตโนมัติ</p>

      <label>โฟลเดอร์ก้อนเทส</label>
      <input id="sourcePath" type="text" />

      <label>โฟลเดอร์ก้อนจริง</label>
      <input id="productionPath" type="text" placeholder="C:\\Next.js Project\\it-helpdesk" />

      <div class="row">
        <div>
          <label>Branch ที่จะ deploy</label>
          <input id="branch" type="text" />
        </div>
        <div>
          <label>ข้อความ commit</label>
          <input id="commitMessage" type="text" />
        </div>
      </div>

      <div class="check">
        <input id="stopPorts" type="checkbox" />
        <label for="stopPorts">ปิดเว็บ/API ก้อนจริงก่อนเปิดใหม่</label>
      </div>

      <div class="check">
        <input id="stashProductionChanges" type="checkbox" />
        <label for="stashProductionChanges">สำรองไฟล์ที่ค้างในก้อนจริงก่อน deploy</label>
      </div>

      <div class="check">
        <input id="runMigrations" type="checkbox" />
        <label for="runMigrations">Migrate database / อัปเดตฐานข้อมูลจริง <span class="danger">(มีผลกับ DB จริง)</span></label>
      </div>

      <p class="muted">ระบบจะไม่คัดลอกหรือเขียนทับไฟล์ .env ของก้อนจริง</p>
      <button id="deploy">เริ่ม Deploy โค้ดขึ้นก้อนจริง</button>
      <div class="summary">
        <div id="summaryHead" class="summary-head">● พร้อม deploy</div>
        <div id="steps" class="steps"></div>
      </div>
      <h2>บันทึกการทำงาน</h2>
      <pre id="log"></pre>
    </section>
  </main>

  <script>
    const saved = ${escapedSaved}
    const token = new URLSearchParams(location.search).get('token')
    const ids = ['sourcePath', 'productionPath', 'branch', 'commitMessage', 'stopPorts', 'stashProductionChanges', 'runMigrations']
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element.type === 'checkbox') element.checked = Boolean(saved[id])
      else element.value = saved[id] || ''
    }
    const log = document.getElementById('log')
    const deployButton = document.getElementById('deploy')
    const summaryHead = document.getElementById('summaryHead')
    const steps = document.getElementById('steps')
    const stepElements = new Map()
    const statusMeta = {
      running: { icon: '↻', text: 'กำลังทำ' },
      success: { icon: '✓', text: 'สำเร็จ' },
      error: { icon: '!', text: 'ล้มเหลว' },
      skipped: { icon: '−', text: 'ข้าม' },
    }
    const escapeHtml = value => String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
    const resetSummary = () => {
      stepElements.clear()
      steps.innerHTML = ''
      summaryHead.className = 'summary-head running'
      summaryHead.textContent = '↻ กำลังเตรียม deploy...'
    }
    const renderStep = event => {
      let element = stepElements.get(event.id)
      if (!element) {
        element = document.createElement('div')
        steps.appendChild(element)
        stepElements.set(event.id, element)
      }
      const meta = statusMeta[event.status] || statusMeta.running
      element.className = 'step ' + event.status
      element.innerHTML =
        '<span class="step-icon">' + meta.icon + '</span>' +
        '<div><div class="step-title">' + escapeHtml(event.label) + '</div>' +
        (event.detail ? '<div class="step-detail">' + escapeHtml(event.detail) + '</div>' : '') +
        '</div><span class="step-status">' + meta.text + '</span>'
    }
    const events = new EventSource('/api/logs?token=' + encodeURIComponent(token || ''))
    events.onmessage = event => {
      const payload = JSON.parse(event.data)
      if (payload.type === 'log') {
        log.textContent += payload.line + '\\n'
        log.scrollTop = log.scrollHeight
      } else if (payload.type === 'step') {
        renderStep(payload)
      } else if (payload.type === 'deploy') {
        summaryHead.className = 'summary-head ' + payload.status
        summaryHead.textContent = (payload.status === 'success' ? '✓ ' : payload.status === 'error' ? '! ' : '↻ ') + payload.message
        if (payload.status === 'success' || payload.status === 'error') deployButton.disabled = false
      }
    }

    deployButton.addEventListener('click', async () => {
      const runMigrations = document.getElementById('runMigrations').checked
      const migrations = runMigrations ? saved.migrations : []
      const payload = {
        sourcePath: document.getElementById('sourcePath').value.trim(),
        productionPath: document.getElementById('productionPath').value.trim(),
        branch: document.getElementById('branch').value.trim(),
        commitMessage: document.getElementById('commitMessage').value.trim(),
        stopPorts: document.getElementById('stopPorts').checked,
        stashProductionChanges: document.getElementById('stashProductionChanges').checked,
        runMigrations,
        migrations,
      }
      const dbWarning = runMigrations ? '\\n\\nระบบจะ migrate database ก้อนจริงด้วย' : ''
      if (!confirm('ยืนยัน deploy ขึ้นก้อนจริงตอนนี้หรือไม่?' + dbWarning)) return

      resetSummary()
      log.textContent = ''
      deployButton.disabled = true
      try {
        const response = await fetch('/api/deploy?token=' + encodeURIComponent(token || ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await response.json()
        if (!response.ok) {
          deployButton.disabled = false
          alert(result.error || 'Deploy ไม่สำเร็จ')
        }
      } catch (error) {
        deployButton.disabled = false
        alert(error.message || 'Deploy ไม่สำเร็จ')
      }
    })
  </script>
</body>
</html>`
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (url.pathname === '/') {
      if (!requireToken(req, res)) return
      htmlResponse(res, pageHtml(readJson(configPath)))
      return
    }

    if (url.pathname === '/api/logs') {
      if (!requireToken(req, res)) return
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      })
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (url.pathname === '/api/deploy' && req.method === 'POST') {
      if (!requireToken(req, res)) return
      const body = await collectBody(req)
      deploy(body).catch(error => sendLog(`ERROR: ${error.message}`))
      jsonResponse(res, 202, { ok: true })
      return
    }

    jsonResponse(res, 404, { error: 'Not found' })
  } catch (error) {
    jsonResponse(res, 500, { error: error.message })
  }
})

server.listen(port, host, () => {
  const url = `http://${host}:${port}/?token=${token}`
  console.log(`Deploy web is running: ${url}`)
  console.log('Keep this terminal open while using the deploy page.')
  if (os.platform() === 'win32' && process.env.DEPLOY_WEB_OPEN !== 'false') {
    spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true })
  }
})
