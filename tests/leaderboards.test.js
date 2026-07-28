import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { addScoreEntry, getLeaderboard, insertLeaderboardEntry, normalizeName } from '../src/lib/leaderboards.js';

function resetLeaderboardStore() {
  const dataFile = path.join(process.cwd(), 'data', 'leaderboards.json');
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify({ daily: [], weekly: [], allTime: [] }, null, 2));
}

function toTimeZoneDateKey(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function createSubmittedAtForTimeZone(offsetDays, timeZone) {
  const today = new Date();
  const todayKey = toTimeZoneDateKey(today, timeZone);
  const [year, month, day] = todayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

test('normalizeName trims and defaults to Anonymous', () => {
  assert.equal(normalizeName('  Sean  '), 'Sean');
  assert.equal(normalizeName('   '), 'Anonymous');
});

test('insertLeaderboardEntry accepts the first score and keeps it in the list', () => {
  const inserted = insertLeaderboardEntry([], {
    name: 'Nova',
    score: 500,
    submittedAt: '2026-07-27T09:00:00.000Z'
  }, 3);

  assert.equal(inserted.inserted, true);
  assert.equal(inserted.entries[0].name, 'Nova (7/27)');
});

test('insertLeaderboardEntry keeps the top entries and rejects lower scores', () => {
  const entries = [
    { name: 'Ada', score: 900, submittedAt: '2026-07-27T10:00:00.000Z' },
    { name: 'Grace', score: 950, submittedAt: '2026-07-27T11:00:00.000Z' },
    { name: 'Linus', score: 850, submittedAt: '2026-07-27T12:00:00.000Z' }
  ];

  const inserted = insertLeaderboardEntry(entries, {
    name: 'Mina',
    score: 980,
    submittedAt: '2026-07-27T13:00:00.000Z'
  }, 3);

  assert.equal(inserted.inserted, true);
  assert.equal(inserted.entries[0].name, 'Mina (7/27)');

  const rejected = insertLeaderboardEntry(entries, {
    name: 'Kofi',
    score: 800,
    submittedAt: '2026-07-27T14:00:00.000Z'
  }, 3);

  assert.equal(rejected.inserted, false);
  assert.equal(rejected.entries.length, 3);
});

test('addScoreEntry persists entries in the requested leaderboard category', () => {
  resetLeaderboardStore();

  const result = addScoreEntry('daily', {
    name: 'Mina',
    score: 820,
    submittedAt: '2026-07-27T13:00:00.000Z'
  }, 3);

  assert.equal(result.inserted, true);
  assert.equal(getLeaderboard('daily')[0].name, 'Mina (7/27)');
});

test('addScoreEntry formats names differently by leaderboard category', () => {
  resetLeaderboardStore();

  const dailyResult = addScoreEntry('daily', {
    name: 'Test User',
    score: 820,
    submittedAt: '2026-07-27T13:00:00.000Z'
  }, 3);

  const allTimeResult = addScoreEntry('allTime', {
    name: 'Test User',
    score: 900,
    submittedAt: '2026-07-27T13:00:00.000Z'
  }, 3);

  assert.equal(dailyResult.inserted, true);
  assert.equal(allTimeResult.inserted, true);
  assert.equal(getLeaderboard('daily')[0].name, 'Test User (7/27)');
  assert.equal(getLeaderboard('allTime')[0].name, 'Test User (7/27/26)');
});

test('addScoreEntry skips blank names so they never appear on the leaderboard', () => {
  resetLeaderboardStore();

  const result = addScoreEntry('daily', {
    name: '   ',
    score: 820,
    submittedAt: '2026-07-27T13:00:00.000Z'
  }, 3);

  assert.equal(result.inserted, false);
  assert.equal(getLeaderboard('daily').length, 0);
});

test('weekly leaderboard resets on Monday and keeps only entries from the current week', () => {
  resetLeaderboardStore();

  const mondayThisWeek = createSubmittedAtForTimeZone(0, 'America/Chicago');
  const nextMonday = createSubmittedAtForTimeZone(7, 'America/Chicago');

  const firstWeekResult = addScoreEntry('weekly', {
    name: 'Mina',
    score: 840,
    submittedAt: `${mondayThisWeek}T13:00:00.000Z`
  }, 3, new Date(`${mondayThisWeek}T13:00:00.000Z`));

  assert.equal(firstWeekResult.inserted, true);
  assert.equal(getLeaderboard('weekly', new Date(`${mondayThisWeek}T13:00:00.000Z`))[0].name, 'Mina (7/27)');

  const nextWeekResult = addScoreEntry('weekly', {
    name: 'Kai',
    score: 900,
    submittedAt: `${nextMonday}T13:00:00.000Z`
  }, 3, new Date(`${nextMonday}T13:00:00.000Z`));

  assert.equal(nextWeekResult.inserted, true);
  assert.equal(getLeaderboard('weekly', new Date(`${nextMonday}T13:00:00.000Z`))[0].name, 'Kai (8/3)');
  assert.equal(getLeaderboard('weekly', new Date(`${nextMonday}T13:00:00.000Z`)).length, 1);
});

test('daily leaderboard keeps only entries from the current Chicago day', () => {
  resetLeaderboardStore();

  const todayKey = createSubmittedAtForTimeZone(0, 'America/Chicago');
  const tomorrowKey = createSubmittedAtForTimeZone(1, 'America/Chicago');

  const firstDayResult = addScoreEntry('daily', {
    name: 'Mina',
    score: 840,
    submittedAt: `${todayKey}T13:00:00.000Z`
  }, 3, new Date(`${todayKey}T13:00:00.000Z`));

  assert.equal(firstDayResult.inserted, true);
  assert.equal(getLeaderboard('daily', new Date(`${todayKey}T13:00:00.000Z`))[0].name, 'Mina (7/27)');

  const nextDayResult = addScoreEntry('daily', {
    name: 'Kai',
    score: 900,
    submittedAt: `${tomorrowKey}T13:00:00.000Z`
  }, 3, new Date(`${tomorrowKey}T13:00:00.000Z`));

  assert.equal(nextDayResult.inserted, true);
  assert.equal(getLeaderboard('daily', new Date(`${tomorrowKey}T13:00:00.000Z`))[0].name, 'Kai (7/28)');
  assert.equal(getLeaderboard('daily', new Date(`${tomorrowKey}T13:00:00.000Z`)).length, 1);
});
