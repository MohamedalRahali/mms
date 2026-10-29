import fs from 'node:fs'
import path from 'node:path'
import { setSourceMeta } from './sourceMeta.js'
import { ACCENT_RE, LOGO_RE, brandOf, saveBrand } from './brand.js'
import { imageKind } from './reports.js'
import { createApiKey, listApiKeys, revokeApiKey } from './apiKeys.js'
import { listShares, revokeShare } from './shares.js'
import { mailPolicy, setMailPolicy } from './mailPolicy.js'
import { mfaPolicy, setMfaPolicy } from './mfa.js'
import { applyMailPolicyToWatches } from './watches.js'
import { applyMailPolicyToBriefing } from './briefing.js'
import { listEntities, saveEntities } from './entities.js'
import { setSourcePolicy, sourcePolicy } from './sourcePolicy.js'
import { getItems, refreshSourcePolicy } from './store.js'
import { entityAIState, runEntityAI, setDecision } from './entityAI.js'
import { aiEnabled, aiProvider, runEconomy } from './ai.js'
import { reviewOption, setReviewOption } from './alertFlow.js'

/**
 * Réglages de la console Super Admin ajoutés avec la liste d'actualités enrichie :
 * pays et portée des sources, logo et nom du client (en tête des tableaux de bord), clés d'API des clients,
 * et vue d'ensemble des liens de partage (révocables d'ici aussi).
 */

const MAX_LOGO = 400_000 // caractères de l'URL data: (≈ 300 Ko d'image)
// Identité des livrables : état dans server/brand.js (lu aussi par les rapports, les veilles et le rapport exécutif)
export { brandOf, initBrand } from './brand.js'

const fail = (res, status, error) => res.status(status).json({ error })

