import { useContext, useState, type KeyboardEvent } from 'react'
import { type Flux, type NewsItem, type Spike, type Tone, DrillContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { TONE_COLORS, useIntel } from '../lib/intel'

/** Éléments de la couche « intelligence » : pics d'activité, tonalité, entités et étiquettes d'une fiche */

type Explained = { explication: string; points: string[] }

function SpikeRow({ spike, flux }: { spike: Spike; flux: Flux | '' }) {
  const i = useI18n()
  const x = useIntel()
  const drill = useContext(DrillContext)
  const [state, setState] = useState<'' | 'loading' | 'error'>('')
  const [result, setResult] = useState<Explained | null>(null)
  const label = spike.dim === 'categories' ? i.category(spike.name) : spike.name

  async function explain() {
    setState('loading')
    try {
      const res = await fetch('/api/ai/spike', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dim: spike.dim, name: spike.name, flux }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setResult(((await res.json()) as { result: Explained }).result)
      setState('')
    } catch {
      setState('error')
    }
  }

  return (
    <li className="mms-spike">
      <div className="mms-spike__row">
        <span className="mms-spike__arrow" aria-hidden>
          ▲
        </span>
        <button type="button" className="mms-spike__name" onClick={() => drill({ [spike.filter]: spike.name, days: '1' })} title={x.drillHint}>
          <small>{x.spikeDims[spike.dim]}</small>
          <strong dir="auto">{label}</strong>
        </button>
        <span className="mms-spike__line">{spike.avg > 0 ? x.spikeLine(i.num(spike.count), i.num(spike.avg)) : x.spikeNew(i.num(spike.count))}</span>
        {!result && (
          <button type="button" className="news-btn news-btn--ghost mms-spike__why" onClick={explain} disabled={state === 'loading'}>
            {state === 'loading' ? x.explaining : x.why}
          </button>
        )}
      </div>
      {state === 'error' && <p className="news-status news-status--error">{x.explainError}</p>}
      {result && (
        <div className="mms-spike__ai" dir="auto">
          <p>{result.explication}</p>
          {result.points.length > 0 && (
            <ul>
              {result.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

/** Bandeau des pics : ce qui monte nettement au-dessus de sa moyenne sur les dernières 24 heures */
export function SpikeBanner({ flux }: { flux: Flux | '' }) {
  const x = useIntel()
  const { data } = useFetch<{ spikes: Spike[] }>(`/api/news/spikes${flux ? `?flux=${flux}` : ''}`)
  const [all, setAll] = useState(false)
  if (!data?.spikes.length) return null
  const shown = all ? data.spikes : data.spikes.slice(0, 3)
  return (
    <section className="mms-spikes" aria-label={x.spikesTitle}>
      <h2>{x.spikesTitle}</h2>
      <ul>
        {shown.map((s) => (
          <SpikeRow key={`${s.dim}|${s.name}`} spike={s} flux={flux} />
        ))}
      </ul>
      {data.spikes.length > shown.length && (
        <button type="button" className="mms-spikes__more" onClick={() => setAll(true)}>
          {x.showAll(data.spikes.length)}
        </button>
      )}
    </section>
  )
}

export function ToneBadge({ tone }: { tone?: Tone | '' }) {
  const x = useIntel()
  if (!tone) return null
  return (
    <span className={`mms-tonebadge mms-tonebadge--${tone}`} style={{ borderColor: TONE_COLORS[tone], color: TONE_COLORS[tone] }}>
      <i style={{ background: TONE_COLORS[tone] }} aria-hidden />
      {x.tones[tone]}
    </span>
  )
}

/** Personnes, organisations et lieux cités : un clic ouvre toutes les actualités qui les mentionnent */
export function EntityChips({ item }: { item: NewsItem }) {
  const drill = useContext(DrillContext)
  const x = useIntel()
  const groups = [
    ['people', item.people],
    ['orgs', item.orgs],
    ['places', item.places],
  ] as const
  if (!groups.some(([, list]) => list?.length)) return null
  return (
    <p className="mms-entities">
      {groups.map(([kind, list]) =>
        (list ?? []).slice(0, 4).map((name) => (
          <button
            key={`${kind}|${name}`}
            type="button"
            className={`mms-entity mms-entity--${kind}`}
            title={`${x[kind]} · ${x.drillHint}`}
            onClick={() => drill({ entity: name })}
            dir="auto"
          >
            {name}
          </button>
        )),
      )}
    </p>
  )
}

/** Étiquettes d'équipe, communes à tous les postes */
export function TagEditor({ item }: { item: NewsItem }) {
  const x = useIntel()
  const [tags, setTags] = useState<string[]>(item.tags ?? [])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  if (!item.key) return null

  async function save(next: string[]) {
    setError(false)
    try {
      const res = await fetch('/api/tags', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: item.key, tags: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setTags(((await res.json()) as { tags: string[] }).tags)
    } catch {
      setError(true)
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = draft.trim()
      if (v && !tags.includes(v)) save([...tags, v])
      setDraft('')
      setAdding(false)
    } else if (e.key === 'Escape') {
      setDraft('')
      setAdding(false)
    }
  }

  return (
    <p className="mms-itags">
      {tags.map((t) => (
        <span key={t} className="mms-tagchip" dir="auto">
          #{t}
          <button type="button" aria-label={`× ${t}`} onClick={() => save(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          className="mms-itags__input"
          autoFocus
          value={draft}
          maxLength={40}
          placeholder={x.tagPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => setAdding(false)}
          dir="auto"
        />
      ) : (
        <button type="button" className="mms-itags__add" onClick={() => setAdding(true)}>
          + {x.addTag}
        </button>
      )}
      {error && <span className="news-status--error">{x.tagError}</span>}
    </p>
  )
}
