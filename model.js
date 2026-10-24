// Логика расчётов: CSV, числа, готовность, птичники, группы.
// Без DOM — можно импортировать и проверять из Node (см. tests/check.mjs).

import {
  READINESS_COLUMNS,
  READINESS_REQUIRED_KEYS,
  JOURNAL_COLUMNS,
  SOSTAV_COLUMNS,
  SOSTAV_REQUIRED_KEYS,
  STATUS,
  STAGE_KEYS,
} from './config.js';

export class HeaderError extends Error {
  constructor(missingKeys, missingLabels, foundHeaders) {
    super(
      `Не найдены обязательные столбцы: ${missingLabels.join(', ')}. ` +
        `Найденные заголовки: ${foundHeaders.join(', ')}`
    );
    this.name = 'HeaderError';
    this.missingKeys = missingKeys;
    this.missingLabels = missingLabels;
    this.foundHeaders = foundHeaders;
  }
}

export class DataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataError';
  }
}

// ---------- CSV (RFC 4180) ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// ---------- Числа ----------

function isThousandsGroups(parts) {
  if (parts.length < 2) return false;
  for (let i = 1; i < parts.length; i += 1) {
    if (parts[i].length !== 3) return false;
  }
  return true;
}

export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === '') return null;

  let isPercent = false;
  if (s.endsWith('%')) {
    isPercent = true;
    s = s.slice(0, -1).trim();
  }

  // убрать обычные и неразрывные пробелы (разделители тысяч в ru-локали)
  s = s.replace(/[\s ]/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized;

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // запятая правее точки — запятая десятичная, точки — тысячи
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // точка правее запятой — точка десятичная, запятые — тысячи
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    normalized = isThousandsGroups(parts) ? parts.join('') : s.replace(',', '.');
  } else {
    normalized = s;
  }

  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return null;
  return isPercent ? num / 100 : num;
}

// ---------- Заголовки ----------

export function normalizeHeader(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/gi, '');
}

export function mapHeaders(headerRow, columnsConfig) {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const map = {};
  for (const [key, variants] of Object.entries(columnsConfig)) {
    let idx = -1;
    for (const variant of variants) {
      idx = normalizedHeaders.indexOf(normalizeHeader(variant));
      if (idx !== -1) break;
    }
    if (idx !== -1) map[key] = idx;
  }
  return { map, normalizedHeaders };
}

export function findHouseColumns(headerRow) {
  const houses = [];
  headerRow.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    const m = norm.match(/^пт(\d+)$/);
    if (m) houses.push({ index: idx, number: parseInt(m[1], 10), header: h });
  });
  houses.sort((a, b) => a.number - b.number);
  return houses;
}

// ---------- Группа марки ----------

export function extractGroup(mark) {
  return String(mark ?? '').replace(/-\d+$/, '');
}

// ---------- Статус марки ----------

export function computeStatus({ ordered, made, painted, ready, shipped }) {
  if (ordered > 0 && shipped >= ordered) return STATUS.SHIPPED;
  if (ordered > 0 && ready >= ordered) return STATUS.DONE;
  if (ready > 0) return STATUS.PARTIAL;
  if (painted > 0) return STATUS.PAINTING;
  if (made > 0) return STATUS.MAKING;
  return STATUS.NOT_STARTED;
}

// ---------- Лист «Готовность» ----------

