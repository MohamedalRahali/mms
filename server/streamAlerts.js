import fs from 'node:fs'
import path from 'node:path'
import { recordAudit } from './auditTrail.js'

/**
 * Coupures des flux TV et radio (audit produit v4, constat 3) : la veille écrit libye-diffusion-coupures.json dès
 * qu'une chaîne échoue 3 fois de suite (veille/broadcast.py, note_capture) ; MMS prévient l'équipe une fois par
 * coupure (Telegram si configuré, e-mail du support technique), puis quand le flux revient. Chaque alerte est inscrite
 * au journal des envois et au journal d'audit. État gardé dans data/stream-alerts.json (pas de double alerte au
 * redémarrage).
 */

let dir = ''
let sent = {} // chaîne → { depuis, at }

const readJson = (file, fb) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fb
  }
}

/** Coupures en cours : { <id>: { nom, canal, depuis, echecs, erreur } } (seulement celles déclarées) */
export function currentCuts() {
  const all = readJson(path.join(dir, 'libye-diffusion-coupures.json'), { coupures: {} }).coupures || {}
  return Object.fromEntries(Object.entries(all).filter(([, c]) => c && c.depuis))
}

const fmt = (iso) => new Intl.DateTimeFormat('ar-LY-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Tripoli' }).format(new Date(iso))

export async function checkCuts({ sendTelegram, telegramReady, sendMail, logDispatch }) {
  const cuts = currentCuts()
  let changed = false
  const notify = async (subject, text, name) => {
    const channels = []
    if (telegramReady()) {
      try {
        await sendTelegram(text)
        channels.push('telegram')
      } catch {
        /* Telegram en panne : l'e-mail suffit */
      }
    }
    try {
      if (await sendMail({ subject, text })) channels.push('email')
    } catch {
      /* pas de SMTP : l'alerte reste visible sur la page des chaînes et dans le journal */
    }
    logDispatch({ kind: 'stream', name, channels, recipients: channels.length, status: channels.length ? 'sent' : 'skipped', ...(channels.length ? {} : { error: 'NO_RECIPIENTS' }) })
  }
  for (const [id, c] of Object.entries(cuts)) {
    if (sent[id]?.depuis === c.depuis) continue
    sent[id] = { depuis: c.depuis, at: new Date().toISOString(), nom: c.nom }
    changed = true
    const what = c.canal === 'radio' ? 'الإذاعة' : 'القناة'
    recordAudit({ actor: 'system', category: 'sources', action: 'stream_cut', target: id, detail: `${c.nom} — ${c.erreur || ''}` })
    await notify(`MMS : انقطاع بث ${c.nom}`, `⚠️ MMS · انقطاع البث\n${what}: ${c.nom}\nمنذ: ${fmt(c.depuis)}\nعدد المحاولات الفاشلة: ${c.echecs}`, `انقطاع: ${c.nom}`)
  }
  for (const [id, s] of Object.entries(sent)) {
    if (cuts[id]) continue
    delete sent[id]
    changed = true
    recordAudit({ actor: 'system', category: 'sources', action: 'stream_back', target: id, detail: s.nom || id })
    await notify(`MMS : عودة بث ${s.nom || id}`, `✅ MMS · عاد البث\n${s.nom || id}\nكان منقطعاً منذ: ${fmt(s.depuis)}`, `عودة: ${s.nom || id}`)
  }
  if (changed) {
    try {
      fs.writeFileSync(path.join(dir, 'stream-alerts.json'), JSON.stringify(sent, null, 1))
    } catch {
      /* gardé en mémoire */
    }
  }
  return { cuts: Object.keys(cuts).length }
}

export function startStreamAlerts(dataDir, deps) {
  dir = dataDir
  sent = readJson(path.join(dir, 'stream-alerts.json'), {})
  const tick = () => checkCuts(deps).catch((err) => console.error('Coupures de flux :', err.message))
  setTimeout(tick, 60_000).unref()
  setInterval(tick, 2 * 60_000).unref()
}
