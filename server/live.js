import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Mur du direct (page « البث المباشر ») : GET /api/media/live
 * Pour chaque chaîne de la veille (libye-diffusion-etat.json + réglages de libye-diffusion.json), la façon de la lire
 * dans le navigateur :
 *   hls      flux officiel .m3u8 lisible sans Referer (hls.js côté navigateur)
 *   audio    flux audio direct (radios)
 *   youtube  direct YouTube officiel de la chaîne (embed youtube-nocookie) : la page publique « /live » de la chaîne
 *            dit si un direct est en cours (lien canonique watch?v=… et isLiveNow) ; vérifié au plus toutes les 5 min
 *   none     aucune source lisible ici (flux réservé au lecteur du site de la chaîne, ou pas d'adresse)
 * On ne relaie ni ne modifie jamais un flux : pas de proxy, pas de Referer imité.
 */

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

// Chaînes et radios montrées sur le mur du direct seulement (ni enregistrées ni transcrites, donc sans coût).
// Adresses vérifiées le 27/10/2026 depuis les annuaires envoyés par Around : flux HLS avec CORS, flux audio en https,
// ou chaîne YouTube officielle. Une chaîne de la veille avec le même id garde ses propres réglages.
const LIVE_ONLY = [
  { id: 'tanasuh-tv', nom: 'قناة التناصح', canal: 'tv', flux: 'https://kilolink.pulsarstarsolutions.com/live/smil:tanasuhtv.smil/manifest.m3u8' },
  { id: 'lebda-tv', nom: 'قناة لبدة', canal: 'tv', youtube: 'https://www.youtube.com/channel/UC8-s6p-YBOfjJxtiRBfIRLA' },
  { id: 'libyas-channel-tv', nom: "Libya's Channel — قناة ليبيا", canal: 'tv', youtube: 'https://www.youtube.com/channel/UCK1zw5mQHT2VwJQdLUpQfWQ' },
  { id: 'mostakbal-tv', nom: 'قناة ليبيا المستقبل', canal: 'tv', youtube: 'https://www.youtube.com/channel/UCB8semSzrUhNJic_jlMXGCg' },
  { id: 'hala-sabratha-radio', nom: 'راديو هلا صبراتة', canal: 'radio', flux: 'https://stream.zeno.fm/1dy2395z3k8uv' },
  { id: 'nour-aleman-radio', nom: 'إذاعة نور الإيمان 105.7', canal: 'radio', flux: 'https://stream.zeno.fm/r6eprdta6nhvv' },
  { id: 'arts-tripoli-radio', nom: 'راديو فنون طرابلس', canal: 'radio', flux: 'https://stream.zeno.fm/z9wfrdpmgg0uv' },
  { id: 'almunir-benghazi-radio', nom: 'إذاعة المنير — بنغازي', canal: 'radio', flux: 'https://live.munir.ly/proxy/almunir/stream' },
  { id: 'almunir-tripoli-radio', nom: 'إذاعة المنير — طرابلس', canal: 'radio', flux: 'https://live.munir.ly/proxy/almunirtip/stream' },
]
const YT_TTL = 5 * 60_000
const ytCache = new Map()

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** Page « /live » d'une chaîne YouTube à partir de l'adresse enregistrée (@handle, /channel/UC…, watch?v=…) */
function livePage(url) {
  try {
    const u = new URL(url)
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null
    const handle = u.pathname.match(/^\/(@[\w.-]+)/)?.[1]
    const channel = u.pathname.match(/^\/channel\/(UC[\w-]{22})/)?.[1]
    if (handle) return `https://www.youtube.com/${handle}/live`
    if (channel) return `https://www.youtube.com/channel/${channel}/live`
  } catch {}
  return null
}

/** { live, videoId, channelId } d'une chaîne YouTube ; live null si la page n'a pas pu être lue */
async function youtubeState(url) {
  const page = livePage(url)
  if (!page) return { live: null, videoId: '', channelId: '' }
  const hit = ytCache.get(page)
  if (hit && Date.now() - hit.at < YT_TTL) return hit.state
  let state = { live: null, videoId: '', channelId: '' }
  try {
    const res = await fetch(page, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ar,en;q=0.8' }, signal: AbortSignal.timeout(8000) })
    if (res.ok && !/consent\./.test(res.url)) {
      const html = (await res.text()).slice(0, 1_500_000)
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || ''
      const videoId = canonical.match(/[?&]v=([\w-]{11})/)?.[1] || ''
      const channelId = html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/)?.[1] || canonical.match(/\/channel\/(UC[\w-]{22})/)?.[1] || ''
      // En direct : lien canonique vers la vidéo + isLiveNow. Hors direct : lien canonique vers la chaîne.
      // Autre page (contrôle anti-robot…) : on ne sait pas, et le navigateur laisse YouTube décider (embed live_stream)
      const live = videoId && /"isLiveNow":true/.test(html) ? true : /\/channel\/UC/.test(canonical) ? false : null
      state = { live, videoId: live ? videoId : '', channelId }
    }
  } catch {}
  ytCache.set(page, { at: Date.now(), state })
  return state
}

/**
 * Chaînes de la veille (état + réglages faits dans MMS) et chaînes du mur seulement (liveOnly), avec leurs adresses :
 * utilisé par le mur du direct et par les enregistrements à la demande
 */
export function liveSources() {
  const status = readJson(path.join(dataDir, 'libye-diffusion-etat.json'), { chaines: [] })
  const pending = new Map((readJson(path.join(dataDir, 'libye-diffusion.json'), { sources: [] }).sources || []).map((s) => [s.id, s]))
  const list = (status.chaines || []).map((c) => ({ ...c, ...(pending.get(c.id) || {}) }))
  for (const s of pending.values()) if (s.ajout && !list.some((c) => c.id === s.id)) list.push(s)
  // Une chaîne déjà enregistrée par la veille (même identifiant ou même flux) n'apparaît pas une seconde fois
  for (const s of LIVE_ONLY) if (!list.some((c) => c.id === s.id || (s.flux && c.flux === s.flux))) list.push({ ...s, ...(pending.get(s.id) || {}), liveOnly: true })
  return list.filter((c) => c.actif !== false)
}

const DAY = 86_400_000

/** État d'enregistrement d'une chaîne d'après la veille : motif de l'échec ramené à une catégorie (jamais le message brut) */
export function captureState(c, now = Date.now()) {
  if (c.liveOnly) return 'liveOnly'
  if (c.actif === false) return 'disabled'
  const err = String(c.erreur || '')
  if (/confirm you.?re not a bot|cookies/i.test(err)) return 'blocked'
  if (/not currently live|does not have a streams tab|is not live/i.test(err)) return 'offline'
  if (/introuvable|not found|404/i.test(err)) return 'nosource'
  if (err) return 'error'
  const last = Date.parse(c.dernier_succes || c.dernier_enregistrement || '')
  if (!last) return 'never'
  return now - last <= 1.5 * DAY ? 'ok' : 'stale'
}

/**
 * Chaînes enregistrées par la veille (actives ou non) et chaînes du mur seulement, avec leur état :
 * en-tête « حالة القنوات » de la page Broadcasts (tv, radio)
 */
export function captureChannels(now = Date.now()) {
  const status = readJson(path.join(dataDir, 'libye-diffusion-etat.json'), { chaines: [] })
  const pending = new Map((readJson(path.join(dataDir, 'libye-diffusion.json'), { sources: [] }).sources || []).map((s) => [s.id, s]))
  const list = (status.chaines || []).map((c) => ({ ...c, ...(pending.get(c.id) || {}) }))
  for (const s of LIVE_ONLY) if (!list.some((c) => c.id === s.id)) list.push({ ...s, ...(pending.get(s.id) || {}), liveOnly: true })
  return list.map((c) => ({
    id: c.id,
    name: c.nom || c.id,
    sub: c.canal === 'radio' ? 'radio' : 'tv',
    state: captureState(c, now),
    last: c.dernier_enregistrement || c.dernier_succes || '',
    via: c.flux ? 'stream' : c.youtube ? 'youtube' : '',
    // Production réelle écrite par la veille (audit v5) : extraits sur 24 h, état et cause sans extrait
    ...(typeof c.extraits_24h === 'number' ? { extracts24: c.extraits_24h, extracts7: c.extraits_7j ?? null, production: c.etat_production || '' } : {}),
  }))
}

export function mountLive(app) {
  app.get('/api/media/live', async (_req, res) => {
    const list = liveSources()

    const channels = await Promise.all(
      list
        .map(async (c) => {
          const base = { id: c.id, nom: c.nom || c.id, canal: c.canal === 'radio' ? 'radio' : 'tv', last: c.dernier_enregistrement || c.dernier_succes || null, slots: Array.isArray(c.creneaux) ? c.creneaux.map(String).slice(0, 12) : [] }
          const direct = c.flux && !c.referer
          if (direct && (/\.m3u8(\?|$)/i.test(c.flux) || c.canal === 'tv')) return { ...base, mode: 'hls', src: c.flux }
          if (direct) return { ...base, mode: 'audio', src: c.flux }
          // Flux officiel réservé au lecteur du site de la chaîne : on renvoie vers ce site
          const site = c.flux && c.referer ? c.referer : undefined
          if (c.youtube) {
            const yt = await youtubeState(c.youtube)
            return { ...base, mode: 'youtube', src: c.youtube, site, ...yt }
          }
          return { ...base, mode: 'none', site, reason: c.referer ? 'referer' : 'nosource' }
        }),
    )
    res.json({ channels })
  })
}