export function parseReadinessData(csvText, columnsConfig = READINESS_COLUMNS) {
  const rows = parseCsv(csvText).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) {
    throw new DataError('Лист «Готовность» пуст или не загрузился.');
  }

  const headerRow = rows[0];
  const { map } = mapHeaders(headerRow, columnsConfig);

  const missingKeys = READINESS_REQUIRED_KEYS.filter((k) => !(k in map));
  if (missingKeys.length > 0) {
    const labelByKey = {};
    for (const [key, variants] of Object.entries(columnsConfig)) labelByKey[key] = variants[0];
    throw new HeaderError(
      missingKeys,
      missingKeys.map((k) => labelByKey[k] || k),
      headerRow.filter((h) => h && h.trim() !== '')
    );
  }

  const houseColumns = findHouseColumns(headerRow);
  const dataRows = rows.slice(1);
  const marks = [];

  for (const r of dataRows) {
    const markVal = (r[map.mark] || '').trim();
    if (!markVal) continue;

    const ordered = parseNumber(r[map.ordered]) ?? 0;
    const unitWeight = map.unitWeight !== undefined ? parseNumber(r[map.unitWeight]) : null;
    let orderWeight = map.orderWeight !== undefined ? parseNumber(r[map.orderWeight]) : null;
    if (orderWeight === null) orderWeight = unitWeight !== null ? ordered * unitWeight : 0;

    const made = map.made !== undefined ? parseNumber(r[map.made]) ?? 0 : 0;
    const painted = map.painted !== undefined ? parseNumber(r[map.painted]) ?? 0 : 0;
    const ready = parseNumber(r[map.ready]) ?? 0;
    const shipped = map.shipped !== undefined ? parseNumber(r[map.shipped]) ?? 0 : 0;

    let readinessPct = map.readiness !== undefined ? parseNumber(r[map.readiness]) : null;
    if (readinessPct === null) readinessPct = ordered > 0 ? ready / ordered : 0;

    let readyWeight = map.readyWeight !== undefined ? parseNumber(r[map.readyWeight]) : null;
    if (readyWeight === null) readyWeight = unitWeight !== null ? ready * unitWeight : 0;

    let status = map.status !== undefined ? (r[map.status] || '').trim() : '';
    if (!status) status = computeStatus({ ordered, made, painted, ready, shipped });

    const check = map.check !== undefined ? (r[map.check] || '').trim() : '';
    const note = map.note !== undefined ? (r[map.note] || '').trim() : '';

    let group = map.group !== undefined ? (r[map.group] || '').trim() : '';
    if (!group) group = extractGroup(markVal);

    const perHouse = map.perHouse !== undefined ? parseNumber(r[map.perHouse]) ?? 0 : 0;
    const fullSets = map.fullSets !== undefined ? parseNumber(r[map.fullSets]) ?? 0 : 0;
    const name = map.name !== undefined ? (r[map.name] || '').trim() : '';

    const houses = houseColumns.map((hc) => parseNumber(r[hc.index]) ?? 0);

    marks.push({
      mark: markVal,
      name,
      ordered,
      unitWeight,
      orderWeight,
      made,
      painted,
      ready,
      shipped,
      readinessPct,
      readyWeight,
      status,
      check,
      note,
      group,
      perHouse,
      fullSets,
      houses,
    });
  }

  return { marks, houseColumns, headerRow };
}

// ---------- Сводная статистика ----------

export function computeOverallStats(marks) {
  let orderedQty = 0;
  let orderedWeight = 0;
  const stageQty = { made: 0, painted: 0, ready: 0, shipped: 0 };
  const stageWeight = { made: 0, painted: 0, ready: 0, shipped: 0 };
  const statusCounts = {};
  let errorCount = 0;

  for (const m of marks) {
    orderedQty += m.ordered;
    orderedWeight += m.orderWeight;
    const uw = m.unitWeight ?? 0;

    stageQty.made += m.made;
    stageQty.painted += m.painted;
    stageQty.ready += m.ready;
    stageQty.shipped += m.shipped;

    stageWeight.made += m.made * uw;
    stageWeight.painted += m.painted * uw;
    stageWeight.ready += m.ready * uw;
    stageWeight.shipped += m.shipped * uw;

    statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
    if (m.check) errorCount += 1;
  }

  const stagePct = {};
  for (const key of STAGE_KEYS) {
    stagePct[key] = orderedWeight > 0 ? stageWeight[key] / orderedWeight : 0;
  }

  return {
    marksCount: marks.length,
    orderedQty,
    orderedWeight,
    stageQty,
    stageWeight,
    stagePct,
    statusCounts,
    errorCount,
  };
}

// ---------- Естественная сортировка марок (К-2 < К-10) ----------

