import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

/**
 * Moteurs d'IA de MMS (analyse, Around, rapport exécutif, correction des acteurs).
 *
 * Audit produit v4 (30/10/2026) : les données des clients ne doivent pas servir à entraîner un modèle. Moteurs pris en
 * charge, tous réglés par .env (voir .env.example) :
 *   - claude : API Anthropic (ANTHROPIC_API_KEY) — données non réutilisées pour l'entraînement ;
 *   - vertex : Gemini sur Google Cloud Vertex AI (MMS_VERTEX_PROJECT + compte de service GOOGLE_APPLICATION_CREDENTIALS,
 *     ou VERTEX_API_KEY) — offre payante, données non réutilisées ;
 *   - gemini : clé de l'API Gemini (GEMINI_API_KEY). Données non réutilisées SEULEMENT si la facturation est activée
 *     sur le projet : le déclarer avec MMS_GEMINI_TIER=paid. Sans cette déclaration, ou si Google répond par un quota
 *     « free_tier », la clé est traitée comme gratuite (données pouvant être réutilisées par Google) et signalée ;
 *   - openai : API OpenAI (OPENAI_API_KEY) — données non réutilisées par défaut ;
 *   - local : modèle hébergé compatible OpenAI (Ollama, vLLM…) : MMS_LLM_BASE_URL, MMS_LLM_MODEL, MMS_LLM_API_KEY.
 * MMS_AI_PROVIDER force le moteur principal, MMS_AI_ECONOMY_PROVIDER celui des tâches de fond ; sinon le premier moteur
 * configuré « sans réutilisation » est pris, et la clé Gemini gratuite seulement en dernier recours
 * (ou en premier pour les tâches de fond si MMS_AI_ALLOW_FREE=1). L'état est montré au Super Admin (aiStatus).
 */

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
const OPENAI_MODEL = process.env.MMS_OPENAI_MODEL || 'gpt-4o-mini'
// gemini-2.5-flash a été retiré par Google (404 « no longer available », 29/10/2026) : si le modèle demandé
// disparaît à son tour, withGemini en choisit un autre dans la liste des modèles du compte
const GEMINI_MODEL = process.env.MMS_GEMINI_MODEL || 'gemini-3.8-flash'
let geminiActive = GEMINI_MODEL
const cache = new Map()

// Prix en dollars par million de jetons (entrée, sortie), pour estimer la dépense de MMS
const PRICES = [
  [/fable|mythos/, 10, 50],
  [/opus-5-5/, 4, 20],
  [/opus/, 5, 25],
  [/sonnet/, 2, 10],
  [/haiku/, 0.1, 0.5],
  [/gpt-4o-mini/, 0.15, 0.6],
  [/^gemini-free/, 0, 0], // version gratuite
  [/gemini.*pro/, 1.25, 10],
  [/gemini/, 0.3, 2.5], // Gemini « flash » payant (Vertex AI ou clé facturée)
  [/^local/, 0, 0], // modèle hébergé : pas de coût à l'appel
]
const price = (model) => PRICES.find(([re]) => re.test(model)) || [null, 4, 20]

let usageFile = ''
let usage = {} // mois (AAAA-MM) → moteur → { runs, input, output, cost }

