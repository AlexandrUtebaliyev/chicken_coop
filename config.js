// Настройки таблицы: ID, листы, соответствие столбцов.
// Чтобы сменить таблицу или имена столбцов — меняйте только этот файл.

export const SPREADSHEET_ID = '1FciVEvxZKf0A95mDLWqW4Qsp13mWSFwcWhCZgFNtOS4';

export const SHEET_NAMES = {
  readiness: 'Готовность',
  journal: 'Журнал',
};

export const READINESS_RANGE = 'A2:AB';
export const JOURNAL_RANGE = 'A1:J';

export function buildGvizUrl(sheetName, range) {
  return (
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&range=${range}&headers=1`
  );
}

// Отдельная таблица «Состав марки» (спецификация деталей) — отдельный документ,
// только для чтения, лист находится автоматически (в документе он один).
export const SOSTAV_SPREADSHEET_ID = '1N9trmeZmpaDhrSThcVps2aFEKQ-15Yrb';

export function buildSostavGvizUrl() {
  return `https://docs.google.com/spreadsheets/d/${SOSTAV_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&headers=1`;
}

// Канонический ключ -> варианты заголовков, как они встречаются в таблице.
// Сопоставление идёт без учёта регистра, пробелов и знаков препинания (см. model.js: normalizeHeader).
export const READINESS_COLUMNS = {
  sheetNum: ['Лист'],
  mark: ['Марка'],
  name: ['Наименование'],
  ordered: ['Заказано, шт'],
  unitWeight: ['Вес 1 шт, кг'],
  orderWeight: ['Вес заказа, кг'],
  made: ['Изготовлено, шт'],
  painted: ['Покрашено, шт'],
  ready: ['Готово, шт'],
  shipped: ['Отгружено, шт'],
  readiness: ['Готовность'],
  readyWeight: ['Готово, кг'],
  status: ['Статус'],
  check: ['Проверка'],
  note: ['Примечание'],
  group: ['Группа'],
  perHouse: ['На 1 птичник, шт'],
  fullSets: ['Полных компл.'],
};

// Эти ключи обязаны найтись в заголовках листа «Готовность».
export const READINESS_REQUIRED_KEYS = ['mark', 'ordered', 'ready'];

export const JOURNAL_COLUMNS = {
  date: ['Дата'],
  mark: ['Марка'],
  stage: ['Этап'],
  qtyDay: ['Кол-во за день, шт'],
  worker: ['Исполнитель / бригада'],
  note: ['Примечание'],
  name: ['Наименование'],
  stageTotalToday: ['Итого по этапу на сегодня'],
  ordered: ['Заказано'],
  check: ['Проверка'],
};

// Лист «Состав марки»: по одной строке «Сборка» на марку (итоги) и
// по одной строке «Деталь» на каждый элемент в составе марки.
export const SOSTAV_COLUMNS = {
  sheetNum: ['Лист'],
  rowType: ['Сборка/деталь'],
  name: ['Наименование марки'],
  mark: ['Марка'],
  markCount: ['Кол-во марок'],
  partNumber: ['№ детали'],
  partQty: ['Кол-во'],
  profile: ['Профиль'],
  width: ['Ширина'],
  length: ['Длина'],
  unitPartMass: ['Масса 1-ой детали'],
  totalPartsMass: ['Масса всех деталей'],
  markMass: ['Масса марки'],
  allMarksMass: ['Масса всех марок'],
  steelGrade: ['Марка стали'],
  note: ['Примечание'],
};

export const SOSTAV_REQUIRED_KEYS = ['mark', 'rowType'];

export const STATUS = {
  NOT_STARTED: 'Не начато',
  MAKING: 'Изготовление',
  PAINTING: 'Покраска',
  PARTIAL: 'Готово частично',
  DONE: 'Готово',
  SHIPPED: 'Отгружено',
};

// Порядок статусов для отображения чипов/счётчиков.
export const STATUS_ORDER = [
  STATUS.NOT_STARTED,
  STATUS.MAKING,
  STATUS.PAINTING,
  STATUS.PARTIAL,
  STATUS.DONE,
  STATUS.SHIPPED,
];

export const STAGE_KEYS = ['made', 'painted', 'ready', 'shipped'];
export const STAGE_LABELS = {
  made: 'Изготовлено',
  painted: 'Покрашено',
  ready: 'Готово',
  shipped: 'Отгружено',
};

export const CACHE_KEYS = {
  readinessCsv: 'cc_readiness_csv',
  readinessTime: 'cc_readiness_time',
  journalCsv: 'cc_journal_csv',
  journalTime: 'cc_journal_time',
  sostavCsv: 'cc_sostav_csv',
  sostavTime: 'cc_sostav_time',
  filters: 'cc_filters',
  plannedHouses: 'cc_planned_houses',
};

export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Чертежи марок и деталей (PDF на Google Диске, доступ по ссылке) — статические
// индексы «марка/номер детали → ссылка», собранные заранее (drawings/*.json).
// Если поменяете набор чертежей — пересоберите эти два файла и замените их.
export const DRAWINGS = {
  assemblyIndex: './drawings/assembly_index.json',
  partsIndex: './drawings/parts_index.json',
};
