import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  deleteTable,
  getTable,
  healthCheck,
  insertTable,
  updateTable,
  upsertTable,
} from './lib/handlers.js'
import {
  changeExpiredPassword,
  getAdminFromRequest,
  getAdminProfile,
  getAdminSecuritySettings,
  loginAdmin,
  unlockAdminAccount,
  updateAdminProfile,
  updateAdminSecuritySettings,
} from './lib/auth.js'
import { proxyGlpiRequest } from './lib/glpi-proxy.js'
import { getLanAddresses } from './lib/network.js'
import { sendTelegramNotification } from './lib/telegram.js'
import { answerAiHelpdeskQuestion } from './lib/ai-helpdesk.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { API_PORT = '4000', API_HOST = '0.0.0.0' } = process.env

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

// Setup Uploads folder
const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Static files for uploads
app.use('/uploads', express.static(uploadDir))

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  },
})

const allowedUploadExtensions = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.gif',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.txt',
  '.webp',
  '.xls',
  '.xlsx',
  '.zip',
])

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase()
    if (allowedUploadExtensions.has(extension)) {
      cb(null, true)
      return
    }
    cb(new Error('Unsupported file type'))
  },
})

const uploadFiles = upload.array('files', 5)

app.post('/api/upload', (req, res) => {
  uploadFiles(req, res, (error) => {
    if (error) {
      const status = error instanceof multer.MulterError ? 400 : 415
      return res.status(status).json({ error: error.message })
    }

    const files = (req.files || []).map(file => ({
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
      url: `/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString(),
    }))
    return res.json({ data: files })
  })
})

app.use('/glpi-proxy', (req, res) => proxyGlpiRequest(req, res))

app.get('/api/health', async (req, res) => {
  try {
    res.json(await healthCheck())
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    return res.json({ data: await loginAdmin(req.body || {}) })
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      code: error.code,
      changeToken: error.changeToken,
      attemptsRemaining: error.attemptsRemaining,
    })
  }
})

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { changeToken, password } = req.body || {}
    return res.json({ data: await changeExpiredPassword(changeToken, password) })
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      code: error.code,
      policyErrors: error.policyErrors,
    })
  }
})

app.put('/api/auth/profile', async (req, res) => {
  try {
    const admin = getAdminFromRequest(req)
    if (!admin) return res.status(401).json({ error: 'Authentication required' })
    return res.json({ data: await updateAdminProfile(admin.id, req.body || {}) })
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      code: error.code,
      policyErrors: error.policyErrors,
    })
  }
})

app.get('/api/auth/profile', async (req, res) => {
  try {
    const admin = getAdminFromRequest(req)
    if (!admin) return res.status(401).json({ error: 'Authentication required' })
    return res.json({ data: await getAdminProfile(admin.id) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/auth/admins/:id/unlock', async (req, res) => {
  try {
    const admin = getAdminFromRequest(req)
    if (!admin) return res.status(401).json({ error: 'Authentication required' })
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'Only Administrator can unlock accounts' })
    return res.json({ data: await unlockAdminAccount(req.params.id) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message, code: error.code })
  }
})

app.get('/api/auth/security-settings', async (req, res) => {
  try {
    const admin = getAdminFromRequest(req)
    if (!admin) return res.status(401).json({ error: 'Authentication required' })
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'Only Administrator can view security settings' })
    return res.json({ data: await getAdminSecuritySettings() })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message, code: error.code })
  }
})

app.put('/api/auth/security-settings', async (req, res) => {
  try {
    const admin = getAdminFromRequest(req)
    if (!admin) return res.status(401).json({ error: 'Authentication required' })
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'Only Administrator can update security settings' })
    return res.json({ data: await updateAdminSecuritySettings(req.body || {}) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message, code: error.code })
  }
})

app.post('/api/telegram/notify', async (req, res) => {
  try {
    return res.json({ data: await sendTelegramNotification(req.body || {}) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/ai-helpdesk/chat', async (req, res) => {
  try {
    return res.json({ data: await answerAiHelpdeskQuestion(req.body || {}) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

function requireAdminsAccess(req, action) {
  const admin = getAdminFromRequest(req)
  if (!admin) {
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }
  if (admin.role !== 'superadmin') {
    const error = new Error(`Only Administrator can ${action} users`)
    error.status = 403
    throw error
  }
  return admin
}

app.get('/api/:table', async (req, res) => {
  try {
    if (req.params.table === 'admins') requireAdminsAccess(req, 'read')
    return res.json(await getTable(req.params.table, req.query))
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/:table', async (req, res) => {
  try {
    if (req.params.table === 'admins') requireAdminsAccess(req, 'write')
    return res.json({ data: await insertTable(req.params.table, req.body.rows) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/:table/upsert', async (req, res) => {
  try {
    if (req.params.table === 'admins') requireAdminsAccess(req, 'write')
    return res.json({
      data: await upsertTable(req.params.table, req.body.rows, req.body.upsert),
    })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.put('/api/:table', async (req, res) => {
  try {
    if (req.params.table === 'admins') requireAdminsAccess(req, 'write')
    return res.json({ data: await updateTable(req.params.table, req.body.data, req.query) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.delete('/api/:table', async (req, res) => {
  try {
    if (req.params.table === 'admins') requireAdminsAccess(req, 'delete')
    return res.json({ data: await deleteTable(req.params.table, req.query) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.listen(Number(API_PORT), API_HOST, () => {
  console.log(`MySQL API listening on http://${API_HOST}:${API_PORT}`)
  console.log(`  Health: http://127.0.0.1:${API_PORT}/api/health`)
  const lanIps = getLanAddresses()
  if (lanIps.length) {
    console.log('  LAN access (other devices on same network):')
    for (const ip of lanIps) {
      console.log(`    http://${ip}:${API_PORT}/api/health`)
    }
  }
})
