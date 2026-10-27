import { useEffect, useMemo, useRef, useState } from 'react'
import { type V, arc, fromLatLon, rotate } from '../components/Globe'
import { flag, fmtNum } from './api'
import { isLand } from './land'

/**
 * Carte animée « التحليلات والدول » : globe 3D en points qui tourne, un repère par pays d'où viennent les visites
 * (taille selon le nombre de visites, onde qui pulse), et des arcs lumineux vers le serveur.
 * Glisser pour tourner, survoler un pays pour ses chiffres. Sans animation si l'utilisateur l'a demandé au système.
 */

// Centre approximatif de chaque pays (latitude, longitude), codes ISO 3166-1
const CENTER: Record<string, [number, number]> = {
  LY: [27, 17], TN: [34, 9.5], DZ: [28, 2.6], MA: [31.8, -7.1], EG: [26.8, 30.8], SD: [15.6, 30.2], TD: [15.4, 18.7], NE: [17.6, 8.1],
  ML: [17.6, -4], MR: [21, -10.9], SN: [14.5, -14.5], NG: [9.1, 8.7], GH: [7.9, -1], CI: [7.5, -5.5], CM: [7.4, 12.4], ET: [9.1, 40.5],
  KE: [-0.02, 37.9], ZA: [-30.6, 22.9], SO: [5.2, 46.2], TZ: [-6.4, 34.9], UG: [1.4, 32.3], CD: [-4, 21.8], AO: [-11.2, 17.9], RW: [-1.9, 29.9],
  FR: [46.2, 2.2], DE: [51.2, 10.4], IT: [41.9, 12.6], ES: [40.5, -3.7], PT: [39.4, -8.2], GB: [55.4, -3.4], IE: [53.4, -8.2], NL: [52.1, 5.3],
  BE: [50.5, 4.5], LU: [49.8, 6.1], CH: [46.8, 8.2], AT: [47.5, 14.6], PL: [51.9, 19.1], CZ: [49.8, 15.5], SE: [60.1, 18.6], NO: [60.5, 8.5],
  FI: [61.9, 25.7], DK: [56.3, 9.5], GR: [39.1, 21.8], TR: [39, 35.2], RO: [45.9, 25], BG: [42.7, 25.5], HU: [47.2, 19.5], UA: [48.4, 31.2],
  RU: [61.5, 105.3], MT: [35.9, 14.4], CY: [35.1, 33.4], RS: [44, 21], HR: [45.1, 15.2], AL: [41.2, 20.2], BA: [43.9, 17.7], SK: [48.7, 19.7],
  SA: [23.9, 45.1], AE: [23.4, 53.8], QA: [25.4, 51.2], KW: [29.3, 47.5], BH: [26, 50.6], OM: [21.5, 55.9], YE: [15.6, 48.5], JO: [30.6, 36.2],
  LB: [33.9, 35.9], SY: [34.8, 39], IQ: [33.2, 43.7], IR: [32.4, 53.7], IL: [31, 34.9], PS: [31.9, 35.2], AF: [33.9, 67.7], PK: [30.4, 69.3],
  IN: [20.6, 79], BD: [23.7, 90.4], CN: [35.9, 104.2], JP: [36.2, 138.3], KR: [35.9, 127.8], ID: [-0.8, 113.9], MY: [4.2, 101.9], SG: [1.35, 103.8],
  TH: [15.9, 100.99], VN: [14.1, 108.3], PH: [12.9, 121.8], AU: [-25.3, 133.8], NZ: [-40.9, 174.9], US: [37.1, -95.7], CA: [56.1, -106.3],
  MX: [23.6, -102.6], BR: [-14.2, -51.9], AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.3], PE: [-9.2, -75], VE: [6.4, -66.6],
  KZ: [48, 66.9], UZ: [41.4, 64.6], AZ: [40.1, 47.6], GE: [42.3, 43.4], AM: [40.1, 45], HK: [22.4, 114.1], TW: [23.7, 121], EE: [58.6, 25],
  LV: [56.9, 24.6], LT: [55.2, 23.9], IS: [64.96, -19], SI: [46.2, 15], MK: [41.6, 21.7], MD: [47.4, 28.4], BY: [53.7, 27.95], ME: [42.7, 19.4],
}

type Row = { cc: string; country: string; hits: number; ips: number; users: number }

