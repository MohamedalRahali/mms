import fs from 'node:fs'
import path from 'node:path'

/**
 * Couche « intelligence » de MMS, sur le modèle de Meltwater :
 * étiquettes d'équipe, entités citées, détection des pics d'activité et export CSV.
 */

const DAY_MS = 86_400_000

/* ---------------------------------------------------------------- étiquettes */

let tagsFile = ''
let tags = {} // clé de fiche (url, sinon id) → étiquettes

export function initTags(dataDir) {
  tagsFile = path.join(dataDir, 'tags.json')
  try {
    tags = JSON.parse(fs.readFileSync(tagsFile, 'utf8')) || {}
  } catch {
    tags = {}
  }
}

/** L'url reste stable d'une relecture à l'autre ; l'id sert pour les fiches sans lien */
export const itemKey = (it) => it.url || it.id
export const tagsOf = (it) => tags[itemKey(it)] || []

export function setTags(key, list) {
  const clean = [...new Set((Array.isArray(list) ? list : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 12)
  if (clean.length) tags[key] = clean
  else delete tags[key]
  fs.mkdirSync(path.dirname(tagsFile), { recursive: true })
  fs.writeFileSync(tagsFile, JSON.stringify(tags))
  return clean
}

export function allTags() {
  const map = new Map()
  for (const list of Object.values(tags)) for (const t of list) map.set(t, (map.get(t) || 0) + 1)
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

/* ---------------------------------------------------------------- entités */

export const entitiesOf = (it) => [...(it.people || []), ...(it.orgs || []), ...(it.places || [])]

/** Comptage d'un champ liste (personnes, organisations, lieux) */
export function countList(items, key, limit = 15) {
  const map = new Map()
  for (const it of items) for (const name of it[key] || []) map.set(name, (map.get(name) || 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/* ---------------------------------------------------------------- pics */

// Dimensions surveillées : le filtre de la liste d'actualités qui ouvre le pic, et les valeurs de chaque fiche
const SPIKE_DIMS = [
  { dim: 'categories', filter: 'category', values: (it) => [it.category] },
  { dim: 'sources', filter: 'source', values: (it) => [it.origin] },
  { dim: 'people', filter: 'entity', values: (it) => it.people || [] },
  { dim: 'orgs', filter: 'entity', values: (it) => it.orgs || [] },
  { dim: 'places', filter: 'entity', values: (it) => it.places || [] },
]

/**
 * Compare les dernières 24 heures à la moyenne quotidienne des 7 jours d'avant.
 * Un pic : au moins 4 mentions, et au moins 3 fois la moyenne (plus une, pour les sujets rares).
 */
export function findSpikes(items, now = Date.now()) {
  const recent = []
  const before = []
  for (const it of items) {
    const t = Date.parse(it.date)
    if (t >= now - DAY_MS) recent.push(it)
    else if (t >= now - 8 * DAY_MS) before.push(it)
  }
  if (!recent.length) return []
  const spikes = []
  for (const d of SPIKE_DIMS) {
    const cur = new Map()
    const old = new Map()
    for (const it of recent) for (const v of d.values(it)) if (v) cur.set(v, (cur.get(v) || 0) + 1)
    for (const it of before) for (const v of d.values(it)) if (v) old.set(v, (old.get(v) || 0) + 1)
    for (const [name, count] of cur) {
      const avg = (old.get(name) || 0) / 7
      if (count >= 4 && count >= 3 * avg + 1) spikes.push({ dim: d.dim, filter: d.filter, name, count, avg: Math.round(avg * 10) / 10 })
    }
  }
  // Les plus marquants d'abord : écart à la moyenne, pondéré par le volume
  const score = (s) => (s.count / (s.avg + 1)) * Math.log2(s.count + 1)
  return spikes.sort((a, b) => score(b) - score(a)).slice(0, 6)
}

/** Fiches des dernières 24 heures qui portent la valeur du pic */
export function spikeItems(items, dim, name, now = Date.now()) {
  const d = SPIKE_DIMS.find((x) => x.dim === dim)
  if (!d) return []
  return items.filter((it) => Date.parse(it.date) >= now - DAY_MS && d.values(it).includes(name))
}

/* ---------------------------------------------------------------- export */

const TONE_AR = { positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي' }
const cell = (v) => {
  const s = String(v ?? '')
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV lisible par Excel : BOM UTF-8 pour l'arabe, une ligne par fiche */
export function toCsv(items) {
  const head = [
    'date',
    'titre',
    'resume',
    'source',
    'canal',
    'categorie',
    'langue',
    'tonalite',
    'importance',
    'personnes',
    'organisations',
    'lieux',
    'etiquettes',
    'url',
    'media',
    'auteur',
    'parent',
  ]
  const rows = items.map((it) =>
    [
      it.date,
      it.title,
      it.summary,
      it.origin,
      it.channel,
      it.category,
      it.lang,
      TONE_AR[it.tone] || '',
      it.importance || '',
      (it.people || []).join(' | '),
      (it.orgs || []).join(' | '),
      (it.places || []).join(' | '),
      tagsOf(it).join(' | '),
      it.url,
      it.media || '',
      it.author || '',
      it.parent?.title || it.thread?.topic || '',
    ]
      .map(cell)
      .join(','),
  )
  return '﻿' + [head.join(','), ...rows].join('\r\n')
}
