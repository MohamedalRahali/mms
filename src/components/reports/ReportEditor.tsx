import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Editor, EditorContent, Node, mergeAttributes, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { Image } from '@tiptap/extension-image'
import { useI18n } from '../../lib/i18n'
import { canDo, useAuth } from '../../lib/auth'
import { type PmNode, type ReportMeta, PAPER_CSS, MARGINS, blobToBase64, downloadBlob, printReport, reportFilename, toDocx, toPdf } from '../../lib/reportExport'
import { type ReportText, reportText } from './text'
import { MailingListPicker } from '../MailingLists'

export type SendEntry = { at: string; status: string; to?: string[]; format?: string; accepted?: string[]; rejected?: string[]; error?: string; posts?: number }
export type Report = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  postIds: string[]
  ai: boolean
  meta: ReportMeta
  doc: PmNode
  history: SendEntry[]
}

/** Saut de page : trait pointillé dans l'éditeur, nouvelle page à l'impression, en PDF et dans Word */
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'rpt-pagebreak' })],
})

const SIZES = ['12px', '13px', '14px', '15px', '16px', '18px', '20px', '24px', '28px', '32px']
const COLORS = ['#1a2433', '#0d3b66', '#1d7a4e', '#7c3aed', '#c8492b', '#a77d12', '#6b7a90']
const PX = 96 / 25.4

/** Déplace le bloc de premier niveau qui contient le curseur (dir = -1 : vers le haut) */
function moveBlock(editor: Editor, dir: -1 | 1) {
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { $from } = state.selection
      if ($from.depth < 1) return false
      const index = $from.index(0)
      const target = index + dir
      if (target < 0 || target >= state.doc.childCount) return false
      const node = state.doc.child(index)
      const start = $from.before(1)
      const other = state.doc.child(target)
      tr.delete(start, start + node.nodeSize)
      const insertAt = dir < 0 ? start - other.nodeSize : start + other.nodeSize
      tr.insert(insertAt, node)
      return true
    })
    .run()
}
function deleteBlock(editor: Editor) {
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { $from } = state.selection
      if ($from.depth < 1) return false
      tr.delete($from.before(1), $from.after(1))
      return true
    })
    .run()
}

