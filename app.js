// Маршруты и экраны. DOM-слой — расчёты лежат в model.js.

import { STATUS_ORDER, STAGE_KEYS, STAGE_LABELS, DRAWINGS } from './config.js';
import {
  parseReadinessData,
  parseJournalData,
  parseSostavData,
  computeOverallStats,
  computeGroups,
  computeHouses,
  getMarkHistory,
  naturalCompare,
  matchSearch,
  HeaderError,
} from './model.js';
import {
  loadReadinessCsv,
  loadJournalCsv,
  loadSostavCsv,
  formatOfflineTime,
  setupAutoRefresh,
  saveFilters,
  loadFilters,
} from './sheet.js';

const screenEl = document.getElementById('screen');
const topbarTitleEl = document.getElementById('topbar-title');
const backBtn = document.getElementById('back-btn');
const refreshBtn = document.getElementById('refresh-btn');
const offlineBanner = document.getElementById('offline-banner');
const appEl = document.getElementById('app');

const state = {
  marks: [],
  houseColumns: [],
  journalEntries: null,
  journalLoading: false,
  journalLoadError: null,
  sostavByMark: null,
  sostavLoading: false,
  sostavLoadError: null,
  assemblyDrawings: null,
  partDrawings: null,
  drawingsLoading: false,
  offline: false,
  offlineTime: null,
  loadErrorMessage: null,
  headerErrorMessage: null,
  filters: null,
  houseViewMode: 'missing',
  houseSearch: '',
};

// ---------- Иконки (inline SVG) ----------

function icon(name) {
  switch (name) {
    case 'refresh':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
    case 'back':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    case 'search':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
    case 'summary':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
    case 'marks':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>';
    case 'houses':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';
    case 'warning':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>';
    case 'drawing':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
    case 'wifi-off':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/></svg>';
    default:
      return '';
  }
}

// ---------- Форматирование и цвета ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatQty(n) {
  return Math.round(n ?? 0).toLocaleString('ru-RU');
}

function formatWeight(kg) {
  if (kg == null || Number.isNaN(kg)) return '—';
  if (Math.abs(kg) >= 1000) {
    return `${(kg / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} т`;
  }
  return `${kg.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} кг`;
}

const STATUS_VAR_KEY = {
  'Не начато': 'not-started',
  Изготовление: 'making',
  Покраска: 'painting',
  'Готово частично': 'partial',
  Готово: 'done',
  Отгружено: 'shipped',
};

const STAGE_CSS_KEY = { made: 'making', painted: 'painting', ready: 'done', shipped: 'shipped' };

function statusColor(status) {
  return `var(--status-${STATUS_VAR_KEY[status] || 'not-started'})`;
}
function statusBg(status) {
  return `var(--status-${STATUS_VAR_KEY[status] || 'not-started'}-bg)`;
}
function stageCssKey(key) {
  return STAGE_CSS_KEY[key] || 'not-started';
}

function houseStatusColors(status) {
  if (status === 'Укомплектован') return { bg: 'var(--status-done-bg)', fg: 'var(--status-done)' };
  if (status === 'Не начат') return { bg: 'var(--status-not-started-bg)', fg: 'var(--status-not-started)' };
  return { bg: 'var(--status-partial-bg)', fg: 'var(--status-partial)' };
}

// ---------- Маршрутизация ----------

function parseRoute() {
  const hash = location.hash || '#/';
  const [pathPart, queryPart] = hash.slice(1).split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');

  if (segments.length === 0) return { name: 'summary', params: {}, query };
  if (segments[0] === 'marks') return { name: 'marks', params: {}, query };
  if (segments[0] === 'houses') return { name: 'houses', params: {}, query };
  if (segments[0] === 'house') {
    return { name: 'house', params: { number: Number(segments[1]) }, query };
  }
  if (segments[0] === 'mark') {
    return { name: 'mark', params: { mark: decodeURIComponent(segments[1] || '') }, query };
  }
  return { name: 'summary', params: {}, query };
}

function defaultFilters() {
  return { status: 'all', group: 'all', search: '', sort: 'mark' };
}

// ---------- Загрузка данных ----------

