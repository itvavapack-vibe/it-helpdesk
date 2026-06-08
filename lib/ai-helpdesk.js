import { getPool } from './db.js'

const CONTACT_IT_MESSAGE = 'ไม่พบแนวทางแก้ไขที่ใกล้เคียงในฐานข้อมูลแจ้งซ่อม กรุณาติดต่อแผนกเทคโนโลยีสารสนเทศ'

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const getTokens = (text) => {
  const normalized = normalizeText(text)
  const words = normalized.split(' ').filter((word) => word.length >= 2)
  const compact = normalized.replace(/\s+/g, '')
  const grams = []

  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      grams.push(compact.slice(index, index + size))
    }
  }

  return [...new Set([...words, ...grams])]
}

const isUserAccountRequest = (query) => {
  const text = `${String(query || '').toLowerCase()} ${normalizeText(query)}`
  const compact = text.replace(/\s+/g, '')
  const hasRequestAction = compact.includes('ขอ')
    || compact.includes('เพิ่ม')
    || compact.includes('สร้าง')
    || compact.includes('เปิด')
    || /\b(request|new|create|add)\b/i.test(text)
  const hasAccountTarget = compact.includes('ผู้ใช้')
    || compact.includes('ผู้ใช้งาน')
    || compact.includes('บัญชี')
    || compact.includes('สิทธิ')
    || /\b(user|account|access)\b/i.test(text)

  return hasRequestAction && hasAccountTarget
}

const expandDocumentQuery = (query) => {
  const terms = [query]

  if (isUserAccountRequest(query)) {
    terms.push(
      'การขอเพิ่มบัญชีผู้ใช้งานระบบงานหลัก ERP',
      'แบบฟอร์มขอเพิ่มบัญชีผู้ใช้งาน FMIT 12',
      'ตรวจสอบการขอผู้ใช้ D365 WMS',
      'เจ้าของข้อมูลอนุมัติ',
      'อนุมัติพร้อมลงนาม',
      'เพิ่มบัญชีตามการร้องขอ',
      'ลงนามรับทราบผลการดำเนินการ',
      'User Access Management',
      'Access right',
    )
  }

  return terms.join(' ')
}

const getIssueText = (issue) => [
  issue.id,
  issue.category,
  issue.severity,
  issue.description,
  issue.repair_details,
  issue.asset_name,
  issue.asset_type,
  issue.asset_location,
  issue.status,
].filter(Boolean).join(' ')

const scoreIssue = (query, issue) => {
  const normalizedQuery = normalizeText(query)
  const normalizedIssue = normalizeText(getIssueText(issue))
  const queryTokens = getTokens(query)
  const issueTokens = new Set(getTokens(getIssueText(issue)))
  const exactQueryTerms = normalizedQuery.match(/[a-z0-9]{2,}/g) || []

  if (!normalizedQuery || !normalizedIssue) return 0
  if (exactQueryTerms.length && !exactQueryTerms.some((term) => normalizedIssue.includes(term))) return 0

  let score = 0
  let matchedTokens = 0

  for (const token of queryTokens) {
    if (issueTokens.has(token)) {
      matchedTokens += 1
      score += token.length >= 4 ? 4 : 2
    } else if (normalizedIssue.includes(token)) {
      matchedTokens += 1
      score += 1.5
    }
  }

  if (normalizedIssue.includes(normalizedQuery)) score += 18
  if (normalizeText(issue.description).includes(normalizedQuery)) score += 12
  if (normalizeText(issue.category).includes(normalizedQuery)) score += 8
  if (issue.repair_details) score += 4
  if (issue.status === 'Resolved' || issue.status === 'Closed') score += 5

  return matchedTokens >= 2 || normalizedIssue.includes(normalizedQuery) ? score : 0
}