export function initUsage(dataDir) {
  usageFile = path.join(dataDir, 'ai-usage.json')
  aiSettingsFile = path.join(dataDir, 'superadmin', 'ai-settings.json')
  try {
    aiSettings = JSON.parse(fs.readFileSync(aiSettingsFile, 'utf8')) || {}
  } catch {
    aiSettings = {}
  }
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

/* ---------------------------------------------------------------- choix du moteur */

const ENGINES = ['claude', 'vertex', 'local', 'gemini', 'openai']
// Clé Gemini vue en offre gratuite (réponse 429 « free_tier ») : gardé jusqu'au redémarrage
let geminiFreeSeen = ''

/** Moteur configuré (clé ou adresse présente) */
export function engineConfigured(id) {
  const e = process.env
  if (id === 'claude') return Boolean(e.ANTHROPIC_API_KEY)
  if (id === 'vertex') return Boolean(e.MMS_VERTEX_PROJECT && (e.VERTEX_API_KEY || e.GOOGLE_APPLICATION_CREDENTIALS)) || Boolean(e.VERTEX_API_KEY)
  if (id === 'local') return /^https?:\/\//i.test(e.MMS_LLM_BASE_URL || '')
  if (id === 'gemini') return Boolean(e.GEMINI_API_KEY)
  if (id === 'openai') return Boolean(e.OPENAI_API_KEY)
  return false
}

/** Offre de la clé Gemini : 'paid' (déclarée payante et jamais vue gratuite), 'free' (vue gratuite) ou 'unknown' */
export function geminiTier() {
  if (geminiFreeSeen) return 'free'
  // Déclarée payante dans .env (MMS_GEMINI_TIER=paid) ou par le Super Admin (data/superadmin/ai-settings.json)
  return String(process.env.MMS_GEMINI_TIER || '').toLowerCase() === 'paid' || aiSettings.geminiPaid === true ? 'paid' : 'unknown'
}

/* Réglages de l'IA faits dans la console Super Admin (sans accès au serveur) : facturation de la clé Gemini confirmée */
let aiSettingsFile = ''
let aiSettings = {}
export const aiSettingsOf = () => ({ ...aiSettings })
export function setGeminiPaid(on, by = '') {
  aiSettings = { ...aiSettings, geminiPaid: on === true, by: String(by).slice(0, 120), at: new Date().toISOString() }
  // Nouvelle déclaration : l'alerte « free_tier » vue avant est oubliée ; elle reviendra si Google répond encore « free_tier »
  if (on === true) geminiFreeSeen = ''
  if (aiSettingsFile) {
    fs.mkdirSync(path.dirname(aiSettingsFile), { recursive: true })
    fs.writeFileSync(aiSettingsFile, JSON.stringify(aiSettings, null, 1))
  }
  return aiSettingsOf()
}

/** Le moteur garantit-il que les données envoyées ne servent pas à l'entraînement ? */
export const noReuse = (id) => (id === 'gemini' ? geminiTier() === 'paid' : ENGINES.includes(id))

function pick(forced, order) {
  const f = String(forced || '').toLowerCase()
  if (ENGINES.includes(f) && engineConfigured(f)) return f
  return order.find((id) => engineConfigured(id) && noReuse(id)) || (engineConfigured('gemini') ? 'gemini' : '')
}

/** Moteur principal : 'claude', 'vertex', 'local', 'gemini', 'openai' ou '' si aucun */
export const aiProvider = () => pick(process.env.MMS_AI_PROVIDER, ['claude', 'vertex', 'local', 'gemini', 'openai'])
export const aiEnabled = () => Boolean(aiProvider())

/** Moteur des tâches de fond (correction des acteurs, analyses Around rapides) : le moins cher sans réutilisation */
export function economyProvider() {
  if (process.env.MMS_AI_ALLOW_FREE === '1' && engineConfigured('gemini') && !process.env.MMS_AI_ECONOMY_PROVIDER) return 'gemini'
  return pick(process.env.MMS_AI_ECONOMY_PROVIDER, ['local', 'vertex', 'gemini', 'claude', 'openai'])
}

const ENGINE_LABEL = { claude: 'Claude (Anthropic API)', vertex: 'Gemini — Google Cloud Vertex AI', local: 'Modèle hébergé (compatible OpenAI)', gemini: 'Gemini — clé API Google AI Studio', openai: 'OpenAI API' }

/** État des moteurs pour le Super Admin : configurés, réutilisation des données, moteurs retenus, alertes */
export function aiStatus() {
  const main = aiProvider()
  const economy = economyProvider()
  const engines = ENGINES.map((id) => ({
    id,
    label: ENGINE_LABEL[id],
    configured: engineConfigured(id),
    noReuse: noReuse(id),
    tier: id === 'gemini' ? geminiTier() : 'paid',
    model: modelOf(id),
  }))
  const warnings = []
  const used = [...new Set([main, economy].filter(Boolean))]
  for (const id of used)
    if (!noReuse(id))
      warnings.push(
        geminiTier() === 'free'
          ? 'GEMINI_FREE_DETECTED' // Google a répondu par un quota « free_tier » : la clé est en offre gratuite
          : 'GEMINI_TIER_UNKNOWN', // clé Gemini non déclarée payante (MMS_GEMINI_TIER=paid)
      )
  if (!main) warnings.push('NO_ENGINE')
  return { main, economy, engines, warnings: [...new Set(warnings)], freeSeen: geminiFreeSeen, settings: aiSettingsOf(), geminiConfigured: engineConfigured('gemini') }
}

function modelOf(id) {
  if (id === 'claude') return MODEL
  if (id === 'vertex') return process.env.MMS_VERTEX_MODEL || geminiActive
  if (id === 'local') return process.env.MMS_LLM_MODEL || 'llama3.1'
  if (id === 'gemini') return geminiActive
  if (id === 'openai') return OPENAI_MODEL
  return ''
}

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

/**
 * Erreur du moteur d'IA avec une cause lisible pour l'interface :
 * KEY (clé refusée), QUOTA (quota ou crédit épuisé), MODEL (modèle introuvable), TIMEOUT, TRUNCATED, REFUSED, PARSE, PROVIDER
 */
export class AIError extends Error {
  constructor(reason, message) {
    super(message)
    this.reason = reason
  }
}

function httpError(provider, status, message) {
  const m = String(message || 'erreur')
  const reason =
    status === 429 || /quota|exhausted|billing|credit/i.test(m)
      ? 'QUOTA'
      : status === 401 || status === 403 || /api key|api_key/i.test(m)
        ? 'KEY'
        : status === 404 || /no longer available|not found|is not supported/i.test(m)
          ? 'MODEL'
          : 'PROVIDER'
  return new AIError(reason, `${provider} ${status} : ${m}`)
}

/** Cause d'une erreur quelconque (réseau, délai, JSON…) */
export function aiReason(err) {
  if (err instanceof AIError) return err.reason
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'TIMEOUT'
  if (err instanceof SyntaxError) return 'PARSE'
  if (err?.status) return httpError('', err.status, err.message).reason
  return 'PROVIDER'
}

/** JSON d'une réponse de modèle, même entouré de ``` ou de texte */
function parseJson(text) {
  const raw = String(text || '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')
  try {
    return JSON.parse(raw)
  } catch {
    const a = raw.indexOf('{')
    const b = raw.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(raw.slice(a, b + 1))
    throw new SyntaxError('Réponse illisible (JSON attendu).')
  }
}

async function run(provider, prompt, spec = DEFAULT_SPEC, opts = {}) {
  if (provider === 'claude') return withClaude(prompt, spec, opts)
  if (provider === 'vertex') return withGemini(prompt, spec, 'vertex')
  if (provider === 'local') return withOpenAI(prompt, spec, 'local')
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

async function withClaude(prompt, spec, { economy = false } = {}) {
  // Tâches de fond : modèle économique (Haiku) pour que la correction des acteurs coûte quelques centimes
  const model = economy ? process.env.MMS_CLAUDE_ECONOMY_MODEL || 'claude-haiku-5-5' : MODEL
  let Anthropic
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default
  } catch {
    throw Object.assign(new Error('Module @anthropic-ai/sdk absent : lancez npm install.'), { code: 'NO_SDK' })
  }
  const client = new Anthropic()
  const msg = await client.beta.messages
    .stream({
      model,
      max_tokens: 16000,
      system: spec.system,
      messages: [{ role: 'user', content: prompt }],
      ...(economy ? {} : { thinking: { type: 'adaptive' } }),
      output_config: { ...(economy ? {} : { effort: 'medium' }), format: { type: 'json_schema', schema: spec.schema } },
      // En cas de refus du modèle, le serveur relance sur un modèle de repli.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    .finalMessage()
  record('claude', msg.model || model, msg.usage?.input_tokens || 0, msg.usage?.output_tokens || 0)
  if (msg.stop_reason === 'refusal') throw new AIError('REFUSED', 'Le modèle a refusé la demande.')
  if (msg.stop_reason === 'max_tokens') throw new AIError('TRUNCATED', 'Réponse tronquée.')
  return parseJson(msg.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
}

// Environ 25 000 jetons en entrée et 1 500 en sortie : moins d'un centime par analyse avec gpt-4o-mini.
// kind 'local' : même protocole vers un modèle hébergé compatible OpenAI (Ollama, vLLM, LM Studio…)
async function withOpenAI(prompt, spec, kind = 'openai') {
  const local = kind === 'local'
  const base = local ? String(process.env.MMS_LLM_BASE_URL).replace(/\/+$/, '') : 'https://api.openai.com/v1'
  const key = local ? process.env.MMS_LLM_API_KEY : process.env.OPENAI_API_KEY
  const model = local ? process.env.MMS_LLM_MODEL || 'llama3.1' : OPENAI_MODEL
  const call = (format) =>
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: local ? 8000 : 4000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: local ? `${spec.system}\n${spec.format || FORMAT}` : spec.system },
          { role: 'user', content: prompt },
        ],
        response_format: format,
      }),
      signal: AbortSignal.timeout(local ? 300_000 : 120_000),
    })
  let res = await call({ type: 'json_schema', json_schema: { name: spec.name, strict: true, schema: spec.schema } })
  // Certains serveurs locaux ne connaissent que le mode JSON simple
  if (local && res.status === 400) res = await call({ type: 'json_object' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError(local ? 'Modèle local' : 'OpenAI', res.status, body.error?.message)
  record(kind, local ? `local-${model}` : body.model || OPENAI_MODEL, body.usage?.prompt_tokens || 0, body.usage?.completion_tokens || 0)
  const choice = body.choices?.[0]
  if (choice?.message?.refusal) throw new AIError('REFUSED', 'Le modèle a refusé la demande.')
  if (choice?.finish_reason === 'length') throw new AIError('TRUNCATED', 'Réponse tronquée.')
  return parseJson(choice?.message?.content || '')
}

const FORMAT = `Réponds uniquement par un objet JSON de la forme
{"synthese": "...", "themes": [{"titre": "...", "points": ["...", "..."]}], "a_surveiller": ["...", "..."]}`

/** Rang d'un modèle Gemini pour le repli : version la plus récente, « flash » stable avant les préversions */
function geminiRank(name) {
  const v = Number((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0)
  return v * 10 + (/preview|exp/.test(name) ? 0 : 5) - (/lite/.test(name) ? 2 : 0)
}

/** Modèle Gemini de repli : le meilleur « flash » texte du compte qui accepte generateContent */
async function nextGeminiModel(failed) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError('Gemini', res.status, body.error?.message)
  const names = (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/image|tts|audio|live|embedding/.test(n) && n !== failed)
    .sort((x, y) => geminiRank(y) - geminiRank(x))
  return names[0] || ''
}

/* Vertex AI : jeton OAuth du compte de service (JWT signé RS256), gardé jusqu'à 5 minutes avant son expiration */
let vertexToken = { value: '', exp: 0 }
async function vertexAuth() {
  if (process.env.VERTEX_API_KEY) return { 'x-goog-api-key': process.env.VERTEX_API_KEY }
  if (vertexToken.value && vertexToken.exp > Date.now() + 300_000) return { authorization: `Bearer ${vertexToken.value}` }
  let sa
  try {
    sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))
  } catch {
    throw new AIError('KEY', 'Vertex AI : fichier du compte de service illisible (GOOGLE_APPLICATION_CREDENTIALS).')
  }
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new AIError('KEY', `Vertex AI : jeton refusé (${body.error_description || body.error || res.status}).`)
  vertexToken = { value: body.access_token, exp: Date.now() + (Number(body.expires_in) || 3600) * 1000 }
  return { authorization: `Bearer ${vertexToken.value}` }
}

