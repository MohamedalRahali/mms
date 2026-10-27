import { getItems, reactionsOf } from './store.js'
import { countList } from './intel.js'
import { toDay } from './insights.js'
import { mountLive } from './live.js'

/**
 * Pages « الوسائط » : un tableau de bord par type de média (diffusion, podcasts, blogs, commentaires, forums).
 * GET /api/media/:type/overview?days=1|7|30&flux=&sub= renvoie les agrégats de la page ; la liste des fiches
 * reste servie par /api/news (media=…). Recalculé au plus une fois par minute pour chaque combinaison.
 */

const DAY = 86_400_000
const TYPES = new Set(['broadcast', 'podcast', 'blog', 'comment', 'forum', 'article', 'social'])
// Débit de parole moyen, pour estimer la durée transcrite à partir du nombre de mots
const WORDS_PER_MINUTE = 130

function counts(items, key, limit = 50) {
  const map = new Map()
  for (const it of items) if (it[key]) map.set(it[key], (map.get(it[key]) || 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

const words = (text) => (text ? text.split(/\s+/).filter(Boolean).length : 0)
const latestOf = (items) => items.reduce((max, it) => (it.date > max ? it.date : max), '')

const card = (it) => ({
  id: it.id,
  title: it.title,
  summary: (it.summary || '').slice(0, 400),
  origin: it.origin,
  url: it.url,
  date: it.date,
  tone: it.tone,
  lang: it.lang,
  subType: it.subType,
  author: it.author,
  mediaUrl: it.mediaUrl,
})

/** Nombre de fiches par jour sur `span` jours (aujourd'hui compris) */
function perDayOf(items, span, now) {
  const rows = []
  for (let i = span - 1; i >= 0; i--) rows.push({ date: toDay(new Date(now - i * DAY).toISOString()), count: 0 })
  const index = new Map(rows.map((d, i) => [d.date, i]))
  for (const it of items) {
    const i = index.get(toDay(it.date))
    if (i != null) rows[i].count++
  }
  return rows
}

function broadcastPart(found, inSpan, span, now) {
  const top = counts(found, 'origin', 6)
  return {
    subTypes: counts(found, 'subType'),
    channels: top.map((c) => {
      const mine = inSpan.filter((it) => it.origin === c.name)
      return { name: c.name, count: c.count, sub: mine[0]?.subType || '', last: latestOf(mine), perDay: perDayOf(mine, span, now).map((d) => d.count) }
    }),
  }
}

function podcastPart(all, found) {
  const shows = new Map()
  for (const it of all) {
    const s = shows.get(it.origin) || { name: it.origin, total: 0, count: 0, last: '', langs: new Map(), url: '' }
    s.total++
    if (it.date > s.last) {
      s.last = it.date
      s.url = it.url || s.url
    }
    s.langs.set(it.lang, (s.langs.get(it.lang) || 0) + 1)
    shows.set(it.origin, s)
  }
  for (const it of found) shows.get(it.origin).count++
  return {
    shows: [...shows.values()]
      .sort((a, b) => b.last.localeCompare(a.last))
      .slice(0, 40)
      .map((s) => ({ name: s.name, total: s.total, count: s.count, last: s.last, url: s.url, lang: [...s.langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '' })),
  }
}

function blogPart(found) {
  return { blogs: counts(found, 'origin', 15), authors: new Set(found.map((it) => it.author).filter(Boolean)).size }
}

function commentPart(found, byId) {
  const groups = new Map()
  for (const it of found) {
    if (!it.parentId) continue
    if (!groups.has(it.parentId)) groups.set(it.parentId, [])
    groups.get(it.parentId).push(it)
  }
  const parents = [...groups.keys()].map((id) => byId.get(id)).filter(Boolean)
  return {
    publications: groups.size,
    tonesComments: counts(found.filter((it) => it.tone), 'tone'),
    tonesParents: counts(parents.filter((it) => it.tone), 'tone'),
    top: [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([id, list]) => ({
        item: byId.get(id) ? card(byId.get(id)) : null,
        count: list.length,
        comments: list
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 30)
          .map((c) => ({ id: c.id, author: c.author || c.origin, text: c.summary || c.title, date: c.date, tone: c.tone, url: c.url })),
      }))
      .filter((g) => g.item),
  }
}

function forumPart(all, found) {
  const topics = new Map()
  for (const it of found) {
    const forum = it.thread?.forum || it.origin
    const topic = it.thread?.topic || it.title
    const key = `${forum}\u0000${topic}`
    const t = topics.get(key) || { forum, topic, url: it.thread?.topicUrl || '', count: 0, last: '' }
    t.count++
    if (it.date > t.last) t.last = it.date
    topics.set(key, t)
  }
  const list = [...topics.values()].sort((a, b) => b.count - a.count)
  const forums = new Map()
  for (const t of list) {
    const f = forums.get(t.forum) || { name: t.forum, count: 0, topics: [] }
    f.count += t.count
    if (f.topics.length < 8) f.topics.push(t)
    forums.set(t.forum, f)
  }
  // Fil complet des sujets les plus actifs : premier message (sans parent) et réponses en retrait
  const threads = list.slice(0, 5).map((t) => {
    const same = all.filter((it) => (it.thread?.forum || it.origin) === t.forum && (it.thread?.topic || it.title) === t.topic)
    const root = same.find((it) => !it.parent) || same[same.length - 1]
    return { ...t, root: root ? card(root) : null, replies: root ? reactionsOf(root).slice(0, 40) : [] }
  })
  return { topics: topics.size, forums: forums.size, activeTopics: list.filter((t) => t.count > 1).length, tree: [...forums.values()].sort((a, b) => b.count - a.count).slice(0, 12), threads }
}

const memo = new Map()

export function mountMedia(app) {
  mountLive(app)
  app.get('/api/media/:type/overview', (req, res) => {
    const type = String(req.params.type)
    if (!TYPES.has(type)) return res.status(404).json({ error: 'UNKNOWN_MEDIA' })
    const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7
    const flux = String(req.query.flux || '')
    const sub = type === 'broadcast' ? String(req.query.sub || '') : ''
    const cache = getItems()
    const key = `${type}|${days}|${flux}|${sub}`
    const minute = Math.floor(Date.now() / 60_000)
    const hit = memo.get(key)
    if (hit && hit.items === cache.items && hit.comments === cache.comments && hit.minute === minute) return res.json(hit.body)

    const now = Date.now()
    const pool = type === 'comment' ? cache.comments : cache.items
    const all = pool.filter((it) => it.media === type && (!flux || it.flux === flux) && (!sub || it.subType === sub))
    const found = all.filter((it) => Date.parse(it.date) >= now - days * DAY)
    // La courbe couvre au moins 7 jours, même quand la période choisie est de 24 h
    const span = Math.max(days, 7)
    const inSpan = all.filter((it) => Date.parse(it.date) >= now - span * DAY)
    const transcribed = found.filter((it) => it.transcription)

    const body = {
      type,
      days,
      total: found.length,
      allTime: all.length,
      last: latestOf(all),
      sourcesCount: new Set(found.map((it) => it.origin)).size,
      transcripts: transcribed.length,
      minutes: Math.round(transcribed.reduce((n, it) => n + words(it.transcription), 0) / WORDS_PER_MINUTE),
      perDay: perDayOf(inSpan, span, now),
      sources: counts(found, 'origin', 12),
      tones: counts(found.filter((it) => it.tone), 'tone'),
      langs: counts(found, 'lang'),
      people: countList(found, 'people', 10),
      orgs: countList(found, 'orgs', 10),
      places: countList(found, 'places', 10),
      ...(type === 'broadcast' ? broadcastPart(found, inSpan, span, now) : {}),
      ...(type === 'podcast' ? podcastPart(all, found) : {}),
      ...(type === 'blog' ? blogPart(found) : {}),
      ...(type === 'comment' ? commentPart(found, cache.byId) : {}),
      ...(type === 'forum' ? forumPart(all, found) : {}),
    }
    memo.set(key, { items: cache.items, comments: cache.comments, minute, body })
    res.json(body)
  })
}
