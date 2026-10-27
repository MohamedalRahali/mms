import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { selection, useSelection } from '../../lib/reportSelection'
import { type Report, ReportEditor } from './ReportEditor'
import { reportText } from './text'
import '../reports.css'

/** Page التقارير : génération depuis les publications cochées, rapports enregistrés, éditeur */

type Summary = { id: string; title: string; createdAt: string; updatedAt: string; posts: number; lang: 'ar' | 'en'; sent: number }
type ListResponse = { reports: Summary[]; mail: boolean; ai: boolean }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error || String(res.status)), { code: body.error || 'generic' })
  return body as T
}

function Generator({ onDone, onNews }: { onDone: (r: Report, notes: string[]) => void; onNews: () => void }) {
  const i = useI18n()
  const t = reportText(i.lang)
  const picked = useSelection()
  const [title, setTitle] = useState('')
  const [org, setOrg] = useState('')
  const [lang, setLang] = useState<'ar' | 'en'>(i.lang === 'en' ? 'en' : 'ar')
  const [logo, setLogo] = useState<string | null>(null) // null : inconnu, '' : logo par défaut
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/reports/logo', { method: 'HEAD' })
      .then((r) => setLogo(r.ok ? `/api/reports/logo?v=${Date.now()}` : ''))
      .catch(() => setLogo(''))
  }, [])

  function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 1_048_576) return setErr(t.logoErr)
    const r = new FileReader()
    r.onload = async () => {
      try {
        const body = await api<{ logo: string }>('/api/reports/logo', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: r.result }) })
        setLogo(body.logo)
        setErr('')
      } catch {
        setErr(t.logoErr)
      }
    }
    r.readAsDataURL(f)
  }

  async function generate() {
    setBusy(true)
    setErr('')
    setStep(0)
    // Étapes affichées pendant l'attente (la génération est une seule requête)
    const tick = window.setInterval(() => setStep((s) => Math.min(s + 1, 3)), 2500)
    try {
      const body = await api<{ report: Report; missing: number; aiError: string }>('/api/reports/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: picked.map((p) => p.id), title, org, lang }),
      })
      const notes = [body.aiError ? t.aiOff : '', body.missing ? t.missing(body.missing) : ''].filter(Boolean)
      onDone(body.report, notes)
    } catch (e) {
      setErr(t.errors[(e as { code?: string }).code || ''] || t.errors.generic)
    } finally {
      window.clearInterval(tick)
      setBusy(false)
    }
  }

  if (!picked.length)
    return (
      <section className="rpt-gen rpt-gen--empty">
        <p>{t.noSelection}</p>
        <button type="button" className="news-btn" onClick={onNews}>
          {t.goNews}
        </button>
      </section>
    )
  return (
    <section className="rpt-gen" aria-busy={busy}>
      <header className="rpt-gen__head">
        <h3>{t.newReport}</h3>
        <span className="rpt-gen__count">{t.selectedN(i.num(picked.length))}</span>
        <button type="button" className="rpt-tray__link" disabled={busy} onClick={() => selection.clear()}>
          {t.clearSel}
        </button>
      </header>
      <div className="rpt-gen__grid">
        <label className="rpt-field">
          <span>{t.reportTitle}</span>
          <input dir="auto" value={title} maxLength={200} placeholder={t.reportTitlePh} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>
        <label className="rpt-field">
          <span>{t.org}</span>
          <input dir="auto" value={org} maxLength={300} placeholder={t.orgPh} onChange={(e) => setOrg(e.target.value)} disabled={busy} />
        </label>
        <label className="rpt-field">
          <span>{t.docLang}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'ar')} disabled={busy}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="rpt-field">
          <span>{t.logo}</span>
          <div className="rpt-logo">
            <img src={logo || '/logo-npdc.png'} alt={logo ? t.logo : t.logoDefault} />
            <div>
              <button type="button" className="news-btn news-btn--ghost" disabled={busy} onClick={() => file.current?.click()}>
                {t.logoUpload}
              </button>
              {logo && (
                <button
                  type="button"
                  className="rpt-tray__link"
                  disabled={busy}
                  onClick={async () => {
                    await fetch('/api/reports/logo', { method: 'DELETE' })
                    setLogo('')
                  }}
                >
                  {t.logoRemove}
                </button>
              )}
              <small>{t.logoHint}</small>
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onLogo} />
          </div>
        </div>
      </div>
      <ul className="rpt-gen__picked">
        {picked.slice(0, 6).map((p) => (
          <li key={p.id} dir="auto">
            {p.title}
          </li>
        ))}
        {picked.length > 6 && <li>…</li>}
      </ul>
      {err && (
        <p className="rpt-msg rpt-msg--err" role="alert">
          {err}
        </p>
      )}
      {busy ? (
        <ol className="rpt-steps" role="status" aria-live="polite">
          {t.steps.map((s, n) => (
            <li key={s} className={n < step ? 'is-done' : n === step ? 'is-now' : ''}>
              {s}
            </li>
          ))}
        </ol>
      ) : (
        <button type="button" className="news-btn rpt-gen__go" onClick={generate}>
          {t.generate}
        </button>
      )}
    </section>
  )
}

