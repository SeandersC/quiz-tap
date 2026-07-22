import { QUESTION_POOL } from './questions.js';

export function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getQuizDayForTimeZone(date = new Date(), timeZone = 'America/Chicago') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return [year, month, day].join('-');
}

export function buildDailyQuestionSet(dateString) {
  const seed = hashString(dateString);
  const questions = [...QUESTION_POOL];

  let shuffleSeed = seed;
  for (let i = questions.length - 1; i > 0; i -= 1) {
    shuffleSeed = (shuffleSeed * 31 + 17) % 1000003;
    const j = shuffleSeed % (i + 1);
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }

  return questions.slice(0, 5);
}

export function calculateQuestionScore(attempts) {
  const normalizedAttempts = Math.min(Math.max(attempts, 1), 5);
  const raw = 200 - (normalizedAttempts - 1) * 50;
  return Math.max(raw, 0);
}