async function loadData(opts = {}) {
  const silent = !!opts.silent;
  if (!silent) setRefreshing(true);

  try {
    const result = await loadReadinessCsv();
    const parsed = parseReadinessData(result.csv);
    state.marks = parsed.marks;
    state.houseColumns = parsed.houseColumns;
    state.loadErrorMessage = null;
    state.headerErrorMessage = null;
    state.offline = !!result.fromCache;
    state.offlineTime = result.time;
  } catch (e) {
    if (e instanceof HeaderError) {
      state.headerErrorMessage = e.message;
    } else {
      state.loadErrorMessage = e.message || 'Не удалось загрузить данные.';
    }
  } finally {
    if (!silent) setRefreshing(false);
  }

  updateOfflineBanner();
  render();
}

async function ensureJournalLoaded() {
  if (state.journalEntries !== null || state.journalLoading) return;
  state.journalLoading = true;
  render();
  try {
    const result = await loadJournalCsv();
    const parsed = parseJournalData(result.csv);
    state.journalEntries = parsed.entries;
    state.journalLoadError = null;
  } catch (e) {
    state.journalEntries = [];
    state.journalLoadError = e.message || 'История недоступна.';
  } finally {
    state.journalLoading = false;
    const route = parseRoute();
    if (route.name === 'mark') render();
  }
}

async function ensureDrawingsLoaded() {
  if (state.assemblyDrawings !== null || state.drawingsLoading) return;
  state.drawingsLoading = true;
  try {
    const [assemblyRes, partsRes] = await Promise.all([
      fetch(DRAWINGS.assemblyIndex),
      fetch(DRAWINGS.partsIndex),
    ]);
    state.assemblyDrawings = assemblyRes.ok ? await assemblyRes.json() : {};
    state.partDrawings = partsRes.ok ? await partsRes.json() : {};
  } catch (e) {
    state.assemblyDrawings = {};
    state.partDrawings = {};
  } finally {
    state.drawingsLoading = false;
    const route = parseRoute();
    if (route.name === 'mark') render();
  }
}

async function ensureSostavLoaded() {
  if (state.sostavByMark !== null || state.sostavLoading) return;
  state.sostavLoading = true;
  render();
  try {
    const result = await loadSostavCsv();
    const parsed = parseSostavData(result.csv);
    state.sostavByMark = parsed.byMark;
    state.sostavLoadError = null;
  } catch (e) {
    state.sostavByMark = new Map();
    state.sostavLoadError = e.message || 'Состав недоступен.';
  } finally {
    state.sostavLoading = false;
    const route = parseRoute();
    if (route.name === 'mark') render();
  }
}

// ---------- Общие элементы шапки ----------

function setRefreshing(isRefreshing) {
  refreshBtn.classList.toggle('spinning', isRefreshing);
  refreshBtn.disabled = isRefreshing;
}

function updateOfflineBanner() {
  if (state.offline && state.offlineTime) {
    offlineBanner.hidden = false;
    offlineBanner.textContent = `Офлайн — данные от ${formatOfflineTime(state.offlineTime)}`;
  } else {
    offlineBanner.hidden = true;
  }
}

function updateBackButton(route) {
  const isDetail = route.name === 'house' || route.name === 'mark';
  backBtn.hidden = !isDetail;

  const titles = { summary: 'Готовность марок', marks: 'Марки', houses: 'Птичники' };
  if (route.name === 'house') topbarTitleEl.textContent = `Птичник ${route.params.number}`;
  else if (route.name === 'mark') topbarTitleEl.textContent = route.params.mark;
  else topbarTitleEl.textContent = titles[route.name] || 'Готовность марок';
}

function updateDetailClass(route) {
  const isDetail = route.name === 'house' || route.name === 'mark';
  appEl.classList.toggle('detail', isDetail);
}

function updateTabbarActive(route) {
  const map = { summary: 'summary', marks: 'marks', houses: 'houses', house: 'houses' };
  const active = map[route.name] || null;
  document.querySelectorAll('.tab-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === active);
  });
}

// ---------- Экран: ошибки ----------

function renderFatalError(message, iconName) {
  screenEl.innerHTML = `
    <div class="error-state">
      <div class="error-icon">${icon(iconName)}</div>
      <p>${escapeHtml(message)}</p>
      <button class="btn" id="retry-btn" type="button">Повторить</button>
    </div>`;
  document.getElementById('retry-btn').addEventListener('click', () => loadData());
}

// ---------- Экран: Сводка ----------

