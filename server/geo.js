import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { toneOf } from './radar.js'
import { normalize } from './watches.js'

/**
 * الحضور في إجابات الذكاء الاصطناعي : les questions que le client se pose sur ses sujets sont posées à l'IA déjà
 * configurée dans MMS (Gemini, Claude ou OpenAI selon le .env), à la demande ou chaque jour / chaque semaine.
 * Chaque réponse est gardée, avec pour chaque entité suivie (personnalité, institution, média) : citée ou non,
 * nombre de mentions et tonalité des phrases qui la citent. L'historique montre l'évolution.
 *
 * Limites : c'est la réponse de l'IA configurée, pas celle de ChatGPT, Perplexity ou Google (aucune collecte sur
 * ces services) ; coût borné par une limite de questions par jour (20 par défaut, 100 au plus) ; désactivable ;
 * sans clé IA, la page s'affiche et explique qu'aucune question ne peut partir.
 * Stockage : data/geo.json (réglages et 1 000 dernières réponses).
 */

const MAX_QUESTIONS = 30
const MAX_ENTITIES = 40
const KEEP_RUNS = 1000
const CHECK_MS = 30 * 60_000
const EVERY = { daily: 86_400_000, weekly: 7 * 86_400_000 }

let file = ''
let state = { settings: { enabled: true, schedule: 'off', dailyLimit: 20, questions: [], entities: [] }, runs: [], day: { key: '', count: 0 }, lastScheduled: null }
let running = false

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    state = { ...state, ...saved, settings: cleanSettings(saved.settings || {}) }
    if (!Array.isArray(state.runs)) state.runs = []
  } catch {
    /* première utilisation */
  }
}
function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, file)
}

export function cleanSettings(s) {
  const questions = (Array.isArray(s.questions) ? s.questions : [])
    .map((q) => ({ id: /^[a-z0-9]{6,16}$/.test(String(q?.id || '')) ? q.id : crypto.randomBytes(4).toString('hex'), text: String(q?.text || '').trim().slice(0, 400) }))
    .filter((q) => q.text)
    .slice(0, MAX_QUESTIONS)
  const entities = [...new Set((Array.isArray(s.entities) ? s.entities : []).map((e) => String(e || '').trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_ENTITIES)
  return {
    enabled: s.enabled !== false,
    schedule: ['off', 'daily', 'weekly'].includes(s.schedule) ? s.schedule : 'off',
    dailyLimit: Math.min(Math.max(Math.round(Number(s.dailyLimit) || 20), 1), 100),
    questions,
    entities,
  }
}

const SPEC = {
  system: `Tu es un assistant généraliste. Réponds à la question de l'utilisateur comme tu le ferais pour le grand public,
en arabe standard moderne, de façon complète mais concise (150 mots au plus). Rends :
- reponse : ta réponse ;
- sources : les médias, sites ou institutions sur lesquels tu t'appuies ou que tu recommandes (noms seulement, 8 au plus, liste vide si aucun).`,
  schema: {
    type: 'object',
    properties: { reponse: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } },
    required: ['reponse', 'sources'],
    additionalProperties: false,
  },
  format: 'Réponds uniquement par un objet JSON de la forme {"reponse": "...", "sources": ["..."]}',
  valid: (d) => typeof d.reponse === 'string' && Array.isArray(d.sources),
  name: 'reponse',
}

/** Présence et tonalité de chaque entité suivie dans une réponse */
export function measure(answer, sources, entities) {
  const text = `${answer}\n${sources.join('\n')}`
  const sentences = text.split(/(?<=[.!؟?\n])\s*/).filter((x) => x.trim())
  return entities.map((name) => {
    const n = normalize(name)
    if (!n) return { name, count: 0, cited: false, tone: '' }
    let count = 0
    const tone = { positive: 0, neutral: 0, negative: 0 }
    for (const s of sentences) {
      const flat = normalize(s)
      if (!flat.includes(n)) continue
      count += flat.split(n).length - 1
      tone[toneOf({ title: s, summary: '' }).tone]++
    }
    const main = count ? (tone.negative > tone.positive ? 'negative' : tone.positive > tone.negative ? 'positive' : 'neutral') : ''
    return { name, count, cited: count > 0, tone: main, inSources: sources.some((x) => normalize(x).includes(n)) }
  })
}

/** Synthèse par entité sur les réponses données : taux de présence, mentions, tonalité, série par jour */
export function summarize(runs, entities) {
  return entities.map((name) => {
    let cited = 0
    let mentions = 0
    const tone = { positive: 0, neutral: 0, negative: 0 }
    const perDay = new Map()
    for (const r of runs) {
      const m = r.mentions.find((x) => x.name === name)
      const d = r.at.slice(0, 10)
      const row = perDay.get(d) || { date: d, runs: 0, cited: 0 }
      row.runs++
      if (m?.cited) {
        cited++
        mentions += m.count
        if (m.tone) tone[m.tone]++
        row.cited++
      }
      perDay.set(d, row)
    }
    return { name, runs: runs.length, cited, rate: runs.length ? Math.round((cited / runs.length) * 100) : 0, mentions, tone, perDay: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60) }
  })
}

