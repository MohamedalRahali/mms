import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'

/**
 * Fiche IA et note de sécurité côté client (audit produit v6, constats 3 et 11). Le texte vient du serveur
 * (/api/ai/disclosure, /api/security-note) : fournisseurs nommés ou non selon le réglage de la console Super Admin,
 * mais toujours l'offre, la clause de non-entraînement, la conservation chez le fournisseur et la région.
 */

type AiRow = { use: string; useLabel: string; vendor: string; product: string; offer: string; noReuse: string; retention: string; region: string; terms: { label: string; url: string }[]; warning?: boolean }
type AiInfo = { mode: 'neutral' | 'named'; rows: AiRow[]; sent: string; noCert: string; named?: string; checked: string }
type Note = { lang: string; title: string; intro: string; file: string; sections: [string, string[]][]; ai: AiInfo; cols: Record<string, string>; aiTitle: string; markdown: string; updated: string }

const L = {
  ar: { details: 'كيف تُعالج بياناتكم؟', provider: 'المزوّد', offer: 'العرض', noReuse: 'عدم التدريب', retention: 'الاحتفاظ لدى المزوّد', region: 'منطقة المعالجة', terms: 'الشروط الرسمية', download: '⬇ تنزيل (Markdown)', print: 'طباعة / PDF', checked: 'تاريخ التحقق' },
  en: { details: 'How is your data processed?', provider: 'Provider', offer: 'Offer', noReuse: 'No training', retention: 'Retention at the provider', region: 'Processing region', terms: 'Official terms', download: '⬇ Download (Markdown)', print: 'Print / PDF', checked: 'Checked on' },
}

function AiTable({ ai, lang }: { ai: AiInfo; lang: 'ar' | 'en' }) {
  const l = L[lang]
  return (
    <div className="ai-disclosure">
      <div className="table-scroll">
        <table className="ai-disclosure__table">
          <thead>
            <tr>
              <th />
              {ai.mode === 'named' && <th>{l.provider}</th>}
              <th>{l.offer}</th>
              <th>{l.noReuse}</th>
              <th>{l.retention}</th>
              <th>{l.region}</th>
              {ai.mode === 'named' && <th>{l.terms}</th>}
            </tr>
          </thead>
          <tbody>
            {ai.rows.map((r) => (
              <tr key={r.use} className={r.warning ? 'is-warn' : undefined}>
                <th scope="row">{r.useLabel}</th>
                {ai.mode === 'named' && (
                  <td>
                    {r.vendor} — {r.product}
                  </td>
                )}
                <td>{r.offer}</td>
                <td>{r.noReuse || '—'}</td>
                <td>{r.retention}</td>
                <td>{r.region}</td>
                {ai.mode === 'named' && (
                  <td>
                    {r.terms.map((t) => (
                      <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ marginInlineEnd: '0.5rem' }}>
                        {t.label}
                      </a>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="news-muted">{ai.sent}</p>
      {ai.named && <p className="news-muted">{ai.named}</p>}
      <p className="news-muted">
        <em>{ai.noCert}</em> · {l.checked}: {ai.checked}
      </p>
    </div>
  )
}

/** Détails repliés « كيف تُعالج بياناتكم؟ » sous l'écran IA et l'assistant */
export function AiDisclosureDetails() {
  const i = useI18n()
  const lang = i.lang === 'ar' ? 'ar' : 'en'
  const { data } = useFetch<AiInfo>(`/api/ai/disclosure?lang=${lang}`, 0)
  if (!data?.rows?.length) return null
  return (
    <details className="ai-disclosure__box">
      <summary>{L[lang].details}</summary>
      <AiTable ai={data} lang={lang} />
    </details>
  )
}

/** Note de sécurité d'une page (centre d'aide) : lecture, téléchargement Markdown, impression en PDF */
export function SecurityNoteView() {
  const i = useI18n()
  const lang = i.lang === 'ar' ? 'ar' : 'en'
  const { data: n } = useFetch<Note>(`/api/security-note?lang=${lang}`, 0)
  if (!n) return null
  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + n.markdown.replace(/\n/g, '\r\n')], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = n.file
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="news-card security-note" id="security-note">
      <div className="security-note__head">
        <h3>{n.title}</h3>
        <span>
          <button type="button" className="news-btn" onClick={download}>
            {L[lang].download}
          </button>{' '}
          <button type="button" className="news-btn news-btn--ghost" onClick={() => window.print()}>
            {L[lang].print}
          </button>
        </span>
      </div>
      <p className="news-muted">{n.intro}</p>
      {n.sections.map(([h, lines]) => (
        <div key={h}>
          <h4>{h}</h4>
          <ul>
            {lines.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ))}
      <h4>{n.aiTitle}</h4>
      <AiTable ai={n.ai} lang={lang} />
    </section>
  )
}