const getBasicUserSteps = (query) => {
  const normalized = normalizeText(query)
  const steps = []

  if (/เปิด|เครื่อง|ไม่ติด|ดับ|power|boot/.test(normalized)) {
    steps.push('ตรวจสอบสายไฟ ปลั๊กไฟ อะแดปเตอร์ และลองกดปุ่มเปิดเครื่องค้างไว้ประมาณ 10 วินาทีแล้วเปิดใหม่')
    steps.push('ถ้าเป็น Notebook ให้ลองถอดอุปกรณ์ต่อพ่วงออกก่อน เช่น USB, Docking, Mouse หรือ Keyboard')
  }

  if (/เน็ต|internet|wifi|wi fi|เครือข่าย|lan|เข้าเว็บ/.test(normalized)) {
    steps.push('ตรวจสอบว่าเชื่อมต่อ Wi-Fi/LAN อยู่หรือไม่ แล้วลองปิด-เปิด Wi-Fi หรือถอดเสียบสาย LAN ใหม่')
    steps.push('ลองเปิดเว็บไซต์อื่นหรือรีสตาร์ทเครื่องหนึ่งครั้ง เพื่อแยกว่าเป็นปัญหาเฉพาะเว็บหรือเครือข่าย')
  }

  if (/ปริ้น|print|printer|พิมพ์|กระดาษ|หมึก/.test(normalized)) {
    steps.push('ตรวจสอบว่าเครื่องพิมพ์เปิดอยู่ มีกระดาษ/หมึก และไม่มีไฟ error แสดงที่หน้าเครื่อง')
    steps.push('ลองล้างคิวพิมพ์ แล้วเลือกเครื่องพิมพ์ให้ถูกตัวก่อนสั่งพิมพ์ใหม่')
  }

  if (/เข้าโปรแกรม|โปรแกรม|login|ล็อกอิน|password|รหัส|สิทธิ์/.test(normalized)) {
    steps.push('ตรวจสอบ username/password และลองปิดเปิดโปรแกรมใหม่ก่อน')
    steps.push('ถ้าเป็นเรื่องสิทธิ์การใช้งาน ให้เตรียมชื่อระบบและหน้าจอ error เพื่อส่งให้ IT ตรวจสอบต่อ')
  }

  if (/ช้า|ค้าง|หน่วง|hang|not responding/.test(normalized)) {
    steps.push('ปิดโปรแกรมที่ไม่ได้ใช้งาน แล้วรีสตาร์ทเครื่องหนึ่งครั้งเพื่อล้าง session ที่ค้าง')
    steps.push('ตรวจสอบพื้นที่ Drive C: ถ้าใกล้เต็มให้แจ้ง IT เพื่อช่วยเคลียร์พื้นที่อย่างถูกต้อง')
  }

  return steps
}

