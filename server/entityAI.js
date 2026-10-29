import fs from 'node:fs'
import path from 'node:path'
import { lookup, norm, setAiEntities } from './entities.js'

/**
 * Correction automatique des personnalités et des institutions par l'IA (demande du client, 29/10).
 *
 * Une fois par jour (et à la demande, console Super Admin), les noms bruts les plus cités sur 30 jours qui ne sont
 * pas encore connus du référentiel sont envoyés au modèle économique (Gemini, gratuit ; sinon le moteur configuré),
 * avec deux titres d'exemple chacun. Il rend pour chaque nom : le nom canonique (fusion des variantes d'écriture),
 * le type (personne, institution, lieu, autre), la nationalité (ليبي / أجنبي), la fonction, ou le rejet (pas un nom
 * de personne, prénom seul, extraction erronée). Les décisions s'appliquent à tous les classements, parts de voix et
 * comparaisons, sur toute la période (les chiffres passés sont recomptés avec les mêmes noms).
 *
 * Rien n'est supprimé des fiches : la correction est une couche au-dessus des entités brutes. Le référentiel saisi à
 * la main reste prioritaire, et chaque décision de l'IA peut être corrigée ou annulée dans la console Super Admin.
 * Stockage : data/superadmin/entity-ai.json. Budget : au plus MMS_ENTITY_AI_RUNS passages par jour (2 par défaut),
 * 150 noms par passage.
 */

const BATCH = 150
const DAY = 86_400_000
let file = ''
let state = { decisions: {}, runs: [] }
let running = false

const save = () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
  fs.renameSync(tmp, file)
}

/** Décisions en vigueur (celles du Super Admin l'emportent sur celles de l'IA) */
export const entityDecisions = () => Object.values(state.decisions)

const apply = () => setAiEntities(Object.values(state.decisions))

export function initEntityAI(dir) {
  file = path.join(dir, 'entity-ai.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    state = { decisions: saved.decisions || {}, runs: saved.runs || [] }
  } catch {
    state = { decisions: {}, runs: [] }
  }
  apply()
}

const TYPES = ['person', 'org', 'place', 'other']

export function cleanDecision(d, source = 'ai') {
  const raw = String(d?.name || d?.raw || '').trim().slice(0, 120)
  if (!raw) return null
  const reject = d.reject === true || d.type === 'other'
  return {
    raw,
    canonical: reject ? '' : String(d.canonical || raw).trim().slice(0, 120),
    type: TYPES.includes(d.type) ? d.type : 'person',
    libyan: d.libyan === true,
    role: String(d.role || '').trim().slice(0, 120),
    reject,
    reason: String(d.reason || '').trim().slice(0, 200),
    source,
    at: new Date().toISOString(),
  }
}

/** Noms bruts les plus cités (30 jours) sans entrée au référentiel ni décision, avec deux titres d'exemple */
export function candidates(items, { now = Date.now(), limit = BATCH } = {}) {
  const since = now - 30 * DAY
  const seen = new Map()
  for (const it of items) {
    if (Date.parse(it.date) < since) continue
    const raw = it._raw || it
    for (const [kind, list] of [['person', raw.people], ['org', raw.orgs]])
      for (const n of list || []) {
        const name = String(n || '').trim()
        if (!name || name.length < 3) continue
        const k = norm(name)
        if (state.decisions[k] || lookup(name)) continue
        const row = seen.get(k) || { name, kind, count: 0, titles: [] }
        row.count++
        if (row.titles.length < 2 && it.title && !row.titles.includes(it.title)) row.titles.push(String(it.title).slice(0, 140))
        seen.set(k, row)
      }
  }
  return [...seen.values()].filter((r) => r.count >= 2).sort((a, b) => b.count - a.count).slice(0, limit)
}

