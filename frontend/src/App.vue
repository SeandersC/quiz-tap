<script setup>
import { computed, onMounted, ref } from 'vue';

const apiBase = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:3001' : '');
const QUESTION_TIME_LIMIT = 60;
const dailyQuestions = ref([]);
const currentIndex = ref(0);
const selectedAnswer = ref('');
const feedback = ref('Loading today’s trivia...');
const copyStatus = ref('');
const totalScore = ref(0);
const completed = ref(false);
const challengeStarted = ref(false);
const timerSeconds = ref(QUESTION_TIME_LIMIT);
const showAnswerResult = ref(false);
const questionSetVersion = 3;
const timeZone = 'America/Chicago';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date()).replace(/\//g, '-');
const stateKey = 'quiztap-trivia-state';
let timerHandle = null;
let advanceDelayHandle = null;

const currentQuestion = computed(() => dailyQuestions.value[currentIndex.value] ?? null);
const progressPercent = computed(() => {
  const answered = dailyQuestions.value.filter((question) => question.solved).length;
  return Math.round((answered / dailyQuestions.value.length) * 100 || 0);
});
const timerLabel = computed(() => `${Math.max(timerSeconds.value, 0)}s`);
const summaryText = computed(() => {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric'
  }).format(new Date());

  const lines = dailyQuestions.value.map((question, index) => {
    const scoreLine = question.score !== undefined && question.score !== null
      ? String(question.score)
      : 'X';
    return `${index + 1}. ${scoreLine}`;
  });

  return [`https://quiz-tap.com — ${formattedDate}`, ...lines, `Final score: ${totalScore.value}`].join('\n');
});

const displaySummary = computed(() => {
  return dailyQuestions.value.map((question, index) => {
    const score = question.score !== undefined && question.score !== null
      ? String(question.score)
      : 'X';
    return `Question ${index + 1}: ${score}`;
  });
});

function isWrongAnswer(option) {
  return Boolean(
    currentQuestion.value &&
      Array.isArray(currentQuestion.value.wrongAnswers) &&
      currentQuestion.value.wrongAnswers.includes(option)
  );
}

function clearQuestionTimer() {
  if (timerHandle) {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }
}

function clearAdvanceDelay() {
  if (advanceDelayHandle) {
    window.clearTimeout(advanceDelayHandle);
    advanceDelayHandle = null;
  }
}

function handleQuestionTimeout() {
  clearQuestionTimer();

  if (!currentQuestion.value) {
    return;
  }

  currentQuestion.value.attempts = (currentQuestion.value.attempts ?? 0) + 1;
  currentQuestion.value.score = 0;
  currentQuestion.value.solved = true;
  selectedAnswer.value = '';
  showAnswerResult.value = false;

  if (currentIndex.value < dailyQuestions.value.length - 1) {
    const nextIndex = currentIndex.value + 1;
    currentIndex.value = nextIndex;
    feedback.value = `Time's up — 0 points recorded. Question ${nextIndex + 1} of ${dailyQuestions.value.length}.`;
    resetQuestionTimer();
  } else {
    completed.value = true;
    challengeStarted.value = false;
    feedback.value = `Time's up — final score: ${totalScore.value} / 1000.`;
  }

  persistState();
}

function resetQuestionTimer() {
  clearQuestionTimer();
  timerSeconds.value = QUESTION_TIME_LIMIT;
  timerHandle = window.setInterval(() => {
    timerSeconds.value = Math.max(0, timerSeconds.value - 1);

    if (timerSeconds.value === 0) {
      handleQuestionTimeout();
    }
  }, 1000);
}

