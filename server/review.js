import { reliabilityOf, sourceTier } from './sourceMeta.js'

/**
 * Revue de presse officielle (audit v5, constat 5) : rubrique « médias et dépêches » (agences, médias établis, médias
 * en ligne) et rubrique séparée « réseaux sociaux » (comptes identifiés seulement). Les comptes anonymes (pseudonymes
 * sans nom réel), forums et commentaires n'entrent pas dans la revue : ils sont seulement comptés (excluded).
 * Chaque fiche porte sa fiabilité (high > medium > social > low) et son type de source.
 */
const RANK = { agency: 0, established: 1, online: 2, social: 3 }

export function splitReview(items) {
  const media = []
  const social = []
  let excluded = 0
  for (const it of items) {
    const tier = sourceTier(it)
    if (tier === 'anonymous' || tier === 'forum') {
      excluded++
      continue
    }
    const row = { ...it, reliability: reliabilityOf(it), sourceTier: tier }
    ;(tier === 'social' ? social : media).push(row)
  }
  // Dans chaque thème, les sources les plus fiables d'abord, puis l'heure
  const order = (a, b) => (RANK[a.sourceTier] ?? 9) - (RANK[b.sourceTier] ?? 9) || a.date.localeCompare(b.date)
  return { media: media.sort(order), social: social.sort(order), excluded }
}
