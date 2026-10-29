import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'

/**
 * Listes de diffusion (قوائم المراسلة) : choix d'une liste à côté d'un champ « المرسَل إليهم » (ses adresses s'ajoutent
 * au champ), et gestion des listes de l'équipe dans une fenêtre. Serveur : server/mailingLists.js.
 */

export type MailingList = { id: string; name: string; emails: string[]; createdBy?: string; updatedAt?: string }

const TEXT = {
  ar: {
    pick: 'إضافة قائمة مراسلة',
    manage: 'إدارة القوائم…',
    title: 'قوائم المراسلة',
    intro: 'مجموعات عناوين بريد مشتركة بين الفريق، تُضاف بنقرة إلى حقل المرسَل إليهم. لا تُقبل إلا عناوين النطاقات المسموح بها.',
    name: 'اسم القائمة',
    emails: 'العناوين (مفصولة بفواصل أو أسطر)',
    add: 'إنشاء القائمة',
    save: 'حفظ',
    edit: 'تعديل',
    remove: 'حذف',
    cancel: 'إلغاء',
    close: 'إغلاق',
    confirm: (n: string) => `حذف القائمة «${n}»؟ لا يؤثر ذلك على عمليات الرصد أو التقارير التي استُعملت فيها.`,
    count: (n: number) => `${n} عنوان`,
    empty: 'لا توجد قوائم بعد.',
    errors: {
      NO_NAME: 'أدخل اسماً للقائمة.',
      NO_EMAILS: 'أضف عنواناً واحداً على الأقل.',
      TOO_MANY_EMAILS: '50 عنواناً على الأكثر في القائمة.',
      BAD_EMAIL: 'أحد العناوين غير صحيح.',
      DOMAIN_BLOCKED: 'عناوين خارج النطاقات المسموح بها (مثل npdc.gov.ly) غير مقبولة.',
      NAME_TAKEN: 'يوجد قائمة بهذا الاسم.',
      TOO_MANY: 'تم بلوغ الحد الأقصى (50 قائمة).',
      FAILED: 'تعذّرت العملية.',
    } as Record<string, string>,
  },
  en: {
    pick: 'Add a mailing list',
    manage: 'Manage lists…',
    title: 'Mailing lists',
    intro: 'Groups of email addresses shared by the team, added in one click to a recipients field. Only addresses from allowed domains are accepted.',
    name: 'List name',
    emails: 'Addresses (separated by commas or lines)',
    add: 'Create the list',
    save: 'Save',
    edit: 'Edit',
    remove: 'Delete',
    cancel: 'Cancel',
    close: 'Close',
    confirm: (n: string) => `Delete the list “${n}”? Watches and reports that used it are not affected.`,
    count: (n: number) => `${n} addresses`,
    empty: 'No list yet.',
    errors: {
      NO_NAME: 'Enter a name for the list.',
      NO_EMAILS: 'Add at least one address.',
      TOO_MANY_EMAILS: '50 addresses at most per list.',
      BAD_EMAIL: 'One of the addresses is not valid.',
      DOMAIN_BLOCKED: 'Addresses outside the allowed domains (such as npdc.gov.ly) are not accepted.',
      NAME_TAKEN: 'A list with this name already exists.',
      TOO_MANY: 'Maximum reached (50 lists).',
      FAILED: 'The operation failed.',
    } as Record<string, string>,
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

/** Ajoute les adresses d'une liste à un champ texte d'adresses, sans doublon */
export function mergeEmails(field: string, emails: string[]) {
  const have = field.split(/[\s,;،]+/).filter(Boolean)
  return [...new Set([...have, ...emails])].join(', ')
}

let cache: MailingList[] | null = null
const listeners = new Set<(l: MailingList[]) => void>()
async function reloadLists() {
  const r = await fetch('/api/mailing-lists')
  cache = r.ok ? ((await r.json()).lists as MailingList[]) : []
  for (const fn of listeners) fn(cache)
}
function useLists() {
  const [lists, setLists] = useState<MailingList[]>(cache ?? [])
  useEffect(() => {
    listeners.add(setLists)
    if (!cache) reloadLists().catch(() => {})
    return () => {
      listeners.delete(setLists)
    }
  }, [])
  return lists
}

/** Liste déroulante à placer sous un champ d'adresses : choisir une liste ajoute ses adresses au champ */
export function MailingListPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useText()
  const lists = useLists()
  const may = canDo(useAuth()?.user, 'send_email')
  const [open, setOpen] = useState(false)
  if (!may) return null
  return (
    <span className="mms-mlpick">
      <select
        value=""
        aria-label={t.pick}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__manage') setOpen(true)
          else {
            const l = lists.find((x) => x.id === v)
            if (l) onChange(mergeEmails(value, l.emails))
          }
        }}
      >
        <option value="">＋ {t.pick}</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({t.count(l.emails.length)})
          </option>
        ))}
        <option value="__manage">{t.manage}</option>
      </select>
      {open && <MailingListsDialog onClose={() => setOpen(false)} />}
    </span>
  )
}

