import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { normalize } from './watches.js'
import { stem } from './radar.js'
import { passagesOf } from './broadcast.js'
import { LIMITS, TERMINAL, addRecording, passagesOfTranscript, readAll, recordableChannels, savedPart, stateOf, statusFile, transcriptOf, tripoliDay, writeAll } from './recordings.js'

/**
 * الرصد المبرمج (veilles programmées sur les enregistrements) : un sujet (mots-clés, synonymes), des chaînes, des jours
 * et des plages horaires (heure de Tripoli), une période de validité. Chaque minute, les plages des prochaines 26 heures
 * deviennent des enregistrements à la demande ordinaires (même circuit : enregistrement du direct, transcription,
 * suppression de l'audio), dans la limite de la part quotidienne du budget. Après chaque transcription, les passages
 * qui parlent du sujet sont repérés (« hits ») et peuvent déclencher une alerte Telegram.
 *
 * Recherche intelligente : dans les transcriptions des enregistrements et dans celles des créneaux fixes du soir,
 * avec filtres (veille, chaîne, dates, statut), comparaison arabe tolérante (alif, ya, ta marbuta, diacritiques,
 * préfixes et suffixes) et synonymes de la veille choisie.
 *
 *   data/libye-rasd.json        veilles et journal des plages non créées (raison lisible)
 *   data/libye-rasd-hits.json   passages repérés par enregistrement terminé
 */

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const FILE = () => path.join(dataDir, 'libye-rasd.json')
const HITS = () => path.join(dataDir, 'libye-rasd-hits.json')
const MIN = 60_000
const DAY = 86_400_000
const HORIZON = 26 * 3_600_000
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/
export const RASD_LIMITS = { maxWatches: 50, maxKeywords: 30, maxChannels: 10, maxWindows: 6, maxWindowMinutes: 240 }

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1))
  fs.renameSync(tmp, file)
}
const fail = (code, status = 400, extra = {}) => Object.assign(new Error(code), { code, status, extra })

const load = () => {
  const d = readJson(FILE(), {})
  return { watches: Array.isArray(d.watches) ? d.watches : [], log: Array.isArray(d.log) ? d.log : [] }
}
const save = (d) => writeJson(FILE(), { maj: new Date().toISOString(), watches: d.watches, log: d.log.slice(-300) })

// ------------------------------------------------------------------ comparaison arabe tolérante

// Conjonction collée devant un article ou une préposition (« وبالنفط », « فللحكومة ») : retirée avant la racine
const root = (w) => stem(w.replace(/^[وف](?=(?:ال|بال|لل|كال)\p{L}{2})/u, ''))

/** Formes d'un mot ou d'une expression : normalisée et racine légère (« وبالنفط » ≈ « النفط » ≈ « نفط ») */
export function termKey(term) {
  return normalize(term)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(root)
    .join(' ')
}

/** Racines des mots d'un texte, dans l'ordre (pour reconnaître aussi les expressions de plusieurs mots) */
function stemsOf(text) {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(root)
}

/** Termes du texte trouvés parmi `terms` (chacun : forme saisie + clé) */
export function matchTerms(text, terms) {
  const s = stemsOf(text)
  const joined = ` ${s.join(' ')} `
  return terms.filter((t) => t.key && joined.includes(` ${t.key} `))
}

/** Termes d'une veille : mots-clés et synonymes (une ligne ou une virgule = un terme) */
const splitTerms = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/[\n,،;]+/))
    .map((x) => String(x).trim())
    .filter(Boolean)
const termsOf = (list) => {
  const out = []
  for (const w of list) {
    const key = termKey(w)
    if (key && !out.some((t) => t.key === key)) out.push({ w, key })
  }
  return out
}
export const watchTerms = (w) => termsOf([...(w.keywords || []), ...(w.synonyms || [])])

// ------------------------------------------------------------------ veilles

const tripoliAt = (day, hm) => Date.parse(`${day}T${hm}:00+02:00`)
const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay()
const windowMinutes = (w) => {
  const [a, b] = w.split('-')
  let m = (tripoliAt('2026-01-01', b) - tripoliAt('2026-01-01', a)) / MIN
  if (m <= 0) m += 1440
  return m
}

