/**
 * Exports du générateur de rapports : Word (.docx, texte et tableaux modifiables), PDF (pages A4 rendues
 * depuis le document affiché) et impression. Les bibliothèques sont chargées seulement à l'export.
 */

export type PmMark = { type: string; attrs?: Record<string, unknown> }
export type PmNode = { type: string; attrs?: Record<string, unknown>; content?: PmNode[]; text?: string; marks?: PmMark[] }

export type ReportMeta = {
  org: string
  author: string
  header: string
  footer: string
  subject: string
  keywords: string
  pageNumbers: boolean
  orientation: 'portrait' | 'landscape'
  margin: 'narrow' | 'normal' | 'wide'
  lang: 'ar' | 'en'
  logo: string
}

/** MMS_Media_Analysis_Report_2026-10-25.docx */
export function reportFilename(ext: 'docx' | 'pdf') {
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `MMS_Media_Analysis_Report_${day}.${ext}`
}

// Marges en millimètres
export const MARGINS = { narrow: 12.7, normal: 20, wide: 30 }
const MM_TWIP = 56.7

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Image (logo, image intégrée) redessinée en PNG, avec sa taille naturelle */
async function imagePng(src: string): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1
    canvas.height = img.naturalHeight || 1
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) return null
    return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
  } catch {
    return null
  }
}

