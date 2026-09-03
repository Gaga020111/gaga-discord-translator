'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GroqTranslationService, completionText } = require('../src/cloud-translation');

test('completionText reads a Groq chat completion', () => {
  const payload = {
    choices: [{ message: { content: '大家好' } }],
  };
  assert.equal(completionText(payload), '大家好');
});

test('transcribes WAV audio and translates it to Traditional Chinese', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/audio/transcriptions')) {
      assert.ok(options.body instanceof FormData);
      return new Response(JSON.stringify({ text: 'Hello everyone.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '大家好。' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const service = new GroqTranslationService({ apiKey: 'test-secret', fetchImpl: fakeFetch });
  const result = await service.translatePcm(Buffer.alloc(48_000 * 2 * 2));

  assert.deepEqual(result, { english: 'Hello everyone.', chinese_traditional: '大家好。' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(JSON.parse(calls[1].options.body).model, 'openai/gpt-oss-20b');
  assert.ok(calls[1].url.endsWith('/chat/completions'));
});

test('rejects safely when the API key is missing', async () => {
  const service = new GroqTranslationService({ apiKey: '', fetchImpl: async () => {} });
  assert.equal(service.ready, false);
  await assert.rejects(service.translatePcm(Buffer.alloc(4)), /GROQ_API_KEY/);
});
