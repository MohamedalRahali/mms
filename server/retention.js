import fs from 'node:fs'
import path from 'node:path'

/**
 * Conservation de l'audio lié à une alerte (audit produit v4, constat 9) : 90 jours au lieu de 3.
 *
 * MMS écrit data/libye-conservation.json, lu par la veille (veille/conservation.py) avant chaque purge :
 *   - fenetres : créneaux TV/radio (« chaîne/AAAA-MM-JJ_HHMM », champ `fenetre` des fiches) des fiches qui ont
 *     déclenché une veille (الرصد) ;
 *   - enregistrements : enregistrements à la demande où الرصد المبرمج a trouvé au moins un passage
 *     (data/libye-rasd-hits.json).
 * Recalculé toutes les 10 minutes ; une entrée reste dans la liste 90 jours après l'alerte.
 */

export const KEEP_DAYS = 90
let dir = ''
let kept = { fenetres: {}, enregistrements: {} } // clé → date de l'alerte (ISO)

const readJson = (file, fb) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fb
  }
}

/** Calcule la liste à partir des veilles (fiches alertées) et des passages trouvés dans les enregistrements */
export function computeRetention({ watches = [], byId = new Map(), rasdHits = {}, now = Date.now(), previous = kept } = {}) {
  const limit = now - KEEP_DAYS * 86_400_000
  const out = { fenetres: { ...previous.fenetres }, enregistrements: { ...previous.enregistrements } }
  for (const w of watches)
    for (const m of w.matches || []) {
      const it = byId.get(m.id)
      const win = it?.audioWindow
      if (win && !out.fenetres[win]) out.fenetres[win] = m.date || new Date(now).toISOString()
    }
  for (const [rid, hits] of Object.entries(rasdHits || {})) {
    const at = Object.values(hits || {}).map((h) => h?.at || h?.last || '').sort().pop() || new Date(now).toISOString()
    if (!out.enregistrements[rid]) out.enregistrements[rid] = at
  }
  for (const k of ['fenetres', 'enregistrements']) for (const [key, at] of Object.entries(out[k])) if (Date.parse(at) < limit) delete out[k][key]
  return out
}

export function writeRetention(state) {
  kept = state
  const file = path.join(dir, 'libye-conservation.json')
  const body = { maj: new Date().toISOString(), jours: KEEP_DAYS, fenetres: Object.keys(state.fenetres), enregistrements: Object.keys(state.enregistrements), depuis: state }
  try {
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(body))
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error('Conservation :', err.message)
  }
}

export function startRetention(dataDir, { getItems, listWatches }) {
  dir = dataDir
  const saved = readJson(path.join(dir, 'libye-conservation.json'), {}).depuis
  if (saved?.fenetres && saved?.enregistrements) kept = saved
  const tick = () => {
    try {
      writeRetention(computeRetention({ watches: listWatches(), byId: getItems().byId, rasdHits: readJson(path.join(dir, 'libye-rasd-hits.json'), {}) }))
    } catch (err) {
      console.error('Conservation :', err.message)
    }
  }
  setTimeout(tick, 90_000).unref()
  setInterval(tick, 10 * 60_000).unref()
}
