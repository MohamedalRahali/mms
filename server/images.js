import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import net from 'node:net'
import { normalize } from './watches.js'

/**
 * Photos des actualités, comme les cartes NewsRadar :
 * - image fournie par la veille (champ image) ;
 * - sinon l'image de partage de l'article (og:image, twitter:image…) lue sur sa page ;
 * - pour la radio (pas de lien), l'article du site Mosaïque FM dont le titre correspond.
 * Les pages sont lues en arrière-plan et le résultat est gardé dans data/images.json.
 * Le navigateur passe par /api/img/<clé> : seules les images trouvées ici sont servies.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 MMS-Radar'
const PAGE_TTL = 7 * 86_400_000 // image trouvée : gardée 7 jours
const MISS_TTL = 12 * 3_600_000 // page sans image ou injoignable : nouvel essai après 12 h
const SITE_TTL = 15 * 60_000 // titres du site Mosaïque FM relus toutes les 15 min
const MAX_PAGE = 1_500_000
const MAX_IMG = 8_000_000
const PARALLEL = 3

let cacheFile = ''
let pages = {} // url de l'article → { image, at }
const known = new Map() // clé → url de l'image
const queue = []
const queued = new Map() // url → promesse résolue quand la page a été lue
let running = 0
let saveTimer = null
let site = { at: 0, loading: null, links: [] } // [{ url, words: Set }]

const SITE_PAGES = () =>
  (process.env.MOSAIQUE_SITE || 'https://www.mosaiquefm.net/ar,https://www.mosaiquefm.net/fr')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export function initImages(dataDir) {
  cacheFile = path.join(dataDir, 'images.json')
  try {
    pages = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {}
  } catch {
    pages = {}
  }
  for (const hit of Object.values(pages)) if (hit?.image) known.set(keyOf(hit.image), hit.image)
}

function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(pages))
    } catch {
      /* dossier data/ en lecture seule : le cache reste en mémoire */
    }
  }, 2000)
}

/** Refuse ce qui n'est pas une adresse web publique (localhost, réseau interne) */
function publicUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || (!host.includes('.') && !net.isIP(host))) return null
  if (net.isIP(host)) {
    if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return null
  }
  return u
}

const keyOf = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)

/** Adresse servie au navigateur pour une image trouvée */
function proxied(image) {
  const key = keyOf(image)
  known.set(key, image)
  return `/api/img/${key}`
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (res.url && !publicUrl(res.url)) throw new Error('redirection refusée')
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (size < MAX_PAGE) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  reader.cancel().catch(() => {})
  return { html: Buffer.concat(chunks).toString('utf8'), base: res.url || url }
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '').trim() : ''
}

/** Image principale d'une page d'article */
export function pickImage(html, base) {
  const metas = html.match(/<meta\b[^>]*>/gi) || []
  const wanted = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'thumbnailurl']
  for (const name of wanted) {
    for (const tag of metas) {
      const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase()
      const content = attr(tag, 'content')
      if (key === name && content) return absolute(content, base)
    }
  }
  const link = (html.match(/<link\b[^>]*>/gi) || []).find((t) => attr(t, 'rel').toLowerCase() === 'image_src')
  if (link && attr(link, 'href')) return absolute(attr(link, 'href'), base)
  // À défaut, la première grande image de l'article
  const scope = /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] || html
  for (const tag of scope.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, 'data-src') || attr(tag, 'src')
    if (!src || src.startsWith('data:') || /logo|icon|avatar|sprite|pixel|blank/i.test(src)) continue
    const w = Number(attr(tag, 'width'))
    if (w && w < 200) continue
    return absolute(src, base)
  }
  return ''
}

function absolute(src, base) {
  try {
    const u = publicUrl(new URL(src, base).href)
    return u ? u.href : ''
  } catch {
    return ''
  }
}

function enqueue(url) {
  if (queued.has(url)) return queued.get(url).done
  let resolve
  const done = new Promise((r) => (resolve = r))
  queued.set(url, { done, resolve })
  queue.push(url)
  pump()
  return done
}

function pump() {
  while (running < PARALLEL && queue.length) {
    const url = queue.shift()
    running++
    fetchText(url)
      .then(({ html, base }) => {
        pages[url] = { image: pickImage(html, base), at: Date.now() }
      })
      .catch(() => {
        pages[url] = { image: '', at: Date.now() }
      })
      .finally(() => {
        queued.get(url)?.resolve()
        queued.delete(url)
        running--
        save()
        pump()
      })
  }
}