function renderSummary() {
  const stats = computeOverallStats(state.marks);
  const groups = computeGroups(state.marks);
  const houses = computeHouses(state.marks, state.houseColumns);

  const stageTilesHtml = STAGE_KEYS.map((key) => {
    const pct = Math.round(stats.stagePct[key] * 100);
    return `<div class="stage-tile" style="--stage-color: var(--status-${stageCssKey(key)})">
      <div class="stage-name">${STAGE_LABELS[key]}</div>
      <div class="stage-pct">${pct}%</div>
      <div class="stage-detail">${formatQty(stats.stageQty[key])} из ${formatQty(stats.orderedQty)} шт · ${formatWeight(stats.stageWeight[key])} из ${formatWeight(stats.orderedWeight)}</div>
    </div>`;
  }).join('');

  const statusChips = STATUS_ORDER.map((s) => {
    const count = stats.statusCounts[s] || 0;
    return `<a class="chip" href="#/marks?status=${encodeURIComponent(s)}">
      <span class="dot" style="color:${statusColor(s)}"></span>${escapeHtml(s)} · ${count}
    </a>`;
  }).join('') + `<a class="chip chip-error" href="#/marks?errors=1">С ошибками · ${stats.errorCount}</a>`;

  const housesMini = houses.length
    ? houses.map((h) => {
        const pct = Math.round(h.stagePct.ready * 100);
        return `<a class="house-mini" href="#/house/${h.number}">
          <div class="house-mini-name">Пт ${h.number}</div>
          <div class="house-mini-pct">${pct}%</div>
        </a>`;
      }).join('')
    : '<div class="empty-state">Нет столбцов птичников.</div>';

  const groupsHtml = groups.length
    ? groups.map((g) => {
        const pctMade = Math.round(g.stagePct.made * 100);
        return `<a class="group-row" href="#/marks?group=${encodeURIComponent(g.code)}">
          <span class="group-code">${escapeHtml(g.code)}</span>
          <div class="group-info">
            <div class="group-name">${escapeHtml(g.name || '—')}</div>
            <div class="group-stats">${g.count} марок · ${formatQty(g.orderedQty)} шт · ${formatWeight(g.orderedWeight)}</div>
          </div>
          <span class="group-pct" style="color:var(--status-making)">${pctMade}%</span>
        </a>`;
      }).join('')
    : '<div class="empty-state">Нет данных.</div>';

  screenEl.innerHTML = `
    <div class="stage-grid">${stageTilesHtml}</div>
    <div class="chip-row">${statusChips}</div>
    <h2 class="section-title">Птичники</h2>
    <div class="house-mini-row">${housesMini}</div>
    <h2 class="section-title">Группы</h2>
    ${groupsHtml}
  `;
}

// ---------- Экран: Марки ----------

function getFilteredMarks() {
  const f = state.filters;
  let list = state.marks;

  if (f.status === 'errors') list = list.filter((m) => m.check);
  else if (f.status !== 'all') list = list.filter((m) => m.status === f.status);

  if (f.group !== 'all') list = list.filter((m) => m.group === f.group);
  if (f.search) list = list.filter((m) => matchSearch(f.search, m.mark, m.name));

  const sorted = [...list];
  if (f.sort === 'mark') sorted.sort((a, b) => naturalCompare(a.mark, b.mark));
  else if (f.sort === 'readiness') sorted.sort((a, b) => a.readinessPct - b.readinessPct);
  else if (f.sort === 'weight') sorted.sort((a, b) => b.orderWeight - a.orderWeight);

  return sorted;
}

function renderStackBar(m) {
  const total = m.ordered || 0;
  if (total <= 0) return '';
  const madeW = Math.min(100, (m.made / total) * 100);
  const paintedW = Math.min(100, (m.painted / total) * 100);
  const readyW = Math.min(100, (m.ready / total) * 100);
  return `<div class="stack-bar">
    <span style="width:${madeW}%;background:var(--status-making);z-index:1"></span>
    <span style="width:${paintedW}%;background:var(--status-painting);z-index:2"></span>
    <span style="width:${readyW}%;background:var(--status-done);z-index:3"></span>
  </div>`;
}

