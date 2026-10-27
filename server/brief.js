import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { aroundRun } from './ai.js'

/**
 * Résumé en deux lignes, en arabe, d'une actualité en langue étrangère (ملخص بالعربية), à la demande.
 * Même IA que le reste de MMS (clé du .env) ; sans clé, la route répond NO_KEY et l'interface n'affiche pas le bouton.
 * Cache disque data/ai-briefs.json (5 000 résumés au plus) : un même article n'est jamais résumé deux fois.
 * Coût borné : 2 résumés en même temps, 300 nouveaux par jour pour toute la plateforme.
 */

const MAX_KEEP = 5000
const DAY_LIMIT = 300
let file = ''
let briefs = new Map()
let running = 0
let day = { key: '', count: 0 }

export function initBrief(dir) {
  file = path.join(dir, 'ai-briefs.json')
  try {
    briefs = new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).briefs || {}))
  } catch {
    briefs = new Map()
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ briefs: Object.fromEntries(briefs) }))
  fs.renameSync(tmp, file)
}

const SPEC = {
  system: `Tu résumes une actualité pour des analystes de veille arabophones (plateforme MMS).
Rends resume : deux lignes en arabe standard moderne (deux phrases courtes, 45 mots au plus), neutres et factuelles.
N'ajoute aucun fait absent du texte ; garde les noms propres reconnaissables.`,
  schema: { type: 'object', properties: { resume: { type: 'string' } }, required: ['resume'], additionalProperties: false },
  format: 'Réponds uniquement par un objet JSON de la forme {"resume": "..."}',
  valid: (d) => typeof d.resume === 'string' && d.resume.trim().length > 0,
  name: 'resume',
}

/** Clé de cache : la fiche et son texte (un texte corrigé donne un nouveau résumé) */
const keyOf = (it) => crypto.createHash('sha1').update(`${it.id}|${it.title}|${it.summary}`).digest('hex').slice(0, 20)

export const cachedBrief = (it) => briefs.get(keyOf(it)) || null

export async function itemBrief(it) {
  const key = keyOf(it)
  const hit = briefs.get(key)
  if (hit) return hit
  if (String(it.lang || '').toLowerCase() === 'ar') throw Object.assign(new Error('ALREADY_AR'), { code: 'ALREADY_AR', status: 400 })
  const today = new Date().toISOString().slice(0, 10)
  if (day.key !== today) day = { key: today, count: 0 }
  if (day.count >= DAY_LIMIT) throw Object.assign(new Error('DAY_LIMIT'), { code: 'DAY_LIMIT', status: 429 })
  if (running >= 2) throw Object.assign(new Error('BUSY'), { code: 'BUSY', status: 429 })
  running++
  day.count++
  try {
    const text = `Titre : ${String(it.title).slice(0, 400)}\nSource : ${it.origin}\nTexte : ${String(it.summary || it.transcription || '').slice(0, 3000)}`
    const r = await aroundRun(`brief|${key}`, text, SPEC)
    const brief = { text: r.resume.trim().slice(0, 600), at: new Date().toISOString() }
    briefs.set(key, brief)
    while (briefs.size > MAX_KEEP) briefs.delete(briefs.keys().next().value)
    save()
    return brief
  } finally {
    running--
  }
}
