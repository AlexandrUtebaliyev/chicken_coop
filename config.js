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
  filters: 'cc_filters',
};

export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
