// Intake Assistant: a guided chat beside the console. It suggests one question
// at a time (from the same ranked queue as "Ask next"), notices when the call
// taker has asked it, listens for the caller's answer, and asks the call taker
// to accept it before moving on. Answers go through the console's normal
// setAnswer(), so the checklist, assessment and saved call stay in sync.
import { esc, formatAnswer, CRITERION_LABELS, CRITERION_CHIPS } from './common.js';

const $ = (sel) => document.querySelector(sel);

const STOP_WORDS = new Set(`about above after again also because been before being between both does doing down during each from further have having here into itself just more most once only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your yours could patient patients able need needs right time today`.split(/\s+/));

// The words that identify a question when it is read aloud.
export function keywords(text) {
  return [...new Set(String(text).toLowerCase().match(/[a-z]{4,}/g) || [])].filter((w) => !STOP_WORDS.has(w));
}

// If most of the question's key words appear in `text`, returns where the
// spoken question starts and ends (the caller's answer follows); else null.
export function findAskedQuestion(question, text) {
  const words = keywords(question);
  if (words.length < 2) return null;
  const lower = String(text).toLowerCase();
  let start = Infinity;
  let end = -1;
  let hits = 0;
  for (const w of words) {
    const i = lower.indexOf(w); // first mention: the answer may repeat the words
    if (i === -1) continue;
    hits += 1;
    start = Math.min(start, i);
    end = Math.max(end, i + w.length);
  }
  if (hits / words.length < 0.6) return null;
  // Start at the beginning of that sentence, finish at its end (e.g. the "?").
  const before = lower.slice(0, start).search(/[^?.!\n]*$/);
  const stop = lower.slice(end).search(/[?.!\n]/);
  return { start: before === -1 ? start : before, end: stop === -1 ? end : end + stop + 1 };
}

// Questions whose answer decides medical necessity "pop out" in the chat.
const KEY_QUESTIONS = {
  bed_confined: { tone: 'qualify', label: 'Qualifying question: bed confinement (all three needed)', answerLabel: 'Qualifies if' },
  condition: { tone: 'qualify', label: 'Qualifying question: this condition can establish medical necessity', answerLabel: 'Qualifies if' },
  als: { tone: 'qualify', label: 'Qualifying question: ALS-level care', answerLabel: 'Qualifies if' },
  sct: { tone: 'qualify', label: 'Qualifying question: specialty care transport', answerLabel: 'Qualifies if' },
  disqualifier: { tone: 'disqualify', label: 'Key question: this answer can rule out ambulance transport', answerLabel: 'Rules out if' },
  emergency: { tone: 'emergency', label: 'Emergency screen: ask this first', answerLabel: 'Emergency if' },
};

