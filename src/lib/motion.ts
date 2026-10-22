import { useEffect, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Fait défiler un chiffre de 0 à sa valeur (chiffres clés), sans animation si l'utilisateur la refuse */
export function useCountUp(value: number, duration = 900) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0))
  useEffect(() => {
    if (reduced()) {
      setShown(value)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return shown
}
