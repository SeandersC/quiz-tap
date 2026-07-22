import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyQuestionSet,
  calculateAttemptScore,
  calculateQuestionScore,
  calculateTimeScore,
  getQuizDayForTimeZone
} from '../src/lib/quiz.js';

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

test('calculateAttemptScore scales down as attempts increase', () => {
  assert.equal(calculateAttemptScore(1), 100);
  assert.equal(calculateAttemptScore(2), 75);
  assert.equal(calculateAttemptScore(3), 50);
  assert.equal(calculateAttemptScore(4), 25);
  assert.equal(calculateAttemptScore(5), 0);
});

test('calculateTimeScore decays linearly by elapsed seconds', () => {
  assert.equal(calculateTimeScore(0), 100);
  assert.equal(calculateTimeScore(30), 50);
  assert.equal(calculateTimeScore(60), 0);
});

test('calculateQuestionScore combines answer worth and time worth', () => {
  assert.equal(calculateQuestionScore(1, 0), 200);
  assert.equal(calculateQuestionScore(2, 30), 125);
  assert.equal(calculateQuestionScore(3, 60), 50);
  assert.equal(calculateQuestionScore(4, 0), 125);
  assert.equal(calculateQuestionScore(5, 60), 0);
});

test('buildDailyQuestionSet randomizes option placement without forcing the answer off the first slot', () => {
  const questions = [
    ...buildDailyQuestionSet('2026-07-22'),
    ...buildDailyQuestionSet('2026-07-23'),
    ...buildDailyQuestionSet('2026-07-24')
  ];

  const firstPositionPlacements = questions.filter((question) => question.options.indexOf(question.correctAnswer) === 0);
  const otherPlacements = questions.filter((question) => question.options.indexOf(question.correctAnswer) !== 0);

  assert.ok(firstPositionPlacements.length > 0);
  assert.ok(otherPlacements.length > 0);
});