function renderMarkListItem(m) {
  const pct = Math.round(m.readinessPct * 100);
  return `
    <a class="mark-card" href="#/mark/${encodeURIComponent(m.mark)}">
      <div class="mark-main">
        <div class="mark-code-row">
          <span class="mark-code">${escapeHtml(m.mark)}</span>
          <span class="badge" style="background:${statusBg(m.status)};color:${statusColor(m.status)}">${escapeHtml(m.status)}</span>
        </div>
        <div class="mark-name">${escapeHtml(m.name)}</div>
        <div class="mark-order-line">Заказано ${formatQty(m.ordered)} шт · ${formatWeight(m.orderWeight)}</div>
        ${renderStackBar(m)}
        ${m.check ? `<div class="mark-error-line">${escapeHtml(m.check)}</div>` : ''}
      </div>
      <div class="mark-pct">${pct}%</div>
    </a>`;
}

function renderMarksList(query) {
  const f = state.filters;
  let changed = false;
  if (query.has('status')) { f.status = query.get('status'); changed = true; }
  if (query.has('group')) { f.group = query.get('group'); changed = true; }
  if (query.has('errors')) { f.status = 'errors'; changed = true; }
  if (changed) saveFilters(f);
  renderMarksBody();
}

function renderMarksBody() {
  const f = state.filters;
  const stats = computeOverallStats(state.marks);
  const groups = computeGroups(state.marks);
  const filtered = getFilteredMarks();

  const chipsHtml = [
    `<button class="chip ${f.status === 'all' ? 'active' : ''}" data-filter-status="all">Все · ${stats.marksCount}</button>`,
    ...STATUS_ORDER.map((s) => {
      const count = stats.statusCounts[s] || 0;
      const active = f.status === s;
      return `<button class="chip ${active ? 'active' : ''}" data-filter-status="${escapeHtml(s)}"><span class="dot" style="color:${statusColor(s)}"></span>${escapeHtml(s)} · ${count}</button>`;
    }),
    `<button class="chip chip-error ${f.status === 'errors' ? 'active' : ''}" data-filter-status="errors">С ошибками · ${stats.errorCount}</button>`,
  ].join('');

  const groupOptions = [`<option value="all">Все группы</option>`]
    .concat(groups.map((g) => `<option value="${escapeHtml(g.code)}" ${f.group === g.code ? 'selected' : ''}>${escapeHtml(g.code)} — ${escapeHtml(g.name || '—')} (${g.count})</option>`))
    .join('');

  const listHtml = filtered.length
    ? filtered.map(renderMarkListItem).join('')
    : '<div class="empty-state">Ничего не найдено.</div>';

  screenEl.innerHTML = `
    <div class="search-box">
      ${icon('search')}
      <input id="mark-search" type="search" placeholder="Поиск по марке или наименованию" value="${escapeHtml(f.search)}" />
    </div>
    <div class="chip-row">${chipsHtml}</div>
    <div class="filter-row">
      <select id="group-select" class="select-box">${groupOptions}</select>
      <select id="sort-select" class="select-box">
        <option value="mark" ${f.sort === 'mark' ? 'selected' : ''}>По марке</option>
        <option value="readiness" ${f.sort === 'readiness' ? 'selected' : ''}>По готовности</option>
        <option value="weight" ${f.sort === 'weight' ? 'selected' : ''}>По весу</option>
      </select>
    </div>
    <div id="marks-list">${listHtml}</div>
  `;

  bindMarksEvents();
}

function bindMarksEvents() {
  const searchInput = document.getElementById('mark-search');
  searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    saveFilters(state.filters);
    renderMarksBody();
    const el = document.getElementById('mark-search');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  document.getElementById('group-select').addEventListener('change', (e) => {
    state.filters.group = e.target.value;
    saveFilters(state.filters);
    renderMarksBody();
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    saveFilters(state.filters);
    renderMarksBody();
  });

  screenEl.querySelectorAll('[data-filter-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filters.status = btn.getAttribute('data-filter-status');
      saveFilters(state.filters);
      renderMarksBody();
    });
  });
}

// ---------- Экран: Птичники ----------

function renderHouseStageRow(stageKey, pctValue) {
  const pct = Math.round(pctValue * 100);
  return `<div class="house-stage-row">
    <span class="house-stage-label">${STAGE_LABELS[stageKey]}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:var(--status-${stageCssKey(stageKey)})"></span></span>
    <span class="house-stage-pct">${pct}%</span>
  </div>`;
}

