import { type Flux } from './news'

/** Tableaux de bord composés par le client : widgets placés sur une grille de 12 colonnes */

export type WidgetType = 'news' | 'bars' | 'columns' | 'pie' | 'line' | 'kpi' | 'table' | 'cloud' | 'tone'
export type Dim = 'channels' | 'categories' | 'sources' | 'flux' | 'tones' | 'people' | 'orgs' | 'places'
export type Metric = 'total' | 'broadcasts' | 'sources' | 'average'

export type WidgetConf = {
  id: string
  type: WidgetType
  title: string
  flux: Flux | ''
  days: number
  dim: Dim
  metric: Metric
  category: string
  x: number
  y: number
  w: number
  h: number
}

export type Board = { id: string; name: string; widgets: WidgetConf[] }

export const COLS = 12
export const ROW_PX = 40
export const GAP_PX = 16

export const WIDGET_TYPES: WidgetType[] = ['news', 'bars', 'columns', 'pie', 'line', 'tone', 'kpi', 'table', 'cloud']
export const DIMS: Dim[] = ['channels', 'categories', 'sources', 'tones', 'people', 'orgs', 'places', 'flux']
export const METRICS: Metric[] = ['total', 'broadcasts', 'sources', 'average']
export const PERIODS = [1, 7, 30, 90]

