import fs from 'node:fs'
import path from 'node:path'
import { getItems } from './store.js'

/**
 * Veille programmée (الرصد المبرمج), sur le principe de NewsRadar :
 * des règles ET/OU, une période et des destinataires. Les actualités déjà reçues par MMS
 * (Mosaïque FM et veille Libye) sont vérifiées à chaque mise à jour des données ;
 * celles qui correspondent partent par e-mail, une seule fois par veille.
 */

const MAX_WATCHES = 100
const MAX_RULES = 30
const MAX_RULE_LEN = 1000
const MAX_RECIPIENTS = 10
const KEEP_MATCHES = 300
const MAIL_ITEMS = 30
const GRACE_DAYS = 2
const CHECK_MS = 5 * 60_000

let file = ''
let watches = []
let running = false
const ruleCache = new Map()

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayKey.format(new Date())
const dayOf = (iso) => dayKey.format(new Date(iso))
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** Comparaison tolérante : minuscules, sans diacritiques ni tatweel, alef/ya/ta marbuta unifiés */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

/** « (ليبيا OR Libya) AND (النفط, oil) » → [["ليبيا","Libya"],["النفط","oil"]] */
export function parseRule(line) {
  return String(line || '')
    .split(/\s+(?:AND|ET)\s+|\s*[+&]\s*/i)
    .map((group) =>
      group
        .replace(/[()]/g, ' ')
        .split(/\s+(?:OR|OU)\s+|\s*[,،|]\s*/i)
        .map((w) => w.trim())
        .filter(Boolean),
    )
    .filter((g) => g.length)
}

function compiled(watch) {
  const key = `${watch.id}|${watch.rules.join('\n')}`
  if (!ruleCache.has(key))
    ruleCache.set(
      key,
      watch.rules.map(parseRule).map((groups) => groups.map((g) => g.map((raw) => ({ raw, norm: normalize(raw) })).filter((w) => w.norm))),
    )
  return ruleCache.get(key)
}

/** Mots déclencheurs de la première règle vérifiée, ou null */
function matchText(watch, text) {
  for (const groups of compiled(watch)) {
    const hits = []
    let ok = groups.length > 0
    for (const g of groups) {
      const hit = g.find((w) => text.includes(w.norm))
      if (!hit) {
        ok = false
        break
      }
      hits.push(hit.raw)
    }
    if (ok) return hits
  }
  return null
}

const itemText = (it) => normalize(`${it.title} ${it.summary} ${it.origin}`)
const itemKey = (it) => `${dayOf(it.date)}|${normalize(it.title)}`

export function statusOf(watch, now = today()) {
  if (now < watch.from) return 'upcoming'
  if (watch.to && now > addDays(watch.to, GRACE_DAYS)) return 'finished'
  return 'active'
}

function inScope(watch, it) {
  const day = dayOf(it.date)
  return (!watch.flux || it.flux === watch.flux) && day >= watch.from && (!watch.to || day <= watch.to)
}

/** Actualités d'une veille, sur toute la base (filtre « الرصد » de الأخبار) */
export function itemsForWatch(id, items) {
  const watch = watches.find((w) => w.id === id)
  if (!watch) return null
  return items.filter((it) => inScope(watch, it) && matchText(watch, itemText(it)))
}

function load() {
  try {
    watches = JSON.parse(fs.readFileSync(file, 'utf8')).watches || []
  } catch {
    watches = []
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ watches }, null, 2))
}

const publicWatch = (w) => {
  const { notified, ...rest } = w
  return { ...rest, status: statusOf(w), notifiedCount: notified.length }
}

export const listWatches = () => watches.map(publicWatch)
export const enabledWatches = () => watches.filter((w) => w.enabled).map((w) => ({ id: w.id, name: w.name, status: statusOf(w) }))

function fail(code) {
  return Object.assign(new Error(code), { status: 400, code })
}

