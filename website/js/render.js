import { getState, update } from "./state.js";
import { getRaceStatus } from "./search.js";
import {
  formatTime, formatDelta, formatClock, formatRound,
  timeAgo, isSyncStale, escapeHtml, $,
} from "./utils.js";

export function render(state) {
  renderHeader(state);
  renderSyncBadge(state);
  renderViewState(state);
  renderFilters(state);
  if (state.status === "ready") renderRaceList(state);
}

// ── Header ────────────────────────────────────────────────────

function renderHeader(state) {
  const event = state.regatta?.event;
  const titleEl = $("event-title");
  const metaEl = $("event-meta");

  if (event) {
    titleEl.textContent = event.title;
    const parts = [];
    if (event.location) parts.push(event.location);
    if (event.startDate) {
      parts.push(new Date(event.startDate).toLocaleDateString("de-DE", {
        day: "2-digit", month: "long", year: "numeric",
      }));
    }
    metaEl.textContent = parts.join(" · ");
  }
}

function renderSyncBadge(state) {
  const badge = $("sync-badge");
  const timeEl = $("sync-time");
  timeEl.textContent = timeAgo(state.regatta?.lastSync);
  badge.classList.toggle("stale", isSyncStale(state.regatta?.lastSync));
}

// ── View States ───────────────────────────────────────────────

function renderViewState(state) {
  $("loading").hidden = state.status !== "loading";
  $("error").hidden = state.status !== "error";
  if (state.status === "error") $("error-message").textContent = state.errorMessage || "Unbekannter Fehler";

  const hasRaces = state.status === "ready" && state.visibleRaces.length > 0;
  $("race-list").hidden = !hasRaces;
  $("empty").hidden = !(state.status === "ready" && state.visibleRaces.length === 0);
}

// ── Filters ───────────────────────────────────────────────────

function renderFilters(state) {
  document.querySelectorAll(".filter-btn[data-filter]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === state.activeFilter);
  });
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sort === state.activeSort);
  });
}

// ── Race List ─────────────────────────────────────────────────

function renderRaceList(state) {
  const container = $("race-list");
  const { visibleRaces, openRaces, regatta } = state;
  const entryMap = buildEntryMap(regatta.races);

  const fragment = document.createDocumentFragment();
  for (const race of visibleRaces) {
    fragment.appendChild(buildRaceCard(race, openRaces.has(race.id), entryMap));
  }
  container.replaceChildren(fragment);
}

// ── Race Card ─────────────────────────────────────────────────

function buildRaceCard(race, isOpen, entryMap) {
  const status = getRaceStatus(race);
  const card = el("div", `race-card ${isOpen ? "open" : ""}`, { "data-race-id": race.id });

  // Startzeit aus dem ersten Lauf
  const firstStart = race.competitions?.[0]?.scheduledStart;
  const timeStr = formatClock(firstStart);

  const header = el("div", "race-header");
  header.addEventListener("click", () => toggleRace(race.id));
  header.innerHTML = `
    <span class="race-number">${escapeHtml(String(race.number))}</span>
    <span class="race-label">${escapeHtml(race.shortLabel || race.longLabel || "")}</span>
    <span class="race-meta">
      ${timeStr ? `<span class="race-starttime">${timeStr}</span>` : ""}
      <span>${race.distance || "–"} m</span>
      <span>${race.entryCount} Boote</span>
      <span class="race-status ${status}">${statusLabel(status)}</span>
    </span>
    <svg class="race-chevron" width="16" height="16" viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>
  `;
  card.appendChild(header);

  if (isOpen) {
    const body = el("div", "race-body");
    const comps = race.competitions || [];

    if (comps.length > 0) {
      for (const comp of comps) body.appendChild(buildCompSection(comp, entryMap));
    } else if (race.entries?.length > 0) {
      body.appendChild(buildEntriesList(race.entries));
    } else {
      body.innerHTML = `<div class="no-comps">Noch keine Einteilungen vorhanden.</div>`;
    }
    card.appendChild(body);
  }

  return card;
}

// ── Competition Section ───────────────────────────────────────