function renderHouseCard(h) {
  const colors = houseStatusColors(h.status);
  return `
  <a class="house-card" href="#/house/${h.number}">
    <div class="house-card-top">
      <span class="house-card-name">Птичник ${h.number}</span>
      <span class="badge" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(h.status)}</span>
    </div>
    <div class="house-card-weight">Вес комплекта: ${formatWeight(h.setWeight)}</div>
    ${STAGE_KEYS.map((k) => renderHouseStageRow(k, h.stagePct[k])).join('')}
    <div class="house-card-missing" style="color:${h.missing > 0 ? 'var(--status-error)' : 'var(--status-done)'}">
      ${h.missing > 0 ? `Не хватает ${h.missing} из ${h.totalWithPer} марок` : 'Все марки в сборе'}
    </div>
  </a>`;
}

function renderHouses() {
  const houses = computeHouses(state.marks, state.houseColumns);
  screenEl.innerHTML = `
    <h2 class="section-title">Птичники</h2>
    ${houses.length ? houses.map(renderHouseCard).join('') : '<div class="empty-state">Нет столбцов птичников.</div>'}
  `;
}

// ---------- Экран: детали птичника ----------

function renderHouseMarkRow(r) {
  const color = r.state === 'full' ? 'var(--status-done)' : r.state === 'partial' ? 'var(--status-making)' : 'var(--status-not-started)';
  const pct = r.need > 0 ? Math.min(100, Math.round((r.have / r.need) * 100)) : 0;
  return `<a class="house-mark-row" href="#/mark/${encodeURIComponent(r.mark)}">
    <div class="mark-main">
      <div class="mark-row-top">
        <span class="mark-code">${escapeHtml(r.mark)}</span>
        <span class="need-have">${r.have} / ${r.need}</span>
      </div>
      <div class="mark-name">${escapeHtml(r.name)}</div>
      <div class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></div>
    </div>
  </a>`;
}