function loadCachedState() {
  const cookieValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${stateKey}=`))
    ?.split('=')[1];

  const storedValue = cookieValue || localStorage.getItem(stateKey);
  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(storedValue));
  } catch {
    return null;
  }
}

function persistState() {
  const savedState = {
    questionSetVersion,
    date: today,
    currentIndex: currentIndex.value,
    challengeStarted: challengeStarted.value,
    timerSeconds: timerSeconds.value,
    showAnswerResult: showAnswerResult.value,
    completed: completed.value,
    totalScore: totalScore.value,
    questions: dailyQuestions.value.map((question) => ({
      id: question.id,
      attempts: question.attempts,
      solved: question.solved,
      score: question.score,
      wrongAnswers: question.wrongAnswers
    }))
  };

  const serialized = encodeURIComponent(JSON.stringify(savedState));
  document.cookie = `${stateKey}=${serialized}; path=/; max-age=31536000`;
  localStorage.setItem(stateKey, serialized);
}

function restoreState(savedState) {
  if (!savedState || savedState.date !== today) {
    return;
  }

  if (savedState.questionSetVersion !== questionSetVersion) {
    document.cookie = `${stateKey}=; path=/; max-age=0`;
    localStorage.removeItem(stateKey);
    return;
  }

  currentIndex.value = savedState.currentIndex ?? 0;
  challengeStarted.value = savedState.challengeStarted ?? false;
  timerSeconds.value = savedState.timerSeconds ?? QUESTION_TIME_LIMIT;
  showAnswerResult.value = savedState.showAnswerResult ?? false;
  completed.value = savedState.completed ?? false;
  totalScore.value = savedState.totalScore ?? 0;

  if (Array.isArray(savedState.questions)) {
    dailyQuestions.value = dailyQuestions.value.map((question) => {
      const savedQuestion = savedState.questions.find((entry) => entry.id === question.id);
      return {
        ...question,
        attempts: savedQuestion?.attempts ?? 0,
        solved: savedQuestion?.solved ?? false,
        score: savedQuestion?.score ?? 0,
        wrongAnswers: Array.isArray(savedQuestion?.wrongAnswers)
          ? savedQuestion.wrongAnswers
          : []
      };
    });
  }

  if (completed.value) {
    feedback.value = 'You completed today’s trivia challenge. Come back tomorrow for a fresh board.';
  } else if (challengeStarted.value) {
    feedback.value = `Question ${currentIndex.value + 1} of ${dailyQuestions.value.length}. Keep going.`;
    resetQuestionTimer();
  } else {
    feedback.value = 'Press Begin Challenge to start the timed round.';
  }
}

async function fetchDailyQuestions() {
  try {
    const response = await fetch(`${apiBase}/api/daily-quiz`);
    if (!response.ok) {
      throw new Error(`Daily quiz request failed with status ${response.status}`);
    }

    const data = await response.json();
    dailyQuestions.value = data.questions.map((question) => ({
      ...question,
      attempts: 0,
      solved: false,
      score: 0,
      wrongAnswers: []
    }));

    const cachedState = loadCachedState();
    restoreState(cachedState);

    if (!dailyQuestions.value.length) {
      feedback.value = 'No questions were available for today.';
    } else if (!challengeStarted.value && !completed.value) {
      feedback.value = 'Press Begin Challenge to start the timed round.';
    }
  } catch (error) {
    console.error(error);
    feedback.value = 'Could not load today’s questions. Make sure the backend is running on port 3001.';
  }
}

function beginChallenge() {
  if (!dailyQuestions.value.length) {
    feedback.value = 'Questions are still loading. Please try again in a moment.';
    return;
  }

  clearAdvanceDelay();
  showAnswerResult.value = false;
  challengeStarted.value = true;
  completed.value = false;
  currentIndex.value = 0;
  selectedAnswer.value = '';
  feedback.value = `Question 1 of ${dailyQuestions.value.length}. Pick the best answer before the timer expires.`;
  resetQuestionTimer();
  persistState();
}

async function submitAnswer() {
  if (!challengeStarted.value) {
    feedback.value = 'Press Begin Challenge before answering the first question.';
    return;
  }

  if (!currentQuestion.value || !selectedAnswer.value) {
    feedback.value = 'Choose one of the answers before submitting.';
    return;
  }

  const attempts = (currentQuestion.value.attempts ?? 0) + 1;
  const elapsedSeconds = QUESTION_TIME_LIMIT - timerSeconds.value;
  const response = await fetch(`${apiBase}/api/submit-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questionId: currentQuestion.value.id,
      answer: selectedAnswer.value,
      attempts,
      elapsedSeconds
    })
  });

  if (!response.ok) {
    throw new Error(`Submit answer request failed with status ${response.status}`);
  }

  const result = await response.json();
  currentQuestion.value.attempts = attempts;

  if (!result.correct) {
    currentQuestion.value.wrongAnswers = Array.from(
      new Set([...(currentQuestion.value.wrongAnswers ?? []), selectedAnswer.value])
    );
    feedback.value = 'Incorrect — keep guessing until you get it right.';
    selectedAnswer.value = '';
    persistState();
    return;
  }

  const earnedScore = result.score;
  currentQuestion.value.score = earnedScore;
  currentQuestion.value.solved = true;
  totalScore.value += earnedScore;
  showAnswerResult.value = true;
  clearQuestionTimer();
  feedback.value = `Correct! You earned ${earnedScore} points.`;

  advanceDelayHandle = window.setTimeout(() => {
    if (currentIndex.value < dailyQuestions.value.length - 1) {
      currentIndex.value += 1;
      selectedAnswer.value = '';
      showAnswerResult.value = false;
      feedback.value = `Question ${currentIndex.value + 1} of ${dailyQuestions.value.length}. Keep going.`;
      resetQuestionTimer();
    } else {
      completed.value = true;
      challengeStarted.value = false;
      selectedAnswer.value = '';
      showAnswerResult.value = false;
      feedback.value = `Correct! Final score: ${totalScore.value} / 1000.`;
    }

    persistState();
  }, 1000);

  persistState();
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(summaryText.value);
    copyStatus.value = 'Score copied to clipboard';
  } catch {
    copyStatus.value = 'Copy failed in this browser. Please try again.';
  }
}

onMounted(fetchDailyQuestions);
</script>

