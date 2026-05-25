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
import { loginAdmin } from './lib/auth.js'
import { proxyGlpiRequest } from './lib/glpi-proxy.js'
import { getLanAddresses } from './lib/network.js'

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

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
})

app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    const files = req.files.map(file => ({
      name: file.originalname,
      url: `/uploads/${file.filename}`
    }))
    res.json({ data: files })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
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
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.get('/api/:table', async (req, res) => {
  try {
    return res.json(await getTable(req.params.table, req.query))
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/:table', async (req, res) => {
  try {
    return res.json({ data: await insertTable(req.params.table, req.body.rows) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/:table/upsert', async (req, res) => {
  try {
    return res.json({
      data: await upsertTable(req.params.table, req.body.rows, req.body.upsert),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.put('/api/:table', async (req, res) => {
  try {
    return res.json({ data: await updateTable(req.params.table, req.body.data, req.query) })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.delete('/api/:table', async (req, res) => {
  try {
    return res.json({ data: await deleteTable(req.params.table, req.query) })
  } catch (error) {
    return res.status(500).json({ error: error.message })
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
