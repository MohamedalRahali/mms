import { useEffect, useState } from 'react'
import { LangToggle } from './AuditLog'
import { api } from './api'

/**
 * ملاحظة الأمان (audit produit v4 constat 10, v6 constat 11) : la note de sécurité d'une page — hébergement,
 * chiffrement, 2FA, IA, rôles, journal, exports, sauvegardes. Même source que la note de l'application client
 * (server/securityNote.js) ; ici les fournisseurs d'IA sont toujours nommés. Téléchargeable en Markdown, imprimable.
 * Réglage : fournisseurs nommés ou non dans l'application client (décision commerciale, « neutral » par défaut),
 * et ce qui manque pour traiter en Europe ou dans le Golfe avec Vertex AI.
 */

type AiRow = { use: string; useLabel: string; vendor: string; product: string; offer: string; noReuse: string; retention: string; region: string; terms: { label: string; url: string }[] }
type Note = { title: string; intro: string; file: string; sections: [string, string[]][]; ai: { rows: AiRow[]; sent: string; noCert: string }; aiTitle: string; markdown: string }
type Disclosure = { clientMode: 'neutral' | 'named'; vertex: { ready: boolean; missing: string[]; location: string; main: boolean } }

export function SecurityNote() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const [n, setN] = useState<Note | null>(null)
  const [d, setD] = useState<Disclosure | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    api<Note>(`/security-note?lang=${lang}`).then(setN, () => setN(null))
    api<Disclosure>(`/ai-disclosure?lang=${lang}`).then(setD, () => setD(null))
  }, [lang])
  const download = () => {
    if (!n) return
    const url = URL.createObjectURL(new Blob(['﻿' + n.markdown.replace(/\n/g, '\r\n')], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = n.file
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const setMode = async (mode: 'neutral' | 'named') => {
    try {
      await api('/settings', 'PUT', { aiDisclosure: mode })
      setD((x) => (x ? { ...x, clientMode: mode } : x))
      setMsg('تم الحفظ')
    } catch (e) {
      setMsg(String((e as Error).message || e))
    }
  }
  if (!n) return <p className="sa-muted">جارٍ التحميل…</p>
  return (
    <section className="sa-card sa-card--wide sa-secnote" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <div className="sa-card__head">
        <h2>{n.title}</h2>
        <span className="sa-row">
          <LangToggle lang={lang} onLang={setLang} />
          <button type="button" className="sa-btn" onClick={download}>
            {lang === 'ar' ? '⬇ تنزيل الملاحظة (Markdown)' : '⬇ Download the note (Markdown)'}
          </button>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={() => window.print()}>
            {lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF'}
          </button>
        </span>
      </div>
      {d && (
        <div className="sa-card" dir="rtl" lang="ar">
          <h3>أسماء مزوّدي الذكاء الاصطناعي في تطبيق العميل</h3>
          <p className="sa-muted">
            الوضع الحالي: <strong>{d.clientMode === 'named' ? 'المزوّدون مذكورون بالاسم مع روابط الشروط الرسمية' : 'دون أسماء (« محرك مرصاد ») مع العرض وعدم التدريب والاحتفاظ والمنطقة'}</strong>. الملاحظة أدناه تذكر الأسماء دائماً، وتُسلَّم للعميل عند الطلب.
          </p>
          <span className="sa-row">
            <button type="button" className="sa-btn" disabled={d.clientMode === 'neutral'} onClick={() => setMode('neutral')}>
              دون أسماء
            </button>
            <button type="button" className="sa-btn" disabled={d.clientMode === 'named'} onClick={() => setMode('named')}>
              بالأسماء
            </button>
          </span>
          {msg && <p className="sa-muted">{msg}</p>}
          <p className="sa-muted">
            Vertex AI (ميلانو europe-west8 أو الدمام me-central2):{' '}
            {d.vertex.ready ? `جاهز (${d.vertex.location})${d.vertex.main ? '، المحرك الرئيسي' : '، لمهام الخلفية فقط'}` : `غير مفعّل — ينقص: ${d.vertex.missing.join('، ')}`}
          </p>
        </div>
      )}
      <p className="sa-muted">{n.intro}</p>
      {n.sections.map(([h, lines]) => (
        <div key={h}>
          <h3>{h}</h3>
          <ul>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <h3>{lang === 'ar' ? 'الذكاء الاصطناعي — المزوّدون الفعليون' : 'Artificial intelligence — actual providers'}</h3>
        <ul>
          {n.ai.rows.map((r) => (
            <li key={r.use}>
              <strong>{r.useLabel}</strong> : {r.vendor} — {r.product} · {r.offer}. {r.noReuse} {r.retention} {lang === 'ar' ? 'المنطقة' : 'Region'}: {r.region}.{' '}
              {r.terms.map((t) => (
                <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" style={{ marginInlineEnd: '0.5rem' }}>
                  {t.label}
                </a>
              ))}
            </li>
          ))}
        </ul>
        <p className="sa-muted">{n.ai.sent}</p>
        <p className="sa-muted">{n.ai.noCert}</p>
      </div>
    </section>
  )
}