const buildLocalGuidance = (query, solvedMatches) => {
  const basicSteps = getBasicUserSteps(query)
  const repairSteps = solvedMatches
    .map(({ issue }) => issue.repair_details?.trim())
    .filter(Boolean)
    .slice(0, 3)
  const mergedSteps = [...basicSteps, ...repairSteps]
    .map((step) => step.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const uniqueSteps = [...new Set(mergedSteps)].slice(0, 5)

  if (!uniqueSteps.length) return CONTACT_IT_MESSAGE

  return [
    'จากอาการที่แจ้งมา ผมวิเคราะห์จากฐานข้อมูลแจ้งซ่อมเดิมแล้ว แนะนำให้ลองทำตามขั้นตอนนี้ครับ',
    '',
    'แนวทางแก้ไขเบื้องต้น:',
    ...uniqueSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'ถ้าลองตามขั้นตอนแล้วยังไม่หาย กรุณาแจ้งรายละเอียดเพิ่มเติม เช่น ข้อความ error, ชื่อโปรแกรม, ชื่อเครื่อง/ทรัพย์สิน หรือแนบรูปหน้าจอ เพื่อให้แผนกเทคโนโลยีสารสนเทศตรวจสอบต่อครับ',
  ].join('\n')
}

const getDocumentSnippets = (query, documents) => {
  const expandedQuery = expandDocumentQuery(query)
  const queryTokens = new Set(getTokens(expandedQuery))
  const normalizedQueries = [query, expandedQuery].map(normalizeText).filter(Boolean)

  return documents
    .flatMap((document) => {
      const paragraphs = String(document.content || '')
        .split(/\n\s*\n|\r?\n(?=\d+\.|[A-Z]?\d+\.\d+|\-|•)/)
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter((text) => text.length >= 40)

      return paragraphs.map((text) => {
        const tokens = getTokens(text)
        const tokenHits = tokens.filter((token) => queryTokens.has(token)).length
        const normalizedText = normalizeText(text)
        const exactHit = normalizedQueries.some((normalizedQuery) => normalizedText.includes(normalizedQuery))
        const userAccountHit = isUserAccountRequest(query)
          && /(ขอเพิ่มบัญชี|บัญชีผู้ใช้|ผู้ใช้งาน|ผู้ใช้|fmit 12|d365|wms|user access|access right|account)/i.test(normalizedText)
        const score = tokenHits * 3
          + (exactHit ? 15 : 0)
          + (userAccountHit ? 25 : 0)
          + (/ขั้นตอน|วิธี|ปฏิบัติ|ควบคุม|นโยบาย|รหัสผ่าน|ข้อมูล|สิทธิ์|vpn|backup|สำรอง|อุปกรณ์|ซ่อม|บำรุง/i.test(normalizedText) ? 3 : 0)

        return { document, text, score }
      })
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

const buildDocumentGuidance = (query, documentSnippets) => {
  if (!documentSnippets.length) return ''

  const normalizedQuery = normalizeText(query)

  const knownSteps = []
  if (isUserAccountRequest(query)) {
    knownSteps.push('กรอกแบบฟอร์มขอเพิ่มบัญชีผู้ใช้งาน FMIT 12 โดยระบุข้อมูลผู้ใช้และระบบที่ต้องการใช้งาน เช่น D365 หรือ WMS')
    knownSteps.push('ส่งคำร้องให้เจ้าของข้อมูลหรือผู้มีอำนาจที่เกี่ยวข้องพิจารณาอนุมัติก่อน')
    knownSteps.push('เจ้าหน้าที่แผนกเทคโนโลยีสารสนเทศตรวจสอบคำร้องและตรวจสอบการขอผู้ใช้ในระบบที่เกี่ยวข้อง')
    knownSteps.push('หัวหน้าส่วนหรือผู้จัดการแผนกเทคโนโลยีสารสนเทศพิจารณาอนุมัติพร้อมลงนาม')
    knownSteps.push('เมื่ออนุมัติแล้ว เจ้าหน้าที่ IT ดำเนินการเพิ่มบัญชีตามคำร้องขอ')
    knownSteps.push('ผู้ร้องหรือผู้ใช้งานลงนามรับทราบผลการดำเนินการหลังเพิ่มบัญชีเรียบร้อย')
  }

  if (/vpn|virtual private network/.test(normalizedQuery)) {
    knownSteps.push('ให้เชื่อมต่อจากภายนอกบริษัทผ่าน VPN ที่บริษัทกำหนดเท่านั้น')
    knownSteps.push('แจ้งขออนุมัติหรือขอเปิดสิทธิ์การใช้งาน VPN กับแผนกเทคโนโลยีสารสนเทศก่อนใช้งาน')
    knownSteps.push('ถ้าใช้อุปกรณ์ส่วนตัว ต้องมีการป้องกันไวรัสและเปิดใช้งานไฟร์วอลล์ตามข้อกำหนดของบริษัท')
    knownSteps.push('ใช้งานเฉพาะระบบที่ได้รับอนุญาต และไม่ส่งต่อบัญชีผู้ใช้หรือรหัสผ่านให้ผู้อื่น')
  }

  if (/รหัสผ่าน|password|passcode|login|ล็อกอิน/.test(normalizedQuery)) {
    knownSteps.push('ใช้รหัสผ่านที่คาดเดายาก และไม่ใช้รหัสผ่านร่วมกับผู้อื่น')
    knownSteps.push('ห้ามบอกรหัสผ่านให้บุคคลอื่น และควรเปลี่ยนรหัสผ่านทันทีเมื่อสงสัยว่ารั่วไหล')
    knownSteps.push('หากเข้าสู่ระบบไม่ได้หรือบัญชีถูกล็อก ให้ติดต่อแผนกเทคโนโลยีสารสนเทศเพื่อตรวจสอบสิทธิ์')
  }

  if (/backup|สำรอง|กู้คืน|restore/.test(normalizedQuery)) {
    knownSteps.push('ตรวจสอบว่าข้อมูลสำคัญถูกจัดเก็บในพื้นที่หรือระบบที่บริษัทกำหนดสำหรับการสำรองข้อมูล')
    knownSteps.push('หากต้องการกู้คืนข้อมูล ให้แจ้งชื่อไฟล์หรือระบบ ช่วงเวลาที่ต้องการกู้คืน และรายละเอียดผลกระทบให้ IT ตรวจสอบ')
  }

  if (/incident|เหตุการณ์|ไวรัส|มัลแวร์|malware|virus|security/.test(normalizedQuery)) {
    knownSteps.push('หากพบเหตุการณ์ผิดปกติด้านความปลอดภัย ให้หยุดใช้งานส่วนที่เกี่ยวข้องเท่าที่ทำได้และรีบแจ้ง IT')
    knownSteps.push('แนบรายละเอียดอาการ เวลาเกิดเหตุ หน้าจอแจ้งเตือน หรือรูปภาพ เพื่อให้ตรวจสอบและแก้ไขได้เร็วขึ้น')
  }

  if (knownSteps.length) {
    const uniqueSteps = [...new Set(knownSteps)].slice(0, 6)
    return [
      'จากเอกสารขั้นตอน/นโยบายด้าน IT ที่เกี่ยวข้อง แนะนำให้ดำเนินการตามนี้ครับ',
      '',
      ...uniqueSteps.map((step, index) => `${index + 1}. ${step}`),
      '',
      'หากดำเนินการแล้วไม่สำเร็จ หรือไม่แน่ใจว่ามีสิทธิ์ใช้งานหรือไม่ กรุณาติดต่อแผนกเทคโนโลยีสารสนเทศเพื่อตรวจสอบต่อครับ',
    ].join('\n')
  }

  const steps = [...new Set(documentSnippets.map((item) => item.text))]
    .slice(0, 4)
    .map((text) => text.length > 420 ? `${text.slice(0, 420)}...` : text)

  return [
    'จากเอกสารขั้นตอน/นโยบายด้าน IT ที่เกี่ยวข้อง แนะนำให้ดำเนินการตามนี้ครับ',
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n')
}

const buildMatches = (query, issues) => issues
  .map((issue) => ({ issue, score: scoreIssue(query, issue) }))
  .filter((item) => item.score >= 12)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5)

async function loadIssueKnowledge() {
  const pool = getPool()
  const [rows] = await pool.query(`
    SELECT id, category, severity, description, status, repair_details, asset_name, asset_type, asset_location, created_at
    FROM issues
    ORDER BY created_at DESC
    LIMIT 500
  `)
  return rows
}

async function loadDocumentKnowledge() {
  const pool = getPool()
  try {
    const [rows] = await pool.query(`
      SELECT id, source_file, title, content, document_type, updated_at
      FROM ai_helpdesk_documents
      ORDER BY updated_at DESC
      LIMIT 50
    `)
    return rows
  } catch (error) {
    if (/doesn't exist|unknown table/i.test(error.message)) return []
    throw error
  }
}

function getExternalAiConfig() {
  const apiUrl = process.env.AI_HELPDESK_API_URL?.trim()
  const apiKey = process.env.AI_HELPDESK_API_KEY?.trim()
  const model = process.env.AI_HELPDESK_MODEL?.trim()

  if (!apiUrl || !model) return null
  return { apiUrl, apiKey, model }
}

async function askExternalAi({ question, solvedMatches, documentSnippets, localAnswer, imageDataUrl }) {
  const config = getExternalAiConfig()
  if (!config) return null

  const context = solvedMatches.slice(0, 5).map(({ issue }, index) => ({
    index: index + 1,
    category: issue.category || '',
    problem: issue.description || '',
    repair: issue.repair_details || '',
  }))
  const documentContext = documentSnippets.slice(0, 6).map((item, index) => ({
    index: index + 1,
    title: item.document.title || '',
    content: item.text || '',
  }))

  const prompt = [
    'คุณคือ AI Helpdesk ผู้ช่วยแก้ไขปัญหาด้าน IT ของบริษัท',
    'ให้ตอบเป็นภาษาไทย สุภาพ กระชับ เป็นขั้นตอนที่ผู้ใช้งานทั่วไปทำตามได้',
    'ต้องวิเคราะห์จากข้อมูลฐานแจ้งซ่อมที่ให้มาก่อนเท่านั้น ห้ามบอกเลขเคสหรือแสดงเคสอ้างอิง',
    'ถ้าข้อมูลไม่พอ ให้แนะนำให้ติดต่อแผนกเทคโนโลยีสารสนเทศ',
    '',
    `คำถามผู้ใช้: ${question}`,
    '',
    `คำตอบภายในระบบเบื้องต้น:\n${localAnswer}`,
    '',
    `ข้อมูลจากฐานแจ้งซ่อม:\n${JSON.stringify(context, null, 2)}`,
    '',
    `ข้อมูลจากเอกสารขั้นตอนและนโยบาย IT:\n${JSON.stringify(documentContext, null, 2)}`,
  ].join('\n')

  const headers = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  const userContent = imageDataUrl
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    : prompt

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'ตอบเฉพาะแนวทางแก้ไขสำหรับผู้ใช้งาน ไม่ต้องแสดงเคสอ้างอิง' },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 700,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || response.statusText || 'External AI error')
  }

  return String(payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || '').trim() || null
}

export async function answerAiHelpdeskQuestion({ question, imageDataUrl }) {
  const normalizedQuestion = String(question || '').trim()
  if (!normalizedQuestion) {
    const error = new Error('question is required')
    error.status = 400
    throw error
  }

  const issues = await loadIssueKnowledge()
  const documents = await loadDocumentKnowledge()
  const matches = buildMatches(normalizedQuestion, issues)
  const solvedMatches = matches.filter(({ issue }) => issue.repair_details?.trim())
  const documentSnippets = getDocumentSnippets(normalizedQuestion, documents)
  const bestIssueScore = matches[0]?.score || 0
  const preferDocumentGuidance = documentSnippets.length > 0 && isUserAccountRequest(normalizedQuestion)

  const issueGuidance = solvedMatches.length
    && !preferDocumentGuidance
    && (!documentSnippets.length || bestIssueScore >= 25)
    ? buildLocalGuidance(normalizedQuestion, solvedMatches)
    : ''
  const documentGuidance = buildDocumentGuidance(normalizedQuestion, documentSnippets)
  const localAnswer = [issueGuidance, documentGuidance].filter(Boolean).join('\n\n') || CONTACT_IT_MESSAGE

  const hasKnowledge = solvedMatches.length > 0 || documentSnippets.length > 0

  if (!hasKnowledge) {
    try {
      const externalAnswer = await askExternalAi({
        question: normalizedQuestion,
        solvedMatches,
        documentSnippets,
        localAnswer,
        imageDataUrl,
      })

      if (externalAnswer) {
        return {
          answer: externalAnswer,
          source: 'external',
          matchedCount: matches.length,
          externalAiUsed: true,
        }
      }
    } catch (error) {
      console.error('AI Helpdesk external AI failed:', error.message)
    }

    return {
      answer: CONTACT_IT_MESSAGE,
      source: 'local',
      matchedCount: matches.length,
      externalAiUsed: false,
    }
  }

  if (matches.length === 0 || solvedMatches.length === 0) {
    if (documentSnippets.length > 0 && !getExternalAiConfig()) {
      return {
        answer: localAnswer,
        source: 'local',
        matchedCount: matches.length,
        externalAiUsed: false,
      }
    }

    try {
      const externalAnswer = await askExternalAi({
        question: normalizedQuestion,
        solvedMatches,
        documentSnippets,
        localAnswer,
        imageDataUrl,
      })

      if (externalAnswer) {
        return {
          answer: externalAnswer,
          source: 'external',
          matchedCount: matches.length,
          externalAiUsed: true,
        }
      }
    } catch (error) {
      console.error('AI Helpdesk external AI failed:', error.message)
    }

    return {
      answer: localAnswer,
      source: 'local',
      matchedCount: matches.length,
      externalAiUsed: false,
    }
  }

  try {
    const externalAnswer = await askExternalAi({
      question: normalizedQuestion,
      solvedMatches,
      documentSnippets,
      localAnswer,
      imageDataUrl,
    })

    if (externalAnswer) {
      return {
        answer: externalAnswer,
        source: 'external',
        matchedCount: matches.length,
        externalAiUsed: true,
      }
    }
  } catch (error) {
    console.error('AI Helpdesk external AI failed:', error.message)
  }

  return {
    answer: localAnswer,
    source: 'local',
    matchedCount: matches.length,
    externalAiUsed: false,
  }
}
