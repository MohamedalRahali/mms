/**
 * Vitrine publique d'actualités (/portal) : API en lecture seule, sans connexion.
 *
 * Seules les fiches approuvées explicitement pour le public (server/itemEdits.js, droit « publish_public ») sont
 * exposées, et seulement ces champs : titre, résumé (600 caractères au plus), source, date, lien vers l'original,
 * image, thème, langue. Rien d'autre (tonalité, entités, transcriptions, réglages, comptes, statistiques internes) ne
 * sort par ici. Limite de débit par adresse IP, cache public court, pas d'indexation des pages de détail sans lien.
 */

const httpUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '')
const shortText = (s, n) => {
  const t = String(s || '').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/** Champs publics d'une fiche approuvée */
export function portalItem(it) {
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
  }
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

/** Liste filtrée et paginée des fiches publiques (recherche, thème, source, langue, période) */
export function portalNews(items, q = {}) {
  const pub = items.filter((it) => it.public === true)
  const needle = norm(String(q.q || '').trim().slice(0, 200))
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? Date.parse(`${q.from}T00:00:00+02:00`) : 0
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? Date.parse(`${q.to}T23:59:59+02:00`) : Infinity
  const found = pub
    .filter(
      (it) =>
        (!q.category || it.category === q.category) &&
        (!q.source || it.origin === q.source) &&
        (!q.lang || it.lang === q.lang) &&
        Date.parse(it.date) >= from &&
        Date.parse(it.date) <= to &&
        (!needle || norm(`${it.title} ${it.summary} ${it.origin}`).includes(needle)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  const size = Math.min(Math.max(Number(q.size) || 12, 1), 48)
  const pages = Math.max(Math.ceil(found.length / size), 1)
  const page = Math.min(Math.max(Number(q.page) || 1, 1), pages)
  const count = (key) => {
    const m = new Map()
    for (const it of pub) if (it[key]) m.set(it[key], (m.get(it[key]) || 0) + 1)
    return [...m.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count)
  }
  return {
    total: found.length,
    page,
    pages,
    items: found.slice((page - 1) * size, page * size).map(portalItem),
    facets: { categories: count('category'), sources: count('origin').slice(0, 40), langs: count('lang') },
  }
}

export function mountPortal(app, { getItems, publicLimit }) {
  const headers = (res) => {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
  app.get('/api/portal/news', publicLimit, (req, res) => {
    headers(res)
    res.json(portalNews(getItems().items, req.query))
  })
  app.get('/api/portal/news/:id', publicLimit, (req, res) => {
    const it = getItems().byId.get(String(req.params.id))
    // Une fiche non approuvée est introuvable ici, qu'elle existe ou non
    if (!it || it.public !== true) return res.status(404).json({ error: 'NOT_FOUND' })
    headers(res)
    res.json({ item: portalItem(it) })
  })
}
