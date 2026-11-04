// The Intake Assistant's listening logic (public/js/chat.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAskedQuestion, guessAnswer } from '../public/js/chat.js';

const Q = 'Can the patient get up from bed without assistance?';

test('notices the call taker reading the question aloud', () => {
  const said = 'Okay. Can she get up from the bed without any assistance? No, she cannot, she needs two people.';
  const { start, end } = findAskedQuestion(Q, said);
  assert.equal(said.slice(start, end).trim(), 'Can she get up from the bed without any assistance?');
  assert.equal(said.slice(end).trim(), 'No, she cannot, she needs two people.');
  assert.equal(findAskedQuestion(Q, 'She lives at Sunrise nursing home and goes to dialysis.'), null);
});

test('the answer can repeat the question words without being cut off', () => {
  const said = 'Can she get up from bed without assistance? She can not get up from bed at all.';
  assert.equal(said.slice(findAskedQuestion(Q, said).end).trim(), 'She can not get up from bed at all.');
});

test('proposes an answer from what the caller said', () => {
  assert.equal(guessAnswer({ answer_type: 'yes_no' }, 'No, she cannot.').answer, 'no');
  assert.equal(guessAnswer({ answer_type: 'yes_no' }, 'Yeah, she does.').answer, 'yes');
  assert.equal(guessAnswer({ answer_type: 'yes_no' }, 'Hmm, let me check.'), null, 'unclear answers are not guessed');
  assert.equal(guessAnswer({ answer_type: 'number' }, 'About 280 pounds').answer, '280');
  assert.equal(guessAnswer({ answer_type: 'choice', options: ['Dialysis center', 'Hospital'] }, 'going to the dialysis center').answer, 'Dialysis center');
  const text = guessAnswer({ answer_type: 'text' }, 'End stage renal disease, on dialysis.');
  assert.deepEqual([text.answer, text.editable], ['End stage renal disease, on dialysis.', true]);
  assert.equal(guessAnswer({ answer_type: 'text' }, '   '), null);
});