export function GeoGlobe({ rows, server }: { rows: Row[]; server?: { cc: string; country: string } | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ row: Row; x: number; y: number } | null>(null)
  const placed = useMemo(() => rows.filter((r) => CENTER[r.cc]).slice(0, 40), [rows])
  const unknown = rows.filter((r) => !CENTER[r.cc]).reduce((n, r) => n + r.hits, 0)
  const total = rows.reduce((n, r) => n + r.hits, 0)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Points réguliers sur la sphère (spirale de Fibonacci), classés terre ou mer une fois pour toutes
    const N = 5200
    const dots: { v: V; land: boolean }[] = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const t = i * Math.PI * (3 - Math.sqrt(5))
      const v: V = [Math.cos(t) * r, y, Math.sin(t) * r]
      const lat = (Math.asin(y) * 180) / Math.PI
      const lon = (Math.atan2(v[0], v[2]) * 180) / Math.PI
      dots.push({ v, land: isLand(lat, lon) })
    }
    const max = Math.max(1, ...placed.map((r) => r.hits))
    const marks = placed.map((r) => ({ row: r, v: fromLatLon(...CENTER[r.cc]), k: Math.sqrt(r.hits / max) }))
    const hub = server && CENTER[server.cc] ? fromLatLon(...CENTER[server.cc]) : null
    const links = hub ? marks.filter((m) => m.row.cc !== server!.cc).map((m) => ({ m, pts: arc(m.v, hub, 56) })) : []
    // Vue de départ tournée vers le pays le plus actif
    const first = marks[0] ? CENTER[marks[0].row.cc] : [27, 17]
    let ry = (-first[1] * Math.PI) / 180
    let rx = ((first[0] * Math.PI) / 180) * 0.85
    let w = 0
    let h = 0
    let drag: { x: number; y: number; ry: number; rx: number } | null = null
    let idleAt = 0
    let raf = 0
    let screen: { row: Row; x: number; y: number; r: number }[] = []

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

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, ry, rx }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      if (drag) {
        ry = drag.ry + ((e.clientX - drag.x) / box.width) * 3.2
        rx = Math.max(-1.2, Math.min(1.2, drag.rx + ((e.clientY - drag.y) / box.height) * 2.4))
        idleAt = performance.now()
      }
      const px = e.clientX - box.left
      const py = e.clientY - box.top
      const hit = screen.find((s) => Math.hypot(s.x - px, s.y - py) <= s.r + 6)
      setHover(hit ? { row: hit.row, x: hit.x, y: hit.y } : null)
    }
    const up = () => {
      drag = null
      idleAt = performance.now()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', () => setHover(null))

    let last = performance.now()
    function frame(now: number) {
      const dt = Math.min(now - last, 50) / 1000
      last = now
      // Rotation lente, reprise 2 s après un glisser
      if (!still && !drag && now - idleAt > 2000) ry += dt * 0.12
      const t = still ? 0 : now / 1000
      const R = Math.min(w, h) * 0.4
      const cx = w / 2
      const cy = h / 2
      const P = 3.4
      const project = (v: V): [number, number, number, number] => {
        const s = P / (P - v[2])
        return [cx + v[0] * R * s, cy - v[1] * R * s, v[2], s]
      }
      ctx!.clearRect(0, 0, w, h)
      const halo = ctx!.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.6)
      halo.addColorStop(0, 'rgba(47, 203, 129, 0.18)')
      halo.addColorStop(1, 'rgba(47, 203, 129, 0)')
      ctx!.fillStyle = halo
      ctx!.fillRect(0, 0, w, h)
      const body = ctx!.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05)
      body.addColorStop(0, 'rgba(18, 92, 62, 0.95)')
      body.addColorStop(0.7, 'rgba(6, 46, 32, 0.95)')
      body.addColorStop(1, 'rgba(2, 24, 16, 0.98)')
      ctx!.beginPath()
      ctx!.arc(cx, cy, R * (P / P), 0, Math.PI * 2)
      ctx!.fillStyle = body
      ctx!.fill()
      for (const d of dots) {
        const v = rotate(d.v, ry, rx)
        if (v[2] < 0) continue
        const [x, y, z, s] = project(v)
        // Terre : points clairs ; mer : trame à peine visible
        ctx!.fillStyle = d.land ? `rgba(125, 255, 179, ${0.25 + z * 0.65})` : `rgba(125, 255, 179, ${0.04 + z * 0.06})`
        const size = (d.land ? 1.9 : 1) * s
        ctx!.fillRect(x - size / 2, y - size / 2, size, size)
      }
      // Arcs vers le serveur, avec une impulsion qui les parcourt
      links.forEach(({ m, pts }, k) => {
        const rot = pts.map((p) => project(rotate(p, ry, rx)))
        ctx!.beginPath()
        let pen = false
        for (const [x, y, z] of rot) {
          if (z > -0.2) {
            if (pen) ctx!.lineTo(x, y)
            else ctx!.moveTo(x, y)
            pen = true
          } else pen = false
        }
        ctx!.strokeStyle = `rgba(240, 180, 60, ${0.18 + m.k * 0.35})`
        ctx!.lineWidth = 1 + m.k * 1.5
        ctx!.stroke()
        if (!still) {
          const f = (t * 0.35 + k * 0.17) % 1
          const [x, y, z] = rot[Math.floor(f * (rot.length - 1))]
          if (z > -0.2) {
            ctx!.beginPath()
            ctx!.arc(x, y, 2.4, 0, Math.PI * 2)
            ctx!.fillStyle = '#ffd27a'
            ctx!.fill()
          }
        }
      })
      // Repères des pays : disque selon les visites, onde qui pulse
      const next: typeof screen = []
      marks.forEach((m, k) => {
        const v = rotate(m.v, ry, rx)
        if (v[2] < 0) return
        const [x, y, , s] = project(v)
        const r = (3 + m.k * 9) * s
        const phase = still ? 0.5 : (t * 0.6 + k * 0.13) % 1
        ctx!.beginPath()
        ctx!.arc(x, y, r + phase * 16, 0, Math.PI * 2)
        ctx!.strokeStyle = `rgba(47, 203, 129, ${0.55 * (1 - phase)})`
        ctx!.lineWidth = 1.5
        ctx!.stroke()
        ctx!.beginPath()
        ctx!.arc(x, y, r, 0, Math.PI * 2)
        ctx!.fillStyle = 'rgba(47, 203, 129, 0.85)'
        ctx!.fill()
        ctx!.lineWidth = 1
        ctx!.strokeStyle = 'rgba(230, 255, 240, 0.9)'
        ctx!.stroke()
        if (m.k > 0.35 || k < 3) {
          ctx!.font = '600 12px "IBM Plex Sans Arabic", Tahoma, sans-serif'
          ctx!.fillStyle = 'rgba(230, 255, 240, 0.95)'
          ctx!.textAlign = 'center'
          ctx!.fillText(m.row.cc, x, y - r - 6)
        }
        next.push({ row: m.row, x, y, r })
      })
      // Serveur : losange doré
      if (hub) {
        const v = rotate(hub, ry, rx)
        if (v[2] >= 0) {
          const [x, y] = project(v)
          ctx!.save()
          ctx!.translate(x, y)
          ctx!.rotate(Math.PI / 4)
          ctx!.fillStyle = '#f0b43c'
          ctx!.fillRect(-5, -5, 10, 10)
          ctx!.restore()
        }
      }
      screen = next
      if (!still || drag) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // Mouvement réduit : on redessine seulement quand on glisse
    const redraw = () => {
      if (still) {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(frame)
      }
    }
    canvas.addEventListener('pointermove', redraw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointermove', redraw)
      canvas.removeEventListener('pointerup', up)
    }
  }, [placed, server])

  const top = placed.slice(0, 8)
  const maxTop = Math.max(1, ...top.map((r) => r.hits))
  return (
    <div className="sa-geo">
      <div className="sa-geo__stage">
        <canvas ref={ref} className="sa-geo__canvas" role="img" aria-label="خريطة الزيارات حسب الدول" />
        {hover && (
          <div className="sa-geo__tip" style={{ left: hover.x, top: hover.y }}>
            <b>
              {flag(hover.row.cc)} {hover.row.country || hover.row.cc}
            </b>
            <span>
              {fmtNum(hover.row.hits)} زيارة · {hover.row.ips} عنوان · {hover.row.users} مستخدم
            </span>
          </div>
        )}
        <p className="sa-geo__hint">اسحب لتدوير الكرة · مرّر على دولة لعرض أرقامها{server?.cc ? ' · ◆ موقع الخادم' : ''}</p>
      </div>
      <ol className="sa-geo__list">
        {top.map((r) => (
          <li key={r.cc}>
            <span>
              {flag(r.cc)} {r.country || r.cc}
            </span>
            <i style={{ width: `${(r.hits / maxTop) * 100}%` }} />
            <b>{total ? Math.round((r.hits / total) * 100) : 0}%</b>
          </li>
        ))}
        {unknown > 0 && <li className="sa-muted">شبكة محلية أو غير معروفة: {fmtNum(unknown)}</li>}
      </ol>
    </div>
  )
}