function Btn({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={on ? 'rpt-tb__btn is-on' : 'rpt-tb__btn'} title={label} aria-label={label} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}
const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <path fill="currentColor" d={d} />
  </svg>
)
const P = {
  undo: 'M12.5 8c-2.6 0-5 1-6.8 2.6L2 7v9h9l-3.6-3.6A7.5 7.5 0 0 1 19.2 16l2.3-.8A10 10 0 0 0 12.5 8z',
  redo: 'M18.4 10.6A10 10 0 0 0 2.5 15.2l2.3.8a7.5 7.5 0 0 1 11.8-3.6L13 16h9V7l-3.6 3.6z',
  bullets: 'M4 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 7h13v2H8zm0 6h13v2H8zm-4 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 19h13v2H8z',
  numbers: 'M3 5h2v5H4V6H3zm0 8h3v1l-2 2h2v1H3v-1l2-2H3zm0 5h3v4H3v-1h2v-.5H4v-1h1V19H3zM8 6h13v2H8zm0 6h13v2H8zm0 6h13v2H8z',
  quote: 'M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z',
  link: 'M10.6 13.4a1 1 0 0 0 1.4 0l4-4a1 1 0 1 0-1.4-1.4l-4 4a1 1 0 0 0 0 1.4zM8.5 18.3a2.8 2.8 0 0 1-4-4l2.8-2.8-1.4-1.4-2.8 2.8a4.8 4.8 0 0 0 6.8 6.8l2.8-2.8-1.4-1.4zm10.4-14.4a4.8 4.8 0 0 0-6.8 0L9.3 6.7l1.4 1.4 2.8-2.8a2.8 2.8 0 0 1 4 4l-2.8 2.8 1.4 1.4 2.8-2.8a4.8 4.8 0 0 0 0-6.8z',
  image: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 13h16l-5-6-4 5-3-3zm4-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  logo: 'M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z',
  table: 'M3 4h18v16H3V4zm2 2v3h6V6H5zm8 0v3h6V6h-6zm-8 5v3h6v-3H5zm8 0v3h6v-3h-6zm-8 5v2h6v-2H5zm8 0v2h6v-2h-6z',
  rowAdd: 'M3 4h18v6H3zm0 8h8v2H3zm0 4h8v2H3zm14-4h2v3h3v2h-3v3h-2v-3h-3v-2h3z',
  colAdd: 'M4 3h6v18H4zm8 0h2v8h-2zm0 10h2v8h-2zm6-1h2v3h3v2h-3v3h-2v-3h-3v-2h3z',
  rowDel: 'M3 4h18v6H3zm11.4 9L16 14.6 17.6 13l1.4 1.4-1.6 1.6 1.6 1.6-1.4 1.4-1.6-1.6-1.6 1.6-1.4-1.4 1.6-1.6-1.6-1.6zM3 13h8v2H3zm0 4h8v2H3z',
  colDel: 'M4 3h6v18H4zm9.4 10L15 14.6 16.6 13l1.4 1.4-1.6 1.6 1.6 1.6-1.4 1.4-1.6-1.6-1.6 1.6-1.4-1.4 1.6-1.6-1.6-1.6z',
  tableDel: 'M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4z',
  headerRow: 'M3 4h18v5H3zm0 7h18v9H3zm2 2v5h6v-5zm8 0v5h6v-5z',
  pageBreak: 'M4 3h16v6H4zm0 12h16v6H4zM2 11h3v2H2zm5 0h3v2H7zm5 0h3v2h-3zm5 0h3v2h-3z',
  hr: 'M3 11h18v2H3z',
  up: 'M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8l-4.6 4.6L5 11z',
  down: 'M12 20l-7-7 1.4-1.4 4.6 4.6V4h2v12.2l4.6-4.6L19 13z',
  blockDel: 'M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4zm1 7v8h1.5v-8zm3 0v8h1.5v-8z',
  clear: 'M6 5v.2L8.8 8H10l-.6 1.4 2 2L13 8h4V5zM3.3 5L2 6.3l7 7L7 18h3l1.6-3.7 5.7 5.7 1.3-1.3z',
  alignStart: 'M3 4h18v2H3zm6 4h12v2H9zM3 12h18v2H3zm6 4h12v2H9zM3 20h18v2H3z',
  alignCenter: 'M3 4h18v2H3zm4 4h10v2H7zm-4 4h18v2H3zm4 4h10v2H7zm-4 4h18v2H3z',
  alignEnd: 'M3 4h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3zm0 4h18v2H3z',
  justify: 'M3 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3z',
}

