import { useContext, useState } from 'react'
import { DrillContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import './listing.css'

/**
 * Répartition territoriale (التوزيع الجغرافي) : actualités par région de la Libye (غرب / شرق / جنوب) et par
 * municipalité, d'après les lieux cités (référentiel des entités, éditable dans la console Super Admin).
 */

type Regions = { days: number; total: number; located: number; regions: Record<'west' | 'east' | 'south', number>; places: { name: string; region: string; count: number }[] }

const TEXT = {
  ar: {
    title: 'التوزيع الجغرافي داخل ليبيا',
    regions: { west: 'الغرب', east: 'الشرق', south: 'الجنوب' },
    located: (n: string, t: string) => `${n} خبر من ${t} مرتبط بمكان ليبي محدد`,
    cities: 'أكثر المدن والمناطق ذكراً',
    period: { 1: '24 ساعة', 7: '7 أيام', 30: '30 يوماً' } as Record<number, string>,
  },
  en: {
    title: 'Geographic spread within Libya',
    regions: { west: 'West', east: 'East', south: 'South' },
    located: (n: string, t: string) => `${n} of ${t} news items tied to a specific Libyan place`,
    cities: 'Most mentioned cities and areas',
    period: { 1: '24 hours', 7: '7 days', 30: '30 days' } as Record<number, string>,
  },
}
const COLOR: Record<string, string> = { west: '#2f6fdb', east: '#e8742a', south: '#c9921b' }

export function RegionsPanel() {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const drill = useContext(DrillContext)
  const [days, setDays] = useState(7)
  const { data } = useFetch<Regions>(`/api/news/regions?days=${days}`)
  if (!data) return null
  const sum = data.regions.west + data.regions.east + data.regions.south || 1
  const max = Math.max(...data.places.map((p) => p.count), 1)
  return (
    <section className="geo-regions" aria-label={t.title}>
      <header>
        <h3>{t.title}</h3>
        <div className="mms-listbar__views" role="group">
          {[1, 7, 30].map((d) => (
            <button key={d} type="button" className={d === days ? 'is-on' : ''} aria-pressed={d === days} onClick={() => setDays(d)} style={{ width: 'auto', padding: '0 10px' }}>
              {t.period[d]}
            </button>
          ))}
        </div>
      </header>
      <p className="news-status">{t.located(i.num(data.located), i.num(data.total))}</p>
      <div className="geo-regions__bar" role="img" aria-label={(['west', 'east', 'south'] as const).map((r) => `${t.regions[r]} ${data.regions[r]}`).join(' · ')}>
        {(['west', 'east', 'south'] as const).map((r) => (
          <i key={r} style={{ width: `${(data.regions[r] / sum) * 100}%`, background: COLOR[r] }} />
        ))}
      </div>
      <ul className="geo-regions__legend">
        {(['west', 'east', 'south'] as const).map((r) => (
          <li key={r}>
            <span style={{ background: COLOR[r] }} />
            {t.regions[r]} <b>{i.num(data.regions[r])}</b> <small>{Math.round((data.regions[r] / sum) * 100)}%</small>
          </li>
        ))}
      </ul>
      <h4>{t.cities}</h4>
      <ul className="geo-regions__places">
        {data.places.slice(0, 12).map((p) => (
          <li key={p.name}>
            <button type="button" onClick={() => drill({ entity: p.name, days: String(days) })}>
              <span dir="auto">{p.name}</span>
              <i style={{ width: `${(p.count / max) * 100}%`, background: COLOR[p.region] }} />
              <b>{i.num(p.count)}</b>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
