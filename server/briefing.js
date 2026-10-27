import fs from 'node:fs'
import path from 'node:path'
import { getItems } from './store.js'
import { onMailPolicyChange, splitRecipients } from './mailPolicy.js'
import { logDispatch } from './dispatchLog.js'
import { aiEnabled, briefingSummary } from './ai.js'
import { briefingFacts, buildBriefing } from './insights.js'
import { sendMail, sendTelegram, telegramReady } from './watches.js'

/**
 * Rapport exécutif programmé : chaque semaine (jour et heure de Tunis choisis dans MMS),
 * MMS rédige la synthèse avec l'IA et l'envoie par e-mail (HTML prêt à imprimer en PDF) et sur Telegram.
 */

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
let file = ''
let conf = { enabled: false, weekday: 0, hour: 8, days: 7, recipients: [], telegram: true, lastSent: '', lastError: '' }

const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tripoli', weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function nowTunis() {
  const p = Object.fromEntries(local.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { weekday: WEEKDAYS.indexOf(p.weekday), hour: Number(p.hour), day: `${p.year}-${p.month}-${p.day}` }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(conf, null, 2))
}

export const briefingConf = () => ({ ...conf, smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), telegramReady: telegramReady(), ai: aiEnabled() })

/** Liste blanche : adresses hors domaines autorisés mises de côté (jamais supprimées), rendues si le domaine est autorisé */
export function applyMailPolicyToBriefing() {
  const all = [...new Set([...(conf.recipients || []), ...(conf.blockedRecipients || [])])]
  const { ok, blocked } = splitRecipients(all)
  if (JSON.stringify(ok) !== JSON.stringify(conf.recipients || []) || JSON.stringify(blocked) !== JSON.stringify(conf.blockedRecipients || [])) {
    if (blocked.length && file && fs.existsSync(file)) {
      const backup = file.replace(/\.json$/, '.avant-liste-blanche.json')
      if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    }
    conf = { ...conf, recipients: ok, blockedRecipients: blocked }
    save()
  }
  return conf.blockedRecipients || []
}

export function setBriefingConf(body) {
  const recipients = [
    ...new Set(
      (Array.isArray(body?.recipients) ? body.recipients : String(body?.recipients || '').split(/[\s,;]+/))
        .map((e) => String(e).trim())
        .filter((e) => EMAIL_RE.test(e)),
    ),
  ].slice(0, 20)
  conf = {
    ...conf,
    enabled: Boolean(body?.enabled),
    weekday: Math.min(Math.max(Math.round(Number(body?.weekday) || 0), 0), 6),
    hour: Math.min(Math.max(Math.round(Number(body?.hour) || 0), 0), 23),
    days: [7, 14, 30].includes(Number(body?.days)) ? Number(body.days) : 7,
    recipients: splitRecipients(recipients).ok,
    blockedRecipients: splitRecipients(recipients).blocked,
    telegram: body?.telegram !== false,
  }
  save()
  return briefingConf()
}

export const briefingKey = (days, lastUpdate, total) => `brief|${days}|${lastUpdate}|${total}`

/** Rapport complet (chiffres + synthèse IA si une clé est configurée) */
export async function briefingWithSummary(items, days, lastUpdate) {
  const b = buildBriefing(items, days)
  let summary = null
  if (aiEnabled() && b.current.total) {
    summary = await briefingSummary({ key: briefingKey(days, lastUpdate, b.current.total), facts: briefingFacts(b), items: b.top.concat(b.items).slice(0, 150) })
  }
  return { b, summary }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const TONE = { positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي' }
const dateAr = new Intl.DateTimeFormat('ar-LY', { timeZone: 'Africa/Tripoli', day: 'numeric', month: 'long', year: 'numeric' })
const delta = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / b) * 100))}%` : '')

export function briefingEmail({ b, summary }) {
  const link = (process.env.PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '')
  const period = `${dateAr.format(new Date(b.from))} – ${dateAr.format(new Date(b.to))}`
  const list = (rows) => rows.map((r) => `<li>${esc(r.name)} : <b>${r.current}</b> <span style="color:#6b7c74">(${r.previous})</span></li>`).join('')
  const bullets = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('')
  const kpi = (label, v, prev) =>
    `<td style="padding:12px;border:1px solid #e3e8e5;border-radius:8px;text-align:center"><div style="color:#5f7469;font-size:13px">${label}</div><div style="font-size:26px;font-weight:800">${v}</div><div style="font-size:12px;color:#00894f">${delta(v, prev)}</div></td>`
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7f5;font-family:Tahoma,Arial,sans-serif;color:#173028">
<div style="max-width:720px;margin:0 auto;background:#fff;padding:28px">
<p style="margin:0;color:#00a362;font-weight:800;letter-spacing:.08em">MMS</p>
<h1 style="margin:4px 0 2px;font-size:24px">التقرير التنفيذي</h1>
<p style="margin:0 0 18px;color:#5f7469">${esc(period)}</p>
<table style="width:100%;border-spacing:8px"><tr>
${kpi('عدد الأخبار', b.current.total, b.previous.total)}${kpi('المصادر', b.current.sources, b.previous.sources)}${kpi('أخبار لافتة', b.current.important, b.previous.important)}${kpi('نبرة سلبية', b.current.tones.negative, b.previous.tones.negative)}
</tr></table>
${
  summary
    ? `<h2 style="font-size:18px;margin:22px 0 8px">الخلاصة</h2><p style="line-height:1.8">${esc(summary.resume)}</p>
