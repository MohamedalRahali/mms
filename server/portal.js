/**
 * Vitrine publique d'actualités (/portal) : API en lecture seule, sans connexion.
 *
 * Seules les fiches retenues par la diffusion (server/portalFeed.js : règles automatiques réglées dans MMS, épingles,
 * approbations une à une, exclusions) sont exposées, et seulement ces champs : titre, résumé (600 caractères au plus),
 * source, date, lien vers l'original, image, thème, langue, type de contenu, épinglée. Rien d'autre (tonalité, entités, transcriptions, réglages, comptes, statistiques internes) ne
 * sort par ici. Limite de débit par adresse IP, cache public court, pas d'indexation des pages de détail sans lien.
 */

import { portalSelection, portalSite, typeOf, TYPES } from './portalFeed.js'

const httpUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '')
const shortText = (s, n) => {
  const t = String(s || '').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/** Champs publics d'une fiche approuvée */
export function portalItem(it, pinned = false) {
  return {
    id: it.id,
    title: shortText(it.title, 300),
    summary: shortText(it.summary, 600),
    source: it.origin,
    date: it.date,
    url: httpUrl(it.url),
    image: httpUrl(it.image),
    category: it.category || '',
    lang: it.lang || 'ar',
    type: typeOf(it),
    pinned: Boolean(pinned),
  }
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

/**
 * Liste filtrée et paginée des fiches publiques (recherche, thème, source, langue, type, période).
 * Sans sélection fournie (tests, ancien appel), seules les fiches approuvées une à une sont publiques.
 */
export function portalNews(items, q = {}, selection = null) {
  const pub = selection ? selection.list : items.filter((it) => it.public === true)
  const pinned = selection?.pinned || new Set()
  const needle = norm(String(q.q || '').trim().slice(0, 200))
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? Date.parse(`${q.from}T00:00:00+02:00`) : 0
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? Date.parse(`${q.to}T23:59:59+02:00`) : Infinity
  const found = pub
    .filter(
      (it) =>
        (!q.category || it.category === q.category) &&
        (!q.source || it.origin === q.source) &&
        (!q.lang || it.lang === q.lang) &&
        (!q.type || typeOf(it) === q.type) &&
        Date.parse(it.date) >= from &&
        Date.parse(it.date) <= to &&
        (!needle || norm(`${it.title} ${it.summary} ${it.origin}`).includes(needle)),
    )
    .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || b.date.localeCompare(a.date))
  const size = Math.min(Math.max(Number(q.size) || 12, 1), 48)
  const pages = Math.max(Math.ceil(found.length / size), 1)
  const page = Math.min(Math.max(Number(q.page) || 1, 1), pages)
  const count = (key) => {
    const m = new Map()
    for (const it of pub) {
      const v = typeof key === 'function' ? key(it) : it[key]
      if (v) m.set(v, (m.get(v) || 0) + 1)
    }
    return [...m.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count)
  }
  return {
    total: found.length,
    page,
    pages,
    items: found.slice((page - 1) * size, page * size).map((it) => portalItem(it, pinned.has(it.id))),
    facets: {
      categories: count('category'),
      sources: count('origin').slice(0, 40),
      langs: count('lang'),
      types: count(typeOf).sort((a, b) => TYPES.indexOf(a.name) - TYPES.indexOf(b.name)),
    },
  }
}

export function mountPortal(app, { getItems, publicLimit }) {
  const headers = (res) => {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
  app.get('/api/portal/news', publicLimit, (req, res) => {
    headers(res)
    const { items } = getItems()
    res.json({ ...portalNews(items, req.query, portalSelection(items)), site: portalSite() })
  })
  app.get('/api/portal/news/:id', publicLimit, (req, res) => {
    const { items, byId } = getItems()
    const it = byId.get(String(req.params.id))
    const sel = portalSelection(items)
    // Une fiche non diffusée est introuvable ici, qu'elle existe ou non
    if (!it || !sel.ids.has(it.id)) return res.status(404).json({ error: 'NOT_FOUND' })
    headers(res)
    res.json({ item: portalItem(it, sel.pinned.has(it.id)) })
  })
}