<template>
  <main>
    <section class="card">
      <p class="eyebrow">Daily trivia challenge</p>
      <h1>Quiz Tap</h1>

      <div class="meta">
        <span>Day: {{ today }}</span>
        <span>Score: {{ totalScore }} / 1000</span>
      </div>

      <div class="progress">
        <div class="progress-bar" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <div v-if="completed" class="status done">
        <div class="trophy-banner">
          <div class="trophy-icon">🏆</div>
          <div>
            <strong>Challenge complete</strong>
            <p>{{ feedback }}</p>
          </div>
        </div>

        <div class="score-highlight">
          <span class="score-label">Final score</span>
          <span class="score-value">{{ totalScore }}</span>
        </div>

        <div class="summary-box">
          <div class="summary-header">
            <strong>Score summary</strong>
            <span>{{ today }}</span>
          </div>
          <div class="score-board">
            <pre>{{ displaySummary.join('\n') }}</pre>
          </div>
          <button class="submit copy-button" @click="copySummary">Copy score</button>
          <p v-if="copyStatus" class="copy-status">{{ copyStatus }}</p>
        </div>
      </div>

      <div v-else-if="!challengeStarted && dailyQuestions.length" class="status intro">
        <p class="intro-copy">You’ll get one trivia question at a time. Each question is worth 200 points, and both answer quality and speed affect your score.</p>
        <button class="submit" @click="beginChallenge">Begin Challenge</button>
      </div>

      <div v-else-if="currentQuestion" class="question-shell">
        <div class="question-header">
          <p class="question-number">Question {{ currentIndex + 1 }} of {{ dailyQuestions.length }}</p>
          <span class="timer-pill">Time left: {{ timerLabel }}</span>
        </div>
        <h2>{{ currentQuestion.prompt }}</h2>

        <div class="options">
          <label
            v-for="option in currentQuestion.options"
            :key="option"
            class="option"
            :class="{
              wrong: isWrongAnswer(option),
              selected: selectedAnswer === option,
              correct: showAnswerResult && option === currentQuestion.correctAnswer
            }"
          >
            <input
              v-model="selectedAnswer"
              type="radio"
              :value="option"
              name="quiz-option"
              :disabled="isWrongAnswer(option) || showAnswerResult"
            />
            <span>{{ option }}</span>
          </label>
        </div>

        <button class="submit" :disabled="!selectedAnswer" @click="submitAnswer">Submit answer</button>
      </div>

      <div v-else class="status">
        <p>{{ feedback }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: Arial, sans-serif;
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
  padding: 24px;
}

.card {
  width: min(700px, 100%);
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  color: #2563eb;
  margin-bottom: 8px;
}

h1 {
  margin: 0 0 12px;
  font-size: 2rem;
}

.subtle {
  color: #475569;
  margin-bottom: 18px;
}

.meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-weight: 700;
}

.progress {
  height: 10px;
  background: #dbeafe;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #8b5cf6);
}

.question-shell,
.status {
  margin-top: 16px;
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.question-number {
  color: #64748b;
  font-weight: 700;
  margin: 0;
}

.timer-pill {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 700;
  border-radius: 999px;
  padding: 6px 10px;
}

.intro {
  text-align: center;
}

.intro-copy {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.55;
}

h2 {
  margin: 0 0 18px;
}

.options {
  display: grid;
  gap: 10px;
}

.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  min-height: 52px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.option:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
  border-color: #93c5fd;
}

.option.selected {
  background: #eff6ff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.option.correct {
  background: #dcfce7;
  border-color: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.16);
}

.option input {
  accent-color: #2563eb;
}

.option.wrong {
  background: #fee2e2;
  border-color: #ef4444;
}

.submit {
  margin-top: 20px;
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  background: #2563eb;
  color: white;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
}

.submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.done {
  background: linear-gradient(180deg, #fef3c7, #eff6ff);
  border-radius: 18px;
  padding: 18px;
}

.trophy-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.trophy-icon {
  font-size: 2.2rem;
}

.trophy-banner strong {
  display: block;
  font-size: 1.1rem;
}

.trophy-banner p {
  margin: 4px 0 0;
}

.score-highlight {
  display: grid;
  gap: 4px;
  justify-items: center;
  padding: 18px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #fde68a, #f59e0b);
  border-radius: 16px;
  color: #111827;
  box-shadow: 0 10px 22px rgba(245, 158, 11, 0.24);
}

.score-label {
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.score-value {
  font-size: 3rem;
  font-weight: 900;
  line-height: 1;
}

.summary-box {
  margin-top: 16px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #eff6ff);
  border: 1px solid #bfdbfe;
  box-shadow: 0 10px 25px rgba(37, 99, 235, 0.08);
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: #1d4ed8;
}

.score-board {
  border-top: 1px solid #bfdbfe;
  padding-top: 12px;
}

.summary-box pre {
  margin: 0 0 12px;
  white-space: pre-wrap;
  font-family: inherit;
  background: #f8fbff;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #dbeafe;
}

.copy-button {
  margin-top: 0;
  width: 100%;
}

.copy-status {
  margin: 12px 0 0;
  text-align: center;
  color: #1d4ed8;
  font-weight: 700;
}
</style>
