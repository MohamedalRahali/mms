import fs from 'node:fs'
import path from 'node:path'

/**
 * Liste blanche des domaines destinataires (النطاقات المسموح بها) : aucun e-mail de MMS (veilles, rapports,
 * briefing, alertes du radar) ne part vers une adresse hors de ces domaines. Réglée dans la console Super Admin ;
 * par défaut npdc.gov.ly. Stockage : data/superadmin/mail-policy.json.
 * Les adresses déjà enregistrées hors liste ne sont pas supprimées : elles sont mises de côté (« bloquées ») dans
 * leur veille ou leur programmation, listées dans la console, et reviennent d'elles-mêmes si leur domaine est autorisé.
 */

let file = ''
const CLIENT_DOMAINS = ['npdc.gov.ly']
let policy = { domains: [...CLIENT_DOMAINS] }
const listeners = new Set()

const cleanDomain = (d) =>
  String(d || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export function initMailPolicy(dir) {
  file = path.join(dir, 'mail-policy.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    const domains = (saved.domains || []).map(cleanDomain).filter((d) => DOMAIN_RE.test(d))
    // Domaine du client toujours autorisé (audit v5 : destinataires @npdc.gov.ly refusés dans les veilles)
    if (domains.length) policy = { domains: [...new Set([...domains, ...CLIENT_DOMAINS])] }
  } catch {
    /* règle par défaut */
  }
}

export const mailPolicy = () => ({ domains: [...policy.domains] })
export const onMailPolicyChange = (fn) => listeners.add(fn)

export function setMailPolicy(p) {
  const domains = [...new Set((Array.isArray(p?.domains) ? p.domains : String(p?.domains || '').split(/[\s,;،]+/)).map(cleanDomain).filter((d) => DOMAIN_RE.test(d)))].slice(0, 30)
  if (!domains.length) throw Object.assign(new Error('NO_DOMAIN'), { code: 'NO_DOMAIN', status: 400 })
  policy = { domains: [...new Set([...domains, ...CLIENT_DOMAINS])] }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ ...policy, savedAt: new Date().toISOString() }, null, 2))
  for (const fn of listeners) fn()
  return mailPolicy()
}

/** L'adresse appartient-elle à un domaine autorisé (ou à un de ses sous-domaines) ? */
export function allowedRecipient(email) {
  const domain = String(email || '')
    .trim()
    .toLowerCase()
    .split('@')[1]
  if (!domain) return false
  return policy.domains.some((d) => domain === d || domain.endsWith(`.${d}`))
}

/** Sépare une liste d'adresses en autorisées et bloquées */
export function splitRecipients(list) {
  const ok = []
  const blocked = []
  for (const r of Array.isArray(list) ? list : []) (allowedRecipient(r) ? ok : blocked).push(r)
  return { ok, blocked }
}