/** Routes de la console, montées sur le routeur /api/superadmin après son contrôle du jeton */
export function mountClientAdmin(sa, { audit }) {
  sa.put('/sources/meta', (req, res) => {
    const name = String(req.body?.name || '').slice(0, 200)
    if (!name) return fail(res, 400, 'NO_NAME')
    const row = setSourceMeta(name, { country: req.body?.country, reach: req.body?.reach, reliability: req.body?.reliability })
    audit(req, 'source_meta', name, row ? `${row.country || '—'} · ${row.reach ?? 'افتراضي'} · ${row.reliability || 'موثوقية افتراضية'}` : 'افتراضي')
    res.json({ meta: row })
  })

  sa.get('/brand', (_req, res) => res.json({ brand: brandOf() }))
  sa.put('/brand', (req, res) => {
    const cur = brandOf()
    const name = String(req.body?.name ?? cur.name).trim().slice(0, 120)
    const logo = req.body?.logo === undefined ? cur.logo : String(req.body.logo || '')
    if (logo && (logo.length > MAX_LOGO || !LOGO_RE.test(logo))) return fail(res, 400, 'BAD_LOGO')
    // Type réel du logo vérifié sur ses premiers octets, comme la photo de profil (un SVG ou un exécutable renommé est refusé)
    if (logo && logo !== cur.logo && !imageKind(Buffer.from(logo.split(',')[1], 'base64'))) return fail(res, 400, 'BAD_LOGO')
    // Nom affiché de l'assistant IA (« Around » par défaut), au nom du Centre si le client le souhaite
    const assistant = String(req.body?.assistant ?? cur.assistant ?? '').trim().slice(0, 40)
    const accent = req.body?.accent === undefined ? cur.accent : String(req.body.accent || '').trim()
    if (accent && !ACCENT_RE.test(accent)) return fail(res, 400, 'BAD_ACCENT')
    const whiteLabel = req.body?.whiteLabel === undefined ? cur.whiteLabel : req.body.whiteLabel === true
    const next = saveBrand({ name, logo, assistant, accent, whiteLabel })
    audit(req, 'brand', name || '—', `${logo ? 'logo' : 'sans logo'} · ${accent || 'couleur d’origine'} · ${whiteLabel ? 'marque blanche' : 'marque Around'}`)
    res.json({ brand: next })
  })

  sa.get('/apikeys', (_req, res) => res.json({ keys: listApiKeys() }))
  sa.post('/apikeys', (req, res) => {
    try {
      const { key, row } = createApiKey({ name: req.body?.name, rate: req.body?.rate })
      audit(req, 'apikey_create', row.name, row.prefix)
      res.status(201).json({ key, row })
    } catch (err) {
      fail(res, err.status || 500, err.code || 'FAILED')
    }
  })
  sa.delete('/apikeys/:id', (req, res) => {
    const row = revokeApiKey(String(req.params.id))
    if (!row) return fail(res, 404, 'NOT_FOUND')
    audit(req, 'apikey_revoke', row.name, row.prefix)
    res.json({ row })
  })

  /* ---- diffusion : domaines destinataires autorisés, adresses mises de côté */
  const blockedNow = () => ({ watches: applyMailPolicyToWatches(), briefing: applyMailPolicyToBriefing() })
  // Politique des sources sociales : comptes et fils écartés, liste blanche des forums
  sa.get('/source-policy', (_req, res) => res.json({ policy: sourcePolicy() }))
  sa.put('/source-policy', (req, res) => {
    const policy = setSourcePolicy(req.body || {})
    refreshSourcePolicy()
    audit(req, 'source_policy', `${policy.blocked.length} écartées, ${policy.forumAllow.length} forums autorisés`)
    res.json({ policy })
  })
  sa.get('/mail-policy', (_req, res) => res.json({ policy: mailPolicy(), blocked: blockedNow() }))
  sa.put('/mail-policy', (req, res) => {
    try {
      const policy = setMailPolicy(req.body || {})
      audit(req, 'mail_policy', policy.domains.join(', '))
      res.json({ policy, blocked: blockedNow() })
    } catch (err) {
      fail(res, err.status || 500, err.code || 'FAILED')
    }
  })

  /* ---- validation des alertes critiques par un analyste avant envoi */
  sa.get('/alert-review', (_req, res) => res.json({ review: reviewOption() }))
  sa.put('/alert-review', (req, res) => {
    const review = setReviewOption(req.body || {})
    audit(req, 'alert_review', review.critical ? 'on' : 'off')
    res.json({ review })
  })

  /* ---- double authentification : règle */
  sa.get('/mfa-policy', (_req, res) => res.json({ policy: mfaPolicy() }))
  sa.put('/mfa-policy', (req, res) => {
    const policy = setMfaPolicy(req.body || {})
    audit(req, 'mfa_policy', policy.requireAll ? 'all' : policy.requireAdmins ? 'admins' : 'off')
    res.json({ policy })
  })

  /* ---- référentiel des entités (acteurs, institutions, lieux, médias) */
  sa.get('/entities', (_req, res) => res.json({ entities: listEntities() }))
  sa.put('/entities', (req, res) => {
    const entities = saveEntities(req.body?.entities)
    audit(req, 'entities', `${entities.length}`)
    res.json({ entities })
  })

  /* Correction des acteurs par l'IA : décisions, passage à la demande, correction ou annulation d'une décision */
  sa.get('/entity-ai', (_req, res) => res.json({ ...entityAIState(), ai: aiEnabled(), provider: process.env.GEMINI_API_KEY ? 'gemini' : aiProvider() }))
  sa.post('/entity-ai/run', async (req, res) => {
    if (!aiEnabled()) return fail(res, 400, 'NO_AI')
    try {
      const run = await runEntityAI(getItems().items, runEconomy, { manual: true })
      audit(req, 'entity_ai_run', `${run.names ?? 0}`, run.skipped || `${run.applied} décisions`)
      res.json({ run, ...entityAIState() })
    } catch (err) {
      res.status(502).json({ error: 'AI_FAILED', detail: String(err.message || err).slice(0, 200) })
    }
  })
  sa.put('/entity-ai', (req, res) => {
    const raw = String(req.body?.raw || '').slice(0, 120)
    if (!raw) return fail(res, 400, 'NO_NAME')
    const d = setDecision(raw, req.body || {})
    audit(req, 'entity_ai_edit', raw, req.body?.remove ? 'annulée' : d?.reject ? 'rejeté' : d?.canonical || '')
    res.json({ decision: d, ...entityAIState() })
  })

  sa.get('/shares', (_req, res) => res.json({ shares: listShares() }))
  sa.delete('/shares/:id', (req, res) => {
    const row = revokeShare(String(req.params.id), 'superadmin')
    if (!row) return fail(res, 404, 'NOT_FOUND')
    audit(req, 'share_revoke', row.boardName || row.boardId, row.createdBy)
    res.json({ share: row })
  })
}
