import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { PageHead } from './Extras'
import { type Flux, FLUX_KEYS } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { THEMES, type Watch, WATCH_TEXT, ZONES, themesToRules } from '../lib/watches'
import { DispatchHistory } from './DispatchHistory'
import { LoadState } from './LoadState'
import { MailingListPicker } from './MailingLists'
import { AlertFields, DEFAULT_ALERT, MergeProposals, WatchAlertRow, WatchAlertTracker } from './WatchAlerts'

/** Écran « الرصد المبرمج » : zone surveillée, thèmes à cocher, période, destinataires, puis liste des veilles */

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayKey.format(new Date())
const tomorrow = () => dayKey.format(new Date(Date.now() + 86_400_000))

/** Mots en étiquettes, retirés avec × et ajoutés avec Entrée (ou une virgule) */
function Tags({ words, onChange, placeholder }: { words: string[]; onChange: (w: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('')
  function add() {
    const fresh = draft
      .split(/[,،]/)
      .map((w) => w.trim())
      .filter((w) => w && !words.includes(w))
    if (fresh.length) onChange([...words, ...fresh])
    setDraft('')
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && words.length) onChange(words.slice(0, -1))
  }
  return (
    <div className="mms-tags">
      {words.map((w) => (
        <span key={w} className="mms-tags__tag" dir="auto">
          {w}
          <button type="button" aria-label={`× ${w}`} onClick={() => onChange(words.filter((x) => x !== w))}>
            ×
          </button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={placeholder} dir="auto" />
    </div>
  )
}

function WatchForm({ onCreated }: { onCreated: () => void }) {
  const i = useI18n()
  const w = WATCH_TEXT[i.lang]
  const [name, setName] = useState('')
  const [scope, setScope] = useState<string[]>(ZONES.libye)
  const [words, setWords] = useState<Record<string, string[]>>(() => Object.fromEntries(THEMES.map((t) => [t.key, t.words])))
  const [picked, setPicked] = useState<string[]>([])
  const [flux, setFlux] = useState<Flux | ''>('')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(tomorrow())
  const [permanent, setPermanent] = useState(false)
  const [recipients, setRecipients] = useState('')
  const [alert, setAlert] = useState(DEFAULT_ALERT)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const themes = THEMES.filter((t) => picked.includes(t.key)).map((t) => ({ key: t.key, words: words[t.key] }))
  const rules = themesToRules(scope, themes)
  const zoneName = scope.includes(ZONES.libye[0]) ? w.zoneLibye : scope.includes(ZONES.tunisie[0]) ? w.zoneTunisie : scope[0] || ''
  const autoName = [
    zoneName,
    THEMES.filter((t) => picked.includes(t.key))
      .map((t) => (i.lang === 'ar' ? t.ar : t.en))
      .join(i.lang === 'ar' ? '، ' : ', '),
  ]
    .filter(Boolean)
    .join(' – ')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setDone(false)
    try {
      const send = (force: boolean) =>
        fetch('/api/watches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() || autoName, rules, themes: picked, scope, flux, from, to: permanent ? null : to, recipients, alert, force }),
        })
      let res = await send(false)
      let json = await res.json()
      // Même surveillance déjà active : on montre laquelle et qui l'a créée, puis on demande confirmation
      if (res.status === 409 && json.existing && window.confirm(w.duplicate(json.existing.name, json.existing.createdBy))) {
        res = await send(true)
        json = await res.json()
      }
      if (!res.ok) throw new Error(json.error || 'FAILED')
      setDone(true)
      setName('')
      setPicked([])
      onCreated()
    } catch (err) {
      setError(w.errors[(err as Error).message] ?? w.errors.FAILED)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mms-widget mms-watchform" onSubmit={submit}>
      <header className="mms-widget__head mms-widget__head--red">
        <div>
          <span>MMS / {w.title}</span>
          <strong>{w.newWatch}</strong>
        </div>
      </header>
      <div className="mms-widget__body">
        <label className="mms-field">
          <span>{w.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} dir="auto" />
        </label>

        <div className="mms-field">
          <span>{w.zone}</span>
          <div className="mms-watchform__zones">
            <button type="button" className="news-btn news-btn--ghost" onClick={() => setScope(ZONES.libye)}>
              <i className="mms-flag mms-flag--libye" /> {w.zoneLibye}
            </button>
            <button type="button" className="news-btn news-btn--ghost" onClick={() => setScope([])}>
              {w.zoneClear}
            </button>
          </div>
          <Tags words={scope} onChange={setScope} placeholder={w.addWord} />
          <small>{w.zoneHint}</small>
        </div>

        <div className="mms-field">
          <span>{w.themes}</span>
          <div className="mms-themes">
            {THEMES.map((t) => {
              const on = picked.includes(t.key)
              return (
                <section key={t.key} className={on ? 'mms-theme is-on' : 'mms-theme'}>
                  <label className="mms-theme__check">
                    <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((k) => k !== t.key) : [...picked, t.key])} />
                    <b>{i.lang === 'ar' ? t.ar : t.en}</b>
                    <small>({words[t.key].length})</small>
                  </label>
                  {on && <Tags words={words[t.key]} onChange={(next) => setWords({ ...words, [t.key]: next })} placeholder={w.addWord} />}
                </section>
              )
            })}
          </div>
        </div>

        <div className="mms-watchform__row">
          <label className="mms-field">
            <span>{w.source}</span>
            <select value={flux} onChange={(e) => setFlux(e.target.value as Flux | '')}>
              <option value="">{i.t.allSources}</option>
              {FLUX_KEYS.map((f) => (
                <option key={f} value={f}>
                  {i.flux(f)}
                </option>
              ))}
            </select>
          </label>
          <label className="mms-field">
            <span>{w.from}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="mms-field">
            <span>{w.to}</span>
            <span className="mms-watchform__to">
              <input type="date" value={to} min={from} disabled={permanent} onChange={(e) => setTo(e.target.value)} />
              <button type="button" className="news-btn news-btn--ghost" disabled={permanent} onClick={() => setTo(tomorrow())}>
                {w.tomorrow}
              </button>
            </span>
          </label>
          <label className="mms-watchform__perm">
            <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
            {w.permanent}
          </label>
        </div>

        <label className="mms-field">
          <span>{w.recipients}</span>
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)} dir="ltr" placeholder="name@example.com, ..." />
        </label>
        <MailingListPicker value={recipients} onChange={setRecipients} />

        <AlertFields value={alert} onChange={setAlert} />

        {rules.length > 0 && (
          <details className="mms-watchform__rules">
            <summary>
              {w.rulesPreview} ({rules.length})
            </summary>
            <ul>
              {rules.map((r) => (
                <li key={r} dir="auto">
                  {r}
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && <p className="news-status news-status--error">{error}</p>}
        {done && <p className="news-status is-ok">{w.created}</p>}
        <button type="submit" className="news-btn" disabled={busy || rules.length === 0}>
          {w.submit}
        </button>
      </div>
    </form>
  )
}

function WatchRow({ watch, onChange, onOpen, nameOf }: { watch: Watch; onChange: () => void; onOpen: (id: string) => void; nameOf: (id: string) => string }) {
  const i = useI18n()
  // Activer, désactiver, supprimer : action « manage_watches » du profil
  const mayEdit = canDo(useAuth()?.user, 'manage_watches')
  const w = WATCH_TEXT[i.lang]
  async function toggle() {
    await fetch(`/api/watches/${watch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !watch.enabled }),
    })
    onChange()
  }
  async function remove() {
    if (!window.confirm(w.confirmRemove)) return
    await fetch(`/api/watches/${watch.id}`, { method: 'DELETE' })
    onChange()
  }
  const themeNames = THEMES.filter((t) => watch.themes.includes(t.key)).map((t) => (i.lang === 'ar' ? t.ar : t.en))
  return (
    <article className={watch.enabled ? 'mms-watch' : 'mms-watch is-off'}>
      <header>
        <strong dir="auto">{watch.name}</strong>
        <span className={`mms-watch__status mms-watch__status--${watch.enabled ? watch.status : 'off'}`}>
          {watch.enabled ? w.status[watch.status] : w.disabled}
        </span>
      </header>
      <p className="mms-watch__meta">
        {w.period(watch.from, watch.to)}
        {watch.flux && ` · ${i.flux(watch.flux)}`}
        {themeNames.length > 0 && ` · ${themeNames.join('، ')}`}
      </p>
      {(watch.query || watch.filters) && (
        <p className="mms-watch__meta" dir="auto">
          {watch.query && <code>{watch.query}</code>}
          {watch.filters && ` ${Object.values(watch.filters).join(' · ')}`}
        </p>
      )}
      <p className="mms-watch__meta">
        {watch.recipients.length ? <span dir="ltr">{watch.recipients.join(', ')}</span> : w.noRecipients} · {w.results(watch.matchCount)}
        {watch.createdBy && (
          <>
            {' · '}
            {w.owner}: <span dir="ltr">{watch.createdBy}</span>
          </>
        )}
      </p>
      {watch.mergedInto && (
        <p className="mms-watch__meta">
          {i.lang === 'ar' ? 'مدمج في' : 'Merged into'}: <b dir="auto">{nameOf(watch.mergedInto)}</b>
        </p>
      )}
      {watch.mergedFrom && (
        <p className="mms-watch__meta">
          {i.lang === 'ar' ? 'يجمع' : 'Combines'}: <span dir="auto">{watch.mergedFrom.map((m) => m.name).join(' · ')}</span>
        </p>
      )}
      <WatchAlertRow id={watch.id} alert={watch.alert} pending={watch.pending} onSaved={onChange} />
      {watch.lastError && <p className="news-status news-status--error">{watch.lastError === 'smtp_missing' ? w.smtpMissing : w.smtpError}</p>}
      {watch.matches.length > 0 && (
        <details>
          <summary>{w.lastSent}</summary>
          <ul className="mms-watch__matches">
            {watch.matches.slice(0, 8).map((m) => (
              <li key={m.id}>
                <b dir="auto">{m.title}</b>
                <small>
                  {i.flux(m.flux)} · {i.dateTime(m.date)} · {m.hits.join('، ')}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mms-watch__actions">
        <button type="button" className="news-btn" onClick={() => onOpen(watch.id)}>
          {w.showNews}
        </button>
        {mayEdit && (
          <>
            <button type="button" className="news-btn news-btn--ghost" onClick={toggle}>
              {watch.enabled ? w.disable : w.enable}
            </button>
            <button type="button" className="news-btn news-btn--ghost" onClick={remove}>
              {w.remove}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export function Watches({ onOpen }: { onOpen: (id: string) => void }) {
  const auth = useAuth()
  const i = useI18n()
  const w = WATCH_TEXT[i.lang]
  const [list, setList] = useState<Watch[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [smtp, setSmtp] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let off = false
    const load = () =>
      fetch('/api/watches')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json) => {
          if (off) return
          setList(json.watches ?? [])
          setSmtp(json.smtp)
          setFailed(false)
        })
        .catch(() => !off && setFailed(true))
    load()
    // La vérification tourne en arrière-plan : on relit la liste pour voir les nouveaux résultats
    const id = window.setInterval(load, 15_000)
    return () => {
      off = true
      window.clearInterval(id)
    }
  }, [tick])
  const reload = () => setTick((n) => n + 1)
  return (
    <>
      <PageHead title={w.title} intro={w.intro} />
      {!smtp && <p className="mms-note">{w.smtpMissing}</p>}
      <MergeProposals tick={tick} onMerged={reload} />
      <div className="mms-watchpage">
        {canDo(auth?.user, 'manage_watches') && <WatchForm onCreated={reload} />}
        <section className="mms-widget">
          <header className="mms-widget__head mms-widget__head--plain">
            <div>
              <span>MMS / {w.title}</span>
              <strong>
                {w.list} ({list?.length ?? 0})
              </strong>
            </div>
          </header>
          <div className="mms-widget__body">
            {!list && <LoadState error={failed} />}
            {list?.length === 0 && <p className="news-status">{w.empty}</p>}
            {list?.map((x) => (
              <WatchRow key={x.id} watch={x} onChange={reload} onOpen={onOpen} nameOf={(id) => list.find((o) => o.id === id)?.name ?? id} />
            ))}
          </div>
        </section>
      </div>
      <WatchAlertTracker onOpen={onOpen} tick={tick} />
      <DispatchHistory />
    </>
  )
}