function vertexUrl(model) {
  const loc = process.env.MMS_VERTEX_LOCATION || 'global'
  const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`
  const m = encodeURIComponent(model)
  // Mode express (clé Vertex sans projet) ou projet Google Cloud
  if (!process.env.MMS_VERTEX_PROJECT) return `https://${host}/v1/publishers/google/models/${m}:generateContent`
  return `https://${host}/v1/projects/${encodeURIComponent(process.env.MMS_VERTEX_PROJECT)}/locations/${loc}/publishers/google/models/${m}:generateContent`
}

async function geminiCall(model, prompt, spec, kind = 'gemini') {
  const url = kind === 'vertex' ? vertexUrl(model) : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const auth = kind === 'vertex' ? await vertexAuth() : { 'x-goog-api-key': process.env.GEMINI_API_KEY }
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${spec.system}\n${spec.format}` }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // Les modèles récents réfléchissent avant de répondre : la marge évite les réponses tronquées
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 32000 },
    }),
    signal: AbortSignal.timeout(150_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Quota « free_tier » : la clé AI Studio est en offre gratuite (données pouvant être réutilisées par Google)
    if (kind === 'gemini' && res.status === 429 && /free_tier|free tier/i.test(JSON.stringify(body.error || ''))) geminiFreeSeen = new Date().toISOString()
    throw httpError(kind === 'vertex' ? 'Vertex AI' : 'Gemini', res.status, body.error?.message)
  }
  return body
}

async function withGemini(prompt, spec, kind = 'gemini') {
  let body
  if (kind === 'vertex') {
    const model = process.env.MMS_VERTEX_MODEL || geminiActive
    body = await geminiCall(model, prompt, spec, 'vertex')
    record('vertex', model, body.usageMetadata?.promptTokenCount || 0, (body.usageMetadata?.candidatesTokenCount || 0) + (body.usageMetadata?.thoughtsTokenCount || 0))
    return geminiResult(body, spec)
  }
  try {
    body = await geminiCall(geminiActive, prompt, spec)
  } catch (err) {
    if (aiReason(err) !== 'MODEL') throw err
    // Modèle retiré ou inconnu : on prend le meilleur modèle disponible et on le garde pour la suite
    const next = await nextGeminiModel(geminiActive)
    if (!next) throw err
    console.error(`Gemini : modèle ${geminiActive} indisponible, passage à ${next}`)
    geminiActive = next
    body = await geminiCall(geminiActive, prompt, spec)
  }
  record(
    'gemini',
    noReuse('gemini') ? geminiActive : `gemini-free:${geminiActive}`,
    body.usageMetadata?.promptTokenCount || 0,
    (body.usageMetadata?.candidatesTokenCount || 0) + (body.usageMetadata?.thoughtsTokenCount || 0),
  )
  return geminiResult(body, spec)
}

function geminiResult(body, spec) {
  const cand = body.candidates?.[0]
  if (!cand && body.promptFeedback?.blockReason) throw new AIError('REFUSED', `Gemini : demande bloquée (${body.promptFeedback.blockReason}).`)
  if (cand?.finishReason === 'MAX_TOKENS') throw new AIError('TRUNCATED', 'Réponse tronquée.')
  if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') throw new AIError('REFUSED', 'Gemini a bloqué la réponse.')
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('')
  const data = parseJson(text)
  if (!spec.valid(data)) throw new AIError('PARSE', 'Réponse Gemini incomplète.')
  return data
}

/** Modèle Gemini réellement utilisé (pour la console) */
export const geminiModel = () => geminiActive

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
 * Moteur économique pour les tâches de fond (correction des acteurs, analyses rapides) : economyProvider(), sans
 * réutilisation des données sauf si rien d'autre n'est configuré. En panne, le moteur principal prend le relais.
 * Comptée dans la consommation de l'IA comme le reste.
 */
export async function runEconomy(prompt, spec) {
  const first = economyProvider()
  try {
    return await run(first, prompt, spec, { economy: true })
  } catch (err) {
    const other = aiProvider()
    if (!other || other === first) throw err
    console.error(`IA ${first} indisponible, repli sur ${other} :`, err.message)
    return run(other, prompt, spec)
  }
}

/* ---------------------------------------------------------------- Around (réponses et agents) */

/** Lance une consigne d'Around sur le moteur disponible ; même cache que le reste de l'IA */
export async function aroundRun(key, prompt, spec, { economy = false } = {}) {
  if (cache.has(key)) return cache.get(key)
  // Types d'analyse : moteur économique (sans réutilisation des données), même cache
  const data = economy ? await runEconomy(prompt, spec) : await run(aiProvider(), prompt, spec)
  const result = { ...data, at: new Date().toISOString() }
  cache.set(key, result)
  return result
}
