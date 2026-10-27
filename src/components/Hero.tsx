import { useContext, useEffect, useRef, type MouseEvent as RMouseEvent } from 'react'
import { type Count, type Flux, type NewsResponse, type Stats, DrillContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useCountUp } from '../lib/motion'
import { type V, arc, fromLatLon, rotate } from './Globe'

/**
 * En-tête « centre de commandement » du tableau de bord : chiffres clés animés,
 * globe 3D centré sur la Libye où chaque ville pulse selon le nombre de mentions, et fil des dernières actualités.
 */

const HERO_TEXT = {
  ar: {
    title: 'رادار ليبيا المباشر',
    sub: 'المدن الأكثر ذكراً خلال 7 أيام',
    k24: 'أخبار آخر 24 ساعة',
    kSources: 'مصادر نشطة اليوم',
    kNeg: 'النبرة السلبية اليوم',
    kWeek: 'حجم الأسبوع',
    vsAvg: (p: string) => `${p} مقارنة بالمتوسط`,
    vsPrev: (p: string) => `${p} مقارنة بالأسبوع السابق`,
    noBase: 'بيانات غير كافية للمقارنة',
    over: 'أكثر من',
    ofTone: 'من الأخبار المصنّفة',
    latest: 'آخر الأخبار',
    mentions: 'إشارة',
  },
  en: {
    title: 'Live Libya radar',
    sub: 'Most mentioned cities, last 7 days',
    k24: 'News, last 24 hours',
    kSources: 'Active sources today',
    kNeg: 'Negative tone today',
    kWeek: 'Weekly volume',
    vsAvg: (p: string) => `${p} vs average`,
    vsPrev: (p: string) => `${p} vs previous week`,
    noBase: 'Not enough data to compare',
    over: 'over',
    ofTone: 'of rated news',
    latest: 'Latest',
    mentions: 'mentions',
  },
}

// Villes libyennes, sous la forme arabe normalisée par la veille
const CITY: Record<string, [number, number, string]> = {
  طرابلس: [32.89, 13.19, 'Tripoli'],
  بنغازي: [32.12, 20.07, 'Benghazi'],
  مصراتة: [32.38, 15.09, 'Misrata'],
  سبها: [27.04, 14.43, 'Sabha'],
  سرت: [31.21, 16.59, 'Sirte'],
  الزاوية: [32.76, 12.73, 'Zawiya'],
  درنة: [32.77, 22.64, 'Derna'],
  البيضاء: [32.76, 21.76, 'Bayda'],
  طبرق: [32.08, 23.96, 'Tobruk'],
  أجدابيا: [30.76, 20.23, 'Ajdabiya'],
  اجدابيا: [30.76, 20.23, 'Ajdabiya'],
  المرج: [32.49, 20.83, 'Marj'],
  زليتن: [32.47, 14.57, 'Zliten'],
  الخمس: [32.65, 14.26, 'Khoms'],
  غريان: [32.17, 13.02, 'Gharyan'],
  صبراتة: [32.79, 12.48, 'Sabratha'],
  زوارة: [32.93, 12.08, 'Zuwara'],
  ترهونة: [32.43, 13.63, 'Tarhuna'],
  'بني وليد': [31.76, 13.99, 'Bani Walid'],
  الكفرة: [24.18, 23.31, 'Kufra'],
  غات: [24.96, 10.17, 'Ghat'],
  أوباري: [26.59, 12.78, 'Ubari'],
  مرزق: [25.92, 13.92, 'Murzuq'],
  هون: [29.13, 15.95, 'Hun'],
  نالوت: [31.87, 10.98, 'Nalut'],
  البريقة: [30.4, 19.58, 'Brega'],
  'راس لانوف': [30.5, 18.55, 'Ras Lanuf'],
  'رأس لانوف': [30.5, 18.55, 'Ras Lanuf'],
  جالو: [29.03, 21.55, 'Jalu'],
  الجفرة: [29.12, 15.94, 'Jufra'],
  يفرن: [32.06, 12.53, 'Yafran'],
  الزنتان: [31.93, 12.25, 'Zintan'],
  شحات: [32.83, 21.86, 'Shahhat'],
}