export function naturalCompare(a, b) {
  const split = (s) => {
    const parts = [];
    const regex = /(\d+)/g;
    let last = 0;
    let match;
    while ((match = regex.exec(s))) {
      if (match.index > last) parts.push(s.slice(last, match.index));
      parts.push(parseInt(match[0], 10));
      last = match.index + match[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };

  const pa = split(String(a));
  const pb = split(String(b));
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i += 1) {
    const va = pa[i];
    const vb = pb[i];
    if (va === undefined) return -1;
    if (vb === undefined) return 1;
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb;
    } else {
      const sa = String(va);
      const sb = String(vb);
      if (sa !== sb) return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

// ---------- Группы ----------

export function computeGroups(marks) {
  const groups = new Map();

  for (const m of marks) {
    const code = m.group || extractGroup(m.mark);
    if (!groups.has(code)) groups.set(code, { marks: [], namesCount: new Map() });
    const entry = groups.get(code);
    entry.marks.push(m);
    const firstWord = (m.name || '').trim().split(/\s+/)[0] || '';
    if (firstWord) entry.namesCount.set(firstWord, (entry.namesCount.get(firstWord) || 0) + 1);
  }

  const result = [];
  for (const [code, entry] of groups) {
    let maxCount = -1;
    for (const count of entry.namesCount.values()) maxCount = Math.max(maxCount, count);
    const topWords = [...entry.namesCount.entries()]
      .filter(([, count]) => count === maxCount)
      .map(([word]) => word)
      .sort((a, b) => a.localeCompare(b, 'ru'));
    const stats = computeOverallStats(entry.marks);
    result.push({ code, name: topWords.join(' / '), count: entry.marks.length, ...stats });
  }

  result.sort((a, b) => naturalCompare(a.code, b.code));
  return result;
}

// ---------- Поиск ----------

export function searchNormalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s-]/g, '');
}

export function matchSearch(query, mark, name) {
  const q = searchNormalize(query);
  if (!q) return true;
  return searchNormalize(mark).includes(q) || searchNormalize(name).includes(q);
}

// ---------- Птичники ----------

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function alloc(qty, per, k) {
  if (!per) return 0;
  return clamp(qty - k * per, 0, per);
}

export function computeHouses(marks, houseColumns) {
  const houses = [];

  for (const hc of houseColumns) {
    const kZero = hc.number - 1;
    let setWeight = 0;
    const stageWeight = { made: 0, painted: 0, ready: 0, shipped: 0 };
    let missing = 0;
    let totalWithPer = 0;
    const markRows = [];

    for (const m of marks) {
      if (!m.perHouse || m.perHouse <= 0) continue;
      totalWithPer += 1;
      const uw = m.unitWeight ?? 0;
      setWeight += m.perHouse * uw;

      const madeA = alloc(m.made, m.perHouse, kZero);
      const paintedA = alloc(m.painted, m.perHouse, kZero);
      const readyA = alloc(m.ready, m.perHouse, kZero);
      const shippedA = alloc(m.shipped, m.perHouse, kZero);

      stageWeight.made += madeA * uw;
      stageWeight.painted += paintedA * uw;
      stageWeight.ready += readyA * uw;
      stageWeight.shipped += shippedA * uw;

      if (readyA < m.perHouse) missing += 1;

      let state = 'none';
      if (readyA >= m.perHouse) state = 'full';
      else if (readyA > 0) state = 'partial';

      markRows.push({
        mark: m.mark,
        name: m.name,
        need: m.perHouse,
        have: readyA,
        state,
      });
    }

    const stagePct = {};
    for (const key of STAGE_KEYS) {
      stagePct[key] = setWeight > 0 ? stageWeight[key] / setWeight : 0;
    }

    let status;
    if (totalWithPer > 0 && missing === 0) status = 'Укомплектован';
    else if (stagePct.made === 0 && stagePct.ready === 0) status = 'Не начат';
    else status = 'Собирается';

    houses.push({
      number: hc.number,
      header: hc.header,
      setWeight,
      stageWeight,
      stagePct,
      missing,
      totalWithPer,
      status,
      markRows,
    });
  }

  return houses;
}

// ---------- Лист «Журнал» ----------

export function parseJournalData(csvText, columnsConfig = JOURNAL_COLUMNS) {
  const rows = parseCsv(csvText).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return { entries: [], headerRow: [] };

  const headerRow = rows[0];
  const { map } = mapHeaders(headerRow, columnsConfig);
  const dataRows = rows.slice(1);
  const entries = [];
  let lastDate = '';

  for (const r of dataRows) {
    const markVal = map.mark !== undefined ? (r[map.mark] || '').trim() : '';
    if (!markVal) continue;

    const dateRaw = map.date !== undefined ? (r[map.date] || '').trim() : '';
    if (dateRaw) lastDate = dateRaw;

    const qty = map.qtyDay !== undefined ? parseNumber(r[map.qtyDay]) ?? 0 : 0;

    entries.push({
      date: lastDate,
      mark: markVal,
      stage: map.stage !== undefined ? (r[map.stage] || '').trim() : '',
      qty,
      worker: map.worker !== undefined ? (r[map.worker] || '').trim() : '',
      note: map.note !== undefined ? (r[map.note] || '').trim() : '',
      name: map.name !== undefined ? (r[map.name] || '').trim() : '',
    });
  }

  return { entries, headerRow };
}