function renderHouseDetail(number) {
  const houses = computeHouses(state.marks, state.houseColumns);
  const h = houses.find((x) => x.number === number);

  if (!h) {
    screenEl.innerHTML = '<div class="empty-state">Птичник не найден.</div>';
    return;
  }

  let rows = h.markRows;
  if (state.houseViewMode === 'missing') rows = rows.filter((r) => r.state !== 'full');
  if (state.houseSearch) rows = rows.filter((r) => matchSearch(state.houseSearch, r.mark, r.name));
  rows = [...rows].sort((a, b) => naturalCompare(a.mark, b.mark));

  screenEl.innerHTML = `
    <div class="card">
      <div class="house-card-weight">Вес комплекта: ${formatWeight(h.setWeight)}</div>
      ${STAGE_KEYS.map((k) => renderHouseStageRow(k, h.stagePct[k])).join('')}
      <div class="house-card-missing" style="color:${h.missing > 0 ? 'var(--status-error)' : 'var(--status-done)'}">
        ${h.missing > 0 ? `Не хватает ${h.missing} из ${h.totalWithPer} марок` : 'Все марки в сборе'}
      </div>
    </div>
    <div class="segmented">
      <button data-view="missing" class="${state.houseViewMode === 'missing' ? 'active' : ''}" type="button">Только недостающие</button>
      <button data-view="all" class="${state.houseViewMode === 'all' ? 'active' : ''}" type="button">Все</button>
    </div>
    <div class="search-box">
      ${icon('search')}
      <input id="house-search" type="search" placeholder="Поиск марки" value="${escapeHtml(state.houseSearch)}" />
    </div>
    ${rows.length ? rows.map(renderHouseMarkRow).join('') : '<div class="empty-state">Ничего не найдено.</div>'}
  `;

  screenEl.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.houseViewMode = btn.getAttribute('data-view');
      renderHouseDetail(number);
    });
  });

  const searchInput = document.getElementById('house-search');
  searchInput.addEventListener('input', (e) => {
    state.houseSearch = e.target.value;
    renderHouseDetail(number);
    const el = document.getElementById('house-search');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

// ---------- Экран: карточка марки ----------

function renderRing(pct, color) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return `<div class="ring-wrap">
    <svg viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--bg-sunken)" stroke-width="8"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
    </svg>
    <span class="ring-pct">${Math.round(pct)}%</span>
  </div>`;
}

function renderStageDetailRow(key, m) {
  const qty = m[key];
  const total = m.ordered || 1;
  const pct = Math.min(100, Math.round((qty / total) * 100));
  return `<div class="stage-detail-row">
    <span class="stage-detail-label">${STAGE_LABELS[key]}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:var(--status-${stageCssKey(key)})"></span></span>
    <span class="stage-detail-qty">${formatQty(qty)} / ${formatQty(m.ordered)}</span>
  </div>`;
}

function renderHouseGridCell(hc, m, idx) {
  const have = m.houses[idx] ?? 0;
  const need = m.perHouse || 0;
  let bg = 'var(--status-not-started-bg)';
  let fg = 'var(--status-not-started)';
  if (need > 0) {
    if (have >= need) {
      bg = 'var(--status-done-bg)';
      fg = 'var(--status-done)';
    } else if (have > 0) {
      bg = 'var(--status-making-bg)';
      fg = 'var(--status-making)';
    }
  }
  return `<div class="house-grid-cell" style="background:${bg};color:${fg}">
    <div class="cell-house">Пт${hc.number}</div>
    <div class="cell-value">${have}</div>
  </div>`;
}

function renderAssemblyDrawingLink(markCode) {
  const drawing = state.assemblyDrawings ? state.assemblyDrawings[markCode] : null;
  if (!drawing) return '';
  return `<a class="drawing-link-btn" href="${escapeHtml(drawing.viewUrl)}" target="_blank" rel="noopener">
    ${icon('drawing')}<span>Чертёж марки</span>
  </a>`;
}

function renderPartRow(p) {
  const dims = [p.width, p.length].filter((v) => v != null).map((v) => formatQty(v)).join('×');
  const metaBits = [dims ? `${dims} мм` : '', p.steelGrade].filter(Boolean).join(' · ');
  const drawing = p.partNumber && state.partDrawings ? state.partDrawings[p.partNumber] : null;
  return `<div class="part-row">
    <div class="part-main">
      <div class="part-profile">${escapeHtml(p.profile || p.partNumber || '—')}${p.partNumber ? ` <span class="part-number">№${escapeHtml(p.partNumber)}</span>` : ''}</div>
      ${metaBits ? `<div class="part-dims">${escapeHtml(metaBits)}</div>` : ''}
      ${p.note ? `<div class="part-note">${escapeHtml(p.note)}</div>` : ''}
    </div>
    <div class="part-qty">${formatQty(p.qty)} шт${p.unitMass != null ? ` · ${formatWeight(p.unitMass)}` : ''}</div>
    ${drawing ? `<a class="part-drawing-btn" href="${escapeHtml(drawing.viewUrl)}" target="_blank" rel="noopener" aria-label="Чертёж детали ${escapeHtml(p.partNumber)}">${icon('drawing')}</a>` : ''}
  </div>`;
}

function renderSostavSection(markCode) {
  if (state.sostavLoading && state.sostavByMark === null) {
    return '<div class="spinner-block"><div class="spinner"></div></div>';
  }
  if (!state.sostavByMark) {
    return `<div class="empty-state">${escapeHtml(state.sostavLoadError || 'Состав недоступен.')}</div>`;
  }

  const comp = state.sostavByMark.get(markCode);
  if (!comp || comp.parts.length === 0) {
    return '<div class="empty-state">Состав не найден в таблице спецификации.</div>';
  }

  return `
    <div class="sostav-summary">Деталей в составе: ${comp.parts.length}</div>
    ${comp.parts.map(renderPartRow).join('')}
  `;
}

function renderHistorySection(markCode) {
  if (state.journalLoading && state.journalEntries === null) {
    return '<div class="spinner-block"><div class="spinner"></div></div>';
  }
  if (!state.journalEntries) {
    return `<div class="empty-state">${escapeHtml(state.journalLoadError || 'История недоступна.')}</div>`;
  }

  const history = getMarkHistory(state.journalEntries, markCode);
  if (history.length === 0) return '<div class="empty-state">Записей в журнале нет.</div>';

  let html = '';
  let lastDate = null;
  for (const e of history) {
    if (e.date !== lastDate) {
      html += `<div class="history-date">${escapeHtml(e.date || 'Дата не указана')}</div>`;
      lastDate = e.date;
    }
    const sign = e.qty > 0 ? '+' : '';
    html += `<div class="history-entry">
      <span class="history-stage">${escapeHtml(e.stage)}</span>
      <span class="history-qty">${sign}${e.qty}</span>
      <span class="history-worker">${escapeHtml(e.worker || '')}</span>
    </div>`;
  }
  return `<div class="history-day">${html}</div>`;
}

function renderMarkCard(markCode) {
  const m = state.marks.find((x) => x.mark === markCode);
  if (!m) {
    screenEl.innerHTML = `<div class="empty-state">Марка «${escapeHtml(markCode)}» не найдена.</div>`;
    return;
  }

  ensureJournalLoaded();
  ensureSostavLoaded();
  ensureDrawingsLoaded();

  const pct = Math.round(m.readinessPct * 100);

  screenEl.innerHTML = `
    <div class="card">
      <div class="mark-detail-head">
        ${renderRing(pct, statusColor(m.status))}
        <div>
          <div class="mark-detail-code">${escapeHtml(m.mark)}</div>
          <span class="badge" style="background:${statusBg(m.status)};color:${statusColor(m.status)}">${escapeHtml(m.status)}</span>
          <div class="mark-detail-name">${escapeHtml(m.name)}</div>
          <div class="mark-detail-group">Группа: ${escapeHtml(m.group)}</div>
        </div>
      </div>
      ${renderAssemblyDrawingLink(markCode)}
      ${STAGE_KEYS.map((k) => renderStageDetailRow(k, m)).join('')}
    </div>

    <div class="card">
      <div class="weight-grid">
        <div class="weight-item"><div class="weight-value">${formatWeight(m.unitWeight ?? 0)}</div><div class="weight-label">Вес 1 шт</div></div>
        <div class="weight-item"><div class="weight-value">${formatWeight(m.orderWeight)}</div><div class="weight-label">Вес заказа</div></div>
        <div class="weight-item"><div class="weight-value">${formatWeight(m.readyWeight)}</div><div class="weight-label">Готово</div></div>
      </div>
      ${m.check ? `<div class="note-line error">Проверка: ${escapeHtml(m.check)}</div>` : ''}
      ${m.note ? `<div class="note-line">Примечание: ${escapeHtml(m.note)}</div>` : ''}
    </div>

    <h2 class="section-title">Состав марки</h2>
    ${renderSostavSection(markCode)}

    <h2 class="section-title">Птичники</h2>
    <div class="card">
      <div class="houses-grid">
        ${state.houseColumns.map((hc, idx) => renderHouseGridCell(hc, m, idx)).join('')}
      </div>
    </div>

    <h2 class="section-title">История</h2>
    ${renderHistorySection(markCode)}
  `;
}

// ---------- Диспетчер ----------

function render() {
  const route = parseRoute();
  updateTabbarActive(route);
  updateBackButton(route);
  updateDetailClass(route);

  if (state.headerErrorMessage) {
    renderFatalError(state.headerErrorMessage, 'warning');
    return;
  }
  if (state.loadErrorMessage && state.marks.length === 0) {
    renderFatalError(state.loadErrorMessage, 'wifi-off');
    return;
  }

  switch (route.name) {
    case 'marks':
      renderMarksList(route.query);
      break;
    case 'houses':
      renderHouses();
      break;
    case 'house':
      renderHouseDetail(route.params.number);
      break;
    case 'mark':
      renderMarkCard(route.params.mark);
      break;
    default:
      renderSummary();
  }
}

// ---------- Pull-to-refresh ----------

function setupPullToRefresh() {
  let startY = 0;
  let pulling = false;

  screenEl.addEventListener('touchstart', (e) => {
    pulling = screenEl.scrollTop <= 0;
    startY = e.touches[0].clientY;
  }, { passive: true });

  screenEl.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 90) {
      pulling = false;
      loadData();
    }
  }, { passive: true });

  screenEl.addEventListener('touchend', () => {
    pulling = false;
  });
}

// ---------- Инициализация ----------

function renderShell() {
  refreshBtn.innerHTML = icon('refresh');
  backBtn.innerHTML = icon('back');
  document.querySelectorAll('[data-icon="summary"]').forEach((el) => { el.innerHTML = icon('summary'); });
  document.querySelectorAll('[data-icon="marks"]').forEach((el) => { el.innerHTML = icon('marks'); });
  document.querySelectorAll('[data-icon="houses"]').forEach((el) => { el.innerHTML = icon('houses'); });
}

async function init() {
  state.filters = loadFilters() || defaultFilters();
  renderShell();

  refreshBtn.addEventListener('click', () => loadData());
  backBtn.addEventListener('click', () => history.back());
  window.addEventListener('hashchange', render);

  setupPullToRefresh();
  await loadData();
  setupAutoRefresh(() => loadData({ silent: true }));
}

init();
