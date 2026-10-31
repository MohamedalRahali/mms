import { useState } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'

/**
 * Fournisseur d'IA réellement utilisé (audit produit v5, constat 1) : nom, offre et région du moteur principal sur
 * l'écran IA, avec le détail par usage (conditions officielles, conservation chez le fournisseur) à la demande.
 */

type Row = { use: string; useLabel: string; vendor: string; product: string; offer: string; noReuse: string; retention: string; region: string; terms: { label: string; url: string }[]; warning: boolean }
type Disclosure = { badge: { product: string; offer: string; region: string; warning: boolean } | null; rows: Row[]; sent: string; noCert: string }

export function AiProvider() {
  const i = useI18n()
  const ar = i.lang === 'ar'
  const d = useFetch<Disclosure>(`/api/ai/providers?lang=${i.lang}`).data
  const [open, setOpen] = useState(false)
  if (!d?.badge) return null
  return (
    <div className={`ai-provider${d.badge.warning ? ' ai-provider--warn' : ''}`}>
      <p>
        <strong>{ar ? 'المحرك: ' : 'Engine: '}</strong>
        {d.badge.product} · {d.badge.offer} · {ar ? 'المنطقة: ' : 'Region: '}
        {d.badge.region}{' '}
        <button type="button" className="ai-provider__link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? (ar ? 'إخفاء التفاصيل' : 'Hide details') : ar ? 'المزوّدون والشروط' : 'Providers and terms'}
        </button>
      </p>
      {open && (
        <div className="ai-provider__details">
          <table className="ai-provider__table">
            <thead>
              <tr>
                <th>{ar ? 'الاستخدام' : 'Use'}</th>
                <th>{ar ? 'المزوّد والعرض' : 'Provider and offer'}</th>
                <th>{ar ? 'عدم إعادة الاستخدام' : 'No reuse'}</th>
                <th>{ar ? 'الاحتفاظ لدى المزوّد' : 'Retention at provider'}</th>
                <th>{ar ? 'المنطقة' : 'Region'}</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.use}>
                  <td>{r.useLabel}</td>
                  <td>
                    {r.vendor} — {r.product}
                    <br />
                    <small>{r.offer}</small>
                  </td>
                  <td>
                    {r.noReuse}
                    {r.terms.map((t) => (
                      <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="ai-provider__term">
                        {t.label}
                      </a>
                    ))}
                  </td>
                  <td>{r.retention}</td>
                  <td>{r.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>{d.sent}</small>
          <small>{d.noCert}</small>
        </div>
      )}
    </div>
  )
}
