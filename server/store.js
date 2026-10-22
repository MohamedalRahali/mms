import fs from 'node:fs'
import path from 'node:path'
import { demoItems } from './demo.js'

/**
 * Lit les sorties des veilles et les ramène à un seul format d'actualité :
 * { id, flux, title, summary, category, date, origin, channel, lang, url, image, broadcasts, live }
 *
 * - Mosaïque FM : <MOSAIQUE_DATA_DIR>/<AAAA-MM-JJ>/actualites.json (rapport consolidé de la nuit),
 *   ou à défaut news/<HH>.json (extraction heure par heure de la journée en cours).
 * - Libye : tout fichier .json de <LIBYE_DATA_DIR>, liste d'actualités ou { actualites: [...] }.
 */

const RELOAD_MS = 30_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TUNIS = '+01:00'

let cache = { at: 0, items: [], lastUpdate: null, demo: false }

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function listOf(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.actualites)) return data.actualites
  return []
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '')
const normCategory = (c) => clean(c).toLowerCase() || 'autre'

function langCode(l) {
  const v = clean(l).toLowerCase()
  if (v.startsWith('ar')) return 'ar'
  if (v.startsWith('fr')) return 'fr'
  if (v.startsWith('en') || v.startsWith('an')) return 'en'
  if (v.startsWith('mix')) return 'mixte'
  return v
}

function hhmm(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(clean(v))
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '00:00'
}

function loadMosaique(dir, track) {
  const items = []
  if (!dir || !fs.existsSync(dir)) return items
  for (const day of fs.readdirSync(dir)) {
    if (!DAY_RE.test(day)) continue
    const dayDir = path.join(dir, day)
    const digest = path.join(dayDir, 'actualites.json')
    let rows = []
    let live = false
    if (fs.existsSync(digest)) {
      rows = listOf(readJson(digest))
      track(digest)
    } else {
      const newsDir = path.join(dayDir, 'news')
      if (!fs.existsSync(newsDir)) continue
      live = true
      for (const f of fs
        .readdirSync(newsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()) {
        rows.push(...listOf(readJson(path.join(newsDir, f))))
        track(path.join(newsDir, f))
      }
    }
    rows.forEach((n, i) => {
      const time = hhmm(n.premiere_diffusion || n.heure)
      items.push({
        id: `mosaique-${day}-${i}`,
        flux: 'mosaique',
        title: clean(n.titre),
        summary: clean(n.resume),
        category: normCategory(n.categorie),
        date: new Date(`${day}T${time}:00${TUNIS}`).toISOString(),
        origin: 'Mosaïque FM',
        channel: 'radio',
        lang: langCode(n.langue) || 'fr',
        url: '',
        broadcasts: Number(n.nb_diffusions) || 1,
        live,
      })
    })
  }
  return items
}

function loadLibye(dir, track) {
  const items = []
  if (!dir || !fs.existsSync(dir)) return items
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const file = path.join(dir, f)
    track(file)
    listOf(readJson(file)).forEach((n, i) => {
      const date = new Date(n.date || n.publie_le || '')
      if (Number.isNaN(date.getTime())) return
      items.push({
        id: `libye-${path.basename(f, '.json')}-${i}`,
        flux: 'libye',
        title: clean(n.titre),
        summary: clean(n.resume),
        category: normCategory(n.categorie),
        date: date.toISOString(),
        origin: clean(n.source) || 'Source libyenne',
        channel: clean(n.canal).toLowerCase() || 'site',
        lang: langCode(n.langue) || 'ar',
        url: clean(n.url),
        image: clean(n.image),
        broadcasts: 1,
        live: false,
      })
    })
  }
  return items
}

export function getItems() {
  if (Date.now() - cache.at < RELOAD_MS) return cache
  let latest = 0
  const track = (file) => {
    try {
      latest = Math.max(latest, fs.statSync(file).mtimeMs)
    } catch {
      /* fichier disparu entre deux lectures */
    }
  }
  const items = [
    // Mosaïque FM n'est plus suivie ; MMS_MOSAIQUE=1 la réactive
    ...(process.env.MMS_MOSAIQUE === '1' ? loadMosaique(process.env.MOSAIQUE_DATA_DIR, track) : []),
    ...loadLibye(process.env.LIBYE_DATA_DIR, track),
  ].filter((n) => n.title)
  const demo = process.env.MMS_DEMO === '1'
  if (demo) items.push(...demoItems())
  items.sort((a, b) => b.date.localeCompare(a.date))
  cache = {
    at: Date.now(),
    items,
    lastUpdate: latest ? new Date(latest).toISOString() : demo ? new Date().toISOString() : null,
    demo,
  }
  return cache
}
