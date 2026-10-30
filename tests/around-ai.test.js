import test from 'node:test'
import assert from 'node:assert/strict'
import { AIError, aiReason, geminiModel, runEconomy } from '../server/ai.js'

const SPEC = { system: 's', format: 'f', schema: {}, valid: (d) => typeof d.ok === 'boolean', name: 't' }
const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

test('Around : cause lisible de chaque erreur du moteur', () => {
  assert.equal(aiReason(new AIError('QUOTA', 'x')), 'QUOTA')
  assert.equal(aiReason(Object.assign(new Error('t'), { name: 'TimeoutError' })), 'TIMEOUT')
  assert.equal(aiReason(new SyntaxError('bad json')), 'PARSE')
  assert.equal(aiReason({ status: 401, message: 'invalid x-api-key' }), 'KEY')
  assert.equal(aiReason(new Error('?')), 'PROVIDER')
})

test('Gemini : modèle retiré (404) → bascule sur le meilleur « flash » du compte', async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY, a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY }
  process.env.GEMINI_API_KEY = 'test'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('/models?')) {
      return json(200, {
        models: [
          { name: 'models/gemini-9.1-flash-image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-9.0-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
        ],
      })
    }
    if (calls.length === 1) return json(404, { error: { message: 'This model is no longer available to new users.' } })
    return json(200, { candidates: [{ content: { parts: [{ text: '```json\n{"ok": true}\n```' }] } }], usageMetadata: {} })
  }
  try {
    const data = await runEconomy('question', SPEC)
    assert.deepEqual(data, { ok: true })
    assert.equal(geminiModel(), 'gemini-9.0-flash')
    assert.ok(calls[2].includes('gemini-9.0-flash:generateContent'))
  } finally {
    globalThis.fetch = saved.fetch
    for (const [k, v] of [['GEMINI_API_KEY', saved.key], ['ANTHROPIC_API_KEY', saved.a], ['OPENAI_API_KEY', saved.o]]) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('Gemini : quota épuisé (429) → erreur QUOTA, sans changer de modèle', async () => {
  const saved = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test'
  globalThis.fetch = async () => json(429, { error: { message: 'Resource has been exhausted (e.g. check quota).' } })
  try {
    await assert.rejects(runEconomy('q', SPEC), (err) => aiReason(err) === 'QUOTA')
  } finally {
    globalThis.fetch = saved
    delete process.env.GEMINI_API_KEY
  }
})