<h2 style="font-size:18px;margin:22px 0 8px">أبرز الأحداث</h2><ul style="line-height:1.8">${bullets(summary.faits)}</ul>
<h2 style="font-size:18px;margin:22px 0 8px">الاتجاهات</h2><ul style="line-height:1.8">${bullets(summary.tendances)}</ul>
<h2 style="font-size:18px;margin:22px 0 8px">توصيات</h2><ul style="line-height:1.8">${bullets(summary.recommandations)}</ul>`
    : ''
}
<h2 style="font-size:18px;margin:22px 0 8px">المواضيع</h2><ul style="line-height:1.8">${list(b.categories)}</ul>
<h2 style="font-size:18px;margin:22px 0 8px">الشخصيات الأكثر ذكراً</h2><ul style="line-height:1.8">${list(b.people)}</ul>
<h2 style="font-size:18px;margin:22px 0 8px">النبرة</h2><p>${Object.entries(b.current.tones)
    .map(([k, v]) => `${TONE[k]} : <b>${v}</b>`)
    .join(' · ')}</p>
<h2 style="font-size:18px;margin:22px 0 8px">أبرز الأخبار</h2><ol style="line-height:1.7">${b.top
    .slice(0, 8)
    .map((it) => `<li>${it.url ? `<a href="${esc(it.url)}" style="color:#173028">${esc(it.title)}</a>` : esc(it.title)} <span style="color:#6b7c74">— ${esc(it.origin)}</span></li>`)
    .join('')}</ol>
<p style="margin-top:26px"><a href="${esc(link)}/?view=briefing" style="background:#00a362;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">فتح التقرير في MMS</a></p>
<p style="color:#8a9a92;font-size:12px">أُرسل تلقائياً من منصة MMS.</p>
</div></body></html>`
  return { subject: `MMS · التقرير التنفيذي · ${period}`, html }
}

export function briefingTelegram({ b, summary }) {
  const link = (process.env.PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '')
  const lines = [
    `<b>MMS · التقرير التنفيذي (${b.days} أيام)</b>`,
    `عدد الأخبار : <b>${b.current.total}</b> ${delta(b.current.total, b.previous.total)}`,
    summary ? `\n${esc(summary.resume)}` : '',
    summary ? `\n<b>أبرز الأحداث</b>\n${summary.faits.map((f) => `• ${esc(f)}`).join('\n')}` : '',
    `\n<a href="${esc(link)}/?view=briefing">فتح التقرير</a>`,
  ]
  return lines.filter(Boolean).join('\n').slice(0, 4000)
}

export async function sendBriefing() {
  const { items, lastUpdate } = getItems()
  const real = items.filter((it) => !it.demo)
  const report = await briefingWithSummary(real, conf.days, lastUpdate)
  const sent = []
  if (conf.recipients.length && process.env.SMTP_USER && process.env.SMTP_PASS) {
    await sendMail(conf.recipients, briefingEmail(report))
    sent.push('email')
  }
  if (conf.telegram && telegramReady()) {
    await sendTelegram(briefingTelegram(report))
    sent.push('telegram')
  }
  if (!sent.length) throw Object.assign(new Error('Aucun canal configuré'), { code: 'NO_CHANNEL' })
  logDispatch({ kind: 'briefing', name: `التقرير التنفيذي (${conf.days} أيام)`, count: report.b?.current?.total || 0, channels: sent, recipients: conf.recipients.length })
  return sent
}

export function startBriefing(dataDir) {
  file = path.join(dataDir, 'briefing.json')
  try {
    conf = { ...conf, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {
    /* pas encore configuré */
  }
  applyMailPolicyToBriefing()
  onMailPolicyChange(applyMailPolicyToBriefing)
  const tick = async () => {
    if (!conf.enabled) return
    const now = nowTunis()
    if (now.weekday !== conf.weekday || now.hour !== conf.hour || conf.lastSent === now.day) return
    conf.lastSent = now.day
    try {
      await sendBriefing()
      conf.lastError = ''
    } catch (err) {
      conf.lastError = err.code || 'FAILED'
      console.error('Rapport exécutif :', err.message)
    }
    save()
  }
  setInterval(() => tick().catch(() => {}), 5 * 60_000).unref()
}