function takeQuota() {
  const today = new Date().toISOString().slice(0, 10)
  if (state.day?.key !== today) state.day = { key: today, count: 0 }
  if (state.day.count >= state.settings.dailyLimit) return false
  state.day.count++
  return true
}

async function ask(question, aiRun, why) {
  if (!takeQuota()) throw Object.assign(new Error('DAY_LIMIT'), { code: 'DAY_LIMIT', status: 429 })
  const at = new Date().toISOString()
  // Une même question n'est reposée qu'une fois par heure (cache de l'IA), même si on clique plusieurs fois
  const r = await aiRun(`geo|${question.id}|${question.text}|${at.slice(0, 13)}`, question.text, SPEC)
  const sources = r.sources.map((x) => String(x).slice(0, 120)).slice(0, 8)
  const run = { id: crypto.randomBytes(5).toString('hex'), at, questionId: question.id, question: question.text, answer: String(r.reponse).slice(0, 4000), sources, mentions: measure(r.reponse, sources, state.settings.entities), why }
  state.runs.push(run)
  if (state.runs.length > KEEP_RUNS) state.runs = state.runs.slice(-KEEP_RUNS)
  save()
  return run
}

/** Pose toutes les questions (ou une seule) ; s'arrête à la limite du jour */
export async function runQuestions(aiRun, { id = '', why = 'manual' } = {}) {
  if (running) throw Object.assign(new Error('BUSY'), { code: 'BUSY', status: 429 })
  running = true
  const done = []
  try {
    for (const q of state.settings.questions.filter((x) => !id || x.id === id)) {
      try {
        done.push(await ask(q, aiRun, why))
      } catch (err) {
        if (err.code === 'DAY_LIMIT') {
          if (!done.length) throw err
          break
        }
        console.error('Présence IA :', err.message)
        if (!done.length && id) throw Object.assign(new Error('FAILED'), { code: 'FAILED', status: 500 })
      }
    }
  } finally {
    running = false
  }
  return done
}

export function mountGeo(app, dataDir, { aiEnabled, aiRun }) {
  file = path.join(dataDir, 'geo.json')
  load()

  const view = () => {
    const since = Date.now() - 30 * 86_400_000
    const recent = state.runs.filter((r) => Date.parse(r.at) >= since)
    return {
      ai: aiEnabled(),
      running,
      settings: state.settings,
      today: state.day?.key === new Date().toISOString().slice(0, 10) ? state.day.count : 0,
      lastScheduled: state.lastScheduled,
      summary: summarize(recent, state.settings.entities),
      runs: state.runs.slice(-60).reverse(),
    }
  }
  app.get('/api/geo', (_req, res) => res.json(view()))
  app.put('/api/geo/settings', express.json({ limit: '40kb' }), (req, res) => {
    state.settings = cleanSettings(req.body || {})
    save()
    res.json(view())
  })
  app.post('/api/geo/run', express.json({ limit: '2kb' }), async (req, res) => {
    if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
    if (!state.settings.enabled) return res.status(400).json({ error: 'DISABLED' })
    if (!state.settings.questions.length) return res.status(400).json({ error: 'NO_QUESTIONS' })
    try {
      const done = await runQuestions(aiRun, { id: String(req.body?.id || '') })
      res.json({ ...view(), done: done.length })
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  })

  // Passage programmé : une fois par jour ou par semaine, si activé et si une clé IA existe
  const timer = setInterval(() => {
    const s = state.settings
    if (!s.enabled || s.schedule === 'off' || !s.questions.length || !aiEnabled() || running) return
    if (state.lastScheduled && Date.now() - Date.parse(state.lastScheduled) < EVERY[s.schedule]) return
    state.lastScheduled = new Date().toISOString()
    save()
    runQuestions(aiRun, { why: 'schedule' }).catch((err) => console.error('Présence IA (programmée) :', err.message))
  }, CHECK_MS)
  timer.unref?.()
}
