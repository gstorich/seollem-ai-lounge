'use strict';

// Decision router shared by production moderation and the offline benchmark.
const fields = ['sexualContent', 'explicitContent', 'sexualMinors', 'adultTransition', 'nonConsensualSex', 'realPersonSexualization', 'seriousHarm'];
const forbidden = ['sexualMinors', 'nonConsensualSex', 'realPersonSexualization', 'seriousHarm'];
const thresholds = Object.freeze({ low: 0.1, high: 0.9 });

function routing(probabilities, adult) {
  if (!probabilities || fields.some(k => !Number.isFinite(probabilities[k]) || probabilities[k] < 0 || probabilities[k] > 1)) {
    return { recheck: true, reason: 'invalid_jev_response' };
  }
  const relevant = adult === true ? [...forbidden, 'explicitContent'] : fields;
  const uncertain = relevant.filter(k => probabilities[k] > thresholds.low && probabilities[k] < thresholds.high);
  return { recheck: uncertain.length > 0, reason: uncertain.length ? 'uncertain' : 'confident', uncertain };
}

function validate(flags) {
  if (!flags || fields.some(k => typeof flags[k] !== 'boolean')) throw Error('INVALID_SAFETY_RESULT');
  return flags;
}

function createHybridSafety({ jev, gemini }) {
  if (typeof jev !== 'function' || typeof gemini !== 'function') throw Error('CLASSIFIERS_REQUIRED');
  return async function classify(input, { adult = false, signal } = {}) {
    signal?.throwIfAborted();
    let first;
    try { first = await jev(input, { signal }); }
    catch (error) {
      signal?.throwIfAborted();
      first = null;
    }
    signal?.throwIfAborted();
    const route = routing(first?.probabilities, adult);
    if (route.recheck) {
      // Failed rechecks propagate. Never turn provider errors into allow.
      const second = await gemini(input, { signal });
      signal?.throwIfAborted();
      return { flags: validate(second?.flags), provider: 'gemini', route, first, second };
    }
    return { flags: Object.fromEntries(fields.map(k => [k, first.probabilities[k] >= 0.5])), provider: 'jev', route, first };
  };
}

module.exports = { createHybridSafety, routing, thresholds, fields };
