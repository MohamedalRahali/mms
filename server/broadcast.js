import crypto from 'node:crypto'
import { getItems } from './store.js'
import { compileQuery, searchText } from './query.js'
import { normalize } from './watches.js'
import { toDay } from './insights.js'
import { reachOf } from './sourceMeta.js'

/**
 * Broadcasts — البث : recherche dans les transcriptions, passages horodatés, temps d'antenne estimé, extraits à partager.
 *
 * Données : la veille Libye enregistre les journaux TV et radio par tranches de 10 minutes, les transcrit et en extrait
 * les actualités. Chaque fiche porte le texte de la tranche où l'actualité a été annoncée (transcription) et l'heure
 * de l'annonce (date). Il n'y a pas d'horodatage dans le texte : l'heure de chaque passage est estimée à partir du
 * début de la tranche et du débit de parole (130 mots par minute), et affichée comme approximative.
 * Le temps d'antenne d'une tranche est réparti entre les actualités qui en sont tirées.
 */

const DAY = 86_400_000
const SEGMENT_MIN = 10
const WORDS_PER_MINUTE = 130
const PASSAGE_WORDS = 45

const wordsOf = (text) => (text ? String(text).split(/\s+/).filter(Boolean) : [])

/** Début de la tranche de 10 minutes qui contient l'annonce */
export function segmentStart(iso) {
  const t = Date.parse(iso)
  return new Date(t - (t % (SEGMENT_MIN * 60_000))).toISOString()
}

/**
 * Passages d'une transcription : phrases regroupées par ~45 mots, avec leur décalage estimé depuis le début de la
 * tranche (secondes) et l'heure correspondante
 */