/** Vérifie et nettoie une veille ; channels : chaînes enregistrables */
export function cleanWatch(body, channels, { now = Date.now(), existing = null } = {}) {
  const name = String(body?.name || '').trim().slice(0, 100)
  if (!name) throw fail('NO_NAME')
  const keywords = splitTerms(body.keywords).slice(0, RASD_LIMITS.maxKeywords).map((x) => x.slice(0, 80))
  const synonyms = splitTerms(body.synonyms).slice(0, RASD_LIMITS.maxKeywords).map((x) => x.slice(0, 80))
  if (!keywords.length) throw fail('NO_KEYWORDS')
  const ids = [...new Set((Array.isArray(body.channels) ? body.channels : []).map(String))]
  if (!ids.length) throw fail('NO_CHANNELS')
  if (ids.length > RASD_LIMITS.maxChannels) throw fail('TOO_MANY_CHANNELS', 400, { max: RASD_LIMITS.maxChannels })
  for (const id of ids) {
    const ch = channels.find((c) => c.id === id)
    if (!ch) throw fail('NO_CHANNEL', 404, { channel: id })
    if (!ch.recordable) throw fail('NOT_RECORDABLE', 400, { channel: id })
  }
  const days = [...new Set((Array.isArray(body.days) ? body.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  if (!days.length) throw fail('NO_DAYS')
  const windows = [...new Set((Array.isArray(body.windows) ? body.windows : []).map((w) => String(w).trim()))]
  if (!windows.length) throw fail('NO_WINDOWS')
  if (windows.length > RASD_LIMITS.maxWindows) throw fail('TOO_MANY_WINDOWS', 400, { max: RASD_LIMITS.maxWindows })
  for (const w of windows) {
    if (!SLOT_RE.test(w)) throw fail('BAD_WINDOW', 400, { window: w })
    const m = windowMinutes(w)
    if (m < LIMITS.minMinutes) throw fail('TOO_SHORT', 400, { window: w })
    if (m > RASD_LIMITS.maxWindowMinutes) throw fail('TOO_LONG', 400, { window: w, max: RASD_LIMITS.maxWindowMinutes })
  }
  // Plages qui se chevauchent dans la même veille (mêmes chaînes) : refus, pour ne pas payer deux fois
  const spans = windows.map((w) => {
    const [a] = w.split('-')
    const s = tripoliAt('2026-01-01', a)
    return [s, s + windowMinutes(w) * MIN, w]
  })
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length; j++)
      for (const shift of [-DAY, 0, DAY])
        if (spans[i][0] < spans[j][1] + shift && spans[j][0] + shift < spans[i][1]) throw fail('OVERLAP', 400, { windows: [spans[i][2], spans[j][2]] })
  const today = tripoliDay(now)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from || '') ? body.from : today
  const to = /^\d{4}-\d{2}-\d{2}$/.test(body.to || '') ? body.to : ''
  if (to && to < today) throw fail('PAST', 400)
  if (to && to < from) throw fail('BAD_RANGE')
  if (from > tripoliDay(now + 365 * DAY)) throw fail('TOO_FAR', 400, { days: 365 })
  return {
    id: existing?.id || crypto.randomBytes(6).toString('hex'),
    name,
    keywords,
    synonyms,
    channels: ids,
    days,
    windows,
    from: existing && from < today ? existing.from : from < today ? today : from,
    to,
    alert: body.alert === true,
    paused: existing ? Boolean(existing.paused) : false,
    createdBy: existing?.createdBy || '',
    createdAt: existing?.createdAt || new Date(now).toISOString(),
  }
}

/** Minutes enregistrées par jour de la semaine (0 = dimanche) pour une veille */
export function minutesPerWeekday(w) {
  const per = w.windows.reduce((n, x) => n + windowMinutes(x), 0) * w.channels.length
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, w.days.includes(d) ? per : 0]))
}

