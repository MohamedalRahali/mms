import { getItems } from './store.js'
import { countryOf, reachIsSet, reachOf } from './sourceMeta.js'

/**
 * مجمع البحث (équivalent du « SearchPool ») : catalogue des sources que MMS reçoit, pour tous les profils qui ont
 * les actualités. Type (canal, média), pays, langues, portée, activité récente. Seules les sources visibles sur la
 * plateforme sont listées (celles coupées par le Super Admin n'apparaissent pas) ; leur réglage reste dans la console.
 */

const DAY = 86_400_000

export function sourceCatalog(items, now = Date.now()) {
  const map = new Map()
  for (const it of items) {
    let s = map.get(it.origin)
    if (!s) {
      map.set(
        it.origin,
        (s = { name: it.origin, channels: new Map(), media: new Map(), langs: new Map(), total: 0, week: 0, day: 0, last: '', country: countryOf(it), reach: reachOf(it), reachSet: reachIsSet(it.origin), url: '' }),
      )
    }
    const t = Date.parse(it.date)
    s.total++
    if (t >= now - 7 * DAY) s.week++
    if (t >= now - DAY) s.day++
    if (it.date > s.last) s.last = it.date
    s.channels.set(it.channel, (s.channels.get(it.channel) || 0) + 1)
    s.media.set(it.media || 'article', (s.media.get(it.media || 'article') || 0) + 1)
    if (it.lang) s.langs.set(it.lang, (s.langs.get(it.lang) || 0) + 1)
    if (!s.url && it.url) {
      try {
        s.url = new URL(it.url).origin
      } catch {
        /* adresse invalide */
      }
    }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const sources = [...map.values()]
    .map((s) => {
      const channels = top(s.channels)
      const media = top(s.media)
      // État : actif (publication cette semaine), calme (ce mois), inactif (rien depuis 30 jours)
      const age = s.last ? now - Date.parse(s.last) : Infinity
      return {
        name: s.name,
        channel: channels[0] || '',
        channels: channels.slice(0, 4),
        media: media[0] || 'article',
        langs: top(s.langs).slice(0, 3),
        country: s.country,
        reach: s.reach,
        reachSet: s.reachSet,
        url: s.url,
        total: s.total,
        week: s.week,
        day: s.day,
        last: s.last || null,
        status: age <= 7 * DAY ? 'active' : age <= 30 * DAY ? 'quiet' : 'idle',
      }
    })
    .sort((a, b) => b.week - a.week || b.total - a.total)
  const count = (key) => {
    const m = new Map()
    for (const s of sources) m.set(s[key], (m.get(s[key]) || 0) + 1)
    return [...m.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count)
  }
  return {
    total: sources.length,
    active: sources.filter((s) => s.status === 'active').length,
    byMedia: count('media'),
    byChannel: count('channel'),
    byCountry: count('country').filter((c) => c.name),
    sources,
  }
}

let memo = { items: null, minute: -1, body: null }
export function mountCatalog(app) {
  app.get('/api/sources/catalog', (_req, res) => {
    const { items } = getItems()
    const minute = Math.floor(Date.now() / 60_000)
    if (memo.items !== items || memo.minute !== minute) memo = { items, minute, body: sourceCatalog(items) }
    res.json(memo.body)
  })
}