const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)}%`

/**
 * Écart (en %) entre une valeur et la moyenne des jours de référence qui ont des données, ramenée à `scale` jours.
 * null quand la comparaison n'a pas de sens : moins de 5 jours d'historique (collecte récente) ou base inférieure à 30 % de la valeur.
 */
function compare(current: number, base: number[], scale: number) {
  const active = base.filter((n) => n > 0)
  if (active.length < 5) return null
  const ref = (active.reduce((a, b) => a + b, 0) / active.length) * scale
  if (ref < current * 0.3) return null
  return ((current - ref) / ref) * 100
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, k) => `${(k / (values.length - 1)) * 100},${30 - (v / max) * 26}`)
  return (
    <svg className="mms-hero__spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="mms-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,32 ${pts.join(' ')} 100,32`} fill="url(#mms-spark)" />
      <polyline points={pts.join(' ')} pathLength={1} className="mms-hero__sparkline" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Kpi(props: { label: string; value: number; suffix?: string; note?: string; trend?: number; spark?: number[]; tone?: 'neg' | 'pos'; index: number }) {
  const i = useI18n()
  const shown = useCountUp(props.value, 1200)
  return (
    <div className={`mms-hero__kpi fx-tilt${props.tone ? ` is-${props.tone}` : ''}`} style={{ ['--i' as string]: props.index }}>
      <span className="mms-hero__label">{props.label}</span>
      <strong className="mms-hero__value">
        {i.num(shown)}
        {props.suffix}
      </strong>
      {props.note && (
        <small className={props.trend == null ? 'mms-hero__note' : props.trend >= 0 ? 'mms-hero__note is-up' : 'mms-hero__note is-down'}>
          {props.trend != null && <i aria-hidden>{props.trend >= 0 ? '▲' : '▼'}</i>}
          {props.note}
        </small>
      )}
      {props.spark && <Spark values={props.spark} />}
    </div>
  )
}

