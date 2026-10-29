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
