import type { AgentStats, AroundText, Turn } from './around'
import { type Block, parseInline, parseMd, plain } from './aroundMd'
import { brandNow } from './brand'

/** Logo des exports de l'assistant : celui du client en marque blanche (ou aucun), sinon celui d'Around */
const exportLogo = () => {
  const b = brandNow()
  if (b?.whiteLabel) return b.logo || ''
  return `${location.origin}/around-logo.png`
}

/**
 * Exports d'une réponse d'Around : texte brut (copie, e-mail), rapport web imprimable (et PDF par l'impression),
 * présentation PowerPoint. Tout est produit dans le navigateur, aux couleurs de la charte MMS.
 */

type Ctx = { a: AroundText; lang: 'ar' | 'en'; num: (n: number) => string; dateTime: (iso: string) => string; day: (d: string) => string }

const GREEN = '1d7a4e'
const GREEN_DARK = '0a2117'
const GOLD = 'a77d12'

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const pct = (cur: number, prev: number) => (prev ? `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 1000) / 10}%` : '—')

export function kpiRows(s: AgentStats, a: AroundText) {
  return [
    [a.mVolume, s.current.total, s.previous.total],
    [a.mPerDay, s.current.perDay, s.previous.perDay],
    [a.mSources, s.current.sources, s.previous.sources],
    [a.mPositive, s.current.tones.positive, s.previous.tones.positive],
    [a.mNegative, s.current.tones.negative, s.previous.tones.negative],
    [
      a.mEngagement,
      s.current.engagement.reactions + s.current.engagement.shares + s.current.engagement.comments,
      s.previous.engagement.reactions + s.previous.engagement.shares + s.previous.engagement.comments,
    ],
  ].map(([label, cur, prev]) => {
    const change = pct(Number(cur), Number(prev))
    // Plus de nouvelles négatives : une hausse est une mauvaise nouvelle
    const up = change.startsWith('+') && change !== '+0%'
    const down = change.startsWith('-')
    const bad = label === a.mNegative ? up : down
    const good = label === a.mNegative ? down : up
    return { label: String(label), cur: Number(cur), prev: Number(prev), change, tone: good ? 'up' : bad ? 'down' : '' }
  })
}

export const turnTitle = (t: Turn, a: AroundText) => t.title || (t.agent ? `${a.agentTitle[t.agent]} : ${t.subject || a.allSubject}` : t.q)

/** Texte brut de la réponse, pour la copie et l'e-mail */
export function turnText(t: Turn, a: AroundText) {
  const parts = [turnTitle(t, a), '']
  if (t.kind === 'ask') parts.push(plain(t.answer || ''))
  else {
    parts.push(`${a.exec}\n${plain(t.summary || '')}`)
    for (const s of t.sections || []) parts.push(`\n${s.titre}\n${s.points.map((p) => `- ${plain(p)}`).join('\n')}`)
    if (t.recommendations?.length) parts.push(`\n${a.recommendations}\n${t.recommendations.map((p) => `- ${plain(p)}`).join('\n')}`)
  }
  if (t.sources?.length) parts.push(`\n${a.sources}\n${t.sources.map((s) => `[${s.n}] ${s.origin} · ${s.title}${s.url ? ` · ${s.url}` : ''}`).join('\n')}`)
  return parts.join('\n')
}

/* ---------------------------------------------------------------- rapport web */

function inlineHtml(text: string, t: Turn) {
  return parseInline(text)
    .map((x) => {
      if (x.t === 'text') return esc(x.v)
      if (x.t === 'bold') return `<strong>${esc(x.v)}</strong>`
      return x.ns
        .map((n) => {
          const s = t.sources?.find((y) => y.n === n)
          return s ? `<a class="cite" href="#src-${n}" title="${esc(s.origin)}">${n}</a>` : ''
        })
        .join('')
    })
    .join('')
}

