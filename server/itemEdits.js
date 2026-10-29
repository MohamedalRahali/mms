import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * Corrections et ajouts faits par l'équipe sur les actualités (vidéos « Tonality » et « Upload A New Article ») :
 *   - correction de la tonalité et du thème d'une fiche (la veille reste la source, la correction s'applique par-dessus) ;
 *   - articles ajoutés à la main (presse papier, source absente de la veille) ;
 *   - approbation pour la vitrine publique d'actualités : rien n'y apparaît sans cette approbation explicite.
 *
 *   data/item-edits.json     { edits: { <id>: { tone, category, by, at } }, public: { <id>: { by, at } } }
 *   data/manual-items.json   { items: [ fiche ajoutée à la main ] }
 * Chaque modification garde son auteur et sa date.
 */

const TONES = ['positive', 'neutral', 'negative']
const MEDIA = ['article', 'broadcast', 'podcast', 'blog', 'social']
const CHANNEL_OF = { article: 'presse', broadcast: 'tv', podcast: 'podcast', blog: 'blog', social: 'site' }
const MAX_MANUAL = 5000
let dir = ''
let edits = { edits: {}, public: {} }
let manual = []
let onChange = () => {}

const read = (f, fb) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  } catch {
    return fb
  }
}
const write = (f, data) => {
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `${f}.${process.pid}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1))
  fs.renameSync(tmp, path.join(dir, f))
}
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })

export function initItemEdits(dataDir, { changed } = {}) {
  dir = dataDir
  const e = read('item-edits.json', {})
  edits = { edits: e.edits || {}, public: e.public || {} }
  manual = read('manual-items.json', { items: [] }).items || []
  if (changed) onChange = changed
}

const httpUrl = (u) => {
  const s = String(u || '').trim()
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 600) : ''
}
const text = (v, n) =>
  String(v || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, n)

/** Applique corrections, approbations publiques et articles manuels à la liste des fiches (à chaque lecture) */
export function applyItemEdits(items) {
  for (const m of manual) items.push({ ...m })
  for (const it of items) {
    const e = edits.edits[it.id]
    if (e) {
      if (e.tone) it.tone = e.tone
      if (e.category) it.category = e.category
      it.edited = { by: e.by, at: e.at }
    }
    if (edits.public[it.id]) it.public = true
  }
}

export function editItem(id, body, by, known) {
  if (!known(id)) throw fail('NOT_FOUND', 404)
  const cur = edits.edits[id] || {}
  const next = { ...cur }
  if (body.tone !== undefined) {
    if (body.tone && !TONES.includes(body.tone)) throw fail('BAD_TONE')
    next.tone = body.tone || undefined
  }
  if (body.category !== undefined) next.category = text(body.category, 40) || undefined
  if (!next.tone && !next.category) delete edits.edits[id]
  else edits.edits[id] = { ...next, by: String(by || '').slice(0, 120), at: new Date().toISOString() }
  write('item-edits.json', edits)
  onChange()
  return edits.edits[id] || null
}

export function setPublic(id, on, by, known) {
  if (!known(id)) throw fail('NOT_FOUND', 404)
  if (on) edits.public[id] = { by: String(by || '').slice(0, 120), at: new Date().toISOString() }
  else delete edits.public[id]
  write('item-edits.json', edits)
  onChange()
  return Boolean(edits.public[id])
}

export const publicIds = () => new Set(Object.keys(edits.public))

export function addManual(body, by, now = Date.now()) {
  if (manual.length >= MAX_MANUAL) throw fail('FULL')
  const title = text(body.title, 300)
  const origin = text(body.origin, 120)
  if (!title) throw fail('NO_TITLE')
  if (!origin) throw fail('NO_SOURCE')
  const date = Date.parse(body.date)
  if (!Number.isFinite(date) || date > now + 3_600_000 || date < now - 5 * 365 * 86_400_000) throw fail('BAD_DATE')
  const media = MEDIA.includes(body.media) ? body.media : 'article'
  const tone = TONES.includes(body.tone) ? body.tone : 'neutral'
  const url = httpUrl(body.url)
  if (body.url && !url) throw fail('BAD_URL')
  const it = {
    id: `manual-${crypto.randomBytes(6).toString('hex')}`,
    flux: 'libye',
    manual: true,
    title,
    summary: text(body.summary, 4000),
    category: text(body.category, 40) || 'société',
    date: new Date(date).toISOString(),
    origin,
    channel: CHANNEL_OF[media],
    media,
    lang: ['ar', 'en', 'fr'].includes(body.lang) ? body.lang : 'ar',
    url,
    image: '',
    broadcasts: 1,
    live: false,
    tone,
    people: [],
    orgs: [],
    places: [],
    importance: 1,
    engagement: undefined,
    subType: '',
    createdBy: String(by || '').slice(0, 120),
    createdAt: new Date(now).toISOString(),
  }
  manual.push(it)
  write('manual-items.json', { items: manual })
  onChange()
  return it
}

export function deleteManual(id, user, isAdmin) {
  const it = manual.find((m) => m.id === id)
  if (!it) throw fail('NOT_FOUND', 404)
  if (it.createdBy !== user && !isAdmin) throw fail('FORBIDDEN', 403)
  manual = manual.filter((m) => m.id !== id)
  delete edits.edits[id]
  delete edits.public[id]
  write('manual-items.json', { items: manual })
  write('item-edits.json', edits)
  onChange()
  return true
}

export function mountItemEdits(app, { getItems, isAdmin }) {
  const wrap = (fn) => (req, res) => {
    try {
      res.json(fn(req))
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  }
  const known = (id) => getItems().byId.has(id) || manual.some((m) => m.id === id)
  app.post('/api/items', express.json({ limit: '16kb' }), wrap((req) => ({ item: addManual(req.body || {}, req.user.email) })))
  app.put('/api/items/:id/edit', express.json({ limit: '4kb' }), wrap((req) => ({ edit: editItem(String(req.params.id), req.body || {}, req.user.email, known) })))
  app.post('/api/items/:id/public', express.json({ limit: '1kb' }), wrap((req) => ({ public: setPublic(String(req.params.id), req.body?.public !== false, req.user.email, known) })))
  app.delete('/api/items/:id', wrap((req) => ({ ok: deleteManual(String(req.params.id), req.user.email, isAdmin(req.user)) })))
}
