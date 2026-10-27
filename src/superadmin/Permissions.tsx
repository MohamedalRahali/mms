import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, errText } from './api'

/**
 * الصلاحيات التفصيلية : profils de permissions (modules du menu et boutons), un tableau profils × droits.
 * Les profils de base suivent les rôles (مدير، محلل، قارئ) ; les autres sont créés ici et attribués à un compte
 * depuis الفريق والصلاحيات ou la fiche du compte. Mêmes règles côté serveur (server/permissions.js).
 */

export type Profile = { id: string; name: string; builtin: boolean; modules: string[]; actions: string[]; users: number; updatedAt?: string }
type Catalog = { modules: { key: string; label: string }[]; actions: { key: string; label: string }[]; profiles: Profile[] }

// Liste des profils partagée par les sélecteurs (équipe, création de compte, fiche du compte)
let cache: Promise<Catalog> | null = null
const subs = new Set<() => void>()
export const loadCatalog = (fresh = false) => {
  if (fresh || !cache) {
    cache = api<Catalog>('/permissions')
    cache.catch(() => (cache = null))
    if (fresh) subs.forEach((fn) => fn())
  }
  return cache
}
function useCatalog() {
  const [data, setData] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    const fn = () => setN((x) => x + 1)
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }, [])
  useEffect(() => {
    let live = true
    loadCatalog()
      .then((d) => live && (setData(d), setError('')))
      .catch((e) => live && setError(errText(e)))
    return () => {
      live = false
    }
  }, [n])
  return { data, error, reload: useCallback(() => loadCatalog(true), []) }
}

