import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { isAdminReq, redactErrors } from './redact.js'
import { fileURLToPath } from 'node:url'
import { passagesOf } from './broadcast.js'
import { liveSources } from './live.js'

/**
 * Enregistrements à la demande (page « البث المباشر ») : une chaîne, une période précise, puis transcription.
 *
 *   data/libye-enregistrements.json        demandes écrites ici (lues par la veille chaque minute)
 *   data/libye-enregistrements-etat.json   état écrit par la veille : progression, erreurs, budget du mois
 *   data/libye-enregistrements/<id>.json   transcription complète écrite par la veille (l'audio est supprimé)
 *
 * Les sources sont des directs (vérifié le 28/10/2026 : 1 à 4 minutes de retour en arrière pour les flux HLS, rien
 * pour les radios) : seule une période qui commence maintenant ou plus tard est acceptée. Garde-fous avant d'écrire :
 * durée maximale, enregistrements simultanés, chevauchement sur une même chaîne (périodes fusionnées), coût estimé
 * de la transcription comparé à ce qui reste du plafond du mois.
 */

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const FILE = () => path.join(dataDir, 'libye-enregistrements.json')
const STATUS = () => path.join(dataDir, 'libye-enregistrements-etat.json')
const TEXTS = () => path.join(dataDir, 'libye-enregistrements')
const MIN = 60_000
export const LIMITS = {
  maxMinutes: Number(process.env.MMS_ENREGISTREMENT_MAX_MIN) || 240,
  minMinutes: 2,
  maxParallel: Number(process.env.MMS_ENREGISTREMENTS_SIMULTANES) || 3,
  maxDaysAhead: 30,
  costPerMinute: 0.003,
  // Part quotidienne des demandes dans le plafond de transcription, tant que rien n'est réglé (même valeur que la veille)
  defaultPart: 1.1,
  // Enregistrements simultanés au plus pour la veille (créneaux fixes + demandes, LIBYE_CAPTURES_MAX)
  maxCaptures: Number(process.env.MMS_CAPTURES_MAX) || 6,
  // Plafond total de transcription réglable dans MMS ($ par jour)
  maxDailyTotal: Number(process.env.MMS_TRANSCRIPTION_MAX_JOUR) || 15,
}
export const TERMINAL = new Set(['termine', 'echoue', 'annule'])

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export const readAll = () => {
  const list = readJson(FILE(), { enregistrements: [] }).enregistrements
  return Array.isArray(list) ? list : []
}
/** Part quotidienne réglée dans MMS (en $), ou null */
export const savedPart = () => {
  const v = readJson(FILE(), {}).part_demandes_jour
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
/** Plafond total de transcription du jour réglé par l'administrateur dans MMS (en $), ou null (celui du .env) */
export const savedTotal = () => {
  const v = readJson(FILE(), {}).plafond_jour
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
export function writeAll(list, part = savedPart(), total = savedTotal()) {
  fs.mkdirSync(dataDir, { recursive: true })
  const tmp = `${FILE()}.${process.pid}.tmp`
  const conf = { ...(part != null ? { part_demandes_jour: part } : {}), ...(total != null ? { plafond_jour: total } : {}) }
  fs.writeFileSync(tmp, JSON.stringify({ maj: new Date().toISOString(), ...conf, enregistrements: list }, null, 1))
  fs.renameSync(tmp, FILE())
}

// Audit v4 : budget de transcription réglable par l'administrateur, au plus LIMITS.maxDailyTotal $ par jour (même borne
// que LIBYE_PLAFOND_MAX_JOUR côté veille) ; cible : au moins 24 h d'audio par jour
export const TARGET_HOURS = 24
export const dailyCostFor = (hours) => round(hours * 60 * LIMITS.costPerMinute)
export function setTotal(value) {
  const v = Number(value)
  if (value === null || value === '' || !Number.isFinite(v) || v < 0 || v > LIMITS.maxDailyTotal) throw fail('BAD_TOTAL', 400, { max: LIMITS.maxDailyTotal })
  const part = savedPart()
  // La part des demandes reste dans le nouveau plafond
  writeAll(readAll(), part != null ? Math.min(part, round(v)) : part, round(v))
  return round(v)
}
export const statusFile = () => readJson(STATUS(), null)

const fail = (code, status = 400, extra = {}) => Object.assign(new Error(code), { code, status, extra })

const YT_BLOCKED = /not a bot|Sign in to confirm|cookies-from-browser/i
/**
 * youtubeBlocked : YouTube refuse le serveur (contrôle anti-robot vu sur au moins une chaîne). Le refus vaut pour tout
 * le serveur : toute chaîne lue SEULEMENT par YouTube est alors indisponible, même si sa dernière erreur est autre.
 */
export function availability(c, youtubeBlocked = false) {
  const youtubeOnly = Boolean(c.youtube) && !c.flux && !c.radio_browser
  if (youtubeOnly && (youtubeBlocked || YT_BLOCKED.test(String(c.erreur || '')))) return { available: false, why: 'YOUTUBE_BLOCKED' }
  return { available: Boolean(c.flux || c.youtube || c.radio_browser), why: '' }
}

/** Chaînes enregistrables : une adresse de direct (flux, YouTube ou annuaire radio) ; créneaux fixes du soir */
export function recordableChannels(list = liveSources()) {
  const youtubeBlocked = list.some((c) => YT_BLOCKED.test(String(c.erreur || '')))
  return list.map((c) => ({
    id: c.id,
    nom: c.nom || c.id,
    canal: c.canal === 'radio' ? 'radio' : 'tv',
    slots: Array.isArray(c.creneaux) ? c.creneaux : [],
    recordable: Boolean(c.flux || c.youtube || c.radio_browser),
    // Disponible maintenant ? Une chaîne lue seulement par YouTube est indisponible tant que YouTube refuse le serveur
    // (contrôle anti-robot : fichier de cookies à renouveler) ; les flux directs restent disponibles
    ...availability(c, youtubeBlocked),
    inVeille: !c.liveOnly,
    stream: { flux: c.flux || '', youtube: c.youtube || '', radio_browser: c.radio_browser || '', referer: c.referer || '' },
  }))
}

/** État d'une demande d'après la veille ; sans réponse de la veille 3 minutes après le début : échec expliqué */
export function stateOf(r, st, now) {
  const s = st?.enregistrements?.[r.id]
  if (r.annule && (!s || !TERMINAL.has(s.etat))) return { etat: 'annule' }
  if (s) return s
  const start = Date.parse(r.debut)
  const end = Date.parse(r.fin)
  if (now < start) return { etat: 'en_attente' }
  if (now > start + 3 * MIN) return { etat: 'echoue', erreur: 'NO_VEILLE' }
  return { etat: 'en_attente', debutDans: Math.max(0, Math.round((start - now) / 1000)), dureeS: Math.round((end - start) / 1000) }
}

const minutesOf = (r) => (Date.parse(r.fin) - Date.parse(r.debut)) / MIN

// Jour de Tripoli (UTC+2 toute l'année) d'un instant
export const tripoliDay = (t) => new Date(t + 2 * 3_600_000).toISOString().slice(0, 10)

/**
 * Budget quotidien des demandes (part du plafond de transcription réglée dans MMS) pour le jour où commence une
 * demande : dépense déjà faite ce jour-là (veille) + coût estimé des demandes de ce jour pas encore transcrites
 */
export function budgetOf(list, st, now = Date.now(), at = now, part = savedPart()) {
  const day = tripoliDay(at)
  const total = st?.budget?.total_jour ?? null
  const cap = part ?? st?.budget?.plafond_jour ?? LIMITS.defaultPart
  const spent = day === tripoliDay(now) ? (st?.budget?.jour ?? 0) : 0
  const reserved = list
    .filter((r) => !TERMINAL.has(stateOf(r, st, now).etat) && tripoliDay(Date.parse(r.debut)) === day)
    .reduce((n, r) => n + minutesOf(r) * LIMITS.costPerMinute, 0)
  const remaining = round(Math.max(0, cap - spent - reserved))
  return {
    day,
    cap: round(cap),
    spent: round(spent),
    reserved: round(reserved),
    remaining,
    hours: Math.round((remaining / LIMITS.costPerMinute / 60) * 10) / 10,
    total: total != null ? round(total) : null,
    fixed: st?.budget?.fixes ? { spent: round(st.budget.fixes.jour), cap: round(st.budget.fixes.plafond_jour) } : null,
    month: st?.budget ? { spent: round(st.budget.mois), cap: round(st.budget.plafond_mois) } : null,
    known: Boolean(st?.budget),
    // Réglage de l'administrateur (null : plafond du .env de la veille), cible 24 h d'audio par jour et son coût
    totalSet: savedTotal(),
    target: { hours: TARGET_HOURS, costPerDay: dailyCostFor(TARGET_HOURS), costPerMonth: round(dailyCostFor(TARGET_HOURS) * 31) },
    hoursPerDay: total != null ? Math.round((total / LIMITS.costPerMinute / 60) * 10) / 10 : null,
    maxTotal: LIMITS.maxDailyTotal,
  }
}

/** Règle la part quotidienne des demandes (bornée par le plafond de transcription du jour quand il est connu) */
export function setPart(value, st = statusFile()) {
  const v = Number(value)
  const total = savedTotal() ?? st?.budget?.total_jour ?? 10
  if (value === null || value === '' || !Number.isFinite(v) || v < 0 || v > total) throw fail('BAD_PART', 400, { max: round(total) })
  writeAll(readAll(), round(v))
  return round(v)
}
const round = (n) => Math.round(n * 1000) / 1000

/** Créneaux fixes du soir d'une chaîne qui recouvrent une période (pour proposer leur transcription existante) */
export function slotsCovering(channel, start, end) {
  const out = []
  for (const w of channel.slots) {
    const [a, b] = w.split('-')
    for (let d = new Date(start - 86_400_000); d <= new Date(end); d = new Date(d.getTime() + 86_400_000)) {
      // Heure de Tripoli (UTC+2 toute l'année)
      const day = new Date(d.getTime() + 2 * 3_600_000).toISOString().slice(0, 10)
      const s = Date.parse(`${day}T${a}:00+02:00`)
      let e = Date.parse(`${day}T${b}:00+02:00`)
      if (e <= s) e += 86_400_000
      if (s < end && e > start) out.push(w)
    }
  }
  return [...new Set(out)]
}

/**
 * Vérifie et enregistre une demande. Renvoie { item, merged } ; lève une erreur au code lisible sinon.
 * Une période qui chevauche une demande active de la même chaîne est fusionnée avec elle.
 */
// rasd : veilles programmées (الرصد المبرمج) à l'origine de la demande, gardées sur la demande fusionnée
export function addRecording({ chaine, debut, fin, rasd = [] }, by, { now = Date.now(), channels = recordableChannels(), list = readAll(), st = statusFile(), part = savedPart() } = {}) {
  const ch = channels.find((c) => c.id === String(chaine || ''))
  if (!ch) throw fail('NO_CHANNEL', 404)
  if (!ch.recordable) throw fail('NOT_RECORDABLE')
  // Échec certain (YouTube refuse le serveur) : refusé tout de suite avec la raison, au lieu d'un enregistrement vide
  if (ch.available === false) throw fail(ch.why || 'UNAVAILABLE')
  let start = Date.parse(debut)
  const end = Date.parse(fin)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw fail('BAD_RANGE')
  // Les directs n'ont pas de passé : une période commencée depuis plus de 2 minutes est refusée
  if (start < now - 2 * MIN) {
    const slots = slotsCovering(ch, start, Math.min(end, now))
    throw fail('PAST', 400, { slots })
  }
  // Durée demandée (les champs de date sont à la minute près) ; il faut au moins une minute d'enregistrement réel
  if (end - start < LIMITS.minMinutes * MIN || end < now + MIN) throw fail('TOO_SHORT')
  if (start < now) start = now
  if (end - start > LIMITS.maxMinutes * MIN) throw fail('TOO_LONG', 400, { max: LIMITS.maxMinutes })
  if (start > now + LIMITS.maxDaysAhead * 86_400_000) throw fail('TOO_FAR', 400, { days: LIMITS.maxDaysAhead })
  const active = list.filter((r) => !TERMINAL.has(stateOf(r, st, now).etat))
  // Même chaîne, périodes qui se touchent : une seule demande, sur l'union des deux périodes
  const same = active.filter((r) => r.chaine === ch.id && Date.parse(r.debut) <= end && Date.parse(r.fin) >= start)
  let merged = null
  let a = start
  let b = end
  for (const r of same) {
    a = Math.min(a, Date.parse(r.debut))
    b = Math.max(b, Date.parse(r.fin))
  }
  if (same.length) {
    if (b - a > LIMITS.maxMinutes * MIN) throw fail('TOO_LONG', 400, { max: LIMITS.maxMinutes, merged: true })
    merged = same[0]
  }
  // Enregistrements simultanés : au plus maxParallel demandes, et au plus maxCaptures avec les créneaux fixes du soir
  const others = active.filter((r) => !same.includes(r))
  const fixedAt = (t) => channels.filter((c) => c.inVeille && c.id !== ch.id && slotsCovering(c, t, t + 1).length).length
  const slotEdges = channels.flatMap((c) => (c.inVeille ? c.slots : []).flatMap((w) => w.split('-'))).flatMap((hm) => {
    const out = []
    for (let d = a - 86_400_000; d <= b + 86_400_000; d += 86_400_000) out.push(Date.parse(`${tripoliDay(d)}T${hm}:00+02:00`))
    return out
  })
  const points = [a, ...others.flatMap((r) => [Date.parse(r.debut), Date.parse(r.fin)]), ...slotEdges].filter((t) => t >= a && t < b)
  for (const t of points) {
    const n = 1 + others.filter((r) => Date.parse(r.debut) <= t && Date.parse(r.fin) > t).length
    if (n > LIMITS.maxParallel) throw fail('PARALLEL', 409, { max: LIMITS.maxParallel })
    if (n + fixedAt(t) > LIMITS.maxCaptures) throw fail('CAPTURES', 409, { max: LIMITS.maxCaptures, fixed: fixedAt(t) })
  }
  // Coût estimé de la transcription, comparé à ce qui reste de la part quotidienne des demandes ce jour-là
  const extra = ((b - a) / MIN - (merged ? same.reduce((n, r) => n + minutesOf(r), 0) : 0)) * LIMITS.costPerMinute
  const budget = budgetOf(list, st, now, a, part)
  if (extra > budget.remaining + 1e-9) throw fail('BUDGET', 409, { estimate: round(extra), remaining: budget.remaining, cap: budget.cap })
  const item = {
    id: merged?.id || crypto.randomBytes(8).toString('hex'),
    chaine: ch.id,
    nom: ch.nom,
    canal: ch.canal,
    // Adresse du direct jointe à la demande : la veille garde la sienne si elle connaît la chaîne, sinon elle prend
    // celle-ci (chaînes du mur du direct seulement)
    ...Object.fromEntries(Object.entries(ch.stream).filter(([, v]) => v)),
    debut: new Date(a).toISOString(),
    fin: new Date(b).toISOString(),
    par: merged?.par || String(by || '').slice(0, 120),
    cree: merged?.cree || new Date(now).toISOString(),
    annule: false,
    ...(() => {
      const ids = [...new Set([...same.flatMap((r) => r.rasd || []), ...(Array.isArray(rasd) ? rasd : [])].map(String))].slice(0, 20)
      return ids.length ? { rasd: ids } : {}
    })(),
  }
  const next = [...list.filter((r) => !same.includes(r)), item]
  return { item, merged: Boolean(merged), estimate: round(extra), list: next }
}

/** Arrêter (en cours : fin = maintenant, la transcription suit) ou annuler (pas encore commencé) */
export function stopRecording(id, { now = Date.now(), list = readAll(), st = statusFile() } = {}) {
  const r = list.find((x) => x.id === id)
  if (!r) throw fail('NOT_FOUND', 404)
  const etat = stateOf(r, st, now).etat
  if (TERMINAL.has(etat)) throw fail('FINISHED', 409)
  if (now < Date.parse(r.debut)) r.annule = true
  else r.fin = new Date(Math.max(now, Date.parse(r.debut) + LIMITS.minMinutes * MIN)).toISOString()
  return { item: r, list }
}

export function transcriptOf(id) {
  if (!/^[a-f0-9]{16}$/.test(id)) return null
  return readJson(path.join(TEXTS(), `${id}.json`), null)
}

/** Passages horodatés d'une transcription (heure estimée à 130 mots par minute à partir de chaque tranche) */
export function passagesOfTranscript(doc) {
  const out = []
  for (const s of doc.segments || []) for (const p of passagesOf(s.texte, s.debut)) out.push({ at: p.at, text: p.text })
  return out
}

const srtTime = (ms) => {
  const t = Math.max(0, ms)
  const p = (n, w = 2) => String(Math.floor(n)).padStart(w, '0')
  return `${p(t / 3_600_000)}:${p((t / 60_000) % 60)}:${p((t / 1000) % 60)},${p(t % 1000, 3)}`
}

/** Sous-titres SRT : un passage par bloc, du début du passage au début du suivant (heures relatives au début) */
export function toSrt(doc) {
  const ps = passagesOfTranscript(doc)
  const t0 = Date.parse(doc.debut)
  return ps
    .map((p, k) => {
      const a = Date.parse(p.at) - t0
      const b = k + 1 < ps.length ? Date.parse(ps[k + 1].at) - t0 : Math.min(a + 30_000, Date.parse(doc.fin) - t0)
      return `${k + 1}\n${srtTime(a)} --> ${srtTime(Math.max(b, a + 1000))}\n${p.text}\n`
    })
    .join('\n')
}

export function toTxt(doc, lang = 'ar') {
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-LY-u-nu-latn', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Tripoli' })
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tripoli' })
  return [`${doc.nom} — ${fmt.format(new Date(doc.debut))} → ${fmt.format(new Date(doc.fin))}`, '', ...passagesOfTranscript(doc).map((p) => `[~${time.format(new Date(p.at))}] ${p.text}`), ''].join('\n')
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

/**
 * Budget de transcription de 24 h d'audio par jour (≈ 4,32 $, approuvé par le client le 30/10/2026, audit v4) :
 * appliqué au démarrage seulement si aucun plafond n'a encore été réglé dans MMS. Un réglage de l'administrateur
 * (page des enregistrements) reste prioritaire et n'est jamais écrasé. MMS_TRANSCRIPTION_HEURES_DEFAUT=0 l'arrête.
 */
export function ensureTargetBudget() {
  const hours = Number(process.env.MMS_TRANSCRIPTION_HEURES_DEFAUT ?? TARGET_HOURS)
  if (!hours || savedTotal() != null) return null
  const total = Math.min(dailyCostFor(hours), LIMITS.maxDailyTotal)
  writeAll(readAll(), savedPart(), total)
  return total
}

export function mountRecordings(app) {
  try {
    const t = ensureTargetBudget()
    if (t != null) console.log(`Budget de transcription réglé à ${t} $ par jour (${TARGET_HOURS} h d'audio)`)
  } catch (err) {
    console.error('Budget de transcription :', err.message)
  }
  const wrap = (fn) => (req, res) => {
    try {
      const out = fn(req, res)
      if (out !== undefined) res.json(out)
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED', ...(err.extra || {}) })
    }
  }

  app.get(
    '/api/recordings',
    wrap((req) => {
      const now = Date.now()
      const list = readAll()
      const st = statusFile()
      // Passages repérés par الرصد المبرمج (server/rasd.js), additionnés pour toutes les veilles de l'enregistrement
      const hits = readJson(path.join(dataDir, 'libye-rasd-hits.json'), {})
      const items = list
        .map((r) => ({
          id: r.id,
          chaine: r.chaine,
          nom: r.nom,
          canal: r.canal,
          debut: r.debut,
          fin: r.fin,
          par: r.par,
          cree: r.cree,
          rasd: r.rasd || [],
          hits: hits[r.id] ? Object.values(hits[r.id]).reduce((n, h) => n + (h.count || 0), 0) : null,
          estimate: round(minutesOf(r) * LIMITS.costPerMinute),
          ...stateOf(r, st, now),
        }))
        .sort((x, y) => y.debut.localeCompare(x.debut))
      const channels = recordableChannels().map(({ stream, ...c }) => c)
      // Non-administrateurs : codes d'erreur lisibles seulement ; « admin » dit à l'interface d'afficher les coûts
      const admin = isAdminReq(req)
      return { items: admin ? items : redactErrors(items), channels: admin ? channels : redactErrors(channels), limits: LIMITS, budget: budgetOf(list, st, now), veille: { maj: st?.maj || null }, admin }
    }),
  )

  app.post(
    '/api/recordings',
    express.json({ limit: '2kb' }),
    wrap((req, res) => {
      const out = addRecording(req.body || {}, req.user?.email)
      writeAll(out.list)
      res.status(201)
      return { item: out.item, merged: out.merged, estimate: out.estimate }
    }),
  )

  // Part quotidienne du plafond de transcription réservée aux demandes (administrateurs : action « diffusion »)
  app.put(
    '/api/recordings/budget',
    express.json({ limit: '1kb' }),
    wrap((req) => {
      // { total } : plafond total du jour (toutes chaînes) ; { part } : part des demandes dans ce plafond
      if (req.body?.total !== undefined) return { total: setTotal(req.body.total) }
      return { part: setPart(req.body?.part) }
    }),
  )

  app.post(
    '/api/recordings/:id/stop',
    wrap((req) => {
      const out = stopRecording(String(req.params.id))
      writeAll(out.list)
      return { item: out.item }
    }),
  )

  // Recherche dans toutes les transcriptions terminées
  app.get(
    '/api/recordings/search',
    wrap((req) => {
      const q = norm(String(req.query.q || '').trim()).slice(0, 200)
      if (q.length < 2) return { hits: [] }
      const hits = []
      for (const r of readAll()) {
        const doc = transcriptOf(r.id)
        if (!doc) continue
        for (const p of passagesOfTranscript(doc)) if (norm(p.text).includes(q)) hits.push({ id: r.id, nom: r.nom, at: p.at, text: p.text })
        if (hits.length >= 200) break
      }
      return { hits: hits.slice(0, 200) }
    }),
  )

  // Transcription : lecture (json) ou téléchargement (txt, srt)
  app.get(
    '/api/recordings/:id/transcript',
    wrap((req, res) => {
      const doc = transcriptOf(String(req.params.id))
      if (!doc) throw fail('NOT_FOUND', 404)
      const format = String(req.query.format || 'json')
      const name = `${doc.chaine}-${doc.debut.slice(0, 16).replace(/[:T]/g, '-')}`
      if (format === 'txt' || format === 'srt') {
        res.setHeader('Content-Type', format === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/plain; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${name}.${format}"`)
        res.send(`﻿${format === 'srt' ? toSrt(doc) : toTxt(doc, req.query.lang === 'en' ? 'en' : 'ar')}`)
        return undefined
      }
      return { ...doc, passages: passagesOfTranscript(doc) }
    }),
  )
}
