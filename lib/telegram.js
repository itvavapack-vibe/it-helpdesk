function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  }
}

function isPlaceholder(value) {
  const text = String(value || '').toLowerCase()
  return !text || text.includes('placeholder') || text.includes('ใส่')
}

export async function sendTelegramNotification({ message }) {
  if (!message || typeof message !== 'string') {
    const error = new Error('message is required')
    error.status = 400
    throw error
  }

  const { botToken, chatId } = getTelegramConfig()
  if (isPlaceholder(botToken) || isPlaceholder(chatId)) {
    return { ok: false, skipped: true, reason: 'Telegram is not configured' }
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.ok) {
    const error = new Error(result?.description || response.statusText || 'Telegram API error')
    error.status = 502
    throw error
  }

  return { ok: true }
}
