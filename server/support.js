import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { logDispatch } from './dispatchLog.js'

/**
 * الدعم الفني : chat d'aide pour les utilisateurs connectés. Les questions courantes ont une réponse dans l'interface
 * (aide de MMS) ; « إرسال إلى الدعم » envoie la conversation par e-mail à l'adresse du support (réglage Super Admin
 * « بريد الدعم الفني », par défaut celle demandée par le client) et l'enregistre comme demande (جديد / قيد المعالجة / مغلق).
 *
 * Contenu de l'e-mail : message et conversation, nom, e-mail et rôle de l'utilisateur, page, navigateur, heure de
 * Tripoli, dernières erreurs de la page. Jamais de mot de passe, de jeton ni de cookie (filtrés). Limite : 5 demandes
 * par heure et par compte. Stockage : data/support-tickets.json et data/superadmin/support.json.
 */

const DEFAULT_EMAIL = 'mohamed.rahali@aroundexpressions.com'
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const STATUSES = ['new', 'progress', 'closed']
const MAX_TICKETS = 2000
let file = ''
let confFile = ''
let tickets = []
let conf = { email: DEFAULT_EMAIL }
const recent = new Map() // compte → horodatages des envois (limite par heure)

export function initSupport(dataDir) {
  file = path.join(dataDir, 'support-tickets.json')
  confFile = path.join(dataDir, 'superadmin', 'support.json')
  try {
    tickets = JSON.parse(fs.readFileSync(file, 'utf8')).tickets || []
  } catch {
    tickets = []
  }
  try {
    const c = JSON.parse(fs.readFileSync(confFile, 'utf8'))
    conf = { email: EMAIL_RE.test(c.email || '') ? c.email : DEFAULT_EMAIL }
  } catch {
    conf = { email: DEFAULT_EMAIL }
  }
}

const save = () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ tickets: tickets.slice(-MAX_TICKETS) }, null, 1))
  fs.renameSync(tmp, file)
}

export const supportConf = () => ({ ...conf })
export function setSupportConf(body) {
  const email = String(body?.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('BAD_EMAIL'), { code: 'BAD_EMAIL', status: 400 })
  conf = { email }
  fs.mkdirSync(path.dirname(confFile), { recursive: true })
  fs.writeFileSync(confFile, JSON.stringify({ ...conf, savedAt: new Date().toISOString() }))
  return supportConf()
}

// Retire tout ce qui ressemble à un secret (mots de passe, jetons, cookies, clés) avant l'envoi
const SECRET = /(pass(word)?|mot de passe|كلمة المرور|token|cookie|session|secret|api[_-]?key|authorization)\s*[:=]\s*\S+/gi
export const scrub = (s, n) => String(s || '').replace(SECRET, '$1: [محذوف]').slice(0, n)

export function cleanTicket(body, user) {
  const message = scrub(body?.message, 3000).trim()
  if (!message) throw Object.assign(new Error('EMPTY'), { code: 'EMPTY', status: 400 })
  const conversation = (Array.isArray(body?.conversation) ? body.conversation : [])
    .slice(-20)
    .map((m) => ({ from: m?.from === 'bot' ? 'bot' : 'user', text: scrub(m?.text, 1500) }))
  return {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    status: 'new',
    user: { name: String(user?.name || '').slice(0, 120), email: String(user?.email || '').slice(0, 160), role: String(user?.role || '') },
    message,
    conversation,
    page: scrub(body?.page, 300),
    browser: scrub(body?.browser, 300),
    errors: (Array.isArray(body?.errors) ? body.errors : []).slice(-5).map((e) => scrub(e, 300)),
    mail: '',
  }
}

const tripoli = (iso) => new Intl.DateTimeFormat('ar-LY', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Tripoli' }).format(new Date(iso))
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function supportEmail(t) {
  const rows = [
    ['المستخدم', `${t.user.name} <${t.user.email}> · ${t.user.role}`],
    ['الوقت (طرابلس)', tripoli(t.at)],
    ['الصفحة', t.page],
    ['المتصفح', t.browser],
    ['رقم الطلب', t.id],
  ]
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;background:#f4f7f5;margin:0;padding:20px">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;padding:20px">
<h2 style="margin:0 0 12px">طلب دعم فني جديد</h2>
<p style="white-space:pre-wrap;font-size:15px;line-height:1.7;background:#f4f7f5;padding:12px;border-radius:6px">${esc(t.message)}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">${rows.map(([k, v]) => `<tr><td style="padding:4px 8px;color:#5f7469;white-space:nowrap">${k}</td><td style="padding:4px 8px" dir="auto">${esc(v)}</td></tr>`).join('')}</table>
${t.conversation.length ? `<h3 style="font-size:14px">المحادثة</h3><ol style="font-size:13px;line-height:1.6">${t.conversation.map((m) => `<li><b>${m.from === 'bot' ? 'المساعد' : 'المستخدم'}:</b> ${esc(m.text)}</li>`).join('')}</ol>` : ''}
${t.errors.length ? `<h3 style="font-size:14px">آخر أخطاء الصفحة</h3><pre dir="ltr" style="font-size:12px;white-space:pre-wrap">${t.errors.map(esc).join('\n')}</pre>` : ''}
</div></body></html>`
  return { subject: `MMS · دعم فني · ${t.user.name || t.user.email} · ${t.id}`, html, text: `${t.message}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`, replyTo: t.user.email }
}

export function canSend(email, now = Date.now()) {
  const list = (recent.get(email) || []).filter((t) => now - t < 3_600_000)
  recent.set(email, list)
  return list.length < 5
}

export const listTickets = () => [...tickets].reverse()
export function setTicketStatus(id, status) {
  const t = tickets.find((x) => x.id === id)
  if (!t || !STATUSES.includes(status)) return null
  t.status = status
  t.updatedAt = new Date().toISOString()
  save()
  return t
}

/** Route utilisateur (session ouverte) ; sendSupport(to, mail) : envoi réservé à l'adresse du support */
export function mountSupport(app, { sendSupport }) {
  app.post('/api/support/ticket', express.json({ limit: '24kb' }), async (req, res) => {
    let t
    try {
      t = cleanTicket(req.body, req.user)
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.code || 'FAILED' })
    }
    if (!canSend(req.user.email)) return res.status(429).json({ error: 'TOO_MANY' })
    recent.get(req.user.email).push(Date.now())
    tickets.push(t)
    try {
      const info = await sendSupport(conf.email, supportEmail(t))
      t.mail = info?.rejected?.length ? 'rejected' : 'sent'
    } catch (err) {
      t.mail = `failed: ${err.code || 'ERROR'}`
    }
    save()
    logDispatch({ kind: 'support', name: t.id, channels: ['email'], recipients: 1, status: t.mail === 'sent' ? 'sent' : 'failed', error: t.mail === 'sent' ? '' : t.mail, by: req.user.email })
    res.status(201).json({ ticket: { id: t.id, at: t.at, mail: t.mail === 'sent' } })
  })
}
