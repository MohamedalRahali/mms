import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

/**
 * Analyse intelligente (التحليل الذكي) : Claude lit les actualités de la période
 * et rend une synthèse en arabe. Le résultat est gardé en mémoire tant que les données ne changent pas.
 * Sans clé Claude, l'analyse passe provisoirement par Gemini (GEMINI_API_KEY, version gratuite),
 * puis par OpenAI (OPENAI_API_KEY) si Gemini est absent, saturé ou en erreur.
 */

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
const OPENAI_MODEL = process.env.MMS_OPENAI_MODEL || 'gpt-4o-mini'
const GEMINI_MODEL = process.env.MMS_GEMINI_MODEL || 'gemini-2.5-flash'
const cache = new Map()

// Prix en dollars par million de jetons (entrée, sortie), pour estimer la dépense de MMS
const PRICES = [
  [/fable|mythos/, 10, 50],
  [/opus-5-5/, 4, 20],
  [/opus/, 5, 25],
  [/sonnet/, 2, 10],
  [/haiku/, 0.1, 0.5],
  [/gpt-4o-mini/, 0.15, 0.6],
  [/gemini/, 0, 0], // version gratuite
]
const price = (model) => PRICES.find(([re]) => re.test(model)) || [null, 4, 20]

let usageFile = ''
let usage = {} // mois (AAAA-MM) → moteur → { runs, input, output, cost }

export function initUsage(dataDir) {
  usageFile = path.join(dataDir, 'ai-usage.json')
  try {
    usage = JSON.parse(fs.readFileSync(usageFile, 'utf8')) || {}
  } catch {
    usage = {}
  }
}

function record(provider, model, input, output) {
  const [, pin, pout] = price(model)
  const month = new Date().toISOString().slice(0, 7)
  const row = ((usage[month] ||= {})[provider] ||= { runs: 0, input: 0, output: 0, cost: 0 })
  row.runs++
  row.input += input
  row.output += output
  row.cost = Math.round((row.cost + (input * pin + output * pout) / 1e6) * 1e4) / 1e4
  try {
    fs.mkdirSync(path.dirname(usageFile), { recursive: true })
    fs.writeFileSync(usageFile, JSON.stringify(usage))
  } catch {
    /* dossier data/ en lecture seule : le compte reste en mémoire */
  }
}

/** Consommation de l'analyse intelligente : mois en cours et total depuis le début */
export function aiUsage() {
  const month = new Date().toISOString().slice(0, 7)
  const total = {}
  for (const byProvider of Object.values(usage))
    for (const [provider, row] of Object.entries(byProvider)) {
      const t = (total[provider] ||= { runs: 0, input: 0, output: 0, cost: 0 })
      t.runs += row.runs
      t.input += row.input
      t.output += row.output
      t.cost = Math.round((t.cost + row.cost) * 1e4) / 1e4
    }
  return { month, current: usage[month] || {}, total }
}

// Les veilles radio et Libye ont déjà leurs clés : on les réutilise si MMS n'a pas les siennes
export function loadKey(root) {
  for (const name of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) {
    if (process.env[name]) continue
    for (const dir of ['../mosaique-radio', '../veille-libye']) {
      try {
        const value = dotenv.parse(fs.readFileSync(path.resolve(root, dir, '.env')))[name]
        if (value) {
          process.env[name] = value
          break
        }
      } catch {
        /* fichier absent ou illisible */
      }
    }
  }
}

export const cached = (key) => cache.get(key) || null

/** 'claude', 'gemini', 'openai' ou '' si aucune clé */
export const aiProvider = () => (process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : '')
export const aiEnabled = () => Boolean(aiProvider())

const SCHEMA = {
  type: 'object',
  properties: {
    synthese: { type: 'string' },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { titre: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
        required: ['titre', 'points'],
        additionalProperties: false,
      },
    },
    a_surveiller: { type: 'array', items: { type: 'string' } },
  },
  required: ['synthese', 'themes', 'a_surveiller'],
  additionalProperties: false,
}

const SYSTEM = `Tu es analyste de veille médias pour la plateforme MMS (veille des médias et réseaux sociaux libyens).
On te donne les actualités d'une période. Rédige en arabe standard, sur un ton neutre et factuel :
- synthese : un paragraphe de 4 à 6 phrases sur ce qui domine la période ;
- themes : 3 à 6 grands thèmes, chacun avec 2 à 4 points précis tirés des actualités ;
- a_surveiller : 2 à 5 sujets à suivre dans les prochains jours.
N'invente aucun fait absent des actualités fournies.`

