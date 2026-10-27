import fs from 'node:fs'
import path from 'node:path'
import { setSourceMeta } from './sourceMeta.js'
import { createApiKey, listApiKeys, revokeApiKey } from './apiKeys.js'
import { listShares, revokeShare } from './shares.js'

/**
 * Réglages de la console Super Admin ajoutés avec la liste d'actualités enrichie :
 * pays et portée des sources, logo et nom du client (en tête des tableaux de bord), clés d'API des clients,
 * et vue d'ensemble des liens de partage (révocables d'ici aussi).
 */

let brandFile = ''
let brand = { name: '', logo: '', updatedAt: null }
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const MAX_LOGO = 400_000 // caractères de l'URL data: (≈ 300 Ko d'image)

export function initBrand(dir) {
  brandFile = path.join(dir, 'brand.json')
  try {
    const saved = JSON.parse(fs.readFileSync(brandFile, 'utf8'))
    brand = { name: String(saved.name || '').slice(0, 120), logo: LOGO_RE.test(saved.logo || '') ? saved.logo : '', updatedAt: saved.updatedAt || null }
  } catch {
    /* pas encore de logo : celui de la plateforme */
  }
}

export const brandOf = () => ({ name: brand.name, logo: brand.logo, updatedAt: brand.updatedAt })

const fail = (res, status, error) => res.status(status).json({ error })

/** Routes de la console, montées sur le routeur /api/superadmin après son contrôle du jeton */
export function mountClientAdmin(sa, { audit }) {
  sa.put('/sources/meta', (req, res) => {
    const name = String(req.body?.name || '').slice(0, 200)
    if (!name) return fail(res, 400, 'NO_NAME')
    const row = setSourceMeta(name, { country: req.body?.country, reach: req.body?.reach })
    audit(req, 'source_meta', name, row ? `${row.country || '—'} · ${row.reach ?? 'افتراضي'}` : 'افتراضي')
    res.json({ meta: row })
  })

  sa.get('/brand', (_req, res) => res.json({ brand: brandOf() }))
  sa.put('/brand', (req, res) => {
    const name = String(req.body?.name ?? brand.name).trim().slice(0, 120)
    const logo = req.body?.logo === undefined ? brand.logo : String(req.body.logo || '')
    if (logo && (logo.length > MAX_LOGO || !LOGO_RE.test(logo))) return fail(res, 400, 'BAD_LOGO')
    brand = { name, logo, updatedAt: new Date().toISOString() }
    fs.mkdirSync(path.dirname(brandFile), { recursive: true })
    fs.writeFileSync(brandFile, JSON.stringify(brand))
    audit(req, 'brand', name || '—', logo ? 'logo' : 'sans logo')
    res.json({ brand: brandOf() })
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

  sa.get('/shares', (_req, res) => res.json({ shares: listShares() }))
  sa.delete('/shares/:id', (req, res) => {
    const row = revokeShare(String(req.params.id), 'superadmin')
    if (!row) return fail(res, 404, 'NOT_FOUND')
    audit(req, 'share_revoke', row.boardName || row.boardId, row.createdBy)
    res.json({ share: row })
  })
}