export function passagesOf(text, startIso) {
  const sentences = String(text || '')
    .split(/(?<=[.!؟?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  let buf = []
  let before = 0
  const start = Date.parse(startIso)
  const flush = () => {
    if (!buf.length) return
    const passage = buf.join(' ')
    const offset = Math.round((before / WORDS_PER_MINUTE) * 60)
    out.push({ n: out.length, offset, at: new Date(start + offset * 1000).toISOString(), text: passage })
    before += wordsOf(passage).length
    buf = []
  }
  for (const s of sentences) {
    buf.push(s)
    if (wordsOf(buf.join(' ')).length >= PASSAGE_WORDS) flush()
  }
  flush()
  return out
}

/** Mots à surligner d'une requête booléenne : termes et expressions, sans les opérateurs ni les exclusions */
export function highlightTerms(q) {
  const out = []
  const src = String(q || '')
  for (const m of src.matchAll(/"([^"]+)"/g)) out.push(m[1])
  const rest = src
    .replace(/"[^"]*"/g, ' ')
    .replace(/\bNOT\s+\S+/gi, ' ')
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(AND|OR|NOT)$/i.test(w))
  return [...new Set([...out, ...rest].map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 20)
}

/** Passages qui contiennent un des mots (comparaison sans diacritiques ni hamza) */
export function matchPassages(passages, terms) {
  const norm = terms.map((t) => normalize(t)).filter(Boolean)
  if (!norm.length) return []
  return passages.filter((p) => {
    const flat = normalize(p.text)
    return norm.some((t) => flat.includes(t))
  })
}

export const segKey = (it) => `${it.origin}|${crypto.createHash('sha1').update(String(it.transcription || it.id)).digest('hex').slice(0, 16)}`

/**
 * Temps d'antenne estimé (minutes) : durée de chaque tranche (mots / 130, au plus 10 min) partagée entre les fiches
 * qui en viennent ; regroupé par chaîne, thème, personnalité, organisation et jour
 */
export function airtime(items) {
  const segs = new Map()
  for (const it of items) {
    const k = segKey(it)
    let s = segs.get(k)
    if (!s) segs.set(k, (s = { minutes: Math.min(SEGMENT_MIN, wordsOf(it.transcription).length / WORDS_PER_MINUTE) || 1, items: [] }))
    s.items.push(it)
  }
  const add = (map, name, v, extra) => {
    if (!name) return
    const row = map.get(name) || { name, minutes: 0, count: 0, ...extra }
    row.minutes += v
    row.count++
    map.set(name, row)
  }
  const channels = new Map()
  const topics = new Map()
  const people = new Map()
  const orgs = new Map()
  const days = new Map()
  let total = 0
  for (const s of segs.values()) {
    total += s.minutes
    const share = s.minutes / s.items.length
    for (const it of s.items) {
      add(channels, it.origin, share, { sub: it.subType || it.channel })
      add(topics, it.category, share)
      for (const p of it.people || []) add(people, p, share)
      for (const o of it.orgs || []) add(orgs, o, share)
      add(days, toDay(it.date), share)
    }
  }
  const rank = (m, n = 15) =>
    [...m.values()]
      .map((r) => ({ ...r, minutes: Math.round(r.minutes * 10) / 10 }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, n)
  return {
    minutes: Math.round(total),
    segments: segs.size,
    channels: rank(channels),
    topics: rank(topics),
    people: rank(people),
    orgs: rank(orgs),
    perDay: [...days.values()].map((d) => ({ date: d.name, minutes: Math.round(d.minutes) })).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** Fiches de diffusion selon les filtres de la page (période, type, chaîne, thème, recherche) */
export function broadcastPool(items, q, now = Date.now()) {
  const days = [1, 7, 30, 90].includes(Number(q.days)) ? Number(q.days) : 7
  const match = q.q ? compileQuery(String(q.q).slice(0, 500)) : null
  return items.filter(
    (it) =>
      it.media === 'broadcast' &&
      Date.parse(it.date) >= now - days * DAY &&
      (!q.sub || it.subType === q.sub) &&
      (!q.channel || it.origin === q.channel) &&
      (!q.category || it.category === q.category) &&
      (!q.flux || it.flux === q.flux) &&
      (!match || match(searchText(it))),
  )
}

/**
 * Extrait = une tranche enregistrée : ses passages, l'heure de début, les actualités qui en ont été tirées, et le lien
 * vers l'audio (quand la veille le fournit) ou vers le direct de la chaîne. group : fiches de la même tranche.
 */
export function clipOf(it, terms = [], group = [it]) {
  const start = segmentStart([...group].sort((a, b) => a.date.localeCompare(b.date))[0].date)
  const passages = passagesOf(it.transcription, start)
  const hits = new Set(matchPassages(passages, terms).map((p) => p.n))
  return {
    id: it.id,
    title: it.title,
    summary: it.summary,
    origin: it.origin,
    sub: it.subType || it.channel,
    category: it.category,
    tone: it.tone || '',
    date: it.date,
    start,
    people: it.people || [],
    // Audio de l'extrait : seulement si la veille le fournit un jour (champ clipUrl) ; sinon lien du direct
    clipUrl: it.clipUrl || '',
    liveUrl: /^https?:/.test(it.mediaUrl || '') ? it.mediaUrl : '',
    passages: passages.map((p) => ({ ...p, hit: hits.has(p.n) })),
    hits: hits.size,
    news: [...group]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({ id: x.id, title: x.title, category: x.category, tone: x.tone || '', date: x.date, people: x.people || [] })),
  }
}

/**
 * Extrait choisi dans une tranche (découpeur « بداية / نهاية ») : passages dont le décalage est entre start et end
 * (secondes depuis le début de la tranche), avec les heures estimées de début et de fin
 */
export function excerptOf(clip, start, end) {
  const a = Math.max(0, Math.min(Number(start) || 0, Number(end) || 0))
  const b = Math.max(Number(start) || 0, Number(end) || 0)
  const parts = clip.passages.filter((p) => p.offset >= a && p.offset <= b)
  if (!parts.length) return null
  const last = parts[parts.length - 1]
  const lastSeconds = Math.round((wordsOf(last.text).length / WORDS_PER_MINUTE) * 60)
  return {
    start: parts[0].offset,
    end: last.offset,
    from: parts[0].at,
    to: new Date(Date.parse(last.at) + lastSeconds * 1000).toISOString(),
    seconds: last.offset + lastSeconds - parts[0].offset,
    text: parts.map((p) => p.text).join(' '),
  }
}

/**
 * Chiffres de chaque chaîne pour le mur du direct (24 dernières heures) : actualités extraites (buzz), tranches
 * enregistrées, temps d'antenne estimé, portée de la chaîne et dernière tranche
 */
export function liveStats(items, now = Date.now()) {
  const pool = items.filter((it) => it.media === 'broadcast' && Date.parse(it.date) >= now - DAY && Date.parse(it.date) <= now)
  const air = new Map(airtime(pool).channels.map((c) => [c.name, c.minutes]))
  const rows = new Map()
  for (const it of pool) {
    let r = rows.get(it.origin)
    if (!r) rows.set(it.origin, (r = { name: it.origin, news: 0, segments: new Set(), minutes: 0, reach: reachOf(it), last: it.date }))
    r.news++
    r.segments.add(segKey(it))
    if (it.date > r.last) r.last = it.date
  }
  return [...rows.values()].map((r) => ({ ...r, segments: r.segments.size, minutes: air.get(r.name) ?? 0 })).sort((a, b) => b.news - a.news)
}

/** Fiches regroupées par tranche, dans l'ordre de la liste */
export function bySegment(items) {
  const groups = new Map()
  for (const it of items) {
    const k = segKey(it)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(it)
  }
  return [...groups.values()]
}

const memo = new Map()
export function mountBroadcast(app) {
  // Temps d'antenne estimé, mêmes filtres que la page
  app.get('/api/media/broadcast/airtime', (req, res) => {
    const cache = getItems()
    const key = `air|${cache.lastUpdate}|${JSON.stringify(req.query)}|${Math.floor(Date.now() / 60_000)}`
    if (!memo.has(key)) {
      if (memo.size > 100) memo.clear()
      memo.set(key, airtime(broadcastPool(cache.items, req.query)))
    }
    res.json(memo.get(key))
  })

  // Recherche dans les transcriptions : fiches et passages trouvés (avec l'heure estimée)
  app.get('/api/media/broadcast/search', (req, res) => {
    const found = broadcastPool(getItems().items, req.query).sort((a, b) => b.date.localeCompare(a.date))
    const segments = bySegment(found)
    const terms = highlightTerms(req.query.q)
    const size = Math.min(Math.max(Number(req.query.size) || 10, 1), 50)
    const pages = Math.max(Math.ceil(segments.length / size), 1)
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages)
    res.json({ total: segments.length, news: found.length, page, pages, terms, items: segments.slice((page - 1) * size, page * size).map((g) => clipOf(g[0], terms, g)) })
  })

  // Chiffres par chaîne pour le mur du direct
  app.get('/api/media/live/stats', (_req, res) => res.json({ channels: liveStats(getItems().items) }))

  // Un extrait (lien à partager entre utilisateurs connectés : /?clip=<id>&t=<secondes>[&e=<secondes>])
  app.get('/api/media/broadcast/clip/:id', (req, res) => {
    const it = getItems().byId.get(String(req.params.id))
    if (!it || it.media !== 'broadcast') return res.status(404).json({ error: 'NOT_FOUND' })
    const k = segKey(it)
    const t = Date.parse(it.date)
    const group = getItems().items.filter((x) => x.media === 'broadcast' && x.origin === it.origin && Math.abs(Date.parse(x.date) - t) < 3 * 3_600_000 && segKey(x) === k)
    res.json(clipOf(it, highlightTerms(req.query.q), group.length ? group : [it]))
  })
}
