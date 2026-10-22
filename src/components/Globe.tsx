import { useEffect, useRef } from 'react'

/**
 * Globe 3D de la page de connexion, dessiné à la main sur un canvas (aucune bibliothèque) :
 * un nuage de points sur une sphère qui tourne, trois orbites avec leurs satellites,
 * des arcs de liaison entre villes, une onde radar, et une légère inclinaison qui suit la souris.
 */

type V = [number, number, number]

const CITIES: V[] = [
  [36.8, 10.18, 0], // Tunis
  [32.9, 13.18, 0], // Tripoli
  [32.1, 20.08, 0], // Benghazi
  [34.74, 10.76, 0], // Sfax
  [32.37, 15.09, 0], // Misrata
  [27.04, 14.43, 0], // Sebha
  [30.04, 31.24, 0], // Le Caire
  [48.85, 2.35, 0], // Paris
]

function fromLatLon(lat: number, lon: number): V {
  const a = (lat * Math.PI) / 180
  const b = (lon * Math.PI) / 180
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]
}

function rotate([x, y, z]: V, ry: number, rx: number): V {
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const x1 = x * cy + z * sy
  const z1 = -x * sy + z * cy
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx]
}

/** Arc de grand cercle entre deux points, soulevé au-dessus de la surface */
function arc(a: V, b: V, steps = 48): V[] {
  const dot = Math.min(Math.max(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1), 1)
  const w = Math.acos(dot) || 1e-6
  const out: V[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const k1 = Math.sin((1 - t) * w) / Math.sin(w)
    const k2 = Math.sin(t * w) / Math.sin(w)
    const lift = 1 + Math.sin(Math.PI * t) * 0.18
    out.push([(a[0] * k1 + b[0] * k2) * lift, (a[1] * k1 + b[1] * k2) * lift, (a[2] * k1 + b[2] * k2) * lift])
  }
  return out
}

