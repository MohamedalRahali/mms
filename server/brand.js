import fs from 'node:fs'
import path from 'node:path'

/**
 * Identité des livrables (هوية المخرجات, console Super Admin) : nom et logo de l'organisation cliente (le Centre),
 * nom de l'assistant IA, couleur d'accent des livrables exportés (rapports, e-mails, rapport exécutif), et marque
 * blanche (sans la marque Around dans l'interface et les livrables). Par défaut tout est vide : comportement d'avant.
 * Stockage : data/superadmin/brand.json. Module sans dépendance (lu par les rapports, les veilles et le rapport exécutif).
 */

let file = ''
let brand = { name: '', logo: '', assistant: '', accent: '', whiteLabel: false, updatedAt: null }
export const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
export const ACCENT_RE = /^#[0-9a-f]{6}$/i

export function initBrand(dir) {
  file = path.join(dir, 'brand.json')
  try {
    brand = cleanBrand(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    /* pas encore réglé : identité de la plateforme */
  }
}

export function cleanBrand(b = {}) {
  return {
    name: String(b.name || '').slice(0, 120),
    logo: LOGO_RE.test(b.logo || '') ? b.logo : '',
    assistant: String(b.assistant || '').slice(0, 40),
    accent: ACCENT_RE.test(b.accent || '') ? String(b.accent).toLowerCase() : '',
    whiteLabel: b.whiteLabel === true,
    updatedAt: b.updatedAt || null,
  }
}

export const brandOf = () => ({ name: brand.name, logo: brand.logo, assistant: brand.assistant || '', accent: brand.accent, whiteLabel: brand.whiteLabel, updatedAt: brand.updatedAt })

export function saveBrand(next) {
  brand = cleanBrand({ ...next, updatedAt: new Date().toISOString() })
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(brand))
  }
  return brandOf()
}

/** Couleur des livrables : celle du client, sinon la couleur d'origine du livrable */
export const accentOr = (fallback) => brand.accent || fallback
/** Nom affiché dans les livrables : l'organisation cliente si elle est renseignée, sinon « MMS » */
export const outputName = (fallback = 'MMS') => brand.name || fallback
