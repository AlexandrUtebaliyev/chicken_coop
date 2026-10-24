// Проверка расчётов model.js на снимке таблицы (tests/fixtures/*.csv).
// Запуск: node tests\check.mjs
// Файлы в tests/fixtures не изменять — их готовит человек, а не этот скрипт.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseReadinessData,
  parseJournalData,
  parseSostavData,
  computePartsIndex,
  computeOverallStats,
  computeGroups,
  computeHouses,
  getMarkHistory,
  parseRuDate,
} from '../model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failCount = 0;
let okCount = 0;

function check(label, actual, expected, tolerance = 0) {
  const ok =
    typeof expected === 'number'
      ? Math.abs(actual - expected) <= tolerance
      : actual === expected;
  if (ok) {
    okCount += 1;
    console.log(`  OK   ${label}: ${actual}`);
  } else {
    failCount += 1;
    console.log(`  FAIL ${label}: получено ${actual}, ожидалось ${expected}`);
  }
}

function pct(x) {
  return Math.round(x * 100);
}

function tonnes(kg) {
  return Math.round((kg / 1000) * 10) / 10;
}

console.log('--- Загрузка снимка «Готовность» ---');
const readinessCsv = readFileSync(
  path.join(__dirname, 'fixtures', 'gotovnost_2026-10-18.csv'),
  'utf-8'
);
const { marks, houseColumns } = parseReadinessData(readinessCsv);
console.log(`Марок в снимке: ${marks.length}, столбцов птичников: ${houseColumns.length}`);

console.log('\n--- Общая статистика ---');
const stats = computeOverallStats(marks);
check('Марок', stats.marksCount, 294);
check('Заказано, шт', stats.orderedQty, 18570);
check('Заказано, т', tonnes(stats.orderedWeight), 969.2, 0.1);

check('Изготовлено, шт', stats.stageQty.made, 1968);
check('Изготовлено, т', tonnes(stats.stageWeight.made), 134.9, 0.1);
check('Изготовлено, %', pct(stats.stagePct.made), 14, 1); // эталон 13.9% ≈ 14

check('Покрашено, шт', stats.stageQty.painted, 1802);
check('Покрашено, т', tonnes(stats.stageWeight.painted), 93.3, 0.1);
check('Покрашено, %', pct(stats.stagePct.painted), 10, 1); // эталон 9.6% ≈ 10

check('Готово, шт', stats.stageQty.ready, 3862);
check('Готово, т', tonnes(stats.stageWeight.ready), 95.2, 0.1);
check('Готово, %', pct(stats.stagePct.ready), 10, 1); // эталон 9.8% ≈ 10

check('Отгружено, шт', stats.stageQty.shipped, 0);

console.log('\n--- Статусы ---');
check('Статус «Не начато»', stats.statusCounts['Не начато'] || 0, 158);
check('Статус «Изготовление»', stats.statusCounts['Изготовление'] || 0, 11);
check('Статус «Покраска»', stats.statusCounts['Покраска'] || 0, 0);
check('Статус «Готово частично»', stats.statusCounts['Готово частично'] || 0, 77);
check('Статус «Готово»', stats.statusCounts['Готово'] || 0, 48);
check('Статус «Отгружено»', stats.statusCounts['Отгружено'] || 0, 0);

console.log('\n--- Ошибки ввода ---');
check('С ошибками (Проверка не пусто)', stats.errorCount, 30);

console.log('\n--- Птичники ---');
const houses = computeHouses(marks, houseColumns);
const setWeightT = tonnes(houses[0]?.setWeight ?? 0);
check('Вес комплекта птичника, т', setWeightT, 96.9, 0.1);

const expectedHouses = {
  1: { made: 53, painted: 48, ready: 48, missing: 172 },
  2: { made: 45, painted: 28, ready: 28, missing: 209 },
  3: { made: 17, painted: 11, ready: 11, missing: 233 },
  10: { made: 1, painted: 1, ready: 1, missing: 246 },
};
for (const [num, exp] of Object.entries(expectedHouses)) {
  const h = houses.find((x) => x.number === Number(num));
  if (!h) {
    failCount += 1;
    console.log(`  FAIL Пт ${num}: не найден птичник`);
    continue;
  }
  check(`Пт ${num}: Изготовлено %`, pct(h.stagePct.made), exp.made, 1);
  check(`Пт ${num}: Покрашено %`, pct(h.stagePct.painted), exp.painted, 1);
  check(`Пт ${num}: Готово %`, pct(h.stagePct.ready), exp.ready, 1);
  check(`Пт ${num}: не хватает марок`, h.missing, exp.missing);
}