export function Reports({ onNews }: { onNews: () => void }) {
  const i = useI18n()
  const t = reportText(i.lang)
  const [list, setList] = useState<ListResponse | null>(null)
  const [open, setOpen] = useState<Report | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    api<ListResponse>('/api/reports')
      .then(setList)
      .catch(() => setErr(t.errors.generic))
  }, [t])
  useEffect(load, [load])

  async function openReport(id: string) {
    try {
      setNotes([])
      setOpen((await api<{ report: Report }>(`/api/reports/${id}`)).report)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setErr(t.errors[(e as { code?: string }).code || ''] || t.errors.generic)
    }
  }

  if (open)
    return (
      <>
        {notes.map((n) => (
          <p key={n} className="rpt-msg rpt-msg--info" role="status">
            {n}
          </p>
        ))}
        <ReportEditor
          key={open.id}
          report={open}
          onClose={() => {
            setOpen(null)
            setNotes([])
            load()
          }}
        />
      </>
    )

  return (
    <div className="rpt-page">
      <header className="mms-page__head">
        <h2>{t.title}</h2>
        <p>{t.intro}</p>
      </header>
      <Generator
        onNews={onNews}
        onDone={(r, n) => {
          setNotes(n)
          setOpen(r)
          window.scrollTo({ top: 0 })
        }}
      />
      {err && (
        <p className="rpt-msg rpt-msg--err" role="alert">
          {err}
        </p>
      )}
      <section className="rpt-list">
        <h3>{t.history}</h3>
        {list && !list.reports.length && <p className="news-status">{t.empty}</p>}
        <ul>
          {list?.reports.map((r) => (
            <li key={r.id} className="rpt-list__item">
              <button type="button" className="rpt-list__open" onClick={() => openReport(r.id)}>
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
                  <path fill="currentColor" d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.6H8zm0 3.5h8v1.6H8z" />
                </svg>
                <span>
                  <b dir="auto">{r.title}</b>
                  <small>
                    {t.posts(r.posts)} · {t.updated}: {i.dateTime(r.updatedAt)} · {r.lang === 'en' ? 'EN' : 'ع'}
                    {r.sent ? ` · ${t.sent(r.sent)}` : ''}
                  </small>
                </span>
              </button>
              <span className="rpt-list__tools">
                <button type="button" className="rpt-tray__link" onClick={() => openReport(r.id)}>
                  {t.open}
                </button>
                <button
                  type="button"
                  className="rpt-tray__link"
                  onClick={async () => {
                    await api(`/api/reports/${r.id}/duplicate`, { method: 'POST' }).catch(() => setErr(t.errors.generic))
                    load()
                  }}
                >
                  {t.duplicate}
                </button>
                <button
                  type="button"
                  className="rpt-tray__link rpt-tray__link--danger"
                  onClick={async () => {
                    if (!window.confirm(t.confirmDel(r.title))) return
                    await api(`/api/reports/${r.id}`, { method: 'DELETE' }).catch(() => setErr(t.errors.generic))
                    load()
                  }}
                >
                  {t.del}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default Reports