const YES_RE = /\b(yes|yeah|yep|yup|correct|that's right|she does|he does|they do|she is|he is|absolutely|definitely)\b/i;
const NO_RE = /\b(no|nope|not really|doesn't|does not|isn't|is not|can't|cannot|never|none)\b/i;

// Turns what the caller said after the question into a proposed answer.
export function guessAnswer(q, heard) {
  const text = String(heard || '').trim();
  if (!text) return null;
  const evidence = text.length > 160 ? `…${text.slice(-160)}` : text;
  if (q.answer_type === 'yes_no') {
    const yes = YES_RE.test(text);
    const no = NO_RE.test(text);
    if (yes === no) return null; // nothing clear, or both
    return { answer: yes ? 'yes' : 'no', evidence };
  }
  if (q.answer_type === 'number') {
    const m = text.match(/-?\d+(?:\.\d+)?/);
    return m ? { answer: m[0], evidence } : null;
  }
  if (q.answer_type === 'choice') {
    const lower = text.toLowerCase();
    const hit = (q.options || []).find((o) => lower.includes(String(o).toLowerCase()));
    return hit ? { answer: hit, evidence } : null;
  }
  return { answer: text.slice(0, 500), evidence, editable: true };
}

export function createChatbot({ state, setAnswer, appendTranscript, currentSuggestions, answerControls, markActive, onAskedHeard = () => {} }) {
  const chat = {
    log: [], // finished exchanges: { who: 'bot' | 'me' | 'caller', html }
    code: null, // question being worked on
    phase: 'ask', // 'ask' -> 'listening'
    postedAt: 0, // transcript length when the question was suggested
    answerFrom: null, // transcript index where the caller's answer starts
    finished: false,
    lastActiveHtml: '',
    spoken: [], // questions the call taker read aloud: { start, end, text }
    popped: null, // the question whose pop-out animation already played
  };

  const say = (who, html) => chat.log.push({ who, html });
  const question = (code) => state.byCode.get(code);

  function greet() {
    say('bot', 'I’ll suggest each question to ask. Ask it, and I’ll listen for the answer. Accept it, or pick a different answer, and I’ll go to the next one. <span class="muted">With the microphone on, I notice when you’ve asked. Otherwise click <strong>I asked it</strong>.</span>');
  }

  function reset() {
    Object.assign(chat, { log: [], code: null, phase: 'ask', postedAt: 0, answerFrom: null, finished: false, lastActiveHtml: '', spoken: [], popped: null });
    greet();
  }

  function questionBubble(q, { past = false } = {}) {
    const ev = state.evaluation;
    const chips = [
      q.criterion && q.criterion !== 'info' ? `<span class="chip ${CRITERION_CHIPS[q.criterion] || ''}">${esc(CRITERION_LABELS[q.criterion] || q.criterion)}</span>` : '',
      q.required ? '<span class="chip chip-amber">Required</span>' : '',
      ev?.triggeredCodes.includes(q.code) ? '<span class="chip chip-violet">Based on what I heard</span>' : '',
    ].join('');
    return `<div class="chat-label">${past ? 'Asked' : 'Ask the caller'}${chips ? ` ${chips}` : ''}</div>
      <div class="chat-q">${esc(q.text)}</div>
      ${!past && q.guidance ? `<div class="chat-guidance">${esc(q.guidance)}</div>` : ''}`;
  }

  // Moves the conversation forward after any change to answers or transcript.
  function advance() {
    const ev = state.evaluation;
    if (!ev) return;

    if (chat.code) {
      const q = question(chat.code);
      const answered = state.answers[chat.code] !== undefined;
      if (!q || answered || state.skipped.has(chat.code) || !ev.visibleCodes.includes(chat.code)) {
        if (q) say('bot', questionBubble(q, { past: true }));
        if (q && answered) say('me', `✓ ${esc(formatAnswer(state.answers[chat.code]))}`);
        else if (q && state.skipped.has(chat.code)) say('me', 'Skipped <span class="chat-sub">(still in the checklist)</span>');
        else if (q) say('bot', '<span class="muted">No longer needed for this call type or payer.</span>');
        chat.code = null;
      }
    }

    if (!chat.code) {
      const next = ev.queue.find((c) => !state.skipped.has(c))
        || (ev.nextQuestion && !state.skipped.has(ev.nextQuestion) ? ev.nextQuestion : null);
      if (next) {
        Object.assign(chat, { code: next, phase: 'ask', postedAt: state.transcript.length, answerFrom: null, finished: false });
      } else if (!chat.finished && Object.keys(state.answers).length) {
        chat.finished = true;
        say('bot', '✓ That covers every prompted question. Confirm anything still listed below, review the assessment, then save the call.');
      }
    }

    // Notice the call taker reading the question out (microphone or typed notes).
    if (chat.code && chat.phase === 'ask') {
      const since = state.transcript.slice(chat.postedAt);
      const found = findAskedQuestion(question(chat.code).text, since);
      if (found) {
        const start = chat.postedAt + found.start;
        const end = chat.postedAt + found.end;
        chat.phase = 'listening';
        chat.answerFrom = end;
        chat.spoken.push({ start, end, text: state.transcript.slice(start, end) });
        onAskedHeard(); // re-check the transcript without the question's own words
      }
    }
  }

  function proposal(q) {
    const detected = currentSuggestions().find((s) => s.code === q.code);
    if (detected) return { answer: detected.answer, evidence: detected.evidence, source: detected.source };
    if (chat.phase !== 'listening') return null;
    const guess = guessAnswer(q, state.transcript.slice(chat.answerFrom ?? chat.postedAt));
    return guess && { ...guess, source: 'Heard' };
  }

  function activeHtml() {
    const parts = [];
    if (chat.code) {
      const q = question(chat.code);
      const p = proposal(q);
      const key = KEY_QUESTIONS[q.criterion];
      const pop = key && chat.popped !== q.code ? ' pop-in' : '';
      if (key) chat.popped = q.code;
      parts.push(`<div class="bubble bot active${key ? ` key key-${key.tone}` : ''}${pop}">
        ${key ? `<div class="key-banner"><span class="key-star" aria-hidden="true">★</span> ${esc(key.label)}
          ${q.qualifying_answer ? `<span class="key-answer">${esc(key.answerLabel)}: <strong>${esc(formatAnswer(q.qualifying_answer.split('|')[0]))}</strong></span>` : ''}</div>` : ''}
        ${questionBubble(q)}
        ${chat.phase === 'ask' ? `<div class="chat-actions">
          <button type="button" class="btn btn-sm btn-primary" data-chat-asked>✓ I asked it</button>
          <button type="button" class="btn btn-sm btn-ghost" data-skip="${esc(q.code)}">Skip</button>
        </div>` : ''}</div>`);

      if (p) {
        const value = p.editable
          ? `<input class="input" data-chat-value value="${esc(p.answer)}" aria-label="Answer to record">`
          : `<strong>${esc(formatAnswer(p.answer))}</strong>`;
        parts.push(`<div class="bubble bot proposal">
          <div class="chat-label">${chat.phase === 'ask' ? 'The caller may have already answered' : 'I heard'}</div>
          <div class="chat-evidence">“${esc(p.evidence)}”</div>
          <div class="chat-record">Record: ${value}</div>
          <div class="chat-actions">
            ${p.editable
              ? `<button type="button" class="btn btn-sm btn-primary" data-chat-accept-input="${esc(q.code)}">Accept</button>`
              : `<button type="button" class="btn btn-sm btn-primary" data-accept="${esc(q.code)}" data-value="${esc(p.answer)}">Accept</button>`}
            ${q.answer_type === 'text' ? '' : `<span class="chat-sub">or choose:</span> ${answerControls(q)}`}
            <button type="button" class="btn btn-sm btn-ghost" data-skip="${esc(q.code)}">Skip</button>
          </div>
        </div>`);
      } else if (chat.phase === 'listening') {
        parts.push(`<div class="bubble bot">
          <div class="chat-label"><span class="listening-dot" aria-hidden="true"></span> Listening for the answer…</div>
          <div class="chat-sub" style="margin-bottom: 6px">Or record it yourself:</div>
          <div class="chat-actions">${answerControls(q)}
            <button type="button" class="btn btn-sm btn-ghost" data-skip="${esc(q.code)}">Skip</button></div>
        </div>`);
      }
    }

    // Answers to other questions picked up along the way.
    const others = currentSuggestions().filter((s) => s.code !== chat.code);
    if (others.length) {
      parts.push(`<div class="bubble bot">
        <div class="chat-label">I also picked up</div>
        ${others.map((s) => `<div class="chat-other">
          <div><div class="chat-other-q">${esc(question(s.code)?.text || s.code)}</div>
          <div class="chat-evidence">“${esc(s.evidence)}” → <strong>${esc(formatAnswer(s.answer))}</strong></div></div>
          <div class="chat-actions" style="margin: 0">
            <button type="button" class="btn btn-sm btn-primary" data-accept="${esc(s.code)}" data-value="${esc(s.answer)}">Accept</button>
            <button type="button" class="btn btn-sm btn-ghost" data-reject="${esc(s.code)}" data-value="${esc(s.answer)}" aria-label="Dismiss">✕</button>
          </div></div>`).join('')}
      </div>`);
    }
    return parts.join('');
  }

  let renderedLog = -1;
  function render() {
    const scroller = $('#chat-scroll');
    if (!scroller) return;
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
    let changed = false;
    if (renderedLog !== chat.log.length) {
      $('#chat-history').innerHTML = chat.log.map((m) => `<div class="bubble ${m.who}">${m.html}</div>`).join('');
      renderedLog = chat.log.length;
      changed = true;
    }
    const html = activeHtml();
    // Don't redraw under the call taker while they edit a proposed answer.
    const focused = document.activeElement;
    const editing = focused?.matches?.('#chat-active input, #chat-active select') && focused.dataset.chatValue !== undefined
      && chat.code && focused.closest('.proposal')?.querySelector(`[data-chat-accept-input="${CSS.escape(chat.code)}"]`);
    if (html !== chat.lastActiveHtml && !editing) {
      $('#chat-active').innerHTML = html;
      chat.lastActiveHtml = html;
      changed = true;
    }
    if (changed && atBottom) scroller.scrollTop = scroller.scrollHeight;
  }

  // The transcript with the call taker's spoken questions blanked out, so words
  // in a question (e.g. "unresponsive") aren't mistaken for the caller's answer.
  function forDetection(transcript) {
    let out = transcript;
    for (const s of chat.spoken) {
      if (out.slice(s.start, s.end) !== s.text) continue; // transcript was edited
      out = out.slice(0, s.start) + ' '.repeat(s.end - s.start) + out.slice(s.end);
    }
    return out;
  }

  function sync() {
    advance();
    render();
  }

  function bind() {
    $('#chat-card').addEventListener('click', (e) => {
      if (e.target.closest('[data-chat-asked]')) {
        markActive();
        chat.phase = 'listening';
        chat.answerFrom = state.transcript.length;
        return render();
      }
      const accept = e.target.closest('[data-chat-accept-input]');
      if (accept) {
        const value = $('#chat-active [data-chat-value]')?.value.trim();
        if (value) setAnswer(accept.dataset.chatAcceptInput, value);
      }
    });
    $('#chat-active').addEventListener('focusout', () => setTimeout(render, 0));
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      say('caller', `<span class="chat-sub">Caller said</span><br>${esc(text)}`);
      // Typing the caller's reply means the question was asked.
      if (chat.code && chat.phase === 'ask') Object.assign(chat, { phase: 'listening', answerFrom: state.transcript.length });
      appendTranscript(text);
      render();
    });
  }

  greet();
  bind();
  return { sync, reset, render, forDetection };
}