export function parseRuDate(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function getMarkHistory(entries, mark) {
  const filtered = entries
    .map((e, i) => ({ ...e, _i: i }))
    .filter((e) => e.mark === mark);

  filtered.sort((a, b) => {
    const da = parseRuDate(a.date);
    const db = parseRuDate(b.date);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    if (ta !== tb) return tb - ta;
    return b._i - a._i;
  });

  return filtered;
}

// ---------- Состав марки (отдельная таблица-спецификация) ----------

export function parseSostavData(csvText, columnsConfig = SOSTAV_COLUMNS) {
  const rows = parseCsv(csvText).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return { byMark: new Map(), headerRow: [] };

  const headerRow = rows[0];
  const { map } = mapHeaders(headerRow, columnsConfig);

  const missingKeys = SOSTAV_REQUIRED_KEYS.filter((k) => !(k in map));
  if (missingKeys.length > 0) {
    const labelByKey = {};
    for (const [key, variants] of Object.entries(columnsConfig)) labelByKey[key] = variants[0];
    throw new HeaderError(
      missingKeys,
      missingKeys.map((k) => labelByKey[k] || k),
      headerRow.filter((h) => h && h.trim() !== '')
    );
  }

  const dataRows = rows.slice(1);
  const byMark = new Map();

  for (const r of dataRows) {
    const markVal = (r[map.mark] || '').trim();
    if (!markVal) continue;

    if (!byMark.has(markVal)) {
      byMark.set(markVal, {
        mark: markVal,
        name: '',
        markCount: 0,
        markMass: 0,
        allMarksMass: 0,
        note: '',
        parts: [],
      });
    }
    const entry = byMark.get(markVal);

    const name = map.name !== undefined ? (r[map.name] || '').trim() : '';
    if (name) entry.name = name;

    const rowType = map.rowType !== undefined ? (r[map.rowType] || '').trim() : '';

    if (rowType === 'Сборка') {
      entry.markCount = map.markCount !== undefined ? parseNumber(r[map.markCount]) ?? 0 : 0;
      entry.markMass = map.markMass !== undefined ? parseNumber(r[map.markMass]) ?? 0 : 0;
      entry.allMarksMass = map.allMarksMass !== undefined ? parseNumber(r[map.allMarksMass]) ?? 0 : 0;
      const assemblyNote = map.note !== undefined ? (r[map.note] || '').trim() : '';
      if (assemblyNote) entry.note = assemblyNote;
    } else if (rowType === 'Деталь') {
      entry.parts.push({
        partNumber: map.partNumber !== undefined ? (r[map.partNumber] || '').trim() : '',
        qty: map.partQty !== undefined ? parseNumber(r[map.partQty]) ?? 0 : 0,
        profile: map.profile !== undefined ? (r[map.profile] || '').trim() : '',
        width: map.width !== undefined ? parseNumber(r[map.width]) : null,
        length: map.length !== undefined ? parseNumber(r[map.length]) : null,
        unitMass: map.unitPartMass !== undefined ? parseNumber(r[map.unitPartMass]) : null,
        totalMass: map.totalPartsMass !== undefined ? parseNumber(r[map.totalPartsMass]) : null,
        steelGrade: map.steelGrade !== undefined ? (r[map.steelGrade] || '').trim() : '',
        note: map.note !== undefined ? (r[map.note] || '').trim() : '',
      });
    }
  }

  return { byMark, headerRow };
}

export function getMarkComposition(byMark, mark) {
  return byMark.get(mark) || null;
}

// Обратный индекс: «№ детали» → профиль/размеры + список марок, где эта
// деталь встречается (один и тот же номер детали часто переиспользуется
// в нескольких марках — тот же физический элемент).
export function computePartsIndex(byMark) {
  const byPart = new Map();

  for (const entry of byMark.values()) {
    for (const p of entry.parts) {
      if (!p.partNumber) continue;
      if (!byPart.has(p.partNumber)) {
        byPart.set(p.partNumber, {
          partNumber: p.partNumber,
          profile: p.profile,
          width: p.width,
          length: p.length,
          unitMass: p.unitMass,
          steelGrade: p.steelGrade,
          usages: [],
        });
      }
      byPart.get(p.partNumber).usages.push({ mark: entry.mark, markName: entry.name, qty: p.qty });
    }
  }

  return byPart;
}