/** Sélecteur du profil d'un compte : « حسب الدور » ('') ou un profil créé */
export function ProfileSelect({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { data } = useCatalog()
  const custom = data?.profiles.filter((p) => !p.builtin) ?? []
  return (
    <select className="sa-input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="ملف الصلاحيات">
      <option value="">حسب الدور</option>
      {custom.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      {value && !custom.some((p) => p.id === value) && <option value={value}>…</option>}
    </select>
  )
}

/** Résumé des droits effectifs d'un compte (fiche du compte) */
export function PermsSummary({ perms }: { perms: { profileName: string; modules: string[]; actions: string[] } }) {
  const { data } = useCatalog()
  if (!data) return null
  return (
    <div className="sa-perm-sum">
      <p>
        ملف الصلاحيات المطبّق: <b>{perms.profileName}</b> — {perms.modules.length}/{data.modules.length} وحدة، {perms.actions.length}/{data.actions.length} إجراء
      </p>
      <div className="sa-perm-chips">
        {data.modules.map((m) => (
          <span key={m.key} className={perms.modules.includes(m.key) ? 'sa-tag is-ok' : 'sa-tag is-off'}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="sa-perm-chips">
        {data.actions.map((a) => (
          <span key={a.key} className={perms.actions.includes(a.key) ? 'sa-tag is-ok' : 'sa-tag is-off'}>
            {a.label}
          </span>
        ))}
      </div>
    </div>
  )
}

type Draft = Record<string, { modules: string[]; actions: string[]; name: string }>

export function Permissions() {
  const { data, error, reload } = useCatalog()
  const [draft, setDraft] = useState<Draft>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [copyOf, setCopyOf] = useState('viewer')

  const profiles = data?.profiles ?? []
  const view = (p: Profile) => draft[p.id] ?? { modules: p.modules, actions: p.actions, name: p.name }
  const dirty = useMemo(
    () =>
      profiles.filter((p) => {
        const d = draft[p.id]
        return d && (d.name !== p.name || [...d.modules].sort().join() !== [...p.modules].sort().join() || [...d.actions].sort().join() !== [...p.actions].sort().join())
      }),
    [draft, profiles],
  )

  function toggle(p: Profile, kind: 'modules' | 'actions', key: string) {
    const v = view(p)
    const list = v[kind].includes(key) ? v[kind].filter((k) => k !== key) : [...v[kind], key]
    setDraft({ ...draft, [p.id]: { ...v, [kind]: list } })
  }
  function setAll(p: Profile, on: boolean) {
    const v = view(p)
    setDraft({ ...draft, [p.id]: { ...v, modules: on ? data!.modules.map((m) => m.key) : [v.modules[0] ?? 'news'], actions: on ? data!.actions.map((a) => a.key) : [] } })
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      setMsg(ok)
      return true
    } catch (e) {
      const code = (e as Error).message
      setMsg(code === 'NO_MODULE' ? 'يجب أن يبقى في كل ملف وحدة واحدة على الأقل.' : code === 'EXISTS' ? 'يوجد ملف بهذا الاسم.' : code === 'NO_NAME' ? 'اكتب اسم الملف.' : errText(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveAll() {
    const ok = await run(async () => {
      for (const p of dirty) await api(`/permissions/${p.id}`, 'PUT', draft[p.id])
    }, `تم حفظ ${dirty.length === 1 ? 'الملف' : `${dirty.length} ملفات`}. تُطبَّق التغييرات فورًا على الخادم، وتتحدّث قوائم المستخدمين خلال دقيقة.`)
    if (ok) {
      setDraft({})
      reload()
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (await run(() => api('/permissions', 'POST', { name: newName, copyOf }), `تم إنشاء الملف «${newName}». حدّد صلاحياته ثم احفظ، وأسنده إلى الحسابات من «الفريق والصلاحيات».`)) {
      setNewName('')
      reload()
    }
  }

  async function remove(p: Profile) {
    if (!confirm(`حذف الملف «${p.name}» ؟ الحسابات المسندة إليه (${p.users}) تعود إلى صلاحيات دورها.`)) return
    if (await run(() => api(`/permissions/${p.id}`, 'DELETE'), `تم حذف الملف «${p.name}».`)) reload()
  }

  return (
    <div className="sa-grid">
      <section className="sa-card sa-card--wide">
        <div className="sa-card__head">
          <h2>ملفات الصلاحيات</h2>
        </div>
        <p className="sa-muted">
          فعّل أو عطّل كل وحدة (صفحة في القائمة) وكل إجراء (زر) لكل ملف. يرى المستخدم فقط ما يسمح به ملفه، ويرفض الخادم كل طلب خارج صلاحياته (يُسجَّل في «الأمان»). أنشئ ملفات مخصّصة مثل «تحليل فقط» وأسندها إلى أي حساب دون إنشاء حساب جديد.
        </p>
        <form className="sa-row sa-perm-new" onSubmit={create}>
          <input className="sa-input" placeholder="اسم الملف الجديد (مثال: تحليل فقط)" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} required />
          <label className="sa-row">
            انطلاقًا من
            <select className="sa-input" value={copyOf} onChange={(e) => setCopyOf(e.target.value)}>
              <option value="">لا شيء</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="sa-btn" disabled={busy}>
            + إنشاء ملف
          </button>
        </form>
        {error && <p className="sa-error">{error}</p>}
        {msg && <p className="sa-note">{msg}</p>}
      </section>

      {data && (
        <section className="sa-card sa-card--wide">
          <div className="sa-card__head">
            <h2>الوحدات والإجراءات حسب الملف</h2>
            <div className="sa-row">
              {dirty.length > 0 && (
                <button type="button" className="sa-btn sa-btn--ghost" onClick={() => setDraft({})} disabled={busy}>
                  تراجع
                </button>
              )}
              <button type="button" className="sa-btn" onClick={saveAll} disabled={busy || !dirty.length}>
                {dirty.length ? `حفظ التغييرات (${dirty.length})` : 'لا تغييرات'}
              </button>
            </div>
          </div>
          <div className="sa-table-wrap">
            <table className="sa-table sa-perm-table">
              <thead>
                <tr>
                  <th />
                  {profiles.map((p) => (
                    <th key={p.id} className={dirty.includes(p) ? 'is-dirty' : ''}>
                      {p.builtin ? (
                        <b>{p.name}</b>
                      ) : (
                        <input
                          className="sa-input sa-perm-name"
                          value={view(p).name}
                          maxLength={60}
                          aria-label="اسم الملف"
                          onChange={(e) => setDraft({ ...draft, [p.id]: { ...view(p), name: e.target.value } })}
                        />
                      )}
                      <small className="sa-muted">
                        {p.builtin ? 'دور أساسي' : 'ملف مخصّص'} · {p.users} حساب
                      </small>
                      <span className="sa-perm-quick">
                        <button type="button" className="sa-link" onClick={() => setAll(p, true)}>
                          الكل
                        </button>
                        <button type="button" className="sa-link" onClick={() => setAll(p, false)}>
                          الحد الأدنى
                        </button>
                        {!p.builtin && (
                          <button type="button" className="sa-link sa-link--bad" onClick={() => remove(p)}>
                            حذف
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="sa-perm-group">
                  <td colSpan={profiles.length + 1}>الوحدات (صفحات القائمة)</td>
                </tr>
                {data.modules.map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    {profiles.map((p) => (
                      <td key={p.id}>
                        <PermSwitch on={view(p).modules.includes(m.key)} label={`${m.label} — ${p.name}`} onChange={() => toggle(p, 'modules', m.key)} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="sa-perm-group">
                  <td colSpan={profiles.length + 1}>الإجراءات (الأزرار)</td>
                </tr>
                {data.actions.map((a) => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    {profiles.map((p) => (
                      <td key={p.id}>
                        <PermSwitch on={view(p).actions.includes(a.key)} label={`${a.label} — ${p.name}`} onChange={() => toggle(p, 'actions', a.key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sa-muted">«المساعدة» متاحة دائمًا. إدارة الحسابات والصلاحيات تبقى حكرًا على هذه الوحدة العليا ولا يملكها أي ملف.</p>
        </section>
      )}
    </div>
  )
}

function PermSwitch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} className={on ? 'sa-switch is-on' : 'sa-switch'} onClick={onChange}>
      <span />
    </button>
  )
}
