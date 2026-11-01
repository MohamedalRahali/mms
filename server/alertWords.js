import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * Mots-clés d'alerte personnels (page « التنبيهات », audit produit v6, constat 1a) : gardés sur le serveur, par compte,
 * au lieu du navigateur (localStorage) ; ils suivent l'utilisateur d'un poste à l'autre.
 *
 * - Stockage : data/alert-words.json, { users: { email: { words, updatedAt, migratedAt? } } }.
 * - Chaque compte ne lit et n'écrit que sa propre liste (clé = adresse de la session, jamais un paramètre).
 * - Migration : au premier chargement, l'interface envoie les mots de l'ancien stockage du navigateur (migrate: true) ;
 *   ils ne sont acceptés que si le compte n'a encore rien sur le serveur (pas d'écrasement d'une liste existante),
 *   puis le navigateur n'est plus la source.
 */

export const MAX_WORDS = 50
export const MAX_WORD_LEN = 120

let file = ''
let data = { users: {} }

export function initAlertWords(dir) {
  file = path.join(dir, 'alert-words.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    data = { users: saved && typeof saved.users === 'object' && saved.users ? saved.users : {} }
  } catch {
    data = { users: {} }
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), ...data }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

const keyOf = (email) => String(email || '').trim().toLowerCase()
const fail = (code) => Object.assign(new Error(code), { code, status: 400 })

/** Liste nettoyée : textes non vides, espaces réduits, sans doublon (casse ignorée), bornée ; erreur si invalide */
export function cleanWords(list) {
  if (!Array.isArray(list)) throw fail('BAD_WORDS')
  const out = []
  const seen = new Set()
  for (const raw of list) {
    if (typeof raw !== 'string') throw fail('BAD_WORDS')
    const w = raw.replace(/\s+/g, ' ').trim()
    if (!w) continue
    if (w.length > MAX_WORD_LEN) throw fail('WORD_TOO_LONG')
    const k = w.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(w)
  }
  if (out.length > MAX_WORDS) throw fail('TOO_MANY_WORDS')
  return out
}

/** Mots du compte ; known : le compte a déjà une liste sur le serveur (même vide) */
export function wordsOf(email) {
  const row = data.users[keyOf(email)]
  return { words: row ? [...row.words] : [], known: Boolean(row), updatedAt: row?.updatedAt || null, migratedAt: row?.migratedAt || null }
}

/**
 * Enregistre la liste du compte. migrate : mots venus de l'ancien stockage du navigateur, acceptés seulement si le
 * compte n'a encore aucune liste (une deuxième migration, depuis un autre poste, ne remplace rien).
 */
export function setWords(email, list, { migrate = false, now = new Date() } = {}) {
  const key = keyOf(email)
  if (!key) throw Object.assign(new Error('NO_USER'), { code: 'NO_USER', status: 401 })
  const words = cleanWords(list)
  const row = data.users[key]
  if (migrate && row) return { ...wordsOf(key), migrated: false }
  data.users[key] = { words, updatedAt: now.toISOString(), ...(migrate ? { migratedAt: now.toISOString() } : row?.migratedAt ? { migratedAt: row.migratedAt } : {}) }
  save()
  return { ...wordsOf(key), migrated: migrate }
}

/** GET /api/alert-words, PUT /api/alert-words { words, migrate? } : la session seule désigne le compte */
export function mountAlertWords(app) {
  app.get('/api/alert-words', (req, res) => res.json(wordsOf(req.user?.email)))
  app.put('/api/alert-words', express.json({ limit: '20kb' }), (req, res) => {
    try {
      res.json(setWords(req.user?.email, req.body?.words, { migrate: req.body?.migrate === true }))
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  })
}