export function createWatch(body) {
  if (watches.length >= MAX_WATCHES) throw fail('TOO_MANY')
  const rules = (Array.isArray(body.rules) ? body.rules : []).map((r) => String(r).trim()).filter((r) => r && parseRule(r).length)
  if (!rules.length) throw fail('NO_RULES')
  if (rules.length > MAX_RULES || rules.some((r) => r.length > MAX_RULE_LEN)) throw fail('RULES_TOO_LONG')
  const from = DAY_RE.test(body.from) ? body.from : today()
  const to = body.to ? String(body.to) : null
  if (to && (!DAY_RE.test(to) || to < from)) throw fail('BAD_DATES')
  if (to && to < today()) throw fail('END_PASSED')
  const recipients = [
    ...new Set(
      String(body.recipients || '')
        .split(/[\s,;،]+/)
        .filter(Boolean),
    ),
  ]
  if (recipients.length > MAX_RECIPIENTS) throw fail('TOO_MANY_RECIPIENTS')
  if (recipients.some((r) => !EMAIL_RE.test(r))) throw fail('BAD_EMAIL')
  const watch = {
    id: Math.random().toString(36).slice(2, 10),
    name:
      String(body.name || '')
        .trim()
        .slice(0, 120) || rules[0].slice(0, 80),
    rules,
    themes: Array.isArray(body.themes) ? body.themes.map(String).slice(0, 20) : [],
    scope: Array.isArray(body.scope) ? body.scope.map(String).slice(0, 50) : [],
    flux: ['mosaique', 'libye'].includes(body.flux) ? body.flux : '',
    from,
    to,
    recipients,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRun: null,
    lastError: null,
    matchCount: 0,
    matches: [],
    notified: [],
  }
  watches.push(watch)
  save()
  runWatches().catch(() => {})
  return publicWatch(watch)
}

export function setEnabled(id, enabled) {
  const watch = watches.find((w) => w.id === id)
  if (!watch) return null
  watch.enabled = Boolean(enabled)
  save()
  if (watch.enabled) runWatches().catch(() => {})
  return publicWatch(watch)
}

export function deleteWatch(id) {
  const before = watches.length
  watches = watches.filter((w) => w.id !== id)
  if (watches.length === before) return false
  save()
  return true
}

/* ---------------------------------------------------------------- e-mail */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const FLUX_AR = { mosaique: 'إذاعة موزاييك', libye: 'الرصد الليبي' }
const dateAr = new Intl.DateTimeFormat('ar-TN-u-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' })

export function buildAlertEmail(watch, found) {
  const link = `${(process.env.PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '')}/?watch=${watch.id}`
  const shown = found.slice(0, MAIL_ITEMS)
  const more = found.length - shown.length
  const subject = `MMS · رصد مبرمج: ${watch.name} (${found.length} أخبار جديدة)`
  const rows = shown
    .map(
      ({ it, hits }) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e5e5">
<div style="font-size:16px;font-weight:700;margin-bottom:4px">${it.url ? `<a href="${esc(it.url)}" style="color:#111;text-decoration:none">${esc(it.title)}</a>` : esc(it.title)}</div>
<div style="font-size:13px;color:#555;margin-bottom:4px">${esc(it.summary)}</div>
<div style="font-size:12px;color:#777">${esc(FLUX_AR[it.flux] || it.flux)} · ${esc(it.origin)} · ${esc(dateAr.format(new Date(it.date)))}</div>
<div style="font-size:12px;color:#007a4a;font-weight:700;margin-top:4px">الكلمات: ${hits.map(esc).join('، ')}</div>
</td></tr>`,
    )
    .join('')
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7f5;font-family:Tahoma,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden" dir="rtl">
<tr><td style="background:#06281d;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">منصة MMS · رصد مبرمج</td></tr>
<tr><td style="padding:20px 24px 0"><div style="font-size:20px;font-weight:700;color:#111">${esc(watch.name)}</div>
<div style="font-size:14px;color:#555;margin-top:6px">${found.length} خبر جديد يطابق هذا الرصد.</div></td></tr>
<tr><td style="padding:8px 24px"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
${more > 0 ? `<p style="color:#555;font-size:13px">… و${more} خبر آخر على المنصة</p>` : ''}</td></tr>
<tr><td style="padding:8px 24px 28px"><a href="${esc(link)}" style="display:inline-block;background:#00a362;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">عرض كل النتائج في قسم الأخبار</a></td></tr>
</table></td></tr></table></body></html>`
  const text = [
    subject,
    '',
    ...shown.map(
      ({ it, hits }) =>
        `- ${it.title}\n  ${FLUX_AR[it.flux] || it.flux} · ${it.origin} · ${dateAr.format(new Date(it.date))}\n  الكلمات: ${hits.join('، ')}${it.url ? `\n  ${it.url}` : ''}`,
    ),
    more > 0 ? `… و${more} خبر آخر على المنصة` : '',
    '',
    `عرض كل النتائج: ${link}`,
  ].join('\n')
  return { subject, html, text }
}

let transport = null
export async function sendMail(to, mail) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw Object.assign(new Error('smtp_missing'), { code: 'smtp_missing' })
  if (!transport) {
    let nodemailer
    try {
      nodemailer = (await import('nodemailer')).default
    } catch {
      throw Object.assign(new Error('nodemailer absent : lancez npm install'), { code: 'smtp_missing' })
    }
    const port = Number(process.env.SMTP_PORT) || 465
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: to.join(', '), ...mail })
}

