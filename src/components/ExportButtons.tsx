import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { exportNewsList } from '../lib/listExport'

/** Boutons « تصدير Word » et « تصدير PDF » d'une liste d'actualités (remplacent l'ancien export Excel) */
export function ExportButtons({ query, title, period, filters }: { query: string; title: string; period: string; filters: string[] }) {
  const i = useI18n()
  const ar = i.lang === 'ar'
  const [busy, setBusy] = useState<'' | 'docx' | 'pdf'>('')
  const [err, setErr] = useState('')
  async function go(format: 'docx' | 'pdf') {
    setBusy(format)
    setErr('')
    try {
      await exportNewsList({ format, query, title, period, filters, lang: ar ? 'ar' : 'en', categoryLabel: i.category })
    } catch {
      setErr(ar ? 'تعذّر التصدير، أعد المحاولة.' : 'Export failed, please retry.')
    } finally {
      setBusy('')
    }
  }
  return (
    <span className="mms-exports">
      <button type="button" className="news-btn news-btn--ghost" disabled={Boolean(busy)} onClick={() => go('docx')}>
        {busy === 'docx' ? (ar ? 'جارٍ إعداد Word…' : 'Preparing Word…') : ar ? 'تصدير Word' : 'Export Word'}
      </button>
      <button type="button" className="news-btn news-btn--ghost" disabled={Boolean(busy)} onClick={() => go('pdf')}>
        {busy === 'pdf' ? (ar ? 'جارٍ إعداد PDF…' : 'Preparing PDF…') : ar ? 'تصدير PDF' : 'Export PDF'}
      </button>
      {err && <small className="news-status news-status--error">{err}</small>}
    </span>
  )
}
