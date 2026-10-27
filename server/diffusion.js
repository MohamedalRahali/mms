import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dns from 'node:dns/promises'
import net from 'node:net'
import { spawn } from 'node:child_process'
import express from 'express'

/**
 * Chaînes TV et radios de la veille Libye : état, réglages des administrateurs, test d'un flux.
 *
 *   libye-diffusion-etat.json  écrit par le collecteur à chaque passage (dernier enregistrement, transcription, erreur)
 *   libye-diffusion.json       écrit ici : activer / désactiver, créneaux, adresse du flux, chaînes ajoutées ;
 *                              le collecteur le fusionne avec sources.yaml et en tient compte en une minute
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/
const SLOT = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/
const URL_RE = /^https?:\/\/[^\s"']+$/

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** Champs acceptés pour une chaîne (mêmes règles que le collecteur) ; null si une valeur est invalide */
function clean(body) {
  const out = {}
  if (body.actif !== undefined) {
    if (typeof body.actif !== 'boolean') return null
    out.actif = body.actif
  }
  if (body.nom !== undefined) {
    const nom = String(body.nom).trim()
    if (!nom || nom.length > 120) return null
    out.nom = nom
  }
  if (body.canal !== undefined) {
    if (!['tv', 'radio'].includes(body.canal)) return null
    out.canal = body.canal
  }
  for (const key of ['flux', 'referer', 'youtube']) {
    if (body[key] === undefined) continue
    const v = String(body[key]).trim()
    if (v && !URL_RE.test(v)) return null
    if (v) out[key] = v
  }
  if (body.creneaux !== undefined) {
    if (!Array.isArray(body.creneaux) || body.creneaux.length > 6) return null
    const slots = body.creneaux.map((s) => String(s).trim()).filter(Boolean)
    if (slots.some((s) => !SLOT.test(s))) return null
    out.creneaux = slots
  }
  return out
}

/** Refuse les adresses internes (le test lance ffmpeg depuis le serveur) */
async function publicHost(url) {
  let host
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) return false
  return addrs.every(({ address: a }) => {
    if (net.isIPv4(a)) {
      const [x, y] = a.split('.').map(Number)
      return !(x === 10 || x === 127 || x === 0 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || x >= 224)
    }
    const v = a.toLowerCase()
    return !(v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:'))
  })
}

/** Lit quelques secondes du flux avec ffmpeg : { ok, octets, erreur } */
function probe(flux, referer, seconds = 6) {
  return new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `mms-flux-${process.pid}-${Date.now()}.mp3`)
    const args = ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'http,https,tcp,tls,crypto']
    if (referer) args.push('-headers', `Referer: ${referer}\r\n`)
    args.push('-i', flux, '-t', String(seconds), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-y', out)
    let err = ''
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const timer = setTimeout(() => p.kill('SIGKILL'), (seconds + 30) * 1000)
    p.stderr.on('data', (d) => (err = (err + d).slice(-400)))
    let finished = false
    const done = (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      let size = 0
      try {
        size = fs.statSync(out).size
        fs.unlinkSync(out)
      } catch {}
      resolve({ ok: code === 0 && size > 1000, octets: size, erreur: err.trim().slice(-300) })
    }
    p.on('error', (e) => {
      err = String(e.message)
      done(-1)
    })
    p.on('close', done)
  })
}

export function mountDiffusion(app, dataDir) {
  const settingsFile = path.join(dataDir, 'libye-diffusion.json')
  const statusFile = path.join(dataDir, 'libye-diffusion-etat.json')
  const settings = () => readJson(settingsFile, { sources: [] })
  // Action « إدارة مصادر البث » du profil (server/permissions.js) : administrateurs par défaut
  const admin = (req, res, next) => (req.perms?.actions.includes('diffusion') ? next() : res.status(403).json({ error: 'FORBIDDEN' }))
  let testing = 0

  // Liste des chaînes : état écrit par le collecteur + réglages en attente (pas encore relus par le collecteur)
  app.get('/api/diffusion', (_req, res) => {
    const status = readJson(statusFile, { chaines: [] })
    const pending = new Map(settings().sources.map((s) => [s.id, s]))
    const chaines = (status.chaines || []).map((c) => ({ ...c, ...(pending.get(c.id) || {}) }))
    for (const s of pending.values()) if (s.ajout && !chaines.some((c) => c.id === s.id)) chaines.push({ ...s, attente: true })
    res.json({ maj: status.maj || null, max: status.max_simultanes || null, chaines })
  })

  // Modifier une chaîne (actif, créneaux, flux, referer, nom, canal)
  app.patch('/api/diffusion/:id', admin, express.json({ limit: '4kb' }), (req, res) => {
    const id = String(req.params.id)
    const patch = clean(req.body || {})
    if (!SLUG.test(id) || !patch) return res.status(400).json({ error: 'BAD_REQUEST' })
    const data = settings()
    const i = data.sources.findIndex((s) => s.id === id)
    if (i >= 0) data.sources[i] = { ...data.sources[i], ...patch }
    else data.sources.push({ id, ...patch })
    writeJson(settingsFile, data)
    res.json({ ok: true })
  })

  // Ajouter une chaîne à partir de l'adresse de son flux officiel
  app.post('/api/diffusion', admin, express.json({ limit: '4kb' }), (req, res) => {
    const body = clean(req.body || {})
    if (!body || !body.flux || !body.nom) return res.status(400).json({ error: 'BAD_REQUEST' })
    const base = String(req.body.id || body.nom)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
    const status = readJson(statusFile, { chaines: [] })
    const data = settings()
    const taken = new Set([...(status.chaines || []).map((c) => c.id), ...data.sources.map((s) => s.id)])
    let id = SLUG.test(base) ? base : `chaine-${Date.now().toString(36)}`
    for (let n = 2; taken.has(id); n++) id = `${base || 'chaine'}-${n}`
    data.sources.push({ id, canal: 'tv', actif: true, creneaux: [], ...body, ajout: true })
    writeJson(settingsFile, data)
    res.json({ ok: true, id })
  })

  // Retirer : une chaîne ajoutée dans MMS disparaît ; une chaîne de sources.yaml revient à ses réglages d'origine
  app.delete('/api/diffusion/:id', admin, (req, res) => {
    const data = settings()
    data.sources = data.sources.filter((s) => s.id !== req.params.id)
    writeJson(settingsFile, data)
    res.json({ ok: true })
  })

  // Tester un flux depuis le serveur (6 secondes d'audio)
  app.post('/api/diffusion/test', admin, express.json({ limit: '2kb' }), async (req, res) => {
    const body = clean({ flux: req.body?.flux, referer: req.body?.referer })
    if (!body?.flux) return res.status(400).json({ error: 'BAD_REQUEST' })
    if (!(await publicHost(body.flux))) return res.json({ ok: false, octets: 0, erreur: 'adresse non publique refusée' })
    if (testing >= 2) return res.status(429).json({ error: 'BUSY' })
    testing++
    try {
      res.json(await probe(body.flux, body.referer))
    } finally {
      testing--
    }
  })
}
