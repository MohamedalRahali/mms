/**
 * Markdown simple des réponses d'Around : intertitres, listes (avec un niveau d'imbrication),
 * tableaux, gras et renvois aux sources [n] ou [n, m]. Le résultat sert à l'affichage et aux exports.
 */

export type Inline = { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'cite'; ns: number[] }
export type Item = { text: string; children: string[] }
export type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'list'; ordered: boolean; items: Item[] }
  | { t: 'table'; head: string[]; rows: string[][] }

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function parseMd(src: string): Block[] {
  const blocks: Block[] = []
  const lines = String(src || '').replace(/\r/g, '').split('\n')
  for (let k = 0; k < lines.length; k++) {
    const raw = lines[k]
    const line = raw.trim()
    if (!line) continue
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      blocks.push({ t: 'h', level: h[1].length, text: h[2] })
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (k < lines.length && lines[k].trim().startsWith('|')) {
        const row = lines[k].trim()
        if (!/^\|?[\s:|-]+\|?$/.test(row)) rows.push(cells(row))
        k++
      }
      k--
      if (rows.length) blocks.push({ t: 'table', head: rows[0], rows: rows.slice(1) })
      continue
    }
    const indent = raw.match(/^\s*/)?.[0].length ?? 0
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/)
    const ul = line.match(/^[-*•]\s+(.*)$/)
    if (ol || ul) {
      const text = (ol ? ol[2] : ul![1]).trim()
      const ordered = Boolean(ol)
      const last = blocks[blocks.length - 1]
      // Puce en retrait sous un élément de liste : sous-point de cet élément
      if (last?.t === 'list' && last.items.length && (indent >= 2 || (!ordered && last.ordered))) {
        last.items[last.items.length - 1].children.push(text)
      } else if (last?.t === 'list' && last.ordered === ordered) {
        last.items.push({ text, children: [] })
      } else {
        blocks.push({ t: 'list', ordered, items: [{ text, children: [] }] })
      }
      continue
    }
    blocks.push({ t: 'p', text: line })
  }
  return blocks
}

/** Découpe une ligne en texte, gras et renvois aux sources */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*([^*]+)\*\*|\[(\d+(?:\s*[,،]\s*\d+)*)\]/g
  let at = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > at) out.push({ t: 'text', v: text.slice(at, m.index) })
    if (m[1] != null) out.push({ t: 'bold', v: m[1] })
    else out.push({ t: 'cite', ns: m[2].split(/\s*[,،]\s*/).map(Number) })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ t: 'text', v: text.slice(at) })
  return out
}

/** Texte brut, sans renvois ni marques (copie, e-mail) */
export const plain = (text: string) =>
  String(text || '')
    .replace(/\s*\[\d+(?:\s*[,،]\s*\d+)*\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