/** Globe 3D tourné vers la Libye ; chaque ville citée pulse en proportion de ses mentions */
function LibyaGlobe({ places, onPick }: { places: Count[]; onPick: (name: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hits = useRef<{ x: number; y: number; name: string }[]>([])
  const i = useI18n()
  const placesKey = places.map((p) => `${p.name}:${p.count}`).join('|')

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const css = getComputedStyle(document.documentElement)
    const light = css.colorScheme === 'light'

    // Vue rapprochée : une grille de points sur la région (Afrique du Nord, Méditerranée), et un quadrillage tous les 10°
    const dots: V[] = []
    for (let lat = -6; lat <= 58; lat += 1.1) for (let lon = -24; lon <= 60; lon += 1.1) dots.push(fromLatLon(lat, lon))
    const grid: V[][] = []
    for (let lat = 0; lat <= 50; lat += 10) grid.push(Array.from({ length: 49 }, (_, k) => fromLatLon(lat, -20 + k * 1.6)))
    for (let lon = -20; lon <= 55; lon += 10) grid.push(Array.from({ length: 41 }, (_, k) => fromLatLon(-5 + k * 1.5, lon)))
    const known = places.filter((p) => CITY[p.name]).slice(0, 12)
    const max = Math.max(...known.map((p) => p.count), 1)
    const pins = known.map((p) => ({ name: p.name, en: CITY[p.name][2], count: p.count, w: p.count / max, v: fromLatLon(CITY[p.name][0], CITY[p.name][1]) }))
    const hub = pins[0]?.v ?? fromLatLon(32.89, 13.19)
    const links = pins.slice(1, 8).map((p) => arc(hub, p.v, 40))
    // Contour simplifié de la Libye (frontières approximatives)
    const border = [
      [33.17, 11.5],
      [32.9, 13.5],
      [32.4, 15.3],
      [31.2, 16.3],
      [30.3, 18.7],
      [30.8, 19.9],
      [31.9, 20.0],
      [32.9, 21.9],
      [32.6, 23.2],
      [31.6, 25.15],
      [29.5, 24.9],
      [22.0, 25.0],
      [20.0, 25.0],
      [19.5, 24.0],
      [21.5, 18.9],
      [23.4, 14.9],
      [22.6, 14.2],
      [24.3, 11.5],
      [25.3, 10.3],
      [26.6, 9.9],
      [30.2, 9.5],
      [30.6, 10.2],
      [31.9, 10.8],
      [33.17, 11.5],
    ].map(([a, b]) => fromLatLon(a, b))

    let w = 0
    let h = 0
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas!.clientWidth
      h = canvas!.clientHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let mx = 0
    let my = 0
    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect()
      mx = ((e.clientX - b.left) / b.width - 0.5) * 2
      my = ((e.clientY - b.top) / b.height - 0.5) * 2
    }
    canvas.addEventListener('pointermove', onMove)
    const onLeave = () => {
      mx = 0
      my = 0
    }
    canvas.addEventListener('pointerleave', onLeave)

    // Orientation de base : la Libye face à la caméra
    const baseY = -(17.5 * Math.PI) / 180
    const baseX = (27 * Math.PI) / 180
    let tiltX = 0
    let tiltY = 0
    let raf = 0
    const start = performance.now()
    const dotColor = light ? '0, 120, 74' : '125, 255, 179'

    function frame(now: number) {
      const t = still ? 2 : (now - start) / 1000
      tiltX += (my * 0.06 - tiltX) * 0.05
      tiltY += (mx * 0.1 - tiltY) * 0.05
      // Balancement lent autour de la Libye, au lieu d'une rotation complète
      const ry = baseY + Math.sin(t * 0.16) * 0.07 + tiltY
      const rx = baseX + Math.sin(t * 0.11) * 0.03 + tiltX
      // Globe très rapproché : la Libye occupe le centre, la courbure se devine sur les bords
      const R = Math.max(w * 1.15, h * 1.9)
      const cx = w * 0.5
      const cy = h * 0.6
      const P = 3.4
      const project = (v: V): [number, number, number, number] => {
        const s = P / (P - v[2])
        return [cx + v[0] * R * s, cy - v[1] * R * s, v[2], s]
      }
      const rot = (v: V) => rotate(v, ry, rx)

      ctx!.clearRect(0, 0, w, h)
      const halo = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6)
      halo.addColorStop(0, light ? 'rgba(0, 163, 98, 0.14)' : 'rgba(25, 211, 138, 0.2)')
      halo.addColorStop(1, 'rgba(25, 211, 138, 0)')
      ctx!.fillStyle = halo
      ctx!.fillRect(0, 0, w, h)

      const body = ctx!.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 1.08)
      if (light) {
        body.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
        body.addColorStop(1, 'rgba(214, 233, 224, 0.95)')
      } else {
        body.addColorStop(0, 'rgba(16, 64, 52, 0.95)')
        body.addColorStop(0.7, 'rgba(6, 26, 30, 0.96)')
        body.addColorStop(1, 'rgba(2, 10, 16, 0.98)')
      }
      ctx!.beginPath()
      ctx!.arc(cx, cy, R * (P / P), 0, Math.PI * 2)
      ctx!.fillStyle = body
      ctx!.fill()

      for (const d of dots) {
        const v = rot(d)
        if (v[2] < -0.1) continue
        const [x, y, z, s] = project(v)
        ctx!.fillStyle = `rgba(${dotColor}, ${0.08 + Math.max(z - 0.6, 0) * 1.1})`
        const size = 1.5 * s
        ctx!.fillRect(x - size / 2, y - size / 2, size, size)
      }

      // Quadrillage (méridiens et parallèles)
      ctx!.strokeStyle = light ? 'rgba(0, 122, 74, 0.12)' : 'rgba(125, 255, 179, 0.09)'
      ctx!.lineWidth = 1
      for (const line of grid) {
        ctx!.beginPath()
        line.forEach((g, n) => {
          const [x, y] = project(rot(g))
          if (n) ctx!.lineTo(x, y)
          else ctx!.moveTo(x, y)
        })
        ctx!.stroke()
      }

      // Frontière de la Libye
      ctx!.beginPath()
      border.forEach((b, k) => {
        const [x, y] = project(rot(b))
        if (k) ctx!.lineTo(x, y)
        else ctx!.moveTo(x, y)
      })
      ctx!.closePath()
      ctx!.fillStyle = light ? 'rgba(0, 163, 98, 0.1)' : 'rgba(25, 211, 138, 0.09)'
      ctx!.fill()
      ctx!.strokeStyle = light ? 'rgba(0, 122, 74, 0.7)' : 'rgba(125, 255, 179, 0.75)'
      ctx!.lineWidth = 1.4
      ctx!.setLineDash([4, 3])
      ctx!.stroke()
      ctx!.setLineDash([])

      // Arcs entre la ville la plus citée et les suivantes, parcourus par une impulsion
      links.forEach((pts, k) => {
        const p2 = pts.map((p) => project(rot(p)))
        ctx!.beginPath()
        p2.forEach(([x, y], n) => (n ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y)))
        ctx!.strokeStyle = 'rgba(240, 180, 60, 0.5)'
        ctx!.lineWidth = 1.2
        ctx!.stroke()
        const pos = Math.floor(((((t * 0.4 + k * 0.21) % 1) + 1) % 1) * (p2.length - 1))
        const [px, py] = p2[pos]
        const g = ctx!.createRadialGradient(px, py, 0, px, py, 7)
        g.addColorStop(0, 'rgba(255, 220, 140, 1)')
        g.addColorStop(1, 'rgba(255, 220, 140, 0)')
        ctx!.fillStyle = g
        ctx!.fillRect(px - 7, py - 7, 14, 14)
      })

      // Villes : onde radar proportionnelle aux mentions, étiquette pour les plus citées
      const nextHits: { x: number; y: number; name: string }[] = []
      const boxes: number[][] = []
      pins.forEach((p, k) => {
        const [x, y, z] = project(rot(p.v))
        if (z < 0) return
        const r = 3 + p.w * 6
        for (let ring = 0; ring < 2; ring++) {
          const q = (((t * 0.55 + ring * 0.5 + k * 0.13) % 1) + 1) % 1
          ctx!.beginPath()
          ctx!.arc(x, y, r + q * (14 + p.w * 26), 0, Math.PI * 2)
          ctx!.strokeStyle = `rgba(${k === 0 ? '255, 93, 93' : '56, 189, 248'}, ${0.65 * (1 - q)})`
          ctx!.lineWidth = 1.4
          ctx!.stroke()
        }
        ctx!.beginPath()
        ctx!.arc(x, y, r, 0, Math.PI * 2)
        ctx!.fillStyle = k === 0 ? '#ff5d5d' : light ? '#0284c7' : '#7dd3fc'
        ctx!.shadowColor = k === 0 ? '#ff5d5d' : '#38bdf8'
        ctx!.shadowBlur = 14
        ctx!.fill()
        ctx!.shadowBlur = 0
        nextHits.push({ x, y, name: p.name })
        if (k < 7) {
          const label = `${i.lang === 'ar' ? p.name : p.en} · ${i.num(p.count)}`
          ctx!.font = `600 ${k === 0 ? 13 : 12}px "IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif`
          ctx!.direction = 'ltr'
          ctx!.textAlign = 'left'
          const tw = ctx!.measureText(label).width
          // Étiquette à droite du point, sinon à gauche, sinon dessous ; omise si elle chevauche une autre
          const spots = [
            [x + r + 8, y - r - 6],
            [x - r - 14 - tw, y - r - 6],
            [x - tw / 2, y + r + 22],
          ]
          const free = spots.find(([sx, sy]) => !boxes.some((b) => sx - 6 < b[2] && sx + tw + 6 > b[0] && sy - 13 < b[3] && sy + 7 > b[1]))
          if (!free) return
          const [lx, ly] = free
          boxes.push([lx - 6, ly - 13, lx + tw + 6, ly + 7])
          ctx!.fillStyle = light ? 'rgba(255, 255, 255, 0.88)' : 'rgba(4, 10, 18, 0.72)'
          ctx!.beginPath()
          ctx!.roundRect(lx - 6, ly - 13, tw + 12, 20, 6)
          ctx!.fill()
          ctx!.fillStyle = light ? '#173028' : '#e7eef6'
          ctx!.fillText(label, lx, ly + 2)
        }
      })
      hits.current = nextHits

      ctx!.beginPath()
      ctx!.arc(cx, cy, R, 0, Math.PI * 2)
      ctx!.strokeStyle = light ? 'rgba(0, 122, 74, 0.25)' : 'rgba(125, 255, 179, 0.22)'
      ctx!.lineWidth = 1.2
      ctx!.stroke()

      // Balayage radar centré sur la Libye
      if (!still) {
        const [sx, sy] = project(rot(fromLatLon(27, 17.5)))
        const sr = Math.min(w, h) * 0.62
        const sweep = ctx!.createConicGradient(t * 0.9, sx, sy)
        sweep.addColorStop(0, light ? 'rgba(0, 163, 98, 0.18)' : 'rgba(125, 255, 179, 0.18)')
        sweep.addColorStop(0.1, 'rgba(125, 255, 179, 0)')
        sweep.addColorStop(1, 'rgba(125, 255, 179, 0)')
        ctx!.save()
        ctx!.beginPath()
        ctx!.arc(sx, sy, sr, 0, Math.PI * 2)
        ctx!.clip()
        ctx!.fillStyle = sweep
        ctx!.fillRect(sx - sr, sy - sr, sr * 2, sr * 2)
        ctx!.restore()
        for (const f of [0.35, 0.7, 1]) {
          ctx!.beginPath()
          ctx!.arc(sx, sy, sr * f, 0, Math.PI * 2)
          ctx!.strokeStyle = light ? 'rgba(0, 122, 74, 0.12)' : 'rgba(125, 255, 179, 0.1)'
          ctx!.stroke()
        }
        raf = requestAnimationFrame(frame)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, i.lang])

  function onClick(e: RMouseEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - b.left
    const y = e.clientY - b.top
    const hit = hits.current.find((p) => Math.hypot(p.x - x, p.y - y) < 18)
    if (hit) onPick(hit.name)
  }
  function onHover(e: RMouseEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect()
    const near = hits.current.some((p) => Math.hypot(p.x - (e.clientX - b.left), p.y - (e.clientY - b.top)) < 18)
    e.currentTarget.style.cursor = near ? 'pointer' : 'grab'
  }

  return <canvas ref={ref} className="mms-hero__globe" onClick={onClick} onMouseMove={onHover} aria-hidden />
}

