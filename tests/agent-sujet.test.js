import test from 'node:test'
import assert from 'node:assert/strict'

/** Agents d'Around : un sujet en phrase libre ne doit plus exiger chacun de ses mots (« في »…) */

const now = Date.parse('2026-11-01T12:00:00Z')
const item = (title, h = 5) => ({ title, summary: '', origin: 'مصدر', date: new Date(now - h * 3600_000).toISOString(), tone: 'neutral' })
const pool = [
  item('الاقتصاد الليبي: المصرف المركزي يعلن حزمة قرارات مالية'),
  item('ارتفاع الدولار أمام الدينار الليبي في السوق الموازية والوضع المالي'),
  item('ليبيا: وزارة المالية تبحث مع البنك الدولي إصلاح الوضع الاقتصادي'),
  item('مباراة كرة القدم في طرابلس'),
  item('الانتخابات البلدية في ليبيا: المفوضية تعلن المواعيد'),
  item('انتخابات المجالس البلدية في الجنوب الليبي'),
  item('ليبيا تستضيف مؤتمراً للطاقة'),
]

test('phrase libre : la moitié des mots significatifs suffit (racines arabes comprises)', async () => {
  const { agentStats } = await import('../server/around.js')
  const st = agentStats(pool, 'الوضع الاقتصادي والمالي في ليبيا', 7, now)
  const n = st.current?.total ?? st.cur?.length
  assert.ok(n >= 2, `au moins deux fiches, ${n} trouvées`)
})

test('deux mots : tous exigés (pas tout ce qui cite ليبيا)', async () => {
  const { agentStats } = await import('../server/around.js')
  const st = agentStats(pool, 'الانتخابات في ليبيا', 7, now)
  assert.equal(st.current?.total ?? st.cur?.length, 1)
})

test('requête booléenne explicite : inchangée', async () => {
  const { agentStats } = await import('../server/around.js')
  const st = agentStats(pool, 'المصرف AND الدولار', 7, now)
  assert.equal(st.current?.total ?? st.cur?.length, 0)
})
