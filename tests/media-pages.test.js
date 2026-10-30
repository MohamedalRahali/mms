import test from 'node:test'
import assert from 'node:assert/strict'
import { captureState } from '../server/live.js'
import { capturePart, countersOf } from '../server/media.js'

/** Pages « الوسائط » : état des chaînes enregistrées, compteurs de l'en-tête. node --test tests/*.test.js */

const NOW = Date.parse('2026-10-30T10:00:00Z')

test('état de capture : motif de l’échec ramené à une catégorie', () => {
  assert.equal(captureState({ actif: false, erreur: 'whatever' }, NOW), 'disabled')
  assert.equal(captureState({ erreur: 'ERROR: [youtube] x: Sign in to confirm you’re not a bot.' }, NOW), 'blocked')
  assert.equal(captureState({ erreur: 'ERROR: [youtube:tab] @218tvnet: The channel is not currently live' }, NOW), 'offline')
  assert.equal(captureState({ erreur: 'This channel does not have a streams tab' }, NOW), 'offline')
  assert.equal(captureState({ erreur: 'radio « Sawt » introuvable dans radio-browser.info' }, NOW), 'nosource')
  assert.equal(captureState({ erreur: 'Timeout' }, NOW), 'error')
  assert.equal(captureState({ dernier_succes: '2026-10-29T19:52:58+00:00' }, NOW), 'ok')
  assert.equal(captureState({ dernier_succes: '2026-10-23T20:46:16+00:00' }, NOW), 'stale')
  assert.equal(captureState({}, NOW), 'never')
  assert.equal(captureState({ liveOnly: true, actif: false }, NOW), 'liveOnly')
})

test('chaînes de la page : filtrées par sous-type, comptées, les actives d’abord ; rien pour youtube', () => {
  const channels = [
    { id: 'a', name: 'قناة 218', sub: 'tv', state: 'blocked', last: '', via: 'youtube' },
    { id: 'b', name: 'قناة الوسط', sub: 'tv', state: 'ok', last: '2026-10-29T19:44:47Z', via: 'stream' },
    { id: 'c', name: 'إذاعة طرابلس', sub: 'radio', state: 'disabled', last: '', via: '' },
  ]
  const found = [{ origin: 'قناة الوسط' }, { origin: 'قناة الوسط' }, { origin: 'أخرى' }]
  const tv = capturePart(channels, found, 'tv')
  assert.deepEqual(
    tv.map((c) => [c.id, c.count]),
    [
      ['b', 2],
      ['a', 0],
    ],
  )
  assert.equal(capturePart(channels, found, '').length, 3)
  assert.deepEqual(capturePart(channels, found, 'youtube'), [])
})

test('compteurs : jour de Tripoli, 7 jours glissants, sources actives', () => {
  const all = [
    { date: '2026-10-30T08:00:00Z', origin: 'A' },
    // 23:30 UTC le 29 = 01:30 le 30 à Tripoli (UTC+2)
    { date: '2026-10-29T23:30:00Z', origin: 'B' },
    { date: '2026-10-29T12:00:00Z', origin: 'B' },
    { date: '2026-10-20T12:00:00Z', origin: 'C' },
  ]
  assert.deepEqual(countersOf(all, NOW), { today: 2, week: 3, sourcesWeek: 2 })
})
