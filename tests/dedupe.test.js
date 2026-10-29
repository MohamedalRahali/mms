import test from 'node:test'
import assert from 'node:assert/strict'
import { dedupeKeyer } from '../server/dedupe.js'

/** Statistiques sans gonflement : une même actualité (même adresse ou même titre) ne compte qu'une fois */

test('doublons : même adresse, même titre, titres trop courts', () => {
  const key = dedupeKeyer()
  const items = [
    { id: '1', url: 'https://alwasat.ly/news/1?utm_source=x', title: 'المؤسسة الوطنية للنفط تفتتح حقل الرشاد للغاز' },
    { id: '2', url: 'https://alwasat.ly/news/1/', title: 'عنوان معدّل' },
    { id: '3', url: 'https://libyaobserver.ly/a', title: 'المؤسسه الوطنيه للنفط تفتتح حقل الرشاد للغاز!' },
    { id: '4', url: 'https://x.com/a/1', title: 'بث مباشر' },
    { id: '5', url: 'https://x.com/a/2', title: 'بث مباشر' },
    { id: '6', url: 'https://example.ly/b', title: 'خبر مختلف تماماً عن غيره' },
    // Deux vidéos YouTube différentes : même chemin, paramètre v différent
    { id: '7', url: 'https://www.youtube.com/watch?v=AAA', title: 'نشرة الأخبار' },
    { id: '8', url: 'https://www.youtube.com/watch?v=BBB', title: 'نشرة' },
  ]
  const keys = items.map(key)
  // 1 et 2 : même adresse (paramètres de suivi et barre finale ignorés) ; 3 : même titre normalisé
  assert.deepEqual(keys, ['1', '1', '1', '4', '5', '6', '7', '8'])
  assert.equal(new Set(keys).size, 6)
})

test('rapport exécutif et comparaison : actualités sans doublons, sources médias séparées des comptes', async () => {
  const { comparePeriods } = await import('../server/insights.js')
  const now = Date.now()
  const at = (h) => new Date(now - h * 3_600_000).toISOString()
  const base = { summary: '', category: 'politique', tone: 'neutral', importance: 2, people: ['الدبيبة'], orgs: [], places: [] }
  const items = [
    { ...base, id: 'a', title: 'الحكومة تعلن الميزانية الجديدة للعام المقبل', url: 'https://alwasat.ly/1', origin: 'الوسط', channel: 'site', date: at(1) },
    { ...base, id: 'b', title: 'الحكومة تعلن الميزانية الجديدة للعام المقبل', url: 'https://libyaobserver.ly/2', origin: 'ليبيا أوبزرفر', channel: 'site', date: at(2) },
    { ...base, id: 'c', title: 'تغريدة عن الميزانية الجديدة ومخصصاتها', url: 'https://x.com/u/1', origin: '@user1', channel: 'x', date: at(3) },
    { ...base, id: 'd', title: 'فيديو عن الميزانية الجديدة ومخصصاتها كاملة', url: 'https://www.youtube.com/watch?v=Z1', origin: 'قناة', channel: 'youtube', date: at(4) },
  ]
  const c = comparePeriods(items, 7)
  assert.equal(c.current.publications, 4)
  assert.equal(c.current.total, 3)
  assert.equal(c.current.sources, 2)
  assert.equal(c.current.accounts, 2)
  assert.equal(c.categories[0].current, 3)
  assert.equal(c.people[0].current, 3)
})
