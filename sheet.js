// Загрузка CSV из Google Таблицы (gviz) + офлайн-кэш в localStorage.
// В таблицу ничего не пишем — только читаем.

import {
  SHEET_NAMES,
  READINESS_RANGE,
  JOURNAL_RANGE,
  buildGvizUrl,
  CACHE_KEYS,
  REFRESH_INTERVAL_MS,
} from './config.js';

export class LoadError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'LoadError';
    this.kind = kind; // 'access' | 'network'
  }
}

async function fetchCsv(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new LoadError('Нет подключения.', 'network');
  }

  if (!response.ok) {
    throw new LoadError(
      'Нет доступа к таблице. Проверьте, что доступ открыт по ссылке.',
      'access'
    );
  }

  const text = await response.text();
  const trimmed = text.trim();
  // Закрытая/недоступная таблица иногда отдаёт HTML-страницу вместо CSV.
  if (trimmed.startsWith('<')) {
    throw new LoadError(
      'Нет доступа к таблице. Проверьте, что доступ открыт по ссылке.',
      'access'
    );
  }

  return text;
}

function saveCache(csvKey, timeKey, csvText) {
  try {
    localStorage.setItem(csvKey, csvText);
    localStorage.setItem(timeKey, String(Date.now()));
  } catch (e) {
    // localStorage недоступен (приватный режим, переполнение) — работаем без кэша
  }
}

function readCache(csvKey, timeKey) {
  try {
    const csv = localStorage.getItem(csvKey);
    const time = localStorage.getItem(timeKey);
    if (csv && time) return { csv, time: Number(time) };
  } catch (e) {
    // игнорируем — просто нет кэша
  }
  return null;
}

async function loadSheet(sheetName, range, csvKey, timeKey) {
  const url = buildGvizUrl(sheetName, range);
  try {
    const csv = await fetchCsv(url);
    saveCache(csvKey, timeKey, csv);
    return { csv, fromCache: false, time: Date.now() };
  } catch (e) {
    const cached = readCache(csvKey, timeKey);
    if (cached) {
      return { csv: cached.csv, fromCache: true, time: cached.time, error: e };
    }
    throw e;
  }
}

export function loadReadinessCsv() {
  return loadSheet(
    SHEET_NAMES.readiness,
    READINESS_RANGE,
    CACHE_KEYS.readinessCsv,
    CACHE_KEYS.readinessTime
  );
}

export function loadJournalCsv() {
  return loadSheet(SHEET_NAMES.journal, JOURNAL_RANGE, CACHE_KEYS.journalCsv, CACHE_KEYS.journalTime);
}

export function formatOfflineTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function setupAutoRefresh(callback) {
  const interval = setInterval(callback, REFRESH_INTERVAL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') callback();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function saveFilters(filters) {
  try {
    localStorage.setItem(CACHE_KEYS.filters, JSON.stringify(filters));
  } catch (e) {
    // игнорируем — фильтры просто не запомнятся
  }
}

export function loadFilters() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.filters);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