/** Image connue d'un article, ou lecture de sa page lancée en arrière-plan */
function imageOfPage(url) {
  const u = publicUrl(url)
  if (!u) return ''
  const hit = pages[u.href]
  const fresh = hit && Date.now() - hit.at < (hit.image ? PAGE_TTL : MISS_TTL)
  if (!fresh) enqueue(u.href)
  return hit?.image || ''
}

const STOP = new Set([
  'في',
  'من',
  'على',
  'الى',
  'الي',
  'عن',
  'مع',
  'بعد',
  'قبل',
  'خلال',
  'حول',
  'le',
  'la',
  'les',
  'de',
  'des',
  'du',
  'un',
  'une',
  'et',
  'en',
  'au',
  'aux',
  'pour',
  'sur',
  'par',
  'dans',
  'avec',
])
function words(text) {
  return new Set(
    normalize(text)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(' ')
      .map((w) => w.replace(/^(وال|بال|لل|ال|و)(?=\S{3,})/, ''))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/** Titres et liens des articles en une du site Mosaïque FM */
function refreshSite() {
  if (Date.now() - site.at < SITE_TTL) return Promise.resolve()
  if (!site.loading) site.loading = loadSite()
  return site.loading
}

async function loadSite() {
  const links = []
  for (const pageUrl of SITE_PAGES()) {
    try {
      const { html, base } = await fetchText(pageUrl)
      const origin = new URL(base).host
      for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = absolute(attr(m[1], 'href'), base)
        if (!href || new URL(href).host !== origin) continue
        const text = decode((attr(m[1], 'title') || m[2]).replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim()
        if (text.length < 20) continue
        const w = words(text)
        if (w.size >= 3) links.push({ url: href, words: w })
      }
    } catch {
      /* site injoignable : on réessaiera au prochain passage */
    }
  }
  site = { at: Date.now(), loading: null, links: links.length ? links : site.links }
}

/** Article du site dont le titre recouvre le mieux celui de la radio (au moins 60 % des mots) */
function matchSite(title) {
  const w = words(title)
  if (w.size < 3) return ''
  let best = ''
  let score = 0
  for (const link of site.links) {
    let common = 0
    for (const x of w) if (link.words.has(x)) common++
    const s = common / Math.min(w.size, link.words.size)
    if (s > score) {
      score = s
      best = link.url
    }
  }
  return score >= 0.6 ? best : ''
}

const WAIT_MS = 2500 // attente maximale des pages encore inconnues avant de répondre

/** Ajoute à chaque actualité de la page son image (adresse /api/img/…) et, pour la radio, le lien de l'article */
export async function withImages(items) {
  const deadline = new Promise((r) => setTimeout(r, WAIT_MS))
  const real = items.filter((it) => !it.demo)
  if (real.some((it) => it.flux === 'mosaique' && !it.url)) await Promise.race([refreshSite(), deadline])
  const links = new Map(real.map((it) => [it.id, it.url || (it.flux === 'mosaique' ? matchSite(it.title) : '')]))
  // Lance la lecture des pages encore inconnues et attend un peu leur résultat
  const waits = []
  for (const it of real) {
    const url = links.get(it.id)
    if (it.image || !url) continue
    imageOfPage(url)
    const pending = queued.get(publicUrl(url)?.href)
    if (pending) waits.push(pending.done)
  }
  if (waits.length) await Promise.race([Promise.all(waits), deadline])
  return items.map((it) => {
    if (it.demo) return it
    const url = links.get(it.id)
    const raw = (it.image && publicUrl(it.image)?.href) || (url ? imageOfPage(url) : '')
    return { ...it, url: url || '', image: raw ? proxied(raw) : '' }
  })
}

/** GET /api/img/:key : relaie l'image (le site d'origine ne voit pas le navigateur) */
export async function imageRoute(req, res) {
  const url = known.get(String(req.params.key))
  if (!url || !publicUrl(url)) return res.status(404).end()
  try {
    const up = await fetch(url, { headers: { 'user-agent': UA, accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    const type = up.headers.get('content-type') || ''
    if (up.url && !publicUrl(up.url)) return res.status(404).end()
    if (!up.ok || !type.startsWith('image/') || type.includes('svg')) return res.status(404).end()
    const buf = Buffer.from(await up.arrayBuffer())
    if (buf.length > MAX_IMG) return res.status(404).end()
    res.set({ 'content-type': type, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' })
    res.end(buf)
  } catch {
    res.status(404).end()
  }
}
