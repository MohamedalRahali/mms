import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './components/Login'
import { AuthContext, type User, watchUnauthorized } from './lib/auth'

/** Porte d'entrée : la page de connexion tant qu'aucune session n'est ouverte */
function Gate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

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

  if (user === undefined) return <div className="mms-boot" aria-busy="true" />
  if (!user) return <Login onLogin={setUser} />
  return (
    <AuthContext.Provider value={{ user, logout }}>
      <App />
    </AuthContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
)