export async function analyse({ items, key, fluxLabel, days }) {
  if (cache.has(key)) return cache.get(key)
  const lines = items
    .slice(0, 300)
    .map((it) => `- [${it.date.slice(0, 16)}] (${it.category}, ${it.origin}) ${it.title} — ${it.summary}`)
    .join('\n')
  const prompt = `Veille : ${fluxLabel}. Période : ${days} derniers jours. ${items.length} actualités.\n\n${lines}`
  const data = await run(aiProvider(), prompt)
  const result = { ...data, at: new Date().toISOString(), count: items.length }
  cache.set(key, result)
  return result
}

/* Explication d'un pic d'activité (détection des pics) : quelques phrases, sur les fiches du pic */
const SPIKE_SCHEMA = {
  type: 'object',
  properties: { explication: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
  required: ['explication', 'points'],
  additionalProperties: false,
}
const SPIKE = {
  system: `Tu es analyste de veille médias pour la plateforme MMS (médias et réseaux sociaux libyens).
On te signale un pic d'activité : un sujet, une personne ou une source dont les mentions des dernières 24 heures dépassent nettement la moyenne.
Rédige en arabe standard, ton neutre et factuel :
- explication : 2 à 3 phrases qui disent ce qui provoque le pic ;
- points : 2 à 4 faits précis tirés des actualités fournies.
N'invente aucun fait absent des actualités fournies.`,
  schema: SPIKE_SCHEMA,
  format: 'Réponds uniquement par un objet JSON de la forme {"explication": "...", "points": ["...", "..."]}',
  valid: (d) => typeof d.explication === 'string' && Array.isArray(d.points),
  name: 'pic',
}

export async function explainSpike({ key, label, count, avg, items }) {
  if (cache.has(key)) return cache.get(key)
  const lines = items
    .slice(0, 80)
    .map((it) => `- [${it.date.slice(0, 16)}] (${it.origin}) ${it.title} — ${it.summary}`)
    .join('\n')
  const prompt = `Pic : « ${label} ». ${count} mentions sur les dernières 24 heures, contre ${avg} par jour en moyenne la semaine précédente.\n\n${lines}`
  const data = await run(aiProvider(), prompt, SPIKE)
  const result = { ...data, at: new Date().toISOString() }
  cache.set(key, result)
  return result
}

const DEFAULT_SPEC = {
  get system() {
    return SYSTEM
  },
  get schema() {
    return SCHEMA
  },
  get format() {
    return FORMAT
  },
  valid: (d) => typeof d.synthese === 'string' && Array.isArray(d.themes) && Array.isArray(d.a_surveiller),
  name: 'analyse',
}

async function run(provider, prompt, spec = DEFAULT_SPEC) {
  if (provider === 'claude') return withClaude(prompt, spec)
  if (provider === 'gemini') {
    try {
      return await withGemini(prompt, spec)
    } catch (err) {
      // Version gratuite saturée (429) ou autre erreur : OpenAI prend le relais s'il est configuré
      if (!process.env.OPENAI_API_KEY) throw err
      console.error('Gemini indisponible, repli sur OpenAI :', err.message)
    }
  }
  return withOpenAI(prompt, spec)
}

async function withClaude(prompt, spec) {
  let Anthropic
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default
  } catch {
    throw Object.assign(new Error('Module @anthropic-ai/sdk absent : lancez npm install.'), { code: 'NO_SDK' })
  }
  const client = new Anthropic()
  const msg = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      system: spec.system,
      messages: [{ role: 'user', content: prompt }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: spec.schema } },
      // En cas de refus du modèle, le serveur relance sur un modèle de repli.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    .finalMessage()
  record('claude', msg.model || MODEL, msg.usage?.input_tokens || 0, msg.usage?.output_tokens || 0)
  if (msg.stop_reason === 'refusal') throw new Error('Le modèle a refusé la demande.')
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse tronquée.')
  return JSON.parse(msg.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
}

// Environ 25 000 jetons en entrée et 1 500 en sortie : moins d'un centime par analyse avec gpt-4o-mini
async function withOpenAI(prompt, spec) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: spec.system },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: spec.name, strict: true, schema: spec.schema } },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`OpenAI ${res.status} : ${body.error?.message || 'erreur'}`)
  record('openai', body.model || OPENAI_MODEL, body.usage?.prompt_tokens || 0, body.usage?.completion_tokens || 0)
  const choice = body.choices?.[0]
  if (choice?.message?.refusal) throw new Error('Le modèle a refusé la demande.')
  if (choice?.finish_reason === 'length') throw new Error('Réponse tronquée.')
  return JSON.parse(choice?.message?.content || '')
}

const FORMAT = `Réponds uniquement par un objet JSON de la forme
{"synthese": "...", "themes": [{"titre": "...", "points": ["...", "..."]}], "a_surveiller": ["...", "..."]}`

