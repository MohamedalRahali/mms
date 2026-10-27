import fs from 'node:fs'
import path from 'node:path'

/**
 * Statut « تمت المعالجة » des actualités, commun à toute l'équipe (comme les étiquettes) : data/processed.json.
 * Clé = itemKey de la fiche (adresse, sinon identifiant). Qui l'a traitée et quand sont gardés.
 * 50 000 marques au plus : les plus anciennes partent d'abord.
 */

const MAX = 50_000
let file = ''
let marks = new Map() // clé → { by, at }

export function initProcessed(dir) {
  file = path.join(dir, 'processed.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).items || {}
    marks = new Map(Object.entries(saved).filter(([k, v]) => k && v && typeof v.at === 'string'))
  } catch {
    marks = new Map()
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), items: Object.fromEntries(marks) }))
  fs.renameSync(tmp, file)
}

export const isProcessed = (key) => marks.has(key)
export const processedOf = (key) => marks.get(key) || null

/** Marque ou démarque une fiche ; renvoie la marque (ou null) */
export function setProcessed(key, done, by) {
  const k = String(key || '').slice(0, 600)
  if (!k) return null
  if (done) {
    marks.delete(k)
    marks.set(k, { by: String(by || '').slice(0, 120), at: new Date().toISOString() })
    while (marks.size > MAX) marks.delete(marks.keys().next().value)
  } else marks.delete(k)
  save()
  return marks.get(k) || null
}