/** Taille de départ de chaque type de widget, en colonnes × lignes */
export const DEFAULT_SIZE: Record<WidgetType, [number, number]> = {
  news: [6, 12],
  bars: [6, 8],
  columns: [6, 8],
  pie: [4, 8],
  line: [8, 7],
  kpi: [3, 4],
  table: [4, 8],
  cloud: [6, 6],
  tone: [8, 8],
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export function makeWidget(type: WidgetType, patch: Partial<WidgetConf> = {}): WidgetConf {
  const [w, h] = DEFAULT_SIZE[type]
  return { id: newId(), type, title: '', flux: '', days: type === 'news' ? 30 : 7, dim: 'channels', metric: 'total', category: '', x: 0, y: 0, w, h, ...patch }
}

const overlap = (a: WidgetConf, b: WidgetConf) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Remet la grille en ordre après un déplacement : le widget « fixed » garde sa place,
 * les autres sont poussés vers le bas s'ils le chevauchent, puis tout remonte au plus haut.
 */
export function compact(widgets: WidgetConf[], fixedId?: string): WidgetConf[] {
  const clamp = (w: WidgetConf) => {
    const width = Math.min(Math.max(w.w, 2), COLS)
    return { ...w, w: width, h: Math.max(w.h, 3), x: Math.min(Math.max(w.x, 0), COLS - width), y: Math.max(w.y, 0) }
  }
  const all = widgets.map(clamp)
  const fixed = all.find((w) => w.id === fixedId)
  const rest = all.filter((w) => w.id !== fixedId).sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: WidgetConf[] = fixed ? [fixed] : []
  for (const w of rest) {
    const item = { ...w }
    while (placed.some((p) => overlap(p, item))) item.y++
    placed.push(item)
  }
  // Remontée : chaque widget (sauf celui qu'on tient) monte tant qu'il ne touche rien
  const out: WidgetConf[] = []
  for (const w of [...placed].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const item = { ...w }
    if (item.id !== fixedId) while (item.y > 0 && !out.some((p) => overlap(p, { ...item, y: item.y - 1 }))) item.y--
    out.push(item)
  }
  return out
}

/** Place un nouveau widget dans le premier espace libre, de haut en bas */
export function append(widgets: WidgetConf[], w: WidgetConf): WidgetConf[] {
  const width = Math.min(w.w, COLS)
  for (let y = 0; ; y++) {
    for (let x = 0; x + width <= COLS; x++) {
      const item = { ...w, w: width, x, y }
      if (!widgets.some((p) => overlap(p, item))) return [...widgets, item]
    }
  }
}

export const DEFAULT_BOARDS: Board[] = [
  {
    id: 'main',
    name: '',
    widgets: [
      makeWidget('news', { id: 'd1', flux: 'libye', x: 0, y: 0 }),
      makeWidget('bars', { id: 'd2', dim: 'sources', x: 6, y: 0, h: 12 }),
      makeWidget('bars', { id: 'd3', dim: 'channels', x: 0, y: 12 }),
      makeWidget('bars', { id: 'd4', dim: 'categories', x: 6, y: 12 }),
      makeWidget('line', { id: 'd5', days: 30, x: 0, y: 20 }),
      makeWidget('pie', { id: 'd6', dim: 'channels', days: 30, x: 8, y: 20, h: 7 }),
    ],
  },
  {
    // Analyse média : tonalité, personnalités, organisations, lieux (comme Meltwater)
    id: 'intel',
    name: '',
    widgets: [
      makeWidget('pie', { id: 'i1', dim: 'tones', x: 0, y: 0, w: 4 }),
      makeWidget('tone', { id: 'i2', dim: 'tones', days: 30, x: 4, y: 0 }),
      makeWidget('bars', { id: 'i3', dim: 'people', x: 0, y: 8, h: 9 }),
      makeWidget('bars', { id: 'i4', dim: 'orgs', x: 6, y: 8, h: 9 }),
      makeWidget('cloud', { id: 'i5', dim: 'places', x: 0, y: 17 }),
      makeWidget('columns', { id: 'i6', dim: 'sources', x: 6, y: 17, h: 6 }),
    ],
  },
]

/** Libellés du concepteur de tableaux de bord */
export const BUILDER_TEXT = {
  ar: {
    defaultBoard: 'الرئيسية',
    intelBoard: 'التحليل الإعلامي',
    edit: 'تعديل اللوحة',
    addChart: 'إضافة رسم بياني',
    save: 'حفظ',
    cancel: 'إلغاء',
    saving: 'جارٍ الحفظ…',
    saveError: 'تعذّر الحفظ. أعد المحاولة.',
    newBoard: 'لوحة جديدة',
    boardName: 'اسم اللوحة',
    deleteBoard: 'حذف هذه اللوحة',
    confirmDelete: 'حذف هذه اللوحة نهائياً؟',
    empty: 'اللوحة فارغة. اضغط « إضافة رسم بياني » لإضافة أول عنصر.',
    editHint: 'اسحب العنصر من رأسه لتحريكه، ومن الزاوية لتغيير حجمه.',
    editWidget: 'تعديل',
    duplicate: 'نسخ',
    remove: 'حذف',
    widgetTitle: 'العنوان (اختياري)',
    type: 'نوع العرض',
    source: 'المصدر',
    period: 'الفترة',
    dim: 'التوزيع حسب',
    metric: 'المؤشر',
    category: 'الموضوع',
    allCategories: 'كل المواضيع',
    preview: 'معاينة',
    apply: 'تطبيق',
    days: (n: number) => (n === 1 ? 'آخر 24 ساعة' : `آخر ${n} يوماً`),
    types: {
      news: 'قائمة الأخبار',
      bars: 'أشرطة أفقية',
      columns: 'أعمدة',
      pie: 'دائري',
      line: 'منحنى زمني',
      kpi: 'رقم رئيسي',
      table: 'جدول',
      cloud: 'سحابة كلمات',
      tone: 'تطور النبرة',
    },
    dims: {
      channels: 'القنوات',
      categories: 'المواضيع',
      sources: 'المصادر',
      flux: 'الرصد',
      tones: 'النبرة',
      people: 'الشخصيات',
      orgs: 'المؤسسات',
      places: 'الأماكن',
    },
    metrics: { total: 'عدد الأخبار', broadcasts: 'مرات البث والنشر', sources: 'عدد المصادر', average: 'المعدل اليومي' },
    other: 'أخرى',
    perDay: 'عدد الأخبار في اليوم',
  },
  en: {
    defaultBoard: 'Main',
    intelBoard: 'Media analysis',
    edit: 'Edit dashboard',
    addChart: 'Add a chart',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
    saveError: 'Saving failed. Please try again.',
    newBoard: 'New dashboard',
    boardName: 'Dashboard name',
    deleteBoard: 'Delete this dashboard',
    confirmDelete: 'Delete this dashboard permanently?',
    empty: 'Empty dashboard. Click “Add a chart” to start.',
    editHint: 'Drag a widget by its header to move it, and by its corner to resize it.',
    editWidget: 'Edit',
    duplicate: 'Duplicate',
    remove: 'Delete',
    widgetTitle: 'Title (optional)',
    type: 'Display type',
    source: 'Source',
    period: 'Period',
    dim: 'Break down by',
    metric: 'Metric',
    category: 'Topic',
    allCategories: 'All topics',
    preview: 'Preview',
    apply: 'Apply',
    days: (n: number) => (n === 1 ? 'Last 24 hours' : `Last ${n} days`),
    types: {
      news: 'News list',
      bars: 'Horizontal bars',
      columns: 'Columns',
      pie: 'Pie chart',
      line: 'Line',
      kpi: 'Key figure',
      table: 'Table',
      cloud: 'Word cloud',
      tone: 'Tone over time',
    },
    dims: {
      channels: 'Channels',
      categories: 'Topics',
      sources: 'Sources',
      flux: 'Watches',
      tones: 'Tone',
      people: 'People',
      orgs: 'Organizations',
      places: 'Places',
    },
    metrics: { total: 'News items', broadcasts: 'Broadcasts and posts', sources: 'Sources', average: 'Average per day' },
    other: 'Other',
    perDay: 'News per day',
  },
}