const hex = (c: unknown) => {
  const s = String(c || '')
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.slice(1)
  if (/^#[0-9a-f]{3}$/i.test(s)) return s.slice(1).replace(/./g, (x) => x + x)
  const m = /^rgba?\((\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s)
  return m ? [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('') : undefined
}
// Taille de police CSS → demi-points Word
const halfPoints = (size: unknown) => {
  const m = /^(\d+(?:\.\d+)?)(px|pt|em|rem)$/.exec(String(size || ''))
  if (!m) return undefined
  const n = Number(m[1])
  const pt = m[2] === 'pt' ? n : m[2] === 'px' ? n * 0.75 : n * 12
  return Math.round(pt * 2)
}

/* ---------------------------------------------------------------- Word */

export async function toDocx(doc: PmNode, meta: ReportMeta, title: string): Promise<Blob> {
  const d = await import('docx')
  const rtl = meta.lang !== 'en'
  const FONT = rtl ? 'Arial' : 'Calibri'
  let listInstance = 0

  const align = (a: unknown) =>
    a === 'center' ? d.AlignmentType.CENTER : a === 'justify' ? d.AlignmentType.BOTH : a === 'left' ? d.AlignmentType.LEFT : a === 'right' ? d.AlignmentType.RIGHT : undefined

  function runs(nodes: PmNode[] = [], base: Record<string, unknown> = {}): (InstanceType<typeof d.TextRun> | InstanceType<typeof d.ExternalHyperlink>)[] {
    const out: (InstanceType<typeof d.TextRun> | InstanceType<typeof d.ExternalHyperlink>)[] = []
    for (const n of nodes) {
      if (n.type === 'hardBreak') {
        out.push(new d.TextRun({ text: '', break: 1 }))
        continue
      }
      if (n.type !== 'text' || !n.text) continue
      const marks = n.marks || []
      const style = marks.find((m) => m.type === 'textStyle')?.attrs || {}
      const link = marks.find((m) => m.type === 'link')?.attrs?.href as string | undefined
      const opts = {
        text: n.text,
        bold: marks.some((m) => m.type === 'bold') || undefined,
        italics: marks.some((m) => m.type === 'italic') || undefined,
        underline: marks.some((m) => m.type === 'underline') || link ? {} : undefined,
        strike: marks.some((m) => m.type === 'strike') || undefined,
        color: hex(style.color) || (link ? '1D5FBF' : undefined),
        size: halfPoints(style.fontSize),
        font: FONT,
        rightToLeft: rtl || undefined,
        ...base,
      }
      out.push(link ? new d.ExternalHyperlink({ link, children: [new d.TextRun(opts)] }) : new d.TextRun(opts))
    }
    return out
  }

  async function blocks(nodes: PmNode[] = [], ctx: { level?: number; quote?: boolean; inCell?: boolean } = {}): Promise<(InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[]> {
    const out: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = []
    const quote = ctx.quote
      ? { border: { [rtl ? 'right' : 'left']: { style: d.BorderStyle.SINGLE, size: 18, color: '7C3AED', space: 8 } }, shading: { type: d.ShadingType.CLEAR, color: 'auto', fill: 'F5F1FE' }, indent: { start: 240 } }
      : {}
    for (const n of nodes) {
      switch (n.type) {
        case 'paragraph':
          out.push(new d.Paragraph({ bidirectional: rtl, alignment: align(n.attrs?.textAlign), spacing: { after: ctx.inCell ? 0 : 120, line: 300 }, children: runs(n.content), ...quote }))
          break
        case 'heading': {
          const level = Number(n.attrs?.level) || 2
          const H = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3, d.HeadingLevel.HEADING_4][Math.min(level, 4) - 1]
          out.push(new d.Paragraph({ heading: H, bidirectional: rtl, alignment: align(n.attrs?.textAlign), keepNext: true, children: runs(n.content, { color: level <= 2 ? '0D3B66' : '1F4E79' }) }))
          break
        }
        case 'blockquote':
          out.push(...(await blocks(n.content, { ...ctx, quote: true })))
          break
        case 'bulletList':
        case 'orderedList': {
          const instance = ++listInstance
          const level = ctx.level ?? 0
          for (const li of n.content || []) {
            const [first, ...rest] = li.content || []
            const children = first?.type === 'paragraph' ? runs(first.content) : []
            out.push(
              new d.Paragraph({
                bidirectional: rtl,
                spacing: { after: 60 },
                children,
                ...(n.type === 'bulletList' ? { bullet: { level } } : { numbering: { reference: 'mms-ol', level, instance } }),
              }),
            )
            out.push(...(await blocks(first?.type === 'paragraph' ? rest : li.content, { ...ctx, level: level + 1 })))
          }
          break
        }
        case 'table': {
          const rows = []
          for (const row of n.content || []) {
            const cells = []
            for (const c of row.content || []) {
              const header = c.type === 'tableHeader'
              const inner = await blocks(c.content, { inCell: true })
              cells.push(
                new d.TableCell({
                  columnSpan: Number(c.attrs?.colspan) > 1 ? Number(c.attrs?.colspan) : undefined,
                  rowSpan: Number(c.attrs?.rowspan) > 1 ? Number(c.attrs?.rowspan) : undefined,
                  shading: header ? { type: d.ShadingType.CLEAR, color: 'auto', fill: 'E6F0EA' } : undefined,
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: inner.length ? inner : [new d.Paragraph({})],
                }),
              )
            }
            rows.push(new d.TableRow({ children: cells, tableHeader: row.content?.every((c) => c.type === 'tableHeader') || undefined }))
          }
          if (rows.length) {
            out.push(new d.Table({ rows, width: { size: 100, type: d.WidthType.PERCENTAGE }, visuallyRightToLeft: rtl }))
            out.push(new d.Paragraph({ spacing: { after: 120 }, children: [] }))
          }
          break
        }
        case 'image': {
          const img = await imagePng(String(n.attrs?.src || ''))
          if (!img) break
          const maxW = meta.orientation === 'landscape' ? 900 : 620
          const w = Math.min(Number(n.attrs?.width) || img.width, maxW)
          const h = Math.round((w / img.width) * img.height)
          out.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.ImageRun({ type: 'png', data: img.data, transformation: { width: w, height: h } })] }))
          break
        }
        case 'pageBreak':
          out.push(new d.Paragraph({ children: [new d.PageBreak()] }))
          break
        case 'horizontalRule':
          out.push(new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'C9D6CE', space: 4 } }, children: [] }))
          break
        case 'codeBlock':
          out.push(new d.Paragraph({ children: [new d.TextRun({ text: (n.content || []).map((t) => t.text || '').join(''), font: 'Consolas' })] }))
          break
      }
    }
    return out
  }

  const children = await blocks(doc.content)
  const small = { size: 17, color: '6B7A90', font: FONT, rightToLeft: rtl || undefined }
  const logo = meta.logo ? await imagePng(meta.logo) : null
  const headerKids = [
    ...(logo ? [new d.ImageRun({ type: 'png' as const, data: logo.data, transformation: { width: Math.round((28 / logo.height) * logo.width), height: 28 } })] : []),
    new d.TextRun({ ...small, text: `${logo ? '   ' : ''}${meta.header || title}` }),
  ]
  const margin = Math.round(MARGINS[meta.margin] * MM_TWIP)
  const file = new d.Document({
    title,
    subject: meta.subject || title,
    creator: meta.author || 'MMS',
    keywords: meta.keywords,
    description: meta.org,
    lastModifiedBy: meta.author || 'MMS',
    styles: { default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 288 } } } } },
    numbering: {
      config: [
        {
          reference: 'mms-ol',
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: d.LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: d.AlignmentType.START,
            style: { paragraph: { indent: { start: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: meta.orientation === 'landscape' ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT },
            margin: { top: margin, bottom: margin, left: margin, right: margin, header: 400, footer: 400 },
          },
        },
        headers: { default: new d.Header({ children: [new d.Paragraph({ bidirectional: rtl, alignment: d.AlignmentType.START, children: headerKids })] }) },
        footers: {
          default: new d.Footer({
            children: [
              new d.Paragraph({
                bidirectional: rtl,
                alignment: d.AlignmentType.CENTER,
                children: [
                  new d.TextRun({ ...small, text: meta.footer || '' }),
                  ...(meta.pageNumbers ? [new d.TextRun({ ...small, rightToLeft: undefined, text: meta.footer ? '   |   ' : '' }), new d.TextRun({ ...small, rightToLeft: undefined, children: [d.PageNumber.CURRENT, ' / ', d.PageNumber.TOTAL_PAGES] })] : []),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  return d.Packer.toBlob(file)
}

/* ---------------------------------------------------------------- PDF */

/** Feuille de style du document imprimé ou exporté (identique à la page de l'éditeur) */
export const PAPER_CSS = `
.rpt-doc{font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif;color:#1a2433;font-size:15px;line-height:1.75;background:#fff}
.rpt-doc h1{font-size:30px;line-height:1.3;color:#0d3b66;margin:.4em 0 .5em}
.rpt-doc h2{font-size:22px;color:#0d3b66;margin:1.4em 0 .5em;padding-bottom:.25em;border-bottom:2px solid #1d7a4e}
.rpt-doc h3{font-size:17px;color:#1f4e79;margin:1.1em 0 .4em}
.rpt-doc h4{font-size:15px;color:#1f4e79;margin:1em 0 .3em}
.rpt-doc p{margin:0 0 .6em}
.rpt-doc a{color:#1d5fbf;text-decoration:underline}
.rpt-doc img{max-width:100%;height:auto;display:block;margin:.6em auto}
.rpt-doc blockquote{margin:.8em 0;padding:.6em 1em;background:#f5f1fe;border-inline-start:4px solid #7c3aed;border-radius:4px}
.rpt-doc table{border-collapse:collapse;width:100%;margin:.6em 0 1em;table-layout:fixed}
.rpt-doc th,.rpt-doc td{border:1px solid #c9d6ce;padding:6px 9px;vertical-align:top;text-align:start;word-wrap:break-word}
.rpt-doc th{background:#e6f0ea;font-weight:700;color:#0a2117}
.rpt-doc th p,.rpt-doc td p{margin:0}
.rpt-doc ul,.rpt-doc ol{padding-inline-start:1.6em;margin:.3em 0 .8em}
.rpt-doc hr{border:0;border-top:1px solid #c9d6ce;margin:1em 0}
.rpt-doc .rpt-pagebreak{break-after:page;height:0;border:0;margin:0}
`

/**
 * PDF A4 : le document est dessiné hors écran à la largeur de la page, puis découpé en pages
 * aux sauts de page et entre les blocs (jamais au milieu d'une ligne), avec en-tête, pied et numéros.
 */
export async function toPdf(html: string, meta: ReportMeta, title: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const landscape = meta.orientation === 'landscape'
  const pageW = landscape ? 297 : 210
  const pageH = landscape ? 210 : 297
  const m = MARGINS[meta.margin]
  const band = 10 // place de l'en-tête et du pied, en mm
  const contentW = pageW - 2 * m
  const contentH = pageH - 2 * m - 2 * band
  const PX = 96 / 25.4 // pixels CSS par mm
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.round(contentW * PX)}px;padding:0 4px;box-sizing:border-box;background:#fff;z-index:-1`
  host.innerHTML = `<style>${PAPER_CSS}</style><div class="rpt-doc" dir="${meta.lang === 'en' ? 'ltr' : 'rtl'}">${html}</div>`
  document.body.appendChild(host)
  try {
    const root = host.querySelector('.rpt-doc') as HTMLElement
    await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)))
    if (document.fonts?.ready) await document.fonts.ready
    // 1,6 : texte net à l'impression et PDF assez léger pour partir par e-mail
    const scale = 1.6
    const canvas = await html2canvas(root, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false })
    const top = root.getBoundingClientRect().top
    // Points de coupe possibles : bas de chaque bloc et de chaque ligne de tableau ; sauts de page imposés
    const cuts = new Set<number>()
    const forced: number[] = []
    root.querySelectorAll(':scope > *, tr, li').forEach((el) => cuts.add(Math.round((el as HTMLElement).getBoundingClientRect().bottom - top)))
    root.querySelectorAll('.rpt-pagebreak').forEach((el) => forced.push(Math.round((el as HTMLElement).getBoundingClientRect().top - top)))
    const total = Math.round(root.getBoundingClientRect().height)
    const pagePx = Math.floor(contentH * PX)
    const slices: [number, number][] = []
    let start = 0
    while (start < total - 2) {
      const limit = start + pagePx
      const hard = forced.find((f) => f > start + 4 && f <= limit)
      let end = hard ?? Math.max(...[...cuts].filter((c) => c > start + pagePx * 0.3 && c <= limit), -1)
      if (end < 0) end = Math.min(limit, total)
      slices.push([start, end])
      start = end
      // On saute l'espace vide après un saut de page
      if (hard !== undefined) start = hard + 1
    }
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true })
    pdf.setProperties({ title, subject: meta.subject || title, author: meta.author, keywords: meta.keywords, creator: 'MMS' })
    // En-tête et pied (texte arabe) dessinés une fois par le navigateur, puis posés sur chaque page
    const strip = async (text: string) => {
      if (!text) return null
      const el = document.createElement('div')
      el.style.cssText = `width:${Math.round(contentW * PX)}px;font:12px 'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#6b7a90;text-align:center;background:#fff;padding:2px 0`
      el.dir = meta.lang === 'en' ? 'ltr' : 'rtl'
      el.textContent = text
      host.appendChild(el)
      const c = await html2canvas(el, { scale, backgroundColor: '#ffffff', logging: false })
      el.remove()
      return c
    }
    const head = await strip(meta.header || title)
    const foot = await strip(meta.footer)
    slices.forEach(([a, b], idx) => {
      if (idx) pdf.addPage()
      const h = Math.max(b - a, 1)
      const page = document.createElement('canvas')
      page.width = canvas.width
      page.height = Math.round(h * scale)
      const ctx = page.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, page.width, page.height)
      ctx.drawImage(canvas, 0, Math.round(a * scale), canvas.width, page.height, 0, 0, canvas.width, page.height)
      pdf.addImage(page.toDataURL('image/jpeg', 0.85), 'JPEG', m, m + band, contentW, h / PX, undefined, 'FAST')
      if (head) pdf.addImage(head, 'PNG', m, m, contentW, head.height / scale / PX)
      pdf.setDrawColor(201, 214, 206)
      pdf.line(m, m + band - 2, pageW - m, m + band - 2)
      if (foot) pdf.addImage(foot, 'PNG', m, pageH - m - band + 3, contentW, foot.height / scale / PX)
      if (meta.pageNumbers) {
        pdf.setFontSize(9)
        pdf.setTextColor(107, 122, 144)
        pdf.text(`${idx + 1} / ${slices.length}`, pageW / 2, pageH - m + 1, { align: 'center' })
      }
    })
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

/* ---------------------------------------------------------------- impression */

const cssString = (s: string) => `"${s.replace(/["\\]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Aperçu avant impression : le document seul, en pages A4, avec en-tête, pied et numéros de page */
export function printReport(html: string, meta: ReportMeta, title: string) {
  const w = window.open('', '_blank')
  if (!w) return false
  const dir = meta.lang === 'en' ? 'ltr' : 'rtl'
  const num = meta.pageNumbers ? 'counter(page) " / " counter(pages)' : '""'
  w.document.open()
  w.document.write(`<!doctype html><html lang="${meta.lang}" dir="${dir}"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
@page{size:A4 ${meta.orientation};margin:${MARGINS[meta.margin]}mm;
@top-center{content:${cssString(meta.header || title)};font:10px Tahoma,Arial,sans-serif;color:#6b7a90}
@bottom-left{content:${dir === 'rtl' ? num : cssString(meta.footer)};font:10px Tahoma,Arial,sans-serif;color:#6b7a90}
@bottom-right{content:${dir === 'rtl' ? cssString(meta.footer) : num};font:10px Tahoma,Arial,sans-serif;color:#6b7a90}}
html,body{margin:0;background:#fff}
${PAPER_CSS}
.rpt-doc h2,.rpt-doc h3{break-after:avoid}
.rpt-doc tr,.rpt-doc img,.rpt-doc blockquote{break-inside:avoid}
</style></head><body><div class="rpt-doc" dir="${dir}">${html}</div></body></html>`)
  w.document.close()
  const go = () => {
    w.focus()
    w.print()
  }
  if (w.document.readyState === 'complete') setTimeout(go, 400)
  else w.addEventListener('load', () => setTimeout(go, 200))
  return true
}