/** Fenêtre de gestion des listes : création, modification, suppression */
export function MailingListsDialog({ onClose }: { onClose: () => void }) {
  const t = useText()
  const lists = useLists()
  const dialog = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<MailingList | null>(null)
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  function start(l: MailingList | null) {
    setEditing(l)
    setName(l?.name ?? '')
    setEmails(l?.emails.join(', ') ?? '')
    setError('')
  }
  async function submit(e: FormEvent) {
    // La fenêtre peut s'ouvrir depuis un autre formulaire (veille, rapport) : son envoi ne doit pas remonter jusqu'à lui
    e.preventDefault()
    e.stopPropagation()
    setError('')
    const res = await fetch(editing ? `/api/mailing-lists/${editing.id}` : '/api/mailing-lists', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, emails }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(t.errors[j.error] ?? t.errors.FAILED)
      return
    }
    start(null)
    await reloadLists()
  }
  async function remove(l: MailingList) {
    if (!window.confirm(t.confirm(l.name))) return
    await fetch(`/api/mailing-lists/${l.id}`, { method: 'DELETE' })
    if (editing?.id === l.id) start(null)
    await reloadLists()
  }
  return createPortal(
    <dialog ref={dialog} className="mms-mldialog" onClose={onClose} onSubmit={(e) => e.stopPropagation()} aria-labelledby="mms-ml-title">
      <header>
        <h2 id="mms-ml-title">{t.title}</h2>
        <button type="button" className="news-btn news-btn--ghost" onClick={() => dialog.current?.close()}>
          {t.close}
        </button>
      </header>
      <p className="mms-mldialog__intro">{t.intro}</p>
      {lists.length === 0 ? (
        <p className="news-status">{t.empty}</p>
      ) : (
        <ul className="mms-mldialog__list">
          {lists.map((l) => (
            <li key={l.id}>
              <div>
                <b dir="auto">{l.name}</b> <small>({t.count(l.emails.length)})</small>
                <p dir="ltr">{l.emails.join(', ')}</p>
              </div>
              <span>
                <button type="button" className="news-btn news-btn--ghost" onClick={() => start(l)}>
                  {t.edit}
                </button>
                <button type="button" className="news-btn news-btn--ghost" onClick={() => remove(l)}>
                  {t.remove}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mms-mldialog__form">
        <label className="mms-field">
          <span>{t.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} dir="auto" required />
        </label>
        <label className="mms-field">
          <span>{t.emails}</span>
          <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={3} dir="ltr" placeholder="name@npdc.gov.ly, …" required />
        </label>
        {error && <p className="news-status news-status--error">{error}</p>}
        <div className="mms-mldialog__actions">
          <button type="submit" className="news-btn">
            {editing ? t.save : t.add}
          </button>
          {editing && (
            <button type="button" className="news-btn news-btn--ghost" onClick={() => start(null)}>
              {t.cancel}
            </button>
          )}
        </div>
      </form>
    </dialog>,
    document.body,
  )
}