function buildCompSection(comp, entryMap) {
  const section = el("div", "comp-section");
  const roundLabel = formatRound(comp.roundCode, comp.heatNumber);
  const timeLabel = formatClock(comp.scheduledStart);

  section.innerHTML = `
    <div class="comp-title">
      ${escapeHtml(roundLabel)}
      ${timeLabel ? `<span class="comp-time">${timeLabel}</span>` : ""}
    </div>
  `;

  section.appendChild(buildBoatTable(comp.boats, comp.hasResults, entryMap));
  return section;
}

function buildBoatTable(boats, hasResults, entryMap) {
  const table = el("table", "boat-table");

  const thead = document.createElement("thead");
  thead.innerHTML = hasResults
    ? `<tr>
         <th class="col-rank">Pl.</th>
         <th class="col-lane">Bahn</th>
         <th class="col-bow">SN</th>
         <th>Boot</th>
         <th class="col-time">Zeit</th>
         <th class="col-delta">Δ</th>
       </tr>`
    : `<tr>
         <th class="col-lane">Bahn</th>
         <th class="col-bow">SN</th>
         <th>Boot</th>
       </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const boat of boats) {
    const entry = entryMap.get(boat.entryId);
    const row = document.createElement("tr");
    if (entry?.isCancelled) row.classList.add("boat-cancelled");

    if (hasResults) {
      row.innerHTML = `
        <td class="col-rank">${rankBadge(boat.rank)}</td>
        <td class="col-lane">${boat.lane ?? "–"}</td>
        <td class="col-bow">${entry?.bowNumber ?? "–"}</td>
        <td>${boatLabel(entry)}${athleteList(entry)}</td>
        <td class="col-time">${formatTime(boat.finalTimeMs)}</td>
        <td class="col-delta">${formatDelta(boat.deltaMs)}</td>
      `;
    } else {
      row.innerHTML = `
        <td class="col-lane">${boat.lane ?? "–"}</td>
        <td class="col-bow">${entry?.bowNumber ?? "–"}</td>
        <td>${boatLabel(entry)}${athleteList(entry)}</td>
      `;
    }
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  return table;
}

// ── Entries List ──────────────────────────────────────────────

function buildEntriesList(entries) {
  const wrap = el("div", "entries-list");
  const active = entries.filter((e) => !e.isCancelled);
  wrap.innerHTML = `<div class="entries-count">${active.length} gemeldete Boote</div>`;

  const table = el("table", "boat-table");
  table.innerHTML = `<thead><tr><th class="col-bow">SN</th><th>Boot</th></tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const entry of entries) {
    const row = document.createElement("tr");
    if (entry.isCancelled) row.classList.add("boat-cancelled");
    row.innerHTML = `
      <td class="col-bow">${entry.bowNumber ?? "–"}</td>
      <td>${boatLabel(entry)}${athleteList(entry)}</td>
    `;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ── Helfer ────────────────────────────────────────────────────

function toggleRace(raceId) {
  const state = getState();
  const next = new Set(state.openRaces);
  next.has(raceId) ? next.delete(raceId) : next.add(raceId);
  update({ openRaces: next });
}

function rankBadge(rank) {
  if (rank == null) return "–";
  if (rank <= 3) return `<span class="rank-badge rank-${rank}">${rank}</span>`;
  return String(rank);
}

function boatLabel(entry) {
  if (!entry) return `<span class="boat-cancelled">Unbekannt</span>`;
  const label = escapeHtml(entry.boatLabel || entry.club?.name || "–");
  const club = entry.club?.short ? ` (${escapeHtml(entry.club.short)})` : "";
  return `<strong>${label}</strong>${club}`;
}

function athleteList(entry) {
  if (!entry?.athletes?.length) return "";
  const items = entry.athletes.map((a) => {
    const name = escapeHtml(`${a.firstName} ${a.lastName}`);
    return a.isCox
    ? `<div class="athlete-item athlete-cox">${name} (St.)</div>`
    : `<div class="athlete-item">${name}</div>`;
  });
  return `<div class="athlete-list">${items.join("")}</div>`;
}

function statusLabel(status) {
  return { scheduled: "Geplant", running: "Laufend", finished: "Beendet" }[status] || status;
}

function buildEntryMap(races) {
  const map = new Map();
  for (const race of races) {
    for (const entry of race.entries || []) map.set(entry.id, entry);
  }
  return map;
}

function el(tag, className = "", attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
