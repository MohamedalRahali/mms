import { useI18n } from '../lib/i18n'

/** Chargement en cours, ou message d'erreur si la requête a échoué (évite un « chargement » sans fin) */
export function LoadState({ error }: { error?: boolean }) {
  const i = useI18n()
  return error ? (
    <p className="news-status news-status--error" role="alert">
      {i.t.loadError}
    </p>
  ) : (
    <p className="news-status">{i.t.loading}</p>
  )
}
