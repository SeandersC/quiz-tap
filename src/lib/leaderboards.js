import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, '..', '..', 'data', 'leaderboards.json');

function ensureStore() {
  const dir = path.dirname(dataFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ daily: [], weekly: [], allTime: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

export function normalizeName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed ? trimmed : 'Anonymous';
}

function formatLeaderboardDisplayName(name, submittedAt, category) {
  const normalizedName = normalizeName(name);
  if (!normalizedName || normalizedName === 'Anonymous') {
    return normalizedName;
  }

  const baseName = normalizedName.replace(/\s\([^)]+\)$/, '');
  const parsedDate = submittedAt ? new Date(submittedAt) : new Date();
  if (Number.isNaN(parsedDate.getTime())) {
    return baseName;
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: category === 'allTime' ? '2-digit' : undefined
  }).format(parsedDate);

  if (category === 'allTime') {
    return `${baseName} (${formattedDate})`;
  }

  return `${baseName} (${formattedDate})`;
}

function getDatePartsInTimeZone(date, timeZone = 'America/Chicago') {
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.formatToParts(parsedDate).reduce((accumulator, part) => {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      accumulator[part.type] = Number(part.value);
    }
    return accumulator;
  }, {});
}

function getWeekStart(date, timeZone = 'America/Chicago') {
  const dateParts = getDatePartsInTimeZone(date, timeZone);
  if (!dateParts) {
    return null;
  }

  const { year, month, day } = dateParts;
  const dateAtMidnight = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = dateAtMidnight.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  dateAtMidnight.setUTCDate(dateAtMidnight.getUTCDate() + mondayOffset);
  return dateAtMidnight;
}

function getWeekKey(date, timeZone = 'America/Chicago') {
  const weekStart = getWeekStart(date, timeZone);
  if (!weekStart) {
    return null;
  }

  return weekStart.toISOString().slice(0, 10);
}

function getDateKey(date, timeZone = 'America/Chicago') {
  const dateParts = getDatePartsInTimeZone(date, timeZone);
  if (!dateParts) {
    return null;
  }

  return `${String(dateParts.year)}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')}`;
}

function getEntriesForCategory(entries, category, referenceDate, timeZone = 'America/Chicago') {
  if (category === 'weekly') {
    const weekKey = getWeekKey(referenceDate, timeZone);
    if (!weekKey) {
      return [];
    }

    return entries.filter((entry) => {
      const submittedAt = entry?.submittedAt ? new Date(entry.submittedAt) : null;
      if (!submittedAt || Number.isNaN(submittedAt.getTime())) {
        return false;
      }

      const entryWeekKey = getWeekKey(submittedAt, timeZone);
      return entryWeekKey === weekKey;
    });
  }

  if (category === 'daily') {
    const dayKey = getDateKey(referenceDate, timeZone);
    if (!dayKey) {
      return [];
    }

    return entries.filter((entry) => {
      const submittedAt = entry?.submittedAt ? new Date(entry.submittedAt) : null;
      if (!submittedAt || Number.isNaN(submittedAt.getTime())) {
        return false;
      }

      const entryDayKey = getDateKey(submittedAt, timeZone);
      return entryDayKey === dayKey;
    });
  }

  return entries;
}

export function insertLeaderboardEntry(entries, entry, limit = 10, category = 'daily') {
  const normalizedName = normalizeName(entry.name);
  if (!normalizedName || normalizedName === 'Anonymous') {
    return {
      inserted: false,
      entries: [...entries]
    };
  }

  const submittedAt = entry.submittedAt || new Date().toISOString();
  const normalizedEntry = {
    ...entry,
    name: formatLeaderboardDisplayName(normalizedName, submittedAt, category),
    score: Number(entry.score) || 0,
    submittedAt
  };

  const nextEntries = [...entries, normalizedEntry]
    .sort((a, b) => b.score - a.score || a.submittedAt.localeCompare(b.submittedAt));
  const trimmed = nextEntries.slice(0, limit);

  const isFirstEntry = entries.length === 0;
  const hasRoom = entries.length < limit;
  const isTopScore = isFirstEntry || hasRoom || normalizedEntry.score > (trimmed[trimmed.length - 1]?.score ?? -Infinity);

  return {
    inserted: isTopScore,
    entries: trimmed
  };
}

export function addScoreEntry(category, entry, limit = 10, referenceDate = new Date()) {
  const store = readStore();
  const currentEntries = Array.isArray(store[category]) ? store[category] : [];
  const normalizedName = normalizeName(entry.name);
  const resolvedReferenceDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const resolvedEntryDate = entry.submittedAt ? new Date(entry.submittedAt) : resolvedReferenceDate;

  const filteredEntries = getEntriesForCategory(currentEntries, category, resolvedEntryDate, 'America/Chicago');

  const result = insertLeaderboardEntry(filteredEntries, entry, limit, category);
  const shouldPersist = result.inserted;

  if (!shouldPersist) {
    return result;
  }

  const nextStore = {
    ...store,
    [category]: category === 'weekly' ? result.entries : result.entries
  };

  writeStore(nextStore);
  return result;
}

export function getLeaderboard(category, referenceDate = new Date()) {
  const store = readStore();
  const entries = Array.isArray(store[category]) ? store[category] : [];
  const formattedEntries = entries.map((entry) => ({
    ...entry,
    name: formatLeaderboardDisplayName(entry.name, entry.submittedAt, category)
  }));

  if (category !== 'weekly') {
    return formattedEntries;
  }

  const resolvedReferenceDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  return getEntriesForCategory(formattedEntries, category, resolvedReferenceDate, 'America/Chicago');
}