export function CommandHero({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const x = HERO_TEXT[i.lang]
  const drill = useContext(DrillContext)
  const q = flux ? `&flux=${flux}` : ''
  const day = useFetch<Stats>(`/api/news/stats?days=1${q}`).data
  const fortnight = useFetch<Stats>(`/api/news/stats?days=14${q}`).data
  const week = useFetch<Stats>(`/api/news/stats?days=7${q}`).data
  const latest = useFetch<NewsResponse>(`/api/news?size=14${q}`).data

  const per = fortnight?.perDay.map((d) => d.count) ?? []
  const last7 = per.slice(-7).reduce((a, b) => a + b, 0)
  // 24 h comparées aux 7 jours complets d'avant (aujourd'hui exclu) ; la semaine aux 7 jours précédents
  const vsAvg = compare(day?.total ?? 0, per.slice(-8, -1), 1)
  const vsPrev = compare(last7, per.slice(-14, -7), 7)
  const shown = (n: number) => (n > 300 ? `${x.over} +300%` : pct(n))
  const tones = day?.tones ?? []
  const rated = tones.reduce((a, b) => a + b.count, 0)
  const neg = tones.find((t) => t.name === 'negative')?.count ?? 0
  const negPct = rated ? Math.round((neg / rated) * 100) : 0
  const total24 = day?.total ?? 0

  return (
    <section className="mms-hero" aria-label={x.title}>
      <div className="mms-hero__kpis">
        <Kpi
          index={0}
          label={x.k24}
          value={total24}
          spark={per}
          trend={vsAvg ?? undefined}
          note={!fortnight ? undefined : vsAvg == null ? x.noBase : x.vsAvg(shown(vsAvg))}
        />
        <Kpi index={1} label={x.kSources} value={day?.sourcesCount ?? 0} spark={week?.perDay.map((d) => d.count)} />
        <Kpi index={2} label={x.kNeg} value={negPct} suffix="%" note={rated ? `${i.num(rated)} ${x.ofTone}` : undefined} tone="neg" />
        <Kpi
          index={3}
          label={x.kWeek}
          value={last7}
          trend={vsPrev ?? undefined}
          note={!fortnight ? undefined : vsPrev == null ? x.noBase : x.vsPrev(shown(vsPrev))}
          tone="pos"
        />
      </div>

      <div className="mms-hero__stage fx-tilt fx-soft">
        <div className="mms-hero__head">
          <span className="mms-hero__live" aria-hidden />
          <div>
            <strong>{x.title}</strong>
            <small>{x.sub}</small>
          </div>
        </div>
        <LibyaGlobe places={week?.places ?? []} onPick={(name) => drill({ entity: name })} />
      </div>

      {!!latest?.items.length && (
        <div className="mms-ticker" dir={i.dir}>
          <span className="mms-ticker__tag">{x.latest}</span>
          <div className="mms-ticker__track">
            <div className="mms-ticker__rail">
              {[...latest.items, ...latest.items].map((it, k) => (
                <a key={`${it.id}-${k}`} href={it.url || undefined} target="_blank" rel="noreferrer" dir="auto" aria-hidden={k >= latest.items.length}>
                  <b>{it.origin}</b>
                  {it.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
