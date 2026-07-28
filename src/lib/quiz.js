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

function shuffleOptions(question, seedInput) {
  const options = [...question.options];
  const answerValue = question.correctAnswer;
  const answerIndex = options.findIndex((option) => option === answerValue);

  if (answerIndex === -1) {
    return question;
  }

  let shuffleSeed = hashString(seedInput);
  for (let i = options.length - 1; i > 0; i -= 1) {
    shuffleSeed = (shuffleSeed * 31 + 17) % 1000003;
    const j = shuffleSeed % (i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }

  const desiredIndex = Math.abs(shuffleSeed) % options.length;
  const currentAnswerIndex = options.findIndex((option) => option === answerValue);

  if (currentAnswerIndex !== desiredIndex) {
    [options[currentAnswerIndex], options[desiredIndex]] = [options[desiredIndex], options[currentAnswerIndex]];
  }

  return {
    ...question,
    options
  };
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

  return questions.slice(0, 5).map((question, index) => {
    return shuffleOptions(question, `${dateString}-${question.id}-${index}`);
  });
}

export function calculateAttemptScore(attempts) {
  const normalizedAttempts = Math.min(Math.max(attempts, 1), 5);
  const attemptWeights = [100, 75, 50, 25, 0];
  return attemptWeights[normalizedAttempts - 1] ?? 0;
}

export function calculateTimeScore(elapsedSeconds, timeLimitSeconds = 60) {
  const boundedSeconds = Math.min(Math.max(elapsedSeconds, 0), timeLimitSeconds);
  return Math.max(0, Math.round(100 - (boundedSeconds / timeLimitSeconds) * 100));
}

export function calculateQuestionScore(attempts, elapsedSeconds = 0) {
  const attemptScore = calculateAttemptScore(attempts);
  const timeScore = calculateTimeScore(elapsedSeconds);
  const missedAttemptPenalty = Math.max(0, attempts - 1) * 5;
  const adjustedTimeScore = Math.max(0, timeScore - missedAttemptPenalty);
  return Math.max(0, Math.min(200, attemptScore + adjustedTimeScore));
}