function blocksHtml(blocks: Block[], t: Turn) {
  return blocks
    .map((b) => {
      if (b.t === 'h') return `<h${Math.min(b.level + 1, 4)}>${inlineHtml(b.text, t)}</h${Math.min(b.level + 1, 4)}>`
      if (b.t === 'p') return `<p>${inlineHtml(b.text, t)}</p>`
      if (b.t === 'table')
        return `<table><thead><tr>${b.head.map((c) => `<th>${inlineHtml(c, t)}</th>`).join('')}</tr></thead><tbody>${b.rows
          .map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c, t)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      const tag = b.ordered ? 'ol' : 'ul'
      return `<${tag}>${b.items
        .map((it) => `<li>${inlineHtml(it.text, t)}${it.children.length ? `<ul>${it.children.map((c) => `<li>${inlineHtml(c, t)}</li>`).join('')}</ul>` : ''}</li>`)
        .join('')}</${tag}>`
    })
    .join('\n')
}

function timelineSvg(s: AgentStats) {
  const max = Math.max(...s.perDay, 1)
  const w = 720
  const h = 140
  const bw = w / s.perDay.length
  const bars = s.perDay
    .map((v, k) => {
      const bh = Math.max((v / max) * (h - 20), v ? 2 : 0)
      const spike = s.spikes.some((p) => p.day === s.dates[k])
      return `<rect x="${(k * bw + bw * 0.15).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${spike ? `#${GOLD}` : `#${GREEN}`}"><title>${s.dates[k]} : ${v}</title></rect>`
    })
    .join('')
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="timeline">${bars}</svg>`
}

export function reportHtml(t: Turn, c: Ctx, autoPrint = false) {
  const { a } = c
  const dir = c.lang === 'ar' ? 'rtl' : 'ltr'
  const title = turnTitle(t, a)
  const s = t.stats
  const body: string[] = []
  if (t.kind === 'ask') body.push(blocksHtml(parseMd(t.answer || ''), t))
  else {
    body.push(`<section class="exec"><h2>${esc(a.exec)}</h2><p>${inlineHtml(t.summary || '', t)}</p></section>`)
    if (s) {
      body.push(
        `<h2>${esc(a.kpis)}</h2><table><thead><tr><th>${esc(a.metric)}</th><th>${esc(a.current)}</th><th>${esc(a.previous)}</th><th>${esc(a.change)}</th></tr></thead><tbody>${kpiRows(s, a)
          .map((r) => `<tr><td>${esc(r.label)}</td><td>${c.num(r.cur)}</td><td>${c.num(r.prev)}</td><td class="${r.tone}" dir="ltr">${r.change}</td></tr>`)
          .join('')}</tbody></table>`,
      )
      body.push(`<h2>${esc(a.timeline)}</h2>${timelineSvg(s)}<p class="muted">${esc(c.day(s.dates[0]))} – ${esc(c.day(s.dates[s.dates.length - 1]))}</p>`)
    }
    for (const sec of t.sections || []) body.push(`<h2>${esc(sec.titre)}</h2><ul>${sec.points.map((p) => `<li>${inlineHtml(p, t)}</li>`).join('')}</ul>`)
    if (s?.spikes.length)
      body.push(
        `<h2>${esc(a.spikes)}</h2><ul>${s.spikes.map((p) => `<li><strong>${esc(c.day(p.day))}</strong> · ${esc(a.spikeLine(c.num(p.count)))} · ${esc(p.sources.map((x) => x.name).join('، '))}${p.top ? `<br><span class="muted">${esc(p.top)}</span>` : ''}</li>`).join('')}</ul>`,
      )
    if (s?.sources.length) body.push(`<h2>${esc(a.topSources)}</h2><table><tbody>${s.sources.map((x) => `<tr><td>${esc(x.name)}</td><td>${c.num(x.count)}</td></tr>`).join('')}</tbody></table>`)
    if (s?.places.length)
      body.push(
        `<h2>${esc(a.geo)}</h2><table><thead><tr><th>${esc(a.place)}</th><th>${esc(a.mentions)}</th><th>${esc(a.tones.positive)}</th><th>${esc(a.tones.neutral)}</th><th>${esc(a.tones.negative)}</th></tr></thead><tbody>${s.places
          .map((p) => `<tr><td>${esc(p.name)}</td><td>${c.num(p.count)}</td><td>${p.tones.positive}</td><td>${p.tones.neutral}</td><td>${p.tones.negative}</td></tr>`)
          .join('')}</tbody></table>`,
      )
    if (t.recommendations?.length) body.push(`<section class="reco"><h2>${esc(a.recommendations)}</h2><ol>${t.recommendations.map((p) => `<li>${inlineHtml(p, t)}</li>`).join('')}</ol></section>`)
  }
  if (t.sources?.length)
    body.push(
      `<h2>${esc(a.sources)}</h2><ol class="sources">${t.sources
        .map((x) => `<li id="src-${x.n}" value="${x.n}"><a href="${esc(x.url)}" target="_blank" rel="noreferrer">${esc(x.title)}</a><br><span class="muted">${esc(x.origin)} · ${esc(c.dateTime(x.date))}</span></li>`)
        .join('')}</ol>`,
    )
  const scope = `${t.watchName || a.allMms} · ${a.periods[t.days] || ''}`
  return `<!doctype html><html lang="${c.lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--g:#${GREEN};--d:#${GREEN_DARK};--gold:#${GOLD};--line:#dfe8e2;--soft:#4f6a5c}
*{box-sizing:border-box}body{margin:0;background:#f3f8f4;color:var(--d);font:15px/1.8 'IBM Plex Sans Arabic','IBM Plex Sans',Tahoma,sans-serif}
.page{max-width:860px;margin:0 auto;padding:0 16px 48px}
header{background:var(--d);color:#fff;padding:28px 32px;border-radius:0 0 18px 18px;display:flex;gap:18px;align-items:center}
header img{width:56px;height:56px;border-radius:50%;background:#fff;object-fit:contain}
header h1{margin:0;font-size:1.55rem;line-height:1.35}header p{margin:4px 0 0;color:#b9d6c6;font-size:.88rem}
.bar{display:flex;gap:8px;justify-content:flex-end;margin:16px 0}.bar button{border:1px solid var(--g);background:#fff;color:var(--g);border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer}
main{background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 32px 28px}
h2{color:var(--g);font-size:1.15rem;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid #e3f2ea}h3,h4{margin:18px 0 6px}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:.92rem}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:start}th{background:#e3f2ea;color:var(--d)}
td.up{color:var(--g);font-weight:700}td.down{color:#c8492b;font-weight:700}
.exec{background:#fbf6e7;border-inline-start:4px solid var(--gold);padding:4px 18px;border-radius:8px;margin-top:20px}.exec h2{color:var(--gold);border:0}
.reco{background:#e3f2ea;padding:4px 18px 10px;border-radius:8px;margin-top:20px}.reco h2{border:0}
.cite{display:inline-block;min-width:1.4em;padding:0 .3em;margin-inline:.1em;border-radius:5px;background:#e3f2ea;color:var(--g);font-size:.72em;font-weight:700;text-align:center;text-decoration:none;vertical-align:super}
.muted{color:var(--soft);font-size:.85rem}.sources li{margin-bottom:6px}.sources a{color:var(--d)}
footer{margin-top:22px;text-align:center;color:var(--soft);font-size:.8rem}
@media print{body{background:#fff}.bar{display:none}header{border-radius:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}main{border:0;padding:0}th,.exec,.reco,.cite,rect{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{break-after:avoid}}
</style></head><body><header>${exportLogo() ? `<img src="${exportLogo()}" alt="">` : ''}<div><h1>${esc(title)}</h1><p>${esc(a.scope)} : ${esc(scope)} · ${esc(a.generatedOn)} : ${esc(c.dateTime(new Date().toISOString()))}</p></div></header>
<div class="page"><div class="bar"><button onclick="print()">${esc(a.print)}</button></div><main>${body.join('\n')}</main><footer>${esc(a.generatedBy)}</footer></div>
${autoPrint ? '<script>addEventListener("load",()=>setTimeout(()=>print(),600))</script>' : ''}</body></html>`
}

export function openReport(t: Turn, c: Ctx, autoPrint = false) {
  const url = URL.createObjectURL(new Blob([reportHtml(t, c, autoPrint)], { type: 'text/html' }))
  const win = window.open(url, '_blank')
  // Fenêtre bloquée : on télécharge le rapport à la place
  if (!win) {
    const link = document.createElement('a')
    link.href = url
    link.download = `around-${Date.now()}.html`
    link.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/* ---------------------------------------------------------------- PowerPoint */

async function logoData() {
  try {
    const src = exportLogo()
    if (!src) return ''
    const blob = await (await fetch(src)).blob()
    return await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

/** Puces d'une réponse libre, regroupées par diapositive */
function askSlides(t: Turn) {
  const slides: { title: string; lines: { text: string; sub?: boolean }[] }[] = []
  let cur = { title: '', lines: [] as { text: string; sub?: boolean }[] }
  const push = () => cur.lines.length && slides.push(cur)
  for (const b of parseMd(t.answer || '')) {
    if (b.t === 'h') {
      push()
      cur = { title: plain(b.text), lines: [] }
    } else if (b.t === 'p') cur.lines.push({ text: plain(b.text) })
    else if (b.t === 'list')
      for (const it of b.items) {
        cur.lines.push({ text: plain(it.text) })
        for (const ch of it.children) cur.lines.push({ text: plain(ch), sub: true })
      }
    else for (const r of [b.head, ...b.rows]) cur.lines.push({ text: r.map(plain).join('  |  ') })
    if (cur.lines.length >= 7) {
      push()
      cur = { title: cur.title, lines: [] }
    }
  }
  push()
  return slides
}

export async function downloadPptx(t: Turn, c: Ctx) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const { a } = c
  const rtl = c.lang === 'ar'
  const align = rtl ? 'right' : 'left'
  const font = 'Arial'
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  if (rtl) pptx.rtlMode = true
  pptx.title = turnTitle(t, a)
  const logo = await logoData()

  pptx.defineSlideMaster({
    title: 'AROUND',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: 0.12, fill: { color: GREEN } } },
      { text: { text: a.generatedBy, options: { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontSize: 9, color: '4F6A5C', fontFace: font, align } } },
    ],
    slideNumber: { x: rtl ? 0.4 : 12.5, y: 7.05, fontSize: 9, color: '4F6A5C' },
  })

  // Couverture
  const cover = pptx.addSlide()
  cover.background = { color: GREEN_DARK }
  if (logo) cover.addImage({ data: logo, x: 5.92, y: 1.0, w: 1.5, h: 1.5, rounding: true })
  cover.addText(turnTitle(t, a), { x: 0.8, y: 2.9, w: 11.7, h: 1.4, fontSize: 32, bold: true, color: 'FFFFFF', fontFace: font, align: 'center', rtlMode: rtl })
  cover.addText(`${t.watchName || a.allMms} · ${a.periods[t.days] || ''}`, { x: 0.8, y: 4.3, w: 11.7, h: 0.5, fontSize: 16, color: 'E5B841', fontFace: font, align: 'center', rtlMode: rtl })
  cover.addText(`${a.generatedOn} : ${c.dateTime(new Date().toISOString())}`, { x: 0.8, y: 4.9, w: 11.7, h: 0.4, fontSize: 12, color: 'B9D6C6', fontFace: font, align: 'center', rtlMode: rtl })

  const bullets = (title: string, lines: { text: string; sub?: boolean }[]) => {
    const slide = pptx.addSlide({ masterName: 'AROUND' })
    slide.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: GREEN, fontFace: font, align, rtlMode: rtl })
    slide.addText(
      lines.map((l) => ({
        text: l.text,
        options: { bullet: l.sub ? { indent: 18 } : true, indentLevel: l.sub ? 1 : 0, fontSize: l.sub ? 13 : 15, color: l.sub ? '4F6A5C' : GREEN_DARK, breakLine: true, paraSpaceAfter: 6 },
      })),
      { x: 0.5, y: 1.2, w: 12.3, h: 5.7, valign: 'top', fontFace: font, align, rtlMode: rtl },
    )
    return slide
  }

  if (t.kind === 'ask') for (const s of askSlides(t)) bullets(s.title || turnTitle(t, a), s.lines)
  else {
    const exec = pptx.addSlide({ masterName: 'AROUND' })
    exec.addText(a.exec, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: GOLD, fontFace: font, align, rtlMode: rtl })
    exec.addText(plain(t.summary || ''), { x: 0.5, y: 1.3, w: 12.3, h: 5.4, fontSize: 18, color: GREEN_DARK, fontFace: font, align, valign: 'top', rtlMode: rtl, paraSpaceAfter: 8 })
    const s = t.stats
    if (s) {
      const kpi = pptx.addSlide({ masterName: 'AROUND' })
      kpi.addText(a.kpis, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: GREEN, fontFace: font, align, rtlMode: rtl })
      const head = [a.metric, a.current, a.previous, a.change].map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: GREEN } } }))
      const rows = kpiRows(s, a).map((r) => [{ text: r.label }, { text: c.num(r.cur) }, { text: c.num(r.prev) }, { text: r.change, options: { bold: true, color: r.tone === 'down' ? 'C8492B' : r.tone === 'up' ? GREEN : '4F6A5C' } }])
      kpi.addTable([rtl ? [...head].reverse() : head, ...rows.map((r) => (rtl ? [...r].reverse() : r))], {
        x: 0.5,
        y: 1.2,
        w: 5.9,
        fontSize: 12,
        fontFace: font,
        border: { type: 'solid', color: 'DFE8E2', pt: 1 },
        align: 'center',
        rowH: 0.45,
      })
      kpi.addChart(pptx.ChartType.bar, [{ name: a.timeline, labels: s.dates.map(c.day), values: s.perDay }], {
        x: 6.7,
        y: 1.2,
        w: 6.1,
        h: 4.2,
        barDir: 'col',
        chartColors: [GREEN],
        showTitle: true,
        title: a.timeline,
        titleFontSize: 13,
        titleColor: GREEN_DARK,
        catAxisLabelFontSize: 8,
        valAxisLabelFontSize: 9,
        showLegend: false,
      })
      const tones = [s.current.tones.positive, s.current.tones.neutral, s.current.tones.negative]
      if (tones.some(Boolean))
        kpi.addChart(pptx.ChartType.doughnut, [{ name: a.tone, labels: [a.tones.positive, a.tones.neutral, a.tones.negative], values: tones }], {
          x: 0.5,
          y: 4.35,
          w: 5.9,
          h: 2.6,
          chartColors: [GREEN, '93AB9E', 'C8492B'],
          showLegend: true,
          legendPos: 'r',
          legendFontSize: 10,
          showPercent: true,
          dataLabelColor: 'FFFFFF',
          showTitle: true,
          title: a.tone,
          titleFontSize: 12,
        })
    }
    for (const sec of t.sections || []) bullets(sec.titre, sec.points.map((p) => ({ text: plain(p) })))
    if (s?.spikes.length) bullets(a.spikes, s.spikes.flatMap((p) => [{ text: `${c.day(p.day)} · ${a.spikeLine(c.num(p.count))} · ${p.sources.map((x) => x.name).join('، ')}` }, ...(p.top ? [{ text: p.top, sub: true }] : [])]))
    if (t.recommendations?.length) bullets(a.recommendations, t.recommendations.map((p) => ({ text: plain(p) })))
  }
  if (t.sources?.length) {
    const slide = pptx.addSlide({ masterName: 'AROUND' })
    slide.addText(a.sources, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: GREEN, fontFace: font, align, rtlMode: rtl })
    slide.addText(
      t.sources.slice(0, 12).map((x) => ({
        text: `[${x.n}] ${x.origin} · ${x.title}`,
        options: { breakLine: true, fontSize: 12, color: GREEN_DARK, hyperlink: x.url ? { url: x.url } : undefined, paraSpaceAfter: 4 },
      })),
      { x: 0.5, y: 1.2, w: 12.3, h: 5.7, valign: 'top', fontFace: font, align, rtlMode: rtl },
    )
  }
  await pptx.writeFile({ fileName: `around-${new Date().toISOString().slice(0, 10)}.pptx` })
}
