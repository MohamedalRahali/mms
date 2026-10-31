/**
 * Classification partagée par toutes les pages (audit v5, constat 8) : analyse, comparaison de périodes, portail,
 * rapport exécutif et exports comptent les thèmes avec ces mêmes fonctions. « دولي » est toujours découpé par zone
 * (international.europe, international.maghreb…, international.other quand la zone n'est pas reconnue).
 */

/** Thème principal d'une fiche ('autre' quand il manque) */
export const categoryKey = (it) => String(it?.category || '').trim().toLowerCase() || 'autre'

/** Thème fin : « دولي » découpé par zone, les autres inchangés */
export const fineCategory = (it) => {
  const c = categoryKey(it)
  return c === 'international' ? `international.${it.intl || 'other'}` : c
}

/** Comptes par thème fin, du plus fréquent au moins fréquent */
export function categoryCounts(items, fine = true) {
  const map = new Map()
  for (const it of items) {
    const k = fine ? fineCategory(it) : categoryKey(it)
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}
