import { lazy, StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import './brand.css'
import App from './App.tsx'
import { Login } from './components/Login'
import { AuthContext, type User, watchUnauthorized } from './lib/auth'
import { applyTheme } from './lib/fx'
import { installTracking } from './lib/track'

// Console Super Admin : chargée seulement à l'adresse /superadmin, séparée de la plateforme
const SuperAdmin = lazy(() => import('./superadmin/SuperAdmin'))
const isSuperAdmin = location.pathname === '/superadmin' || location.pathname.startsWith('/superadmin/')

try {
  applyTheme(localStorage.getItem('mms-theme') === 'light' ? 'light' : 'dark')
} catch {
  applyTheme('dark')
}

/** Porte d'entrée : la page de connexion tant qu'aucune session n'est ouverte */
type PlatformStatus = { announcement: { text: string; level: string } | null; maintenance: { message: string } | null }

function Gate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [status, setStatus] = useState<PlatformStatus | null>(null)

  // Bandeau d'annonce et mode maintenance, réglés dans la console Super Admin
  useEffect(() => {
    const load = () =>
      fetch('/api/platform/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setStatus(s))
        .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => (user ? installTracking() : undefined), [user])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setUser(json?.user ?? null))
      .catch(() => setUser(null))
    return watchUnauthorized(() => setUser(null))
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (status?.maintenance)
    return (
      <div className="mms-maintenance" dir="rtl">
        <h1>المنصة قيد الصيانة</h1>
        <p>{status.maintenance.message || 'نعود قريبًا.'}</p>
        <p dir="ltr">MMS is under maintenance.</p>
      </div>
    )
  const banner = status?.announcement?.text ? (
    <div className={`mms-announce is-${status.announcement.level}`} role="status" dir="auto">
      {status.announcement.text}
    </div>
  ) : null
  if (user === undefined) return <div className="mms-boot" aria-busy="true" />
  if (!user)
    return (
      <>
        {banner}
        <Login onLogin={setUser} />
      </>
    )
  return (
    <AuthContext.Provider value={{ user, logout }}>
      {banner}
      <App />
    </AuthContext.Provider>
  )
}

// Application installable (PWA) : uniquement sur la version publiée
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isSuperAdmin) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSuperAdmin ? (
      <Suspense fallback={null}>
        <SuperAdmin />
      </Suspense>
    ) : (
      <Gate />
    )}
  </StrictMode>,
)
