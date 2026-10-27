import fs from 'node:fs'
import path from 'node:path'

/**
 * سجل الإرسال (historique des alertes envoyées) : chaque envoi automatique ou manuel — veille, alerte du radar,
 * briefing exécutif, rapport — avec la date, les canaux, le nombre de destinataires et le résultat.
 * Stockage : data/dispatch-log.json (1 000 dernières lignes). Les adresses ne sont pas gardées, seulement leur nombre.
 */

const KEEP = 1000
let file = ''
let rows = []

export function initDispatchLog(dataDir) {
  file = path.join(dataDir, 'dispatch-log.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).rows
    rows = Array.isArray(saved) ? saved : []
  } catch {
    rows = []
  }
}

/** kind : watch | radar | briefing | report ; status : sent | failed | blocked */
export function logDispatch({ kind, name, count = 0, channels = [], recipients = 0, status = 'sent', error = '', by = '' }) {
  rows.push({
    at: new Date().toISOString(),
    kind: String(kind).slice(0, 20),
    name: String(name || '').slice(0, 160),
    count: Math.max(0, Number(count) || 0),
    channels: [...new Set(channels)].slice(0, 4),
    recipients: Math.max(0, Number(recipients) || 0),
    status,
    ...(error ? { error: String(error).slice(0, 60) } : {}),
    ...(by ? { by: String(by).slice(0, 120) } : {}),
  })
  if (rows.length > KEEP) rows = rows.slice(-KEEP)
  if (!file) return
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ rows }))
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error('Historique des envois :', err.message)
  }
}

export const dispatchHistory = (limit = 200) => rows.slice(-limit).reverse()
