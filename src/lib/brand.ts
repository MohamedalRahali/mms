import { useEffect, useState } from 'react'

/**
 * Identité des livrables du client (هوية المخرجات, console Super Admin) : nom et logo de l'organisation, couleur
 * d'accent des exports, nom de l'assistant IA, et option « marque blanche » qui retire la marque Around de
 * l'interface et des livrables. Lue une seule fois (/api/platform/brand) puis gardée en mémoire. L'interface de MMS
 * garde sa charte graphique ; la couleur d'accent ne sert qu'aux livrables exportés.
 */

export type Brand = { name: string; logo: string; assistant?: string; accent?: string; whiteLabel?: boolean }

const EMPTY: Brand = { name: '', logo: '' }
let cached: Brand | null = null
let pending: Promise<Brand> | null = null

export function loadBrand(): Promise<Brand> {
  if (cached) return Promise.resolve(cached)
  if (!pending)
    pending = fetch('/api/platform/brand')
      .then((r) => (r.ok ? r.json() : EMPTY))
      .catch(() => EMPTY)
      .then((b: Brand) => (cached = { ...EMPTY, ...b }))
  return pending
}

/** Marque déjà lue (null tant que la première lecture n'est pas finie) : pour les exports hors React */
export const brandNow = () => cached

export function useBrand() {
  const [brand, setBrand] = useState<Brand | null>(cached)
  useEffect(() => {
    let off = false
    loadBrand().then((b) => !off && setBrand(b))
    return () => {
      off = true
    }
  }, [])
  return brand
}

/** Nom affiché de l'assistant : celui du client, sinon « المساعد الذكي » en marque blanche, sinon '' (Around) */
export function assistantName(brand: Brand | null, lang: string) {
  if (brand?.assistant) return brand.assistant
  if (brand?.whiteLabel) return lang === 'ar' ? 'المساعد الذكي' : 'AI assistant'
  return ''
}

const AROUND_RE = /Around|أراوند/g

/** Remplace « Around » / « أراوند » par le nom choisi dans un texte, ou dans tous les textes d'un objet (fonctions comprises) */
export function renameAround<T>(value: T, name: string): T {
  if (!name) return value
  if (typeof value === 'string') return value.replace(AROUND_RE, name) as T
  if (typeof value === 'function') return ((...args: unknown[]) => renameAround((value as (...a: unknown[]) => unknown)(...args), name)) as T
  if (Array.isArray(value)) return value.map((v) => renameAround(v, name)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameAround(v, name)])) as T
  return value
}
