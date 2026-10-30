import { useEffect, useRef, useState } from 'react'
import type { Theme } from '../lib/fx'
import { PALETTES, type Palette } from '../lib/palette'

/** Bouton « المظهر » de la barre du haut : quatre thèmes de couleurs et le mode sombre ou clair */
export function ThemePicker({ lang, palette, onPalette, theme, onTheme }: { lang: 'ar' | 'en'; palette: Palette; onPalette: (p: Palette) => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ar = lang === 'ar'
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const label = ar ? 'المظهر' : 'Appearance'
  return (
    <div className="mms-pal" ref={ref}>
      <button type="button" className="mms-tool__btn mms-pal__btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title={label} aria-label={label}>
        <span className="mms-pal__dot" aria-hidden />
      </button>
      {open && (
        <div className="mms-pal__pop" role="dialog" aria-label={label} dir={ar ? 'rtl' : 'ltr'} lang={lang}>
          <p className="mms-pal__title">{ar ? 'اختر مظهر المنصة' : 'Choose the platform style'}</p>
          <ul className="mms-pal__list" role="radiogroup" aria-label={label}>
            {PALETTES.map((p) => (
              <li key={p.key}>
                <button type="button" role="radio" aria-checked={palette === p.key} className="mms-pal__opt" onClick={() => onPalette(p.key)}>
                  <span className="mms-pal__sw" aria-hidden>
                    {p.swatch.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="mms-pal__txt">
                    <b>{ar ? p.ar : p.en}</b>
                    <small>{ar ? p.arHint : p.enHint}</small>
                  </span>
                  {palette === p.key && <span className="mms-pal__check">✓</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="mms-pal__mode" role="group" aria-label={ar ? 'الوضع' : 'Mode'}>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
              {ar ? 'داكن' : 'Dark'}
            </button>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>
              {ar ? 'فاتح' : 'Light'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