function Toolbar({ editor, t, rtl, logo, onImage }: { editor: Editor; t: ReportText; rtl: boolean; logo: string; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      level: ([1, 2, 3, 4] as const).find((l) => e.isActive('heading', { level: l })) ?? 0,
      size: (e.getAttributes('textStyle').fontSize as string) || '',
      color: (e.getAttributes('textStyle').color as string) || '',
      align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? '',
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  // Dans un document arabe, « début » = droite
  const startSide = rtl ? 'right' : 'left'
  const endSide = rtl ? 'left' : 'right'
  return (
    <div className="rpt-tb" role="toolbar" aria-label="Formatting">
      <div className="rpt-tb__grp">
        <Btn label={t.tb.undo} disabled={!s.undo} onClick={() => c().undo().run()}>
          <Ico d={rtl ? P.redo : P.undo} />
        </Btn>
        <Btn label={t.tb.redo} disabled={!s.redo} onClick={() => c().redo().run()}>
          <Ico d={rtl ? P.undo : P.redo} />
        </Btn>
      </div>
      <div className="rpt-tb__grp">
        <select
          className="rpt-tb__sel"
          aria-label={t.tb.style}
          title={t.tb.style}
          value={s.level}
          onChange={(e) => {
            const level = Number(e.target.value) as 0 | 1 | 2 | 3 | 4
            if (level) c().setHeading({ level }).run()
            else c().setParagraph().run()
          }}
        >
          <option value={0}>{t.tb.paragraph}</option>
          {[1, 2, 3, 4].map((l) => (
            <option key={l} value={l}>
              {t.tb.h(l)}
            </option>
          ))}
        </select>
        <select
          className="rpt-tb__sel rpt-tb__sel--size"
          aria-label={t.tb.size}
          title={t.tb.size}
          value={s.size}
          onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}
        >
          <option value="">—</option>
          {SIZES.map((z) => (
            <option key={z} value={z}>
              {parseInt(z)}
            </option>
          ))}
        </select>
      </div>
      <div className="rpt-tb__grp">
        <Btn label={t.tb.bold} on={s.bold} onClick={() => c().toggleBold().run()}>
          <b>B</b>
        </Btn>
        <Btn label={t.tb.italic} on={s.italic} onClick={() => c().toggleItalic().run()}>
          <i>I</i>
        </Btn>
        <Btn label={t.tb.underline} on={s.underline} onClick={() => c().toggleUnderline().run()}>
          <u>U</u>
        </Btn>
        <Btn label={t.tb.strike} on={s.strike} onClick={() => c().toggleStrike().run()}>
          <s>S</s>
        </Btn>
        <span className="rpt-tb__colors" role="group" aria-label={t.tb.color}>
          {COLORS.map((col) => (
            <button
              key={col}
              type="button"
              className={s.color === col ? 'rpt-tb__color is-on' : 'rpt-tb__color'}
              style={{ background: col }}
              title={`${t.tb.color} ${col}`}
              aria-label={`${t.tb.color} ${col}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (col === '#1a2433' ? c().unsetColor().run() : c().setColor(col).run())}
            />
          ))}
        </span>
        <Btn label={t.tb.clear} onClick={() => c().unsetAllMarks().clearNodes().run()}>
          <Ico d={P.clear} />
        </Btn>
      </div>
      <div className="rpt-tb__grp">
        <Btn label={t.tb.alignStart} on={s.align === startSide} onClick={() => c().setTextAlign(startSide).run()}>
          <Ico d={rtl ? P.alignEnd : P.alignStart} />
        </Btn>
        <Btn label={t.tb.alignCenter} on={s.align === 'center'} onClick={() => c().setTextAlign('center').run()}>
          <Ico d={P.alignCenter} />
        </Btn>
        <Btn label={t.tb.alignEnd} on={s.align === endSide} onClick={() => c().setTextAlign(endSide).run()}>
          <Ico d={rtl ? P.alignStart : P.alignEnd} />
        </Btn>
        <Btn label={t.tb.justify} on={s.align === 'justify'} onClick={() => c().setTextAlign('justify').run()}>
          <Ico d={P.justify} />
        </Btn>
      </div>
      <div className="rpt-tb__grp">
        <Btn label={t.tb.bullets} on={s.bullets} onClick={() => c().toggleBulletList().run()}>
          <Ico d={P.bullets} />
        </Btn>
        <Btn label={t.tb.numbers} on={s.numbers} onClick={() => c().toggleOrderedList().run()}>
          <Ico d={P.numbers} />
        </Btn>
        <Btn label={t.tb.quote} on={s.quote} onClick={() => c().toggleBlockquote().run()}>
          <Ico d={P.quote} />
        </Btn>
        <Btn
          label={t.tb.link}
          on={s.link}
          onClick={() => {
            const prev = (editor.getAttributes('link').href as string) || 'https://'
            const href = window.prompt(t.tb.linkPrompt, prev)
            if (href === null) return
            if (!href.trim() || href === 'https://') c().extendMarkRange('link').unsetLink().run()
            else if (/^(https?:\/\/|mailto:)/i.test(href.trim())) c().extendMarkRange('link').setLink({ href: href.trim() }).run()
          }}
        >
          <Ico d={P.link} />
        </Btn>
      </div>
      <div className="rpt-tb__grp">
        <Btn label={t.tb.image} onClick={onImage}>
          <Ico d={P.image} />
        </Btn>
        {logo && (
          <Btn label={t.tb.logo} onClick={() => c().setImage({ src: logo, alt: 'logo', width: 200 }).run()}>
            <Ico d={P.logo} />
          </Btn>
        )}
        <Btn label={t.tb.pageBreak} onClick={() => c().insertContent({ type: 'pageBreak' }).run()}>
          <Ico d={P.pageBreak} />
        </Btn>
        <Btn label={t.tb.hr} onClick={() => c().setHorizontalRule().run()}>
          <Ico d={P.hr} />
        </Btn>
      </div>
      <div className="rpt-tb__grp">
        <Btn label={t.tb.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Ico d={P.table} />
        </Btn>
        {s.table && (
          <>
            <Btn label={t.tb.rowAdd} onClick={() => c().addRowAfter().run()}>
              <Ico d={P.rowAdd} />
            </Btn>
            <Btn label={t.tb.colAdd} onClick={() => c().addColumnAfter().run()}>
              <Ico d={P.colAdd} />
            </Btn>
            <Btn label={t.tb.rowDel} onClick={() => c().deleteRow().run()}>
              <Ico d={P.rowDel} />
            </Btn>
            <Btn label={t.tb.colDel} onClick={() => c().deleteColumn().run()}>
              <Ico d={P.colDel} />
            </Btn>
            <Btn label={t.tb.headerRow} onClick={() => c().toggleHeaderRow().run()}>
              <Ico d={P.headerRow} />
            </Btn>
            <Btn label={t.tb.tableDel} onClick={() => c().deleteTable().run()}>
              <Ico d={P.tableDel} />
            </Btn>
          </>
        )}
      </div>
      <div className="rpt-tb__grp">
        <Btn label={t.tb.up} onClick={() => moveBlock(editor, -1)}>
          <Ico d={P.up} />
        </Btn>
        <Btn label={t.tb.down} onClick={() => moveBlock(editor, 1)}>
          <Ico d={P.down} />
        </Btn>
        <Btn label={t.tb.blockDel} onClick={() => deleteBlock(editor)}>
          <Ico d={P.blockDel} />
        </Btn>
      </div>
    </div>
  )
}

/** Titres du document, pour se déplacer dans un long rapport */
function Outline({ editor }: { editor: Editor }) {
  const items = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: { pos: number; level: number; text: string }[] = []
      e.state.doc.forEach((node, pos) => {
        if (node.type.name === 'heading' && node.attrs.level <= 2) out.push({ pos, level: node.attrs.level, text: node.textContent.slice(0, 80) })
      })
      return out
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  })
  return (
    <ol className="rpt-outline">
      {items.map((h) => (
        <li key={h.pos} className={`rpt-outline__l${h.level}`}>
          <button
            type="button"
            dir="auto"
            onClick={() => {
              editor.chain().focus().setTextSelection(h.pos + 1).run()
              const dom = editor.view.nodeDOM(h.pos)
              if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {h.text || '…'}
          </button>
        </li>
      ))}
    </ol>
  )
}

type MailState = { to: string; subject: string; message: string; format: 'pdf' | 'docx' }

/** Envoi par e-mail : rédaction, aperçu de la pièce jointe, envoi réel par le SMTP de MMS */
function MailDialog({ t, report, build, onClose, onHistory }: { t: ReportText; report: Report; build: (f: 'pdf' | 'docx') => Promise<Blob>; onClose: () => void; onHistory: (h: SendEntry[]) => void }) {
  const [m, setM] = useState<MailState>({ to: '', subject: report.title, message: t.defaultMessage(report.title), format: 'pdf' })
  const [step, setStep] = useState<'edit' | 'preview' | 'sending' | 'done'>('edit')
  const [file, setFile] = useState<{ blob: Blob; url: string; name: string } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => () => (file ? URL.revokeObjectURL(file.url) : undefined), [file])
  const recipients = m.to.split(/[,;\s]+/).filter(Boolean)
  const valid = recipients.length > 0 && recipients.length <= 20 && recipients.every((r) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(r))

  async function preview() {
    setMsg(null)
    setStep('preview')
    try {
      const blob = await build(m.format)
      setFile({ blob, url: URL.createObjectURL(blob), name: reportFilename(m.format) })
    } catch {
      setMsg({ ok: false, text: t.exportErr })
      setStep('edit')
    }
  }
  async function send() {
    if (!file) return
    setStep('sending')
    setMsg(null)
    try {
      const res = await fetch(`/api/reports/${report.id}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: recipients, subject: m.subject, message: m.message, format: m.format, filename: file.name, file: await blobToBase64(file.blob) }),
      })
      const body = await res.json().catch(() => ({}))
      if (body.history) onHistory(body.history)
      if (res.ok && body.ok) {
        setMsg({ ok: true, text: [t.mailOk(body.accepted.join(', ')), body.rejected?.length ? t.mailRejected(body.rejected.join(', ')) : ''].filter(Boolean).join(' — ') })
        setStep('done')
      } else {
        setMsg({ ok: false, text: t.mailErr[res.status === 413 ? 'ATTACHMENT_SIZE' : body.error] || t.mailErr.generic })
        setStep('preview')
      }
    } catch {
      setMsg({ ok: false, text: t.mailErr.generic })
      setStep('preview')
    }
  }

  return (
    <dialog ref={dialog} className="rpt-dialog" onClose={onClose} aria-labelledby="rpt-mail-title">
      <form method="dialog" className="rpt-dialog__box" onSubmit={(e) => e.preventDefault()}>
        <h3 id="rpt-mail-title">{t.mailTitle}</h3>
        {step === 'edit' && (
          <>
            <label className="rpt-field">
              <span>{t.to}</span>
              <input type="text" inputMode="email" dir="ltr" autoFocus value={m.to} onChange={(e) => setM({ ...m, to: e.target.value })} placeholder="name@example.ly, …" aria-describedby="rpt-to-hint" />
              <MailingListPicker value={m.to} onChange={(to) => setM({ ...m, to })} />
              <small id="rpt-to-hint">{t.toHint}</small>
            </label>
            <label className="rpt-field">
              <span>{t.subjectMail}</span>
              <input type="text" dir="auto" value={m.subject} maxLength={250} onChange={(e) => setM({ ...m, subject: e.target.value })} />
            </label>
            <label className="rpt-field">
              <span>{t.message}</span>
              <textarea dir="auto" rows={6} value={m.message} maxLength={5000} onChange={(e) => setM({ ...m, message: e.target.value })} />
            </label>
            <fieldset className="rpt-field rpt-field--row">
              <legend>{t.format}</legend>
              {(['pdf', 'docx'] as const).map((f) => (
                <label key={f} className="rpt-radio">
                  <input type="radio" name="fmt" checked={m.format === f} onChange={() => setM({ ...m, format: f })} />
                  {f === 'pdf' ? 'PDF' : 'Word (.docx)'}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {step !== 'edit' && (
          <div className="rpt-mailpreview">
            <dl>
              <dt>{t.to}</dt>
              <dd dir="ltr">{recipients.join(', ')}</dd>
              <dt>{t.subjectMail}</dt>
              <dd dir="auto">{m.subject}</dd>
              <dt>{t.attachment}</dt>
              <dd>
                {file ? (
                  <a href={file.url} target="_blank" rel="noopener noreferrer" dir="ltr">
                    {file.name} · {Math.max(1, Math.round(file.blob.size / 1024))} KB
                  </a>
                ) : (
                  <span className="rpt-spin">{t.exporting}</span>
                )}
              </dd>
            </dl>
            <div className="rpt-mailpreview__body" dir="auto">
              {m.message}
            </div>
          </div>
        )}
        {msg && (
          <p className={msg.ok ? 'rpt-msg rpt-msg--ok' : 'rpt-msg rpt-msg--err'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        <div className="rpt-dialog__actions">
          {step === 'edit' && (
            <button type="button" className="news-btn" disabled={!valid} onClick={preview}>
              {t.preview}
            </button>
          )}
          {(step === 'preview' || step === 'sending') && (
            <>
              <button type="button" className="news-btn" disabled={!file || step === 'sending'} onClick={send}>
                {step === 'sending' ? t.sending : t.send}
              </button>
              <button type="button" className="news-btn news-btn--ghost" disabled={step === 'sending'} onClick={() => setStep('edit')}>
                {t.edit}
              </button>
            </>
          )}
          <button type="button" className="news-btn news-btn--ghost" disabled={step === 'sending'} onClick={() => dialog.current?.close()}>
            {step === 'done' ? t.close : t.cancel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

export function ReportEditor({ report: initial, onClose }: { report: Report; onClose: () => void }) {
  const i = useI18n()
  const t = reportText(i.lang)
  const [title, setTitle] = useState(initial.title)
  const [meta, setMeta] = useState<ReportMeta>(initial.meta)
  const [history, setHistory] = useState<SendEntry[]>(initial.history)
  const [save, setSave] = useState<SaveState>('saved')
  const [busy, setBusy] = useState<'' | 'docx' | 'pdf'>('')
  const [err, setErr] = useState('')
  const [mail, setMail] = useState(false)
  // Envoi par e-mail : action « send_email » du profil
  const mayMail = canDo(useAuth()?.user, 'send_email')
  const [panel, setPanel] = useState<'outline' | 'page' | 'info' | 'sends'>('outline')
  const imageInput = useRef<HTMLInputElement>(null)
  const pending = useRef<{ title?: string; doc?: boolean; meta?: ReportMeta }>({})
  const timer = useRef<number>(0)
  const rtl = meta.lang !== 'en'
  // La barre d'outils reste visible sous l'en-tête fixe de MMS
  const [stickTop, setStickTop] = useState(0)
  useEffect(() => {
    const head = document.querySelector('.mms-head') as HTMLElement | null
    const measure = () => setStickTop(head && getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: { openOnClick: false, autolink: true, protocols: ['mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } } }),
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ allowBase64: true, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 40, minHeight: 20 } }),
      PageBreak,
    ],
    [],
  )

  const flush = useCallback(async (editor: Editor | null) => {
    window.clearTimeout(timer.current)
    const p = pending.current
    if (!p.title && !p.doc && !p.meta) return true
    pending.current = {}
    setSave('saving')
    try {
      const res = await fetch(`/api/reports/${initial.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(p.title !== undefined ? { title: p.title } : {}), ...(p.doc && editor ? { doc: editor.getJSON() } : {}), ...(p.meta ? { meta: p.meta } : {}) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSave(Object.keys(pending.current).length ? 'dirty' : 'saved')
      return true
    } catch {
      // Les modifications non enregistrées repartent au prochain essai
      pending.current = { ...p, ...pending.current }
      setSave('error')
      return false
    }
  }, [initial.id])

  const editorRef = useRef<Editor | null>(null)
  const schedule = useCallback(
    (patch: { title?: string; doc?: boolean; meta?: ReportMeta }) => {
      pending.current = { ...pending.current, ...patch }
      setSave('dirty')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => flush(editorRef.current), 1200)
    },
    [flush],
  )

  const editor = useEditor({
    extensions,
    content: initial.doc,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: 'rpt-doc', dir: rtl ? 'rtl' : 'ltr', lang: meta.lang, 'aria-label': title, spellcheck: 'true' } },
    onUpdate: () => schedule({ doc: true }),
  })
  editorRef.current = editor

  // Enregistre avant de quitter la page ou de fermer l'onglet
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        flush(editorRef.current)
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      flush(editorRef.current)
    }
  }, [flush])

  const setM = (patch: Partial<ReportMeta>) => {
    const next = { ...meta, ...patch }
    setMeta(next)
    schedule({ meta: next })
  }

  async function build(format: 'pdf' | 'docx') {
    if (!editor) throw new Error('no editor')
    return format === 'docx' ? toDocx(editor.getJSON() as PmNode, meta, title) : toPdf(editor.getHTML(), meta, title)
  }
  async function exportAs(format: 'pdf' | 'docx') {
    setBusy(format)
    setErr('')
    try {
      downloadBlob(await build(format), reportFilename(format))
    } catch (e) {
      console.error(e)
      setErr(t.exportErr)
    } finally {
      setBusy('')
    }
  }

  function onImageFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !editor) return
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 1_048_576) {
      setErr(t.logoErr)
      return
    }
    const r = new FileReader()
    r.onload = () => editor.chain().focus().setImage({ src: String(r.result), alt: f.name.slice(0, 100) }).run()
    r.readAsDataURL(f)
  }

  const paperW = Math.round((meta.orientation === 'landscape' ? 297 : 210) * PX)
  const pad = Math.round(MARGINS[meta.margin] * PX)
  const saveLabel = { saved: t.saved, dirty: t.unsaved, saving: t.saving, error: t.saveErr }[save]

  if (!editor) return null
  return (
    <div className="rpt-ed" dir={i.dir}>
      <style>{PAPER_CSS}</style>
      <div className="rpt-ed__chrome" style={{ top: stickTop }}>
      <header className="rpt-ed__top">
        <button
          type="button"
          className="rpt-ed__back"
          onClick={async () => {
            await flush(editor)
            onClose()
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden style={{ transform: i.dir === 'rtl' ? 'scaleX(-1)' : undefined }}>
            <path fill="currentColor" d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
          </svg>
          {t.back}
        </button>
        <input
          className="rpt-ed__title"
          dir="auto"
          value={title}
          maxLength={200}
          aria-label={t.reportTitle}
          onChange={(e) => {
            setTitle(e.target.value)
            schedule({ title: e.target.value })
          }}
        />
        <span className={`rpt-ed__save is-${save}`} role="status">
          {saveLabel}
        </span>
        <div className="rpt-ed__actions">
          {save !== 'saved' && (
            <button type="button" className="news-btn news-btn--ghost" onClick={() => flush(editor)}>
              {t.save}
            </button>
          )}
          <button type="button" className="news-btn news-btn--ghost" onClick={() => printReport(editor.getHTML(), meta, title)}>
            {t.print}
          </button>
          <button type="button" className="news-btn news-btn--ghost" disabled={!!busy} onClick={() => exportAs('docx')}>
            {busy === 'docx' ? t.exporting : `⬇ ${t.docx}`}
          </button>
          <button type="button" className="news-btn news-btn--ghost" disabled={!!busy} onClick={() => exportAs('pdf')} title={t.pdfNote}>
            {busy === 'pdf' ? t.exporting : `⬇ ${t.pdf}`}
          </button>
          {mayMail && (
            <button type="button" className="news-btn" onClick={() => setMail(true)}>
              ✉ {t.email}
            </button>
          )}
        </div>
      </header>
      {err && (
        <p className="rpt-msg rpt-msg--err" role="alert">
          {err}
        </p>
      )}
      <Toolbar editor={editor} t={t} rtl={rtl} logo={meta.logo} onImage={() => imageInput.current?.click()} />
      </div>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onImageFile} />
      <div className="rpt-ed__body">
        <aside className="rpt-ed__side" style={{ top: stickTop + 130 }}>
          <div className="seg rpt-ed__tabs" role="tablist">
            {(['outline', 'page', 'info', 'sends'] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={panel === p} className={panel === p ? 'seg__btn is-active' : 'seg__btn'} onClick={() => setPanel(p)}>
                {{ outline: t.outline, page: t.page, info: t.info, sends: t.sends }[p]}
              </button>
            ))}
          </div>
          {panel === 'outline' && <Outline editor={editor} />}
          {panel === 'page' && (
            <div className="rpt-ed__form">
              <label className="rpt-field">
                <span>{t.orientation}</span>
                <select value={meta.orientation} onChange={(e) => setM({ orientation: e.target.value as ReportMeta['orientation'] })}>
                  <option value="portrait">{t.portrait}</option>
                  <option value="landscape">{t.landscape}</option>
                </select>
              </label>
              <label className="rpt-field">
                <span>{t.margins}</span>
                <select value={meta.margin} onChange={(e) => setM({ margin: e.target.value as ReportMeta['margin'] })}>
                  <option value="narrow">{t.narrow}</option>
                  <option value="normal">{t.normal}</option>
                  <option value="wide">{t.wide}</option>
                </select>
              </label>
              <label className="rpt-check">
                <input type="checkbox" checked={meta.pageNumbers} onChange={(e) => setM({ pageNumbers: e.target.checked })} />
                {t.pageNumbers}
              </label>
              <label className="rpt-field">
                <span>{t.header}</span>
                <input dir="auto" value={meta.header} maxLength={300} onChange={(e) => setM({ header: e.target.value })} />
              </label>
              <label className="rpt-field">
                <span>{t.footer}</span>
                <input dir="auto" value={meta.footer} maxLength={300} onChange={(e) => setM({ footer: e.target.value })} />
              </label>
            </div>
          )}
          {panel === 'info' && (
            <div className="rpt-ed__form">
              <label className="rpt-field">
                <span>{t.org}</span>
                <input dir="auto" value={meta.org} maxLength={300} onChange={(e) => setM({ org: e.target.value })} />
              </label>
              <label className="rpt-field">
                <span>{t.author}</span>
                <input dir="auto" value={meta.author} maxLength={300} onChange={(e) => setM({ author: e.target.value })} />
              </label>
              <label className="rpt-field">
                <span>{t.subject}</span>
                <input dir="auto" value={meta.subject} maxLength={300} onChange={(e) => setM({ subject: e.target.value })} />
              </label>
              <label className="rpt-field">
                <span>{t.keywords}</span>
                <input dir="auto" value={meta.keywords} maxLength={300} onChange={(e) => setM({ keywords: e.target.value })} />
              </label>
              <p className="rpt-ed__facts">
                {t.posts(initial.postIds.length)} · {i.dateTime(initial.createdAt)}
              </p>
            </div>
          )}
          {panel === 'sends' && (
            <ul className="rpt-sends">
              {history.filter((h) => h.status === 'sent' || h.status === 'failed').length === 0 && <li className="rpt-sends__none">{t.noSends}</li>}
              {history
                .filter((h) => h.status === 'sent' || h.status === 'failed')
                .map((h) => (
                  <li key={h.at} className={`rpt-sends__item is-${h.status}`}>
                    <b>{h.status === 'sent' ? t.statusSent : t.statusFailed}</b> · {i.dateTime(h.at)} · {String(h.format || '').toUpperCase()}
                    <small dir="ltr">{(h.accepted?.length ? h.accepted : h.to || []).join(', ')}</small>
                    {h.error && <small>{t.mailErr[h.error] || h.error}</small>}
                  </li>
                ))}
            </ul>
          )}
        </aside>
        <div className="rpt-ed__canvas">
          <div className={`rpt-paper is-${meta.orientation}`} style={{ width: paperW, paddingInline: pad, paddingBlock: Math.round(pad * 0.6) }} dir={rtl ? 'rtl' : 'ltr'} lang={meta.lang}>
            <div className="rpt-paper__head">
              {meta.logo && <img src={meta.logo} alt="" height={26} />}
              <input dir="auto" value={meta.header} maxLength={300} aria-label={t.header} placeholder={t.header} onChange={(e) => setM({ header: e.target.value })} />
            </div>
            <EditorContent editor={editor} />
            <div className="rpt-paper__foot">
              <input dir="auto" value={meta.footer} maxLength={300} aria-label={t.footer} placeholder={t.footer} onChange={(e) => setM({ footer: e.target.value })} />
              {meta.pageNumbers && <span dir="ltr">1 / n</span>}
            </div>
          </div>
        </div>
      </div>
      {mail && <MailDialog t={t} report={{ ...initial, title, meta }} build={build} onClose={() => setMail(false)} onHistory={setHistory} />}
    </div>
  )
}