const SPEC = {
  name: 'entites',
  system: `Tu corriges la liste des acteurs extraits automatiquement des actualités libyennes (plateforme MMS).
Pour chaque nom fourni (avec son type supposé, son nombre de mentions et des titres d'exemple), décide :
- canonical : le nom complet et usuel en arabe (ex. « فوزي بوخزام » et « فوزي مصباح أبوخزام » → « فوزي أبوخزام » ; « ترمب » → « دونالد ترامب ») ; garde le même nom s'il est déjà correct ;
- type : person (personne), org (institution, ministère, parti, entreprise, organisation), place (lieu), other (ni l'un ni l'autre) ;
- libyan : true si la personne ou l'institution est libyenne, false sinon ;
- role : fonction courte en arabe (ex. « رئيس حكومة الوحدة الوطنية »), vide si inconnue ;
- reject : true si ce n'est pas un acteur réel (prénom seul, titre générique comme « الرئيس » ou « الوزير », média, mot isolé, erreur d'extraction) ;
- reason : une raison courte quand reject est true ou quand le nom est fusionné.
Ne devine pas : en cas de doute, garde le nom tel quel avec reject false. N'invente aucune personne.`,
  format: `Réponds uniquement par un objet JSON {"entites": [{"name": "...", "canonical": "...", "type": "person", "libyan": true, "role": "...", "reject": false, "reason": "..."}]}`,
  schema: {
    type: 'object',
    properties: {
      entites: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            canonical: { type: 'string' },
            type: { type: 'string', enum: TYPES },
            libyan: { type: 'boolean' },
            role: { type: 'string' },
            reject: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['name', 'canonical', 'type', 'libyan', 'role', 'reject', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['entites'],
    additionalProperties: false,
  },
  valid: (d) => Array.isArray(d?.entites),
}

/**
 * Un passage : envoie les candidats au modèle et enregistre ses décisions. runAI(prompt, spec) fourni par l'appelant
 * (server/ai.js). Plafond : MMS_ENTITY_AI_RUNS passages par jour (heure de Tripoli).
 */
export async function runEntityAI(items, runAI, { manual = false } = {}) {
  if (running) return { skipped: 'RUNNING' }
  const today = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10)
  const max = Math.max(Number(process.env.MMS_ENTITY_AI_RUNS) || 2, 1)
  const done = state.runs.filter((r) => r.at.slice(0, 10) === today && !r.error).length
  if (done >= max) return { skipped: 'DAILY_CAP', max }
  const list = candidates(items)
  if (!list.length) return { skipped: 'NOTHING_NEW' }
  running = true
  const run = { at: new Date(Date.now() + 2 * 3_600_000).toISOString(), names: list.length, manual }
  try {
    const prompt = list.map((r) => `- ${r.name} (${r.kind === 'org' ? 'institution ?' : 'personne ?'}, ${r.count} mentions) : ${r.titles.join(' | ')}`).join('\n')
    const out = await runAI(`Noms à corriger :\n${prompt}`, SPEC)
    const asked = new Set(list.map((r) => norm(r.name)))
    let applied = 0
    for (const d of out.entites || []) {
      const c = cleanDecision(d)
      if (!c || !asked.has(norm(c.raw))) continue
      const k = norm(c.raw)
      if (state.decisions[k]?.source === 'admin') continue
      state.decisions[k] = c
      applied++
    }
    run.applied = applied
    run.merged = (out.entites || []).filter((d) => !d.reject && d.canonical && norm(d.canonical) !== norm(d.name)).length
    run.rejected = (out.entites || []).filter((d) => d.reject).length
    apply()
    return run
  } catch (err) {
    run.error = String(err.message || err).slice(0, 200)
    throw err
  } finally {
    running = false
    state.runs = [run, ...state.runs].slice(0, 60)
    save()
  }
}

/** Correction du Super Admin : remplace la décision de l'IA (ou l'annule avec remove) */
export function setDecision(raw, patch) {
  const k = norm(raw)
  if (!k) return null
  if (patch?.remove) delete state.decisions[k]
  else state.decisions[k] = cleanDecision({ ...(state.decisions[k] || {}), ...patch, name: raw }, 'admin')
  save()
  apply()
  return state.decisions[k] || null
}

export const entityAIState = () => ({ runs: state.runs.slice(0, 20), decisions: Object.values(state.decisions).sort((a, b) => a.raw.localeCompare(b.raw)) })

/** Passage quotidien (vers 3 h, heure de Tripoli), si un moteur IA est configuré */
export function startEntityAI(getItems, runAI, enabled) {
  const tick = () => {
    const h = new Date(Date.now() + 2 * 3_600_000).getUTCHours()
    if (h !== 3 || !enabled()) return
    runEntityAI(getItems().items, runAI).catch((err) => console.error('Correction des acteurs (IA) :', err.message))
  }
  setInterval(tick, 20 * 60_000).unref()
}
