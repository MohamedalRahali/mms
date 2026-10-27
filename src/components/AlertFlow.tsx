import { type FormEvent, useState } from 'react'
import { type AlertFlow, type AlertStatus, type SmartAlert } from '../lib/radar'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'

/** Traitement d'une alerte du radar : statut, attribution, commentaire, historique (server/alertFlow.js) */

const TEXT = {
  ar: {
    status: { new: 'جديد', ack: 'تم الاطلاع', assigned: 'مُسند', escalated: 'مُصعَّد', validated: 'مُعتمد', closed: 'مغلق' } as Record<AlertStatus, string>,
    actions: { ack: 'اطّلعت', escalated: 'تصعيد', validated: 'اعتماد', closed: 'إغلاق' } as Partial<Record<AlertStatus, string>>,
    assign: 'إسناد إلى',
    comment: 'تعليق',
    save: 'حفظ',
    history: 'السجل',
    to: 'إلى',
  },
  en: {
    status: { new: 'New', ack: 'Acknowledged', assigned: 'Assigned', escalated: 'Escalated', validated: 'Validated', closed: 'Closed' } as Record<AlertStatus, string>,
    actions: { ack: 'Acknowledge', escalated: 'Escalate', validated: 'Validate', closed: 'Close' } as Partial<Record<AlertStatus, string>>,
    assign: 'Assign to',
    comment: 'Comment',
    save: 'Save',
    history: 'History',
    to: 'to',
  },
}

export function AlertFlowBar({ alert }: { alert: SmartAlert }) {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const auth = useAuth()
  const [flow, setFlow] = useState<AlertFlow>(alert.flow ?? { status: 'new', history: [] })
  const [open, setOpen] = useState(false)
  const [assignee, setAssignee] = useState(flow.assignee ?? '')
  const [comment, setComment] = useState('')
  const can = canDo(auth?.user, 'mark_processed')
  async function send(body: { status?: AlertStatus; assignee?: string; comment?: string }) {
    const res = await fetch(`/api/radar/alerts/${encodeURIComponent(alert.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) setFlow((await res.json()).flow)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    send({ ...(assignee !== (flow.assignee ?? '') ? { status: 'assigned' as AlertStatus, assignee } : {}), comment })
    setComment('')
  }
  return (
    <div className={`alert-flow is-${flow.status}`}>
      <span className="alert-flow__status">{t.status[flow.status]}</span>
      {flow.assignee && (
        <small>
          {t.to} <span dir="ltr">{flow.assignee}</span>
        </small>
      )}
      {can &&
        (Object.keys(t.actions) as AlertStatus[])
          .filter((s) => s !== flow.status)
          .map((s) => (
            <button key={s} type="button" className="alert-flow__btn" onClick={() => send({ status: s })}>
              {t.actions[s]}
            </button>
          ))}
      <button type="button" className="alert-flow__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t.history} ({flow.history.length})
      </button>
      {open && (
        <div className="alert-flow__panel">
          {can && (
            <form onSubmit={submit} className="alert-flow__form">
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder={t.assign} aria-label={t.assign} dir="auto" maxLength={120} />
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.comment} aria-label={t.comment} dir="auto" maxLength={1000} />
              <button type="submit" className="news-btn">
                {t.save}
              </button>
            </form>
          )}
          <ol>
            {[...flow.history].reverse().map((h, k) => (
              <li key={k}>
                <time>{i.dateTime(h.at)}</time> · <b dir="auto">{h.by}</b> · {t.status[h.status]}
                {h.assignee && ` → ${h.assignee}`}
                {h.comment && <p dir="auto">{h.comment}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
