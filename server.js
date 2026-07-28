import express from 'express';
import cors from 'cors';
import { buildDailyQuestionSet, calculateQuestionScore, getQuizDayForTimeZone } from './src/lib/quiz.js';
import { addScoreEntry, getLeaderboard } from './src/lib/leaderboards.js';

const app = express();
const port = process.env.PORT || 3001;
const today = () => getQuizDayForTimeZone(new Date(), 'America/Chicago');

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Quiz Tap backend is running. Use /api/health, /api/daily-quiz, or /api/submit-answer.'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Node backend is running' });
});

app.get('/api/daily-quiz', (_req, res) => {
  const day = today();
  const questions = buildDailyQuestionSet(day).map((question) => ({
    id: question.id,
    difficulty: question.difficulty,
    prompt: question.prompt,
    options: question.options
  }));

  res.json({ day, questions });
});

app.post('/api/submit-answer', (req, res) => {
  const { questionId, answer, attempts, elapsedSeconds = 0 } = req.body ?? {};
  const day = today();
  const question = buildDailyQuestionSet(day).find((entry) => entry.id === questionId);

  if (!question) {
    return res.status(404).json({ error: 'Question not found for today' });
  }

  const isCorrect = question.correctAnswer === answer;

  if (!isCorrect) {
    return res.json({ correct: false, message: 'Incorrect answer. Try again.' });
  }

  return res.json({
    correct: true,
    score: calculateQuestionScore(attempts, elapsedSeconds),
    correctAnswer: question.correctAnswer
  });
});

app.post('/api/leaderboard', (req, res) => {
  const { category = 'allTime', name, score, submittedAt } = req.body ?? {};

  if (typeof score !== 'number' || Number.isNaN(score)) {
    return res.status(400).json({ error: 'A numeric score is required.' });
  }

  const result = addScoreEntry(category, {
    name,
    score,
    submittedAt: submittedAt || new Date().toISOString()
  }, 10);

  return res.json({ success: result.inserted, leaderboard: result.entries });
});

app.get('/api/leaderboard/:category', (req, res) => {
  const category = req.params.category;
  const allowedCategories = ['daily', 'weekly', 'allTime'];

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({ error: 'Invalid leaderboard category.' });
  }

  return res.json({ category, entries: getLeaderboard(category) });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
