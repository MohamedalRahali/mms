import { countryOf, reliabilityOf } from './sourceMeta.js'

/**
 * قاعدة الصحفيين ووسائل الإعلام (audit produit v4, constat 15, première version) : journalistes et médias libyens
 * avec l'historique de leurs publications et citations, calculés à la volée sur les fiches déjà chargées.
 *
 * - Journalistes : signatures des articles, billets de blog et messages de forum (champ `author`), hors comptes de
 *   réseaux sociaux et commentaires ; « libyen » quand la majorité de leurs textes vient d'un média libyen.
 * - Médias : sources (origin) des articles, TV, radios, blogs, podcasts, dont le pays est la Libye.
 * - Citations : fiches d'autres sources qui citent le nom (personnes repérées par la veille, ou nom du média dans le
 *   titre et le résumé).
 * Rien n'est stocké : la liste suit la veille. Les fiches sans auteur ne créent pas de journaliste.
 */

const SOCIAL = new Set(['x', 'twitter', 'bluesky', 'facebook', 'instagram', 'telegram', 'tiktok', 'reddit', 'mastodon', 'linkedin', 'threads'])
const PRESS_MEDIA = new Set(['article', 'blog', 'forum', 'podcast', 'broadcast'])
const DAY = 86_400_000

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()

const isPress = (it) => PRESS_MEDIA.has(it.media || 'article') && !SOCIAL.has(it.channel) && it.media !== 'comment'
const brief = (it) => ({ id: it.id, title: it.title, origin: it.origin, date: it.date, url: it.url, category: it.category })
const month = (iso) => String(iso).slice(0, 7)

let memo = { items: null, at: 0, data: null }

/** Index des journalistes et médias ; recalculé quand les fiches changent (au plus toutes les 5 minutes) */
export function directory(items, now = Date.now()) {
  if (memo.items === items && now - memo.at < 300_000) return memo.data
  const people = new Map()
  const media = new Map()
  for (const it of items) {
    if (!isPress(it)) continue
    const ly = countryOf(it) === 'LY'
    if (ly) {
      let m = media.get(it.origin)
      if (!m) media.set(it.origin, (m = { name: it.origin, kind: 'media', channels: new Set(), count: 0, first: it.date, last: it.date, authors: new Set(), reliability: reliabilityOf(it), byMonth: {} }))
      m.count++
      m.channels.add(it.channel)
      if (it.date < m.first) m.first = it.date
      if (it.date > m.last) m.last = it.date
      m.byMonth[month(it.date)] = (m.byMonth[month(it.date)] || 0) + 1
      if (it.author && it.author !== it.origin) m.authors.add(it.author)
    }
    const a = String(it.author || '').trim()
    if (!a || a === it.origin || a.length > 80 || /^(u\/|@)/.test(a)) continue
    let p = people.get(a)
    if (!p) people.set(a, (p = { name: a, kind: 'journalist', outlets: new Map(), count: 0, lyCount: 0, first: it.date, last: it.date, byMonth: {} }))
    p.count++
    if (ly) p.lyCount++
    p.outlets.set(it.origin, (p.outlets.get(it.origin) || 0) + 1)
    if (it.date < p.first) p.first = it.date
    if (it.date > p.last) p.last = it.date
    p.byMonth[month(it.date)] = (p.byMonth[month(it.date)] || 0) + 1
  }
  const data = {
    journalists: [...people.values()]
      .map((p) => ({ ...p, libyan: p.lyCount * 2 >= p.count, outlets: [...p.outlets.entries()].sort((x, y) => y[1] - x[1]).map(([name, count]) => ({ name, count })) }))
      .sort((x, y) => y.count - x.count),
    media: [...media.values()].map((m) => ({ ...m, channels: [...m.channels], authors: [...m.authors].slice(0, 50) })).sort((x, y) => y.count - x.count),
  }
  memo = { items, at: now, data }
  return data
}

/** Liste filtrée (type, recherche, libyens seulement), paginée */
export function directoryList(items, { kind = 'journalist', q = '', libyan = '1', page = 1, size = 30 } = {}) {
  const d = directory(items)
  const needle = norm(q).slice(0, 100)
  let list = kind === 'media' ? d.media : d.journalists
  if (kind !== 'media' && libyan === '1') list = list.filter((p) => p.libyan)
  if (needle) list = list.filter((x) => norm(x.name).includes(needle) || (x.outlets || []).some((o) => norm(o.name).includes(needle)))
  const n = Math.min(Math.max(Number(size) || 30, 5), 100)
  const pages = Math.max(Math.ceil(list.length / n), 1)
  const p = Math.min(Math.max(Number(page) || 1, 1), pages)
  return {
    total: list.length,
    page: p,
    pages,
    counts: { journalists: d.journalists.length, libyanJournalists: d.journalists.filter((x) => x.libyan).length, media: d.media.length },
    rows: list.slice((p - 1) * n, p * n).map(({ byMonth, lyCount, ...x }) => x),
  }
}

/**
 * Fiche d'un journaliste ou d'un média : publications (signées ou publiées), citations par d'autres sources,
 * répartition par mois (12 derniers mois).
 */
export function directoryEntry(items, kind, name, now = Date.now()) {
  const d = directory(items)
  const entry = (kind === 'media' ? d.media : d.journalists).find((x) => x.name === name)
  if (!entry) return null
  const key = norm(name)
  const own = []
  const cited = []
  for (const it of items) {
    if (it.media === 'comment') continue
    const mine = kind === 'media' ? it.origin === name && isPress(it) : String(it.author || '').trim() === name
    if (mine) {
      own.push(it)
      continue
    }
    // Citation : la personne repérée par la veille, ou le nom dans le titre ou le résumé (4 lettres au moins)
    if (key.length >= 4 && ((it.people || []).some((p) => norm(p) === key) || norm(`${it.title} ${it.summary}`).includes(key))) cited.push(it)
  }
  const byDate = (a, b) => b.date.localeCompare(a.date)
  own.sort(byDate)
  cited.sort(byDate)
  const months = []
  for (let k = 11; k >= 0; k--) {
    const dt = new Date(now - k * 30 * DAY)
    months.push(dt.toISOString().slice(0, 7))
  }
  const uniq = [...new Set(months)]
  const count = (list) => Object.fromEntries(uniq.map((m) => [m, list.filter((it) => month(it.date) === m).length]))
  const { byMonth, lyCount, ...rest } = entry
  return {
    ...rest,
    published: own.slice(0, 100).map(brief),
    publishedTotal: own.length,
    citations: cited.slice(0, 100).map(brief),
    citationsTotal: cited.length,
    citedBy: [...new Set(cited.map((it) => it.origin))].slice(0, 30),
    timeline: { months: uniq, published: count(own), cited: count(cited) },
  }
}

export function mountJournalists(app, { getItems }) {
  app.get('/api/journalists', (req, res) => res.json(directoryList(getItems().items, req.query)))
  app.get('/api/journalists/entry', (req, res) => {
    const kind = req.query.kind === 'media' ? 'media' : 'journalist'
    const e = directoryEntry(getItems().items, kind, String(req.query.name || '').slice(0, 200))
    if (!e) return res.status(404).json({ error: 'NOT_FOUND' })
    res.json(e)
  })
}
