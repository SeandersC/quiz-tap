import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyQuestionSet, calculateQuestionScore, getQuizDayForTimeZone } from '../src/lib/quiz.js';

test('getQuizDayForTimeZone keeps the quiz date in a fixed timezone', () => {
  const day = getQuizDayForTimeZone(new Date('2026-07-21T23:30:00-07:00'), 'America/Los_Angeles');

  assert.equal(day, '2026-07-21');
});

test('buildDailyQuestionSet returns 5 unique questions from the unified pool for the same day', () => {
  const date = '2026-07-21';
  const questions = buildDailyQuestionSet(date);

  assert.equal(questions.length, 5);
  assert.equal(new Set(questions.map((q) => q.id)).size, 5);
  assert.equal(questions.every((question) => question.difficulty === undefined), true);
});

test('calculateQuestionScore scales down as attempts increase', () => {
  assert.equal(calculateQuestionScore(1), 200);
  assert.equal(calculateQuestionScore(2), 150);
  assert.equal(calculateQuestionScore(3), 100);
  assert.equal(calculateQuestionScore(4), 50);
  assert.equal(calculateQuestionScore(5), 0);
});
