import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import {
  deleteTable,
  getTable,
  healthCheck,
  insertTable,
  updateTable,
  upsertTable,
} from './lib/handlers.js'

dotenv.config()

const { API_PORT = '4000' } = process.env

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', async (req, res) => {
  try {
    res.json(await healthCheck())
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
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

app.listen(Number(API_PORT), () => {
  console.log(`MySQL API server running on port ${API_PORT}`)
})
