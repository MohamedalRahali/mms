import { type PmNode, type ReportMeta, downloadBlob, toDocx, toPdf } from './reportExport'
import { brandNow } from './brand'

/**
 * Export Word (.docx) et PDF d'une liste d'actualités (لوحة الأخبار, لوحات التثبيت) à la place de l'export Excel.
 * Les lignes viennent du serveur (/api/news/export.json : mêmes filtres, droits et limites par rôle, journal
 * d'activité) ; le document est fabriqué ici avec le moteur des rapports (arabe de droite à gauche, police arabe du
 * navigateur pour le PDF), avec l'identité des livrables (هوية المخرجات) quand elle est réglée.
 */

type Row = { date: string; origin: string; title: string; url: string; category: string; tone: string; summary: string }
type ExportData = { total: number; shown: number; by: string; at: string; items: Row[] }

const PDF_ROWS = 300 // au-delà, le PDF (pages dessinées) devient lourd : le Word garde toutes les lignes

const T = {
  ar: {
    cols: ['التاريخ', 'المصدر', 'العنوان', 'الموضوع', 'النبرة', 'الملخص'],
    period: 'الفترة',
    filters: 'عوامل التصفية',
    none: 'بدون',
    exported: 'تاريخ التصدير (توقيت طرابلس)',
    by: 'أعدّه',
    count: (shown: number, total: number) => (shown < total ? `عدد الأخبار (دون تكرار): ${total} — المعروض ${shown} (حد التصدير لهذا الحساب)` : `عدد الأخبار (دون تكرار): ${total}`),
    pdfCut: (n: number) => `ملف PDF يعرض أول ${n} خبر؛ ملف Word يتضمن القائمة كاملة.`,
    internal: 'وثيقة داخلية — لا تُنشر',
    tones: { positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي' } as Record<string, string>,
  },
  en: {
    cols: ['Date', 'Source', 'Title', 'Topic', 'Tone', 'Summary'],
    period: 'Period',
    filters: 'Filters',
    none: 'none',
    exported: 'Exported on (Tripoli time)',
    by: 'By',
    count: (shown: number, total: number) => (shown < total ? `News (without duplicates): ${total} — ${shown} shown (export limit for this account)` : `News (without duplicates): ${total}`),
    pdfCut: (n: number) => `The PDF shows the first ${n} items; the Word file has the full list.`,
    internal: 'Internal document — not for publication',
    tones: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' } as Record<string, string>,
  },
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const text = (t: string, marks?: PmNode['marks']): PmNode => ({ type: 'text', text: t || ' ', ...(marks ? { marks } : {}) })
const para = (content: PmNode[]): PmNode => ({ type: 'paragraph', content })
const cell = (content: PmNode[], header = false): PmNode => ({ type: header ? 'tableHeader' : 'tableCell', content: [para(content)] })

export type ListExportOptions = {
  format: 'docx' | 'pdf'
  query: string // filtres de la liste (mêmes paramètres que /api/news)
  title: string
  period: string
  filters: string[]
  lang: 'ar' | 'en'
  categoryLabel: (c: string) => string
}

export async function exportNewsList(o: ListExportOptions) {
  const t = T[o.lang]
  const res = await fetch(`/api/news/export.json?${o.query ? `${o.query}&` : ''}format=${o.format}`)
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as ExportData
  const brand = brandNow()
  const stamp = new Intl.DateTimeFormat(o.lang === 'ar' ? 'ar-LY' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Tripoli' }).format(new Date(data.at))
  const day = new Intl.DateTimeFormat(o.lang === 'ar' ? 'ar-LY' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Tripoli' })
  const rows = o.format === 'pdf' ? data.items.slice(0, PDF_ROWS) : data.items
  const tone = (x: string) => t.tones[x] ?? ''
  const meta: ReportMeta = {
    org: brand?.name || 'MMS',
    author: data.by,
    header: o.title,
    footer: t.internal,
    subject: o.title,
    keywords: 'MMS',
    pageNumbers: true,
    orientation: 'landscape',
    margin: 'narrow',
    lang: o.lang,
    logo: brand?.logo || '',
  }
  const lines = [
    `${t.period} : ${o.period}`,
    `${t.filters} : ${o.filters.length ? o.filters.join(' · ') : t.none}`,
    `${t.exported} : ${stamp} · ${t.by} : ${data.by}`,
    t.count(data.shown, data.total),
    ...(o.format === 'pdf' && data.items.length > PDF_ROWS ? [t.pdfCut(PDF_ROWS)] : []),
  ]
  const name = `MMS_${o.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.${o.format}`
  if (o.format === 'docx') {
    const doc: PmNode = {
      type: 'doc',
      content: [
        ...(meta.logo ? [{ type: 'image', attrs: { src: meta.logo, width: 160 } }] : []),
        { type: 'heading', attrs: { level: 1 }, content: [text(o.title)] },
        ...lines.map((l) => para([text(l)])),
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: t.cols.map((c) => cell([text(c)], true)) },
            ...rows.map((r) => ({
              type: 'tableRow',
              content: [
                cell([text(day.format(new Date(r.date)))]),
                cell([text(r.origin)]),
                cell([text(r.title, r.url ? [{ type: 'link', attrs: { href: r.url } }] : undefined)]),
                cell([text(r.category ? o.categoryLabel(r.category) : '')]),
                cell([text(tone(r.tone))]),
                cell([text(r.summary)]),
              ],
            })),
          ],
        },
      ],
    }
    downloadBlob(await toDocx(doc, meta, o.title), name)
    return data
  }
  const html = [
    meta.logo ? `<img src="${esc(meta.logo)}" alt="" style="max-height:60px;width:auto">` : '',
    `<h1>${esc(o.title)}</h1>`,
    ...lines.map((l) => `<p>${esc(l)}</p>`),
    `<table><colgroup><col style="width:12%"><col style="width:13%"><col style="width:27%"><col style="width:9%"><col style="width:8%"><col style="width:31%"></colgroup>`,
    `<tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`,
    ...rows.map(
      (r) =>
        `<tr><td style="white-space:nowrap">${esc(day.format(new Date(r.date)))}</td><td>${esc(r.origin)}</td><td>${r.url ? `<a href="${esc(r.url)}">${esc(r.title)}</a>` : esc(r.title)}</td><td>${esc(r.category ? o.categoryLabel(r.category) : '')}</td><td>${esc(tone(r.tone))}</td><td>${esc(r.summary)}</td></tr>`,
    ),
    '</table>',
  ].join('')
  downloadBlob(await toPdf(html, meta, o.title), name)
  return data
}