/**
 * Coût quotidien estimé (pire jour de la semaine) de la veille et de toutes les veilles actives, comparé à la part
 * quotidienne des demandes. Refus au-delà de la part ; avertissement au-delà de 80 %.
 */
export function costCheck(w, watches, part = savedPart() ?? LIMITS.defaultPart) {
  const mine = minutesPerWeekday(w)
  const others = watches.filter((x) => x.id !== w.id && !x.paused).map(minutesPerWeekday)
  let worst = { day: 0, minutes: 0, total: 0 }
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    const total = mine[d] + others.reduce((n, o) => n + o[d], 0)
    if (total > worst.total) worst = { day: d, minutes: mine[d], total }
  }
  const perDay = Math.max(...Object.values(mine))
  const cost = (m) => Math.round(m * LIMITS.costPerMinute * 1000) / 1000
  return {
    minutesPerDay: perDay,
    costPerDay: cost(perDay),
    totalMinutesPerDay: worst.total,
    totalCostPerDay: cost(worst.total),
    part,
    worstDay: worst.day,
    level: cost(worst.total) > part + 1e-9 ? 'over' : cost(worst.total) > part * 0.8 ? 'warn' : 'ok',
  }
}

/** Plages d'une veille qui commencent (ou sont en cours) dans les prochaines `horizon` ms */
export function upcomingSlots(w, now = Date.now(), horizon = HORIZON) {
  const out = []
  for (let d = now - DAY; d <= now + horizon; d += DAY) {
    const day = tripoliDay(d)
    if (day < w.from || (w.to && day > w.to) || !w.days.includes(weekdayOf(day))) continue
    for (const win of w.windows) {
      const [a] = win.split('-')
      const start = tripoliAt(day, a)
      const end = start + windowMinutes(win) * MIN
      if (end <= now + LIMITS.minMinutes * MIN || start > now + horizon) continue
      for (const ch of w.channels) out.push({ watch: w.id, channel: ch, day, window: win, start: Math.max(start, now), end })
    }
  }
  return out.sort((x, y) => x.start - y.start)
}

/**
 * Crée les enregistrements des plages à venir de toutes les veilles actives (une fois par plage et par chaîne). Les
 * plages refusées (budget, simultanés…) sont notées dans le journal avec leur raison, une seule fois.
 */
export function materialize({ now = Date.now(), channels = recordableChannels(), data = load(), list = readAll(), st = statusFile(), part = savedPart() } = {}) {
  let changed = false
  let created = 0
  for (const w of data.watches.filter((x) => !x.paused)) {
    for (const slot of upcomingSlots(w, now)) {
      const key = `${w.id}|${slot.channel}|${slot.day}|${slot.window}`
      const covered = list.some((r) => (r.rasd || []).includes(w.id) && r.chaine === slot.channel && Date.parse(r.debut) <= slot.start + MIN && Date.parse(r.fin) >= slot.end - MIN)
      if (covered || data.log.some((l) => l.key === key)) continue
      try {
        const out = addRecording({ chaine: slot.channel, debut: new Date(slot.start).toISOString(), fin: new Date(slot.end).toISOString(), rasd: [w.id] }, `الرصد المبرمج: ${w.name}`, { now, channels, list, st, part })
        list = out.list
        created++
        changed = true
      } catch (err) {
        data.log.push({ key, watch: w.id, channel: slot.channel, at: new Date(slot.start).toISOString(), error: err.code || 'FAILED', extra: err.extra || {}, logged: new Date(now).toISOString() })
      }
    }
  }
  return { list, data, created, changed }
}

// ------------------------------------------------------------------ passages repérés et alertes

/** Passages d'une transcription qui contiennent les termes d'une veille : [{ n, at, terms }] */
export function hitsOf(doc, w) {
  const terms = watchTerms(w)
  return passagesOfTranscript(doc)
    .map((p, n) => ({ n, at: p.at, terms: matchTerms(p.text, terms).map((t) => t.w) }))
    .filter((h) => h.terms.length)
}