console.log('\n--- Группа К ---');
const groups = computeGroups(marks);
const groupK = groups.find((g) => g.code === 'К');
if (groupK) {
  check('Группа К: марок', groupK.count, 16);
  check('Группа К: шт заказано', groupK.orderedQty, 440);
  check('Группа К: т заказано', tonnes(groupK.orderedWeight), 157.6, 0.1);
  check('Группа К: изготовлено %', pct(groupK.stagePct.made), 36, 1);
} else {
  failCount += 1;
  console.log('  FAIL Группа К не найдена');
}

console.log('\n--- Ш1-2 по птичникам ---');
const sh12 = marks.find((m) => m.mark === 'Ш1-2');
if (sh12) {
  const expectedAlloc = [352, 352, 296, 0, 0, 0, 0, 0, 0, 0];
  houseColumns.forEach((hc, idx) => {
    const got = sh12.houses[idx];
    check(`Ш1-2 Пт ${hc.number}`, got, expectedAlloc[idx] ?? 0);
  });
} else {
  failCount += 1;
  console.log('  FAIL Марка Ш1-2 не найдена');
}

console.log('\n--- Журнал: протягивание дат ---');
const journalCsv = readFileSync(
  path.join(__dirname, 'fixtures', 'zhurnal_2026-10-18_sample.csv'),
  'utf-8'
);
const { entries } = parseJournalData(journalCsv);
check('Журнал: строк прочитано', entries.length > 0, true);
const emptyDateCount = entries.filter((e) => !e.date).length;
check('Журнал: нет строк без даты после протягивания', emptyDateCount, 0);
const badDateCount = entries.filter((e) => !parseRuDate(e.date)).length;
check('Журнал: все даты распознаны', badDateCount, 0);

const k1History = getMarkHistory(entries, 'К-1');
check('История К-1: есть записи', k1History.length > 0, true);
if (k1History.length > 1) {
  const first = parseRuDate(k1History[0].date).getTime();
  const last = parseRuDate(k1History[k1History.length - 1].date).getTime();
  check('История К-1: новые сверху (по дате)', first >= last, true);
}

console.log('\n--- Состав марки (отдельная таблица-спецификация) ---');
const sostavCsv = readFileSync(
  path.join(__dirname, 'fixtures', 'sostav_2026-10-19.csv'),
  'utf-8'
);
const { byMark: sostav } = parseSostavData(sostavCsv);
check('Состав: марок с деталями', sostav.size > 0, true);

const b6 = sostav.get('Б-6');
if (b6) {
  check('Б-6: число деталей в составе', b6.parts.length, 3);
  check('Б-6: есть профиль ДВУТAВР18Б1', b6.parts.some((p) => p.profile === 'ДВУТAВР18Б1'), true);
} else {
  failCount += 1;
  console.log('  FAIL Состав Б-6 не найден');
}

const sh12Sostav = sostav.get('Ш1-2');
if (sh12Sostav) {
  check('Ш1-2: число деталей в составе', sh12Sostav.parts.length, 1);
  check('Ш1-2: профиль детали', sh12Sostav.parts[0].profile, 'PL12*90');
  check('Ш1-2: кол-во детали', sh12Sostav.parts[0].qty, 1);
} else {
  failCount += 1;
  console.log('  FAIL Состав Ш1-2 не найден');
}

console.log('\n--- Детали: обратный индекс (деталь → марки) ---');
const partsIndex = computePartsIndex(sostav);
check('Детали: всего номеров деталей', partsIndex.size, 338);

const part68 = partsIndex.get('68');
if (part68) {
  const marks68 = part68.usages.map((u) => u.mark).sort();
  check('Деталь №68: встречается в 3 марках', part68.usages.length, 3);
  check('Деталь №68: марки верные', marks68.join(','), 'А1-1,А1-2,А1-8');
} else {
  failCount += 1;
  console.log('  FAIL Деталь №68 не найдена в индексе');
}

// Ш1-2 — марка из единственной детали (см. фикстуру): должна тоже попасть в индекс.
const sh12Part = sh12Sostav ? sh12Sostav.parts[0] : null;
if (sh12Part) {
  const partEntry = partsIndex.get(sh12Part.partNumber);
  check(
    'Деталь марки Ш1-2 (единственная) есть в индексе и содержит Ш1-2',
    !!partEntry && partEntry.usages.some((u) => u.mark === 'Ш1-2'),
    true
  );
}

console.log(`\n=== Итог: ${okCount} OK, ${failCount} FAIL ===`);
if (failCount > 0) {
  process.exit(1);
}
