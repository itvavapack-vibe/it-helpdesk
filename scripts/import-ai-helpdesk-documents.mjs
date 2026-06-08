import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import XLSX from 'xlsx'

const execFileAsync = promisify(execFile)
const args = process.argv.slice(2)

const getArgValues = (name) => {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1])
  }
  return values
}

const getArg = (name, fallback = '') => {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] || fallback
}

const hasFlag = (name) => args.includes(name)

const envPath = path.resolve(getArg('--env', process.env.ENV_FILE || '.env'))
dotenv.config({ path: envPath })

const decodeXmlEntities = (value) =>
  String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

const compactText = (value) =>
  String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

async function extractDocxXml(filePath) {
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead('${filePath.replace(/'/g, "''")}')
    try {
      $entry = $zip.GetEntry('word/document.xml')
      if ($null -eq $entry) { throw 'word/document.xml not found' }
      $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
      try { $reader.ReadToEnd() } finally { $reader.Close() }
    } finally {
      $zip.Dispose()
    }
  `
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024,
      windowsHide: true,
    },
  )
  return stdout
}

async function extractDocxText(filePath) {
  const xml = await extractDocxXml(filePath)
  const withBreaks = xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')

  const textParts = []
  const textRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let match = textRegex.exec(withBreaks)
  while (match) {
    textParts.push(decodeXmlEntities(match[1]))
    match = textRegex.exec(withBreaks)
  }

  return compactText(textParts.join(' '))
}

function extractXlsxText(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false })
  const sections = []

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    })
    const lines = rows
      .map((row) => row.map((cell) => String(cell || '').trim()).filter(Boolean).join(' | '))
      .filter(Boolean)

    if (lines.length) {
      sections.push(`Sheet: ${sheetName}\n${lines.join('\n')}`)
    }
  }

  return compactText(sections.join('\n\n'))
}

async function extractDocumentText(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.docx') return extractDocxText(filePath)
  if (extension === '.xlsx' || extension === '.xls') return extractXlsxText(filePath)
  throw new Error(`unsupported document type: ${extension}`)
}

const files = getArgValues('--file').map((file) => path.resolve(file))

if (!files.length) {
  console.error('Import failed: pass one or more --file "path/to/document.docx|xlsx"')
  process.exit(1)
}

const missingFiles = files.filter((file) => !fs.existsSync(file))
if (missingFiles.length) {
  console.error(`Import failed: missing files:\n${missingFiles.join('\n')}`)
  process.exit(1)
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

try {
  if (hasFlag('--replace')) {
    await pool.query('DELETE FROM ai_helpdesk_documents')
    console.log('Cleared existing AI Helpdesk documents')
  }

  let imported = 0
  for (const file of files) {
    const content = await extractDocumentText(file)
    if (!content) {
      console.log(`Skipped empty document text: ${file}`)
      continue
    }

    const title = path.basename(file)
    const documentType = path.extname(file).slice(1).toLowerCase()
    await pool.query(
      `
        INSERT INTO ai_helpdesk_documents (source_file, title, content, document_type)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          content = VALUES(content),
          document_type = VALUES(document_type),
          updated_at = CURRENT_TIMESTAMP
      `,
      [file, title, content, documentType],
    )
    imported += 1
    console.log(`Imported: ${title} (${content.length.toLocaleString()} chars)`)
  }

  console.log(`Database: ${process.env.DB_NAME}`)
  console.log(`Imported documents: ${imported}`)
} catch (error) {
  console.error('Import failed:', error.message)
  process.exit(1)
} finally {
  await pool.end()
}
