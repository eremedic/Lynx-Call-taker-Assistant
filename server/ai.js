// Optional Claude-powered transcript analysis. The assistant works fully
// without it (keyword detection in engine/detect.js); when an API key is
// configured, Claude reads the transcript, suggests answers to the question
// bank, and proposes follow-up questions the bank does not cover.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

let client = null;
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `You assist a call taker at an ambulance service who is on the phone with a caller (often a nurse, facility, or family member) arranging patient transport.

Your job is to read the live call transcript and help the call taker document whether ambulance transport meets Medicare (CMS) medical-necessity requirements under 42 CFR 410.40 and the Medicare Benefit Policy Manual, Chapter 10:
- Ambulance transport is covered only when other means of transport would endanger the patient's health.
- Bed-confined means ALL of: unable to get up from bed without assistance, unable to ambulate, and unable to sit in a chair or wheelchair. Bed-confinement alone is not sufficient on its own.
- Lack of other transportation, convenience, or preference does not establish necessity.
- Non-emergency transports require a Physician Certification Statement; repetitive scheduled transports need one dated within 60 days prior.

You receive the transcript, the call type, the question bank (with codes), and the answers already confirmed.

Rules:
- Only suggest an answer when the transcript states it. Quote the supporting words in "evidence". Never infer clinical facts that were not said.
- For yes/no questions answer exactly "yes" or "no". For choice questions answer with one of the listed options exactly. For text questions answer with a short phrase.
- Do not suggest answers for questions that already have a confirmed answer unless the transcript clearly contradicts it.
- In additional_questions, propose at most 3 short questions the call taker should ask next that the question bank does not already cover and that would materially help document medical necessity. Use an empty list if none.
- call_details: fill only what the caller explicitly said; use an empty string otherwise.
- summary: 1-2 sentences describing the patient's condition and why transport is needed, suitable for the trip record.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    suggested_answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          answer: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['code', 'answer', 'evidence'],
        additionalProperties: false,
      },
    },
    additional_questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['question', 'rationale'],
        additionalProperties: false,
      },
    },
    call_details: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        pickup_location: { type: 'string' },
        destination: { type: 'string' },
        reason_for_transport: { type: 'string' },
      },
      required: ['patient_name', 'pickup_location', 'destination', 'reason_for_transport'],
      additionalProperties: false,
    },
    summary: { type: 'string' },
  },
  required: ['suggested_answers', 'additional_questions', 'call_details', 'summary'],
  additionalProperties: false,
};

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function analyzeTranscript({ transcript, callType, questions, answers }) {
  if (!aiConfigured()) throw new AiError('AI analysis is not configured. Set ANTHROPIC_API_KEY on the server.', 503);

  const bank = questions.map((q) => ({
    code: q.code,
    category: q.category,
    question: q.text,
    type: q.answer_type,
    ...(q.answer_type === 'choice' ? { options: q.options } : {}),
  }));

  const userContent = [
    `Call type: ${callType}`,
    `Question bank:\n${JSON.stringify(bank)}`,
    `Confirmed answers:\n${JSON.stringify(answers || {})}`,
    `Transcript:\n<transcript>\n${transcript}\n</transcript>`,
  ].join('\n\n');

  let response;
  try {
    response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('AI service rejected the API key.', 502);
    if (err instanceof Anthropic.RateLimitError) throw new AiError('AI service is rate limited — try again shortly.', 429);
    if (err instanceof Anthropic.APIError) throw new AiError(`AI service error (${err.status ?? 'network'}).`, 502);
    throw err;
  }

  if (response.stop_reason === 'refusal') throw new AiError('The AI declined to analyze this transcript.', 422);
  if (response.stop_reason === 'max_tokens') throw new AiError('AI response was cut off.', 502);

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError('AI returned an unreadable response.', 502);
  }

  // Keep only suggestions that map to real questions with valid answers.
  const byCode = new Map(questions.map((q) => [q.code, q]));
  parsed.suggested_answers = (parsed.suggested_answers || []).filter((s) => {
    const q = byCode.get(s.code);
    if (!q) return false;
    if (q.answer_type === 'yes_no') return ['yes', 'no'].includes(String(s.answer).toLowerCase());
    if (q.answer_type === 'choice') return (q.options || []).includes(s.answer);
    return Boolean(String(s.answer).trim());
  }).map((s) => {
    const q = byCode.get(s.code);
    return { ...s, answer: q.answer_type === 'yes_no' ? String(s.answer).toLowerCase() : s.answer };
  });
  return { ...parsed, model: response.model };
}
