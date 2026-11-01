import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getItems } from './store.js'
import { providerAccounts } from './accountPolicy.js'

/**
 * Mesures de l'audit produit v6, en LECTURE SEULE : `node server/mesures.js` (sur le serveur : sudo -u mms node
 * server/mesures.js dans /opt/mms). Rien n'est écrit ; adresses e-mail des clients jamais affichées (seuls les comptes
 * du prestataire le sont, pour la décision demandée par l'audit).
 *   - fiches sur 24 h / 7 j / 30 j, par média ; articles par mois sur 12 mois ;
 *   - TV et radio : extraits 24 h / 7 j par chaîne (fiches et état de la veille) ; chaînes libyennes avec extraits ;
 *   - YouTube : vidéos et vidéos transcrites sur 7 j ; commentaires 7 j / 30 j ;
 *   - veilles programmées actives ; comptes du prestataire.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = path.join(root, 'data')
const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return d
  }
}
const now = Date.now()
const H = 3_600_000
const since = (it, h) => Date.parse(it.date) >= now - h * H
const count = (list, key) => list.reduce((m, x) => ((m[key(x)] = (m[key(x)] || 0) + 1), m), {})

const { items, comments = [] } = getItems()
const bc = items.filter((it) => it.media === 'broadcast' && it.channel !== 'youtube')
const yt = items.filter((it) => it.channel === 'youtube')
const perChannel = {}
for (const it of bc.filter((x) => since(x, 7 * 24))) {
  const k = `${it.channel}:${it.origin}`
  perChannel[k] = perChannel[k] || { d1: 0, d7: 0 }
  perChannel[k].d7++
  if (since(it, 24)) perChannel[k].d1++
}
const etat = readJson(path.join(process.env.LIBYE_DATA_DIR || path.join(data, 'libye'), 'libye-diffusion-etat.json'), { chaines: [] })
const libyan = /الوطنية|الأحرار|218|الحدث|التناصح|الوسط|المسار|ليبيا/
const months = {}
for (const it of items) {
  const m = String(it.date).slice(0, 7)
  if (Date.parse(it.date) >= now - 366 * 24 * H) months[m] = (months[m] || 0) + 1
}
let audit = []
try {
  audit = fs.readFileSync(path.join(data, 'audit-trail.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return null
    }
  }).filter(Boolean)
} catch {}
const users = readJson(path.join(data, 'users.json'), { users: [] }).users || []
const watches = readJson(path.join(data, 'watches.json'), { watches: [] })
const wl = Array.isArray(watches) ? watches : watches.watches || []

const out = {
  at: new Date(now).toISOString(),
  fiches: { h24: items.filter((x) => since(x, 24)).length, j7: items.filter((x) => since(x, 168)).length, j30: items.filter((x) => since(x, 720)).length, parMedia7j: count(items.filter((x) => since(x, 168)), (x) => x.media || 'article') },
  articlesParMois: Object.fromEntries(Object.entries(months).sort()),
  tvRadio: {
    extraitsParChaine: perChannel,
    tv7j: bc.filter((x) => x.channel === 'tv' && since(x, 168)).length,
    radio7j: bc.filter((x) => x.channel === 'radio' && since(x, 168)).length,
    radiosAvecExtraits24h: new Set(bc.filter((x) => x.channel === 'radio' && since(x, 24)).map((x) => x.origin)).size,
    tvLibyennesAvecExtraits24h: [...new Set(bc.filter((x) => x.channel === 'tv' && since(x, 24) && libyan.test(x.origin)).map((x) => x.origin))],
    etatVeille: (etat.chaines || []).map((c) => ({ id: c.id, canal: c.canal, via: c.flux ? 'flux' : c.youtube ? 'youtube' : '', extraits_24h: c.extraits_24h, extraits_7j: c.extraits_7j, etat: c.etat_production, cause: c.cause_sans_extrait || c.raison || '' })),
    majVeille: etat.maj || null,
  },
  youtube: { videos7j: yt.filter((x) => since(x, 168)).length, transcrites7j: yt.filter((x) => since(x, 168) && (x.transcription || x.transcript)).length, chaines7j: new Set(yt.filter((x) => since(x, 168)).map((x) => x.origin)).size },
  commentaires: { j7: comments.filter((x) => since(x, 168)).length, j30: comments.filter((x) => since(x, 720)).length },
  veilles: { total: wl.length, actives: wl.filter((w) => w.enabled !== false && !w.disabled).length, seedV6: wl.filter((w) => w.seed === 'audit-v6').map((w) => ({ name: w.name, enabled: w.enabled !== false })) },
  reprise: readJson(path.join(process.env.LIBYE_DATA_DIR || path.join(data, 'libye'), 'libye-reprise-etat.json'), null),
  comptesPrestataire: providerAccounts(users, audit),
}
console.log(JSON.stringify(out, null, 1))