/* ---------------------------------------------------------------- Telegram */

// Bot Telegram : TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID (une ou plusieurs discussions, séparées par des virgules)
export const telegramReady = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)

export function buildAlertTelegram(watch, found) {
  const link = `${(process.env.PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '')}/?watch=${watch.id}`
  const shown = found.slice(0, 8)
  const lines = shown.map(
    ({ it }) => `• <b>${esc(it.title)}</b>\n${esc(it.origin)} · ${esc(dateAr.format(new Date(it.date)))}${it.url ? `\n${esc(it.url)}` : ''}`,
  )
  const more = found.length - shown.length
  return [
    `🔔 <b>MMS · رصد مبرمج: ${esc(watch.name)}</b>`,
    `${found.length} خبر جديد`,
    '',
    ...lines,
    more > 0 ? `… و${more} خبر آخر` : '',
    '',
    `<a href="${esc(link)}">عرض كل النتائج</a>`,
  ]
    .join('\n')
    .slice(0, 4000)
}

export async function sendTelegram(text) {
  const chats = String(process.env.TELEGRAM_CHAT_ID)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  for (const chat of chats) {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`Telegram ${res.status}`)
  }
}

/* ---------------------------------------------------------------- vérification */

/** Vérifie chaque veille active ; un verrou empêche deux passages simultanés */
export async function runWatches() {
  if (running) return
  running = true
  try {
    // Les actualités d'exemple (MMS_DEMO) s'affichent dans le filtre mais ne partent jamais par e-mail
    const items = getItems().items.filter((it) => !it.demo)
    const texts = new Map(items.map((it) => [it.id, itemText(it)]))
    let changed = false
    for (const watch of watches) {
      if (!watch.enabled || statusOf(watch) !== 'active') continue
      const sent = new Set(watch.notified)
      const found = []
      for (const it of items) {
        if (!inScope(watch, it) || sent.has(itemKey(it))) continue
        const hits = matchText(watch, texts.get(it.id))
        if (hits) found.push({ it, hits })
      }
      watch.lastRun = new Date().toISOString()
      changed = true
      if (!found.length) continue
      found.sort((a, b) => b.it.date.localeCompare(a.it.date))
      watch.matches = [
        ...found.map(({ it, hits }) => ({ id: it.id, title: it.title, flux: it.flux, origin: it.origin, date: it.date, url: it.url, hits })),
        ...watch.matches,
      ].slice(0, KEEP_MATCHES)
      watch.matchCount += found.length
      try {
        // Telegram en plus de l'e-mail ; son échec ne fait pas renvoyer l'e-mail
        if (telegramReady()) await sendTelegram(buildAlertTelegram(watch, found)).catch((err) => console.error(`Veille « ${watch.name} » : ${err.message}`))
        // Sans SMTP mais avec Telegram, l'alerte part seulement sur Telegram, sans erreur
        const smtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
        if (watch.recipients.length && (smtp || !telegramReady())) await sendMail(watch.recipients, buildAlertEmail(watch, found))
        watch.lastError = null
        // Envoyés (ou sans destinataire) : on ne les signalera plus
        watch.notified = [...watch.notified, ...found.map(({ it }) => itemKey(it))].slice(-5000)
      } catch (err) {
        // Échec d'envoi : les actualités repartiront au passage suivant
        const code = err.code === 'smtp_missing' ? 'smtp_missing' : 'smtp_error'
        if (watch.lastError !== code) console.error(`Veille « ${watch.name} » : ${err.message}`)
        watch.lastError = code
        watch.matchCount -= found.length
        watch.matches = watch.matches.slice(found.length)
      }
    }
    if (changed) save()
  } finally {
    running = false
  }
}

export function startWatches(dataDir) {
  file = path.join(dataDir, 'watches.json')
  load()
  // MMS relit ses données toutes les 30 s ; la veille repasse toutes les 5 min, et dès qu'il y a du nouveau
  let last = ''
  const tick = () => {
    const { items, lastUpdate } = getItems()
    const sig = `${lastUpdate}|${items.length}`
    if (sig !== last) {
      last = sig
      runWatches().catch((err) => console.error('Veille :', err.message))
    }
  }
  tick()
  setInterval(tick, 30_000).unref()
  setInterval(() => runWatches().catch(() => {}), CHECK_MS).unref()
}
