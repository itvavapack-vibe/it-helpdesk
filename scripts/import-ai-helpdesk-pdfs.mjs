import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

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

const envPath = path.resolve(getArg('--env', process.env.ENV_FILE || '.env'))
dotenv.config({ path: envPath })

const candidatePdfToTextPaths = [
  getArg('--pdftotext', ''),
  'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe',
  'C:\\Program Files (x86)\\Git\\mingw64\\bin\\pdftotext.exe',
  'pdftotext',
].filter(Boolean)

async function findPdfToText() {
  for (const candidate of candidatePdfToTextPaths) {
    try {
      await execFileAsync(candidate, ['-v'], { windowsHide: true })
      return candidate
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`
      if (/pdftotext/i.test(output)) return candidate
    }
  }

  throw new Error('pdftotext.exe not found')
}

async function extractPdfText(pdftotextPath, filePath) {
  const { stdout } = await execFileAsync(
    pdftotextPath,
    ['-layout', '-enc', 'UTF-8', filePath, '-'],
    {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    },
  )

  return String(stdout || '')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const files = getArgValues('--file').map((file) => path.resolve(file))

if (!files.length) {
  console.error('Import failed: pass one or more --file "path/to/document.pdf"')
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
  const pdftotextPath = await findPdfToText()
  let imported = 0

  for (const file of files) {
    const content = await extractPdfText(pdftotextPath, file)
    if (!content) {
      console.log(`Skipped empty PDF text: ${file}`)
      continue
    }

    const title = path.basename(file)
    await pool.query(
      `
        INSERT INTO ai_helpdesk_documents (source_file, title, content, document_type)
        VALUES (?, ?, ?, 'pdf')
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          content = VALUES(content),
          document_type = VALUES(document_type),
          updated_at = CURRENT_TIMESTAMP
      `,
      [file, title, content],
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