export function Globe() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Points répartis régulièrement sur la sphère (spirale de Fibonacci)
    const N = 1100
    const dots: V[] = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const t = i * Math.PI * (3 - Math.sqrt(5))
      dots.push([Math.cos(t) * r, y, Math.sin(t) * r])
    }
    const cities = CITIES.map(([lat, lon]) => fromLatLon(lat, lon))
    const links = [
      [0, 1],
      [1, 2],
      [0, 3],
      [1, 4],
      [4, 5],
      [0, 6],
      [7, 0],
      [2, 6],
    ].map(([a, b]) => arc(cities[a], cities[b]))
    const orbits = [
      { tilt: 0.35, spin: 0.9, r: 1.32, phase: 0 },
      { tilt: -0.55, spin: 0.6, r: 1.48, phase: 2 },
      { tilt: 1.15, spin: 0.45, r: 1.62, phase: 4 },
    ]

    let w = 0
    let h = 0
    let dpr = 1
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas!.clientWidth
      h = canvas!.clientHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let mx = 0
    let my = 0
    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2
      my = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onMove)

    let tiltX = 0
    let tiltY = 0
    let raf = 0
    const start = performance.now()

    function frame(now: number) {
      const t = still ? 8 : (now - start) / 1000
      tiltX += (my * 0.25 - tiltX) * 0.04
      tiltY += (mx * 0.35 - tiltY) * 0.04
      const ry = -2.6 + t * 0.12 + tiltY
      const rx = -0.42 + tiltX
      const R = Math.min(w, h) * 0.34
      const cx = w * 0.5
      const cy = h * 0.5
      const P = 3.2 // distance de la caméra, pour la perspective
      const project = (v: V): [number, number, number, number] => {
        const s = P / (P - v[2])
        return [cx + v[0] * R * s, cy - v[1] * R * s, v[2], s]
      }

      ctx!.clearRect(0, 0, w, h)

      // Halo derrière le globe
      const halo = ctx!.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9)
      halo.addColorStop(0, 'rgba(0, 200, 120, 0.22)')
      halo.addColorStop(1, 'rgba(0, 200, 120, 0)')
      ctx!.fillStyle = halo
      ctx!.fillRect(0, 0, w, h)

      // Corps de la sphère
      const body = ctx!.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05)
      body.addColorStop(0, 'rgba(18, 92, 62, 0.95)')
      body.addColorStop(0.7, 'rgba(6, 46, 32, 0.95)')
      body.addColorStop(1, 'rgba(2, 24, 16, 0.98)')
      ctx!.beginPath()
      ctx!.arc(cx, cy, R * (P / (P - 0)) * 1.0, 0, Math.PI * 2)
      ctx!.fillStyle = body
      ctx!.fill()

      // Orbites : moitié arrière d'abord, le reste après les points
      const orbitPts = orbits.map((o) => {
        const pts: V[] = []
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * Math.PI * 2
          let v: V = [Math.cos(a) * o.r, 0, Math.sin(a) * o.r]
          v = rotate(v, 0, o.tilt)
          pts.push(rotate(v, ry * 0.3, rx))
        }
        const sa = t * o.spin + o.phase
        const sat = rotate(rotate([Math.cos(sa) * o.r, 0, Math.sin(sa) * o.r], 0, o.tilt), ry * 0.3, rx)
        return { pts, sat }
      })
      const drawOrbits = (front: boolean) => {
        for (const { pts, sat } of orbitPts) {
          ctx!.beginPath()
          let pen = false
          for (const v of pts) {
            const [x, y, z] = project(v)
            if (z >= 0 === front) {
              if (pen) ctx!.lineTo(x, y)
              else ctx!.moveTo(x, y)
              pen = true
            } else pen = false
          }
          ctx!.strokeStyle = front ? 'rgba(125, 255, 179, 0.35)' : 'rgba(125, 255, 179, 0.12)'
          ctx!.lineWidth = 1.2
          ctx!.stroke()
          const [sx, sy, sz] = project(sat)
          if (sz >= 0 === front) {
            const g = ctx!.createRadialGradient(sx, sy, 0, sx, sy, 14)
            g.addColorStop(0, 'rgba(240, 180, 60, 0.95)')
            g.addColorStop(1, 'rgba(240, 180, 60, 0)')
            ctx!.fillStyle = g
            ctx!.fillRect(sx - 14, sy - 14, 28, 28)
            ctx!.beginPath()
            ctx!.arc(sx, sy, 3, 0, Math.PI * 2)
            ctx!.fillStyle = '#ffd27a'
            ctx!.fill()
          }
        }
      }
      drawOrbits(false)

      // Points de la sphère, plus clairs vers l'avant
      for (const d of dots) {
        const v = rotate(d, ry, rx)
        if (v[2] < -0.15) continue
        const [x, y, z, s] = project(v)
        const a = 0.15 + Math.max(z, 0) * 0.75
        ctx!.fillStyle = `rgba(125, 255, 179, ${a})`
        const size = 1.1 * s
        ctx!.fillRect(x - size / 2, y - size / 2, size, size)
      }

      // Arcs de liaison, avec une impulsion qui parcourt chaque arc
      links.forEach((pts, k) => {
        const rot = pts.map((p) => project(rotate(p, ry, rx)))
        ctx!.beginPath()
        let pen = false
        for (const [x, y, z] of rot) {
          if (z > -0.05) {
            if (pen) ctx!.lineTo(x, y)
            else ctx!.moveTo(x, y)
            pen = true
          } else pen = false
        }
        ctx!.strokeStyle = 'rgba(240, 180, 60, 0.55)'
        ctx!.lineWidth = 1.4
        ctx!.stroke()
        const pos = Math.floor(((((t * 0.35 + k * 0.17) % 1) + 1) % 1) * (rot.length - 1))
        const [px, py, pz] = rot[pos]
        if (pz > -0.05) {
          ctx!.beginPath()
          ctx!.arc(px, py, 2.6, 0, Math.PI * 2)
          ctx!.fillStyle = '#fff3d6'
          ctx!.fill()
        }
      })

      // Villes et onde radar sur Tunis et Tripoli
      cities.forEach((c, k) => {
        const [x, y, z] = project(rotate(c, ry, rx))
        if (z < 0) return
        ctx!.beginPath()
        ctx!.arc(x, y, 3.2, 0, Math.PI * 2)
        ctx!.fillStyle = k < 2 ? '#ffffff' : '#7dffb3'
        ctx!.fill()
        if (k < 2) {
          for (let ring = 0; ring < 2; ring++) {
            const p = (((t * 0.6 + ring * 0.5 + k * 0.25) % 1) + 1) % 1
            ctx!.beginPath()
            ctx!.arc(x, y, 4 + p * 26, 0, Math.PI * 2)
            ctx!.strokeStyle = `rgba(125, 255, 179, ${0.6 * (1 - p)})`
            ctx!.lineWidth = 1.5
            ctx!.stroke()
          }
        }
      })

      // Liseré lumineux du bord de la sphère
      ctx!.beginPath()
      ctx!.arc(cx, cy, R, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(125, 255, 179, 0.25)'
      ctx!.lineWidth = 1.5
      ctx!.stroke()

      drawOrbits(true)
      if (!still) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={ref} className="mms-globe" aria-hidden />
}