/** Repère les passages des enregistrements de veille terminés (une fois par enregistrement) ; renvoie les nouveaux */
export function tagFinished({ list = readAll(), st = statusFile(), now = Date.now(), data = load(), hits = readJson(HITS(), {}) } = {}) {
  const fresh = []
  for (const r of list) {
    if (!r.rasd?.length || hits[r.id] || stateOf(r, st, now).etat !== 'termine') continue
    const doc = transcriptOf(r.id)
    if (!doc) continue
    hits[r.id] = {}
    for (const id of r.rasd) {
      const w = data.watches.find((x) => x.id === id)
      if (!w) continue
      const found = hitsOf(doc, w)
      hits[r.id][id] = { count: found.length, passages: found.slice(0, 200) }
      if (found.length) fresh.push({ watch: w, rec: r, found })
    }
  }
  return { hits, fresh }
}

async function alertFresh(fresh, { telegramReady, sendTelegram, logDispatch }) {
  for (const { watch, rec, found } of fresh) {
    if (!watch.alert) continue
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tripoli' })
    const text = [`🎙 الرصد المبرمج — ${watch.name}`, `${rec.nom} · ${tripoliDay(Date.parse(rec.debut))}`, ...found.slice(0, 5).map((h) => `• ~${time.format(new Date(h.at))} : ${h.terms.join('، ')}`), `(${found.length})`].join('\n')
    try {
      if (telegramReady()) await sendTelegram(text)
      logDispatch({ kind: 'rasd', name: watch.name, count: found.length, channels: telegramReady() ? ['telegram'] : [], status: telegramReady() ? 'sent' : 'skipped' })
    } catch (err) {
      logDispatch({ kind: 'rasd', name: watch.name, count: found.length, channels: ['telegram'], status: 'failed', error: String(err.message || err).slice(0, 200) })
    }
  }
}

// ------------------------------------------------------------------ recherche intelligente

