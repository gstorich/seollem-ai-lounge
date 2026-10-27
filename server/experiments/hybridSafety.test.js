'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHybridSafety, routing, fields } = require('./hybridSafety');
const probabilities = Object.fromEntries(fields.map(k => [k, 0.01]));
const flags = Object.fromEntries(fields.map(k => [k, false]));
test('certain safe and certain prohibited decisions skip recheck', async () => {
  for (const p of [probabilities, { ...probabilities, sexualMinors: .99 }]) {
    const classify = createHybridSafety({ jev: async () => ({ probabilities: p }), gemini: async () => assert.fail('unexpected recheck') });
    assert.equal((await classify({})).provider, 'jev');
  }
});
test('uncertain decision uses Gemini flags rather than Jev flags', async () => {
  const classify = createHybridSafety({ jev: async () => ({ probabilities: { ...probabilities, sexualContent: .6 } }), gemini: async () => ({ flags }) });
  assert.deepEqual((await classify({})).flags, flags);
});
test('verified adult ignores only fields which cannot change access', () => {
  assert.equal(routing({ ...probabilities, sexualContent: .6 }, true).recheck, false);
  assert.equal(routing({ ...probabilities, explicitContent: .6 }, true).recheck, true);
  assert.equal(routing({ ...probabilities, sexualMinors: .6 }, true).recheck, true);
});
test('missing, NaN and out-of-range probabilities require recheck', () => {
  for (const value of [undefined, NaN, -1, 1.1]) assert.equal(routing({ ...probabilities, seriousHarm: value }, false).recheck, true);
});
test('Jev failure falls back; Gemini failure and malformed results never allow', async () => {
  const jev = async () => { throw Error('unavailable'); };
  assert.equal((await createHybridSafety({ jev, gemini: async () => ({ flags }) })({})).provider, 'gemini');
  await assert.rejects(createHybridSafety({ jev, gemini: async () => { throw Error('unavailable'); } })({}));
  await assert.rejects(createHybridSafety({ jev, gemini: async () => ({ flags: {} }) })({}));
});
test('cancellation does not start a fallback request', async () => {
  const controller = new AbortController();
  const classify = createHybridSafety({ jev: async () => { controller.abort(); throw Error('cancelled'); }, gemini: async () => assert.fail('fallback after abort') });
  await assert.rejects(classify({}, { signal: controller.signal }));
});
