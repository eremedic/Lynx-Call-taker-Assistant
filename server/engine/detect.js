// Keyword-based fact detection over a call transcript.
//
// Each question can list phrases that suggest a "yes" (detect_yes) or "no"
// (detect_no) answer. A phrase preceded closely by a negation ("no oxygen",
// "denies chest pain") flips a yes-phrase into a "no" and cancels a
// no-phrase. When several phrases match, the latest mention in the
// transcript wins, since callers often correct themselves.

const NEGATIONS = new Set([
  'no', 'not', 'denies', 'denied', 'never', 'without', 'negative', "isn't", "doesn't", "don't", "wasn't", 'none',
  "can't", 'cannot', 'unable',
]);
const NEGATION_WINDOW = 3; // words

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ');
}

const isWordChar = (ch) => ch !== undefined && /[a-z0-9]/.test(ch);

// Find every occurrence of `phrase` in `text` that starts on a word boundary.
// With `wholeWord`, the match must also end on a boundary (a plural "s" is allowed).
export function findPhrase(text, phrase, { wholeWord = true } = {}) {
  const needle = normalize(phrase).trim();
  const hits = [];
  if (!needle) return hits;
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    from = idx + 1;
    const before = text[idx - 1];
    if (isWordChar(before) || before === '-') continue;
    if (wholeWord) {
      let end = idx + needle.length;
      if (text[end] === 's' && !isWordChar(text[end + 1])) end += 1;
      if (isWordChar(text[end])) continue;
    }
    hits.push(idx);
  }
  return hits;
}

function isNegated(text, idx) {
  let tail = text.slice(Math.max(0, idx - 60), idx);
  // Punctuation ends the scope of a negation: "no pain, on oxygen".
  const lastBreak = Math.max(...['.', ',', ';', '?', '!'].map((c) => tail.lastIndexOf(c)));
  if (lastBreak !== -1) tail = tail.slice(lastBreak + 1);
  return tail.split(/[^a-z']+/).filter(Boolean).slice(-NEGATION_WINDOW).some((w) => NEGATIONS.has(w));
}

function excerpt(text, idx, length) {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + length + 30);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

// Returns { [questionCode]: { answer, phrase, evidence, position } }
export function detectAnswers(transcript, questions) {
  const text = normalize(transcript);
  const results = {};
  if (!text.trim()) return results;

  for (const q of questions) {
    if (q.answer_type !== 'yes_no') continue;
    let best = null;
    const consider = (phrase, polarity) => {
      for (const idx of findPhrase(text, phrase)) {
        const negated = isNegated(text, idx);
        let answer = polarity;
        if (negated) {
          if (polarity === 'no') continue; // "not ambulatory" is ambiguous; skip.
          answer = 'no';
        }
        if (!best || idx >= best.position) {
          best = { answer, phrase, position: idx, evidence: excerpt(text, idx, phrase.length) };
        }
      }
    };
    (q.detect_yes || []).forEach((p) => consider(p, 'yes'));
    (q.detect_no || []).forEach((p) => consider(p, 'no'));
    if (best) results[q.code] = best;
  }
  return results;
}

// Returns the set of question codes whose trigger keywords appear in the transcript.
export function detectTriggers(transcript, questions) {
  const text = normalize(transcript);
  const triggered = new Set();
  if (!text.trim()) return triggered;
  for (const q of questions) {
    if ((q.triggers || []).some((t) => findPhrase(text, t, { wholeWord: false }).length > 0)) {
      triggered.add(q.code);
    }
  }
  return triggered;
}