/** Termes de la recherche : la saisie (mots ou « expressions »), plus les mots-clés et synonymes de la veille choisie */
export function searchTerms(q, watch) {
  const typed = []
  const src = String(q || '').slice(0, 300)
  for (const m of src.matchAll(/"([^"]+)"/g)) typed.push(m[1])
  for (const w of src.replace(/"[^"]*"/g, ' ').split(/[\s,،]+/)) if (w.trim().length >= 2) typed.push(w.trim())
  const base = termsOf(typed)
  const extra = watch ? watchTerms(watch).filter((t) => !base.some((b) => b.key === t.key)) : []
  return { typed: base, expanded: extra, all: [...base, ...extra] }
}

/**
 * Passages trouvés, du plus pertinent au moins pertinent : nombre de termes saisis présents, puis termes de la veille,
 * puis le plus récent. sources : enregistrements (transcriptions complètes) et créneaux fixes (fiches de diffusion).
 */
export function smartSearch({ q = '', watch = '', channel = '', from = '', to = '', status = '', source = 'all' } = {}, { list = readAll(), st = statusFile(), now = Date.now(), data = load(), broadcastItems = [], channels = recordableChannels() } = {}) {
  const w = watch ? data.watches.find((x) => x.id === watch) : null
  const terms = searchTerms(q, w)
  if (!terms.all.length) return { terms: [], expanded: [], hits: [], total: 0 }
  const inRange = (t) => (!from || tripoliDay(t) >= from) && (!to || tripoliDay(t) <= to)
  const hits = []
  const score = (found) => found.filter((t) => terms.typed.includes(t)).length * 10 + found.length
  if (source !== 'fixed') {
    for (const r of list) {
      if (w && !(r.rasd || []).includes(w.id)) continue
      if (channel && r.chaine !== channel) continue
      if (!inRange(Date.parse(r.debut))) continue
      const etat = stateOf(r, st, now).etat
      if (status && etat !== status) continue
      const doc = etat === 'termine' ? transcriptOf(r.id) : null
      if (!doc) continue
      passagesOfTranscript(doc).forEach((p, n) => {
        const found = matchTerms(p.text, terms.all)
        if (found.length) hits.push({ kind: 'recording', id: r.id, n, nom: r.nom, chaine: r.chaine, at: p.at, text: p.text, terms: found.map((t) => t.w), score: score(found) })
      })
    }
  }
  if (source !== 'recordings' && !w && !status) {
    // Créneaux fixes du soir : transcription jointe à chaque fiche de diffusion (une tranche de 10 minutes)
    const names = channel ? new Set(channels.filter((c) => c.id === channel).map((c) => c.nom)) : null
    const seen = new Set()
    for (const it of broadcastItems) {
      if (it.media !== 'broadcast' || !it.transcription || (names && !names.has(it.origin)) || !inRange(Date.parse(it.date))) continue
      const k = `${it.origin}|${it.transcription.length}|${it.transcription.slice(0, 40)}`
      if (seen.has(k)) continue
      seen.add(k)
      passagesOf(it.transcription, it.date).forEach((p) => {
        const found = matchTerms(p.text, terms.all)
        if (found.length) hits.push({ kind: 'fixed', id: it.id, offset: p.offset, nom: it.origin, at: p.at, text: p.text, terms: found.map((t) => t.w), score: score(found) })
      })
    }
  }
  hits.sort((x, y) => y.score - x.score || y.at.localeCompare(x.at))
  return { terms: terms.all.map((t) => t.w), expanded: terms.expanded.map((t) => t.w), total: hits.length, hits: hits.slice(0, 200) }
}

// ------------------------------------------------------------------ suggestions

/**
 * Propositions de chaînes et de plages : journaux principaux connus (créneaux fixes du soir déjà enregistrés, donc
 * cherchés sans coût), et pour les chaînes sans créneau, les bulletins habituels de mi-journée et du soir.
 */
export function suggestions(channels = recordableChannels()) {
  const out = []
  for (const c of channels.filter((x) => x.recordable)) {
    if (c.slots.length) out.push({ channel: c.id, nom: c.nom, canal: c.canal, windows: c.slots, kind: 'fixed' })
    else out.push({ channel: c.id, nom: c.nom, canal: c.canal, windows: c.canal === 'radio' ? ['08:00-08:30', '14:00-14:30'] : ['14:00-14:30', '20:00-20:30'], kind: 'bulletin' })
  }
  return out
}

// ------------------------------------------------------------------ routes

export function mountRasd(app, { getItems, telegramReady, sendTelegram, logDispatch }) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req, res))
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED', ...(err.extra || {}) })
    }
  }
  const tick = () => {
    try {
      const out = materialize()
      if (out.changed) writeAll(out.list)
      save(out.data)
      const tagged = tagFinished({ list: out.list, data: out.data })
      if (tagged.fresh.length || Object.keys(tagged.hits).length) writeJson(HITS(), tagged.hits)
      if (tagged.fresh.length) alertFresh(tagged.fresh, { telegramReady, sendTelegram, logDispatch }).catch(() => {})
    } catch (err) {
      console.error(`الرصد المبرمج : ${err.message}`)
    }
  }
  setTimeout(tick, 5000).unref?.()
  setInterval(tick, 60_000).unref?.()

  const view = (w, now, list, st, hits, log) => {
    const recs = list.filter((r) => (r.rasd || []).includes(w.id))
    return {
      ...w,
      cost: costCheck(w, load().watches),
      upcoming: upcomingSlots(w, now, 7 * DAY).slice(0, 20).map((s) => ({ channel: s.channel, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })),
      // Enregistrements commencés ou finis (les plages à venir sont dans « upcoming »)
      recordings: recs
        .filter((r) => Date.parse(r.debut) <= now)
        .sort((a, b) => b.debut.localeCompare(a.debut))
        .slice(0, 30)
        .map((r) => ({ id: r.id, chaine: r.chaine, nom: r.nom, debut: r.debut, fin: r.fin, etat: stateOf(r, st, now).etat, hits: hits[r.id]?.[w.id]?.count ?? null })),
      skipped: log.filter((l) => l.watch === w.id).slice(-10).reverse(),
    }
  }

  app.get(
    '/api/rasd',
    wrap(() => {
      const now = Date.now()
      const d = load()
      const list = readAll()
      const st = statusFile()
      const hits = readJson(HITS(), {})
      return { watches: d.watches.map((w) => view(w, now, list, st, hits, d.log)), limits: RASD_LIMITS, part: savedPart() ?? LIMITS.defaultPart }
    }),
  )
  app.get('/api/rasd/suggest', wrap(() => ({ suggestions: suggestions() })))

  // Coût estimé d'un projet de veille, avant de l'enregistrer
  app.post(
    '/api/rasd/estimate',
    express.json({ limit: '8kb' }),
    wrap((req) => {
      const d = load()
      const w = cleanWatch(req.body || {}, recordableChannels(), { existing: d.watches.find((x) => x.id === req.body?.id) || null })
      return { cost: costCheck(w, d.watches) }
    }),
  )

  const upsert = (req) => {
    const d = load()
    const existing = req.params.id ? d.watches.find((x) => x.id === req.params.id) : null
    if (req.params.id && !existing) throw fail('NOT_FOUND', 404)
    if (!existing && d.watches.length >= RASD_LIMITS.maxWatches) throw fail('TOO_MANY_WATCHES', 400, { max: RASD_LIMITS.maxWatches })
    const w = cleanWatch(req.body || {}, recordableChannels(), { existing })
    if (!existing) w.createdBy = String(req.user?.email || '').slice(0, 120)
    const cost = costCheck(w, d.watches)
    if (cost.level === 'over' && !w.paused) throw fail('BUDGET', 409, { cost })
    d.watches = existing ? d.watches.map((x) => (x.id === w.id ? w : x)) : [...d.watches, w]
    // Plages modifiées : les refus notés pour cette veille sont oubliés, pour être réessayés
    d.log = d.log.filter((l) => l.watch !== w.id)
    save(d)
    tick()
    return { watch: w, cost }
  }
  app.post('/api/rasd', express.json({ limit: '8kb' }), wrap(upsert))
  app.put('/api/rasd/:id', express.json({ limit: '8kb' }), wrap(upsert))

  app.post(
    '/api/rasd/:id/pause',
    express.json({ limit: '1kb' }),
    wrap((req) => {
      const d = load()
      const w = d.watches.find((x) => x.id === req.params.id)
      if (!w) throw fail('NOT_FOUND', 404)
      const paused = req.body?.paused !== false
      if (!paused && costCheck({ ...w, paused: false }, d.watches).level === 'over') throw fail('BUDGET', 409, { cost: costCheck(w, d.watches) })
      w.paused = paused
      if (!paused) d.log = d.log.filter((l) => l.watch !== w.id)
      save(d)
      if (paused) {
        // Pause : les enregistrements de cette veille qui n'ont pas commencé sont annulés (ceux en cours continuent)
        const now = Date.now()
        const list = readAll().map((r) => ((r.rasd || []).includes(w.id) && r.rasd.length === 1 && Date.parse(r.debut) > now && !TERMINAL.has(stateOf(r, statusFile(), now).etat) ? { ...r, annule: true } : r))
        writeAll(list)
      } else tick()
      return { watch: w }
    }),
  )

  app.delete(
    '/api/rasd/:id',
    wrap((req) => {
      const d = load()
      const w = d.watches.find((x) => x.id === req.params.id)
      if (!w) throw fail('NOT_FOUND', 404)
      d.watches = d.watches.filter((x) => x.id !== w.id)
      d.log = d.log.filter((l) => l.watch !== w.id)
      save(d)
      // Les enregistrements à venir de cette seule veille sont annulés ; les transcriptions faites restent consultables
      const now = Date.now()
      writeAll(readAll().map((r) => ((r.rasd || []).includes(w.id) && r.rasd.length === 1 && Date.parse(r.debut) > now && !TERMINAL.has(stateOf(r, statusFile(), now).etat) ? { ...r, annule: true } : r)))
      return { ok: true }
    }),
  )

  app.get(
    '/api/rasd/search',
    wrap((req) => smartSearch(req.query, { broadcastItems: getItems().items })),
  )
}

