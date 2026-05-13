import { subscribe, update, getState } from "./state.js";
import { filterRaces, getRegattaDays, getRaceStatus } from "./search.js";
import { render } from "./render.js";


const DATA_URL = "data/regatta.json";
const REFRESH_INTERVAL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 200;
let refreshHandle = null;

async function init() {
  subscribe(render);
  setupSearch();
  setupFilters();
  setupKeyboardShortcuts();
  await loadData();
  refreshHandle = setInterval(loadData, REFRESH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(refreshHandle);
    } else {
      loadData();
      refreshHandle = setInterval(loadData, REFRESH_INTERVAL_MS);
    }
  });
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL + `?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const regatta = await response.json();
    const state = getState();

    // Tag-Filter-Buttons aktualisieren
    renderDayButtons(regatta.races || []);

    const visibleRaces = filterRaces(
      regatta.races || [],
      state.searchQuery,
      state.activeFilter,
      state.activeDay,
    );

    update({ status: "ready", regatta, visibleRaces, errorMessage: null });
  } catch (error) {
    console.error("[app] Fehler beim Laden:", error);
    if (!getState().regatta) {
      update({ status: "error", errorMessage: "Regattadaten konnten nicht geladen werden." });
    }
  }
}

// ── Tag-Filter-Buttons dynamisch rendern ──────────────────────

function renderDayButtons(races) {
  const container = document.getElementById("day-filter-group");
  if (!container) return;

  const days = getRegattaDays(races);

  // Nur anzeigen wenn mehr als ein Tag vorhanden
  if (days.length <= 1) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  const activeDay = getState().activeDay;

  // Buttons neu bauen
  const allBtn = makeFilterBtn("Alle Tage", "all", activeDay === "all", (d) => applyFilters(getState().searchQuery, getState().activeFilter, d));
  const dayBtns = days.map((day) => {
    const label = new Date(day + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "short", day: "2-digit", month: "2-digit",
    });
    return makeFilterBtn(label, day, activeDay === day, (d) => applyFilters(getState().searchQuery, getState().activeFilter, d));
  });

  container.replaceChildren(allBtn, ...dayBtns);
}

function makeFilterBtn(label, value, isActive, onClick) {
  const btn = document.createElement("button");
  btn.className = "filter-btn" + (isActive ? " active" : "");
  btn.textContent = label;
  btn.addEventListener("click", () => onClick(value));
  return btn;
}

// ── Suche ─────────────────────────────────────────────────────

function setupSearch() {
  const input = document.getElementById("search-input");
  let timer = null;

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => applyFilters(input.value, getState().activeFilter, getState().activeDay), SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { clearTimeout(timer); applyFilters(input.value, getState().activeFilter, getState().activeDay); }
    if (e.key === "Escape") { input.value = ""; input.blur(); applyFilters("", getState().activeFilter, getState().activeDay); }
  });
}

function setupFilters() {
  // Status-Filter (Alle, Geplant, Laufend, Beendet)
  document.querySelectorAll(".filter-btn[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () =>
    applyFilters(getState().searchQuery, btn.dataset.filter, getState().activeDay)
    );
  });
  document.getElementById('btn-scroll-current').addEventListener('click', scrollToCurrent);
}
function applyFilters(query, filter, activeDay = "all", activeSort = getState().activeSort) {
  const state = getState();
  if (!state.regatta) return;

  const visibleRaces = filterRaces(
    state.regatta.races || [], query, filter, activeDay, activeSort
  );
  update({ searchQuery: query, activeFilter: filter, activeDay, activeSort, visibleRaces });
  renderDayButtons(state.regatta.races || []);
}

function getDayBtnLabel(day, races) {
  if (day === "all") return "Alle Tage";
  return new Date(day + "T12:00:00").toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      document.getElementById("search-input").focus();
    }
  });
}

function scrollToCurrent() {
  const { visibleRaces } = getState();
  if (!visibleRaces?.length) return;

  const current =
  visibleRaces.find(r => ['running', 'im_ziel'].includes(getRaceStatus(r))) ||
  visibleRaces.find(r => getRaceStatus(r) === 'scheduled');

  if (!current) return;
  document.querySelector(`[data-race-id="${current.id}"]`)
  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

init().catch((err) => console.error("[app] Init fehlgeschlagen:", err));