async function withGemini(prompt, spec) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${spec.system}\n${spec.format}` }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 8000 },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gemini ${res.status} : ${body.error?.message || 'erreur'}`)
  record(
    'gemini',
    GEMINI_MODEL,
    body.usageMetadata?.promptTokenCount || 0,
    (body.usageMetadata?.candidatesTokenCount || 0) + (body.usageMetadata?.thoughtsTokenCount || 0),
  )
  const cand = body.candidates?.[0]
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('Réponse tronquée.')
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('')
  const data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  if (!spec.valid(data)) throw new Error('Réponse Gemini incomplète.')
  return data
}

/* ---------------------------------------------------------------- assistant de requête booléenne */

const QUERY = {
  system: `Tu aides les analystes de la plateforme MMS (veille des médias libyens) à écrire une requête de recherche booléenne.
On te décrit en langage courant (arabe, français ou anglais) ce qu'il faut trouver. Rends :
- requete : la requête, avec les opérateurs AND, OR, NOT, des parenthèses et des "expressions exactes".
  Mets les noms propres et les mots-clés en arabe standard ET leurs variantes latines courantes reliées par OR
  (par exemple (الدبيبة OR Dbeibah OR Dbeibeh)). Pas de joker, pas de champ, rien d'autre que ces opérateurs ;
- explication : une phrase, dans la langue de la demande, qui dit ce que la requête cherche.`,
  schema: {
    type: 'object',
    properties: { requete: { type: 'string' }, explication: { type: 'string' } },
    required: ['requete', 'explication'],
    additionalProperties: false,
  },
  format: 'Réponds uniquement par un objet JSON de la forme {"requete": "...", "explication": "..."}',
  valid: (d) => typeof d.requete === 'string' && typeof d.explication === 'string',
  name: 'requete',
}

export async function writeQuery(text) {
  const key = `query|${text}`
  if (cache.has(key)) return cache.get(key)
  const data = await run(aiProvider(), `Demande : ${text}`, QUERY)
  cache.set(key, data)
  return data
}

/* ---------------------------------------------------------------- rapport exécutif */

const BRIEF = {
  system: `Tu rédiges le rapport exécutif hebdomadaire de la plateforme MMS (veille des médias libyens) pour une direction.
On te donne les chiffres de la période, leur évolution et les actualités les plus marquantes. Rédige en arabe standard, ton neutre :
- resume : un paragraphe de 4 à 6 phrases, l'essentiel pour un décideur pressé ;
- faits : 4 à 7 faits marquants, une phrase chacun ;
- tendances : 2 à 4 évolutions par rapport à la période précédente (chiffres à l'appui) ;
- recommandations : 2 à 4 points à surveiller ou actions de communication.
N'invente aucun fait absent des données fournies.`,
  schema: {
    type: 'object',
    properties: {
      resume: { type: 'string' },
      faits: { type: 'array', items: { type: 'string' } },
      tendances: { type: 'array', items: { type: 'string' } },
      recommandations: { type: 'array', items: { type: 'string' } },
    },
    required: ['resume', 'faits', 'tendances', 'recommandations'],
    additionalProperties: false,
  },
  format: 'Réponds uniquement par un objet JSON de la forme {"resume": "...", "faits": ["..."], "tendances": ["..."], "recommandations": ["..."]}',
  valid: (d) => typeof d.resume === 'string' && Array.isArray(d.faits) && Array.isArray(d.tendances) && Array.isArray(d.recommandations),
  name: 'rapport',
}

export async function briefingSummary({ key, facts, items }) {
  if (cache.has(key)) return cache.get(key)
  const lines = items
    .slice(0, 150)
    .map((it) => `- [${it.date.slice(0, 10)}] (${it.category}, ${it.origin}) ${it.title} — ${it.summary}`)
    .join('\n')
  const data = await run(aiProvider(), `${facts}\n\nActualités marquantes :\n${lines}`, BRIEF)
  const result = { ...data, at: new Date().toISOString() }
  cache.set(key, result)
  return result
}

/* ---------------------------------------------------------------- tâches de fond économiques */

/**
 * Moteur économique pour les tâches de fond (correction des acteurs) : Gemini (version gratuite) en priorité, sinon
 * le moteur configuré. Comptée dans la consommation de l'IA comme le reste.
 */
export async function runEconomy(prompt, spec) {
  if (process.env.GEMINI_API_KEY) return withGemini(prompt, spec)
  return run(aiProvider(), prompt, spec)
}

/* ---------------------------------------------------------------- Around (réponses et agents) */

/** Lance une consigne d'Around sur le moteur disponible ; même cache que le reste de l'IA */
export async function aroundRun(key, prompt, spec, { economy = false } = {}) {
  if (cache.has(key)) return cache.get(key)
  // Types d'analyse : moteur économique (Gemini gratuit en priorité), même cache
  const data = economy ? await runEconomy(prompt, spec) : await run(aiProvider(), prompt, spec)
  const result = { ...data, at: new Date().toISOString() }
  cache.set(key, result)
  return result
}
