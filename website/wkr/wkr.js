/**
 * wkr.js — Gemeinsame Logik für WKR Start & Ziel
 *
 * Erwartet folgende globale Variablen, definiert in der jeweiligen HTML-Seite:
 *   WKR_DATA_URL  {string}  Pfad zur regatta.json
 *   WKR_MODE      {string}  "start" | "ziel"
 */

// ── State ────────────────────────────────────────────────────────

let regatta      = null;
let races        = [];
let currentIndex = 0;
let autoMode     = false;
let isProgrammatic = false;
let cardEls      = [];

const container = document.getElementById('scroll-container');

// ── Auto-Index: einziger Unterschied zwischen Start und Ziel ────

function autoIdx() {
  const n = nextUnstartedIdx();
  return WKR_MODE === 'ziel' ? Math.max(0, n - 1) : n;
}

// ── Init ─────────────────────────────────────────────────────────

loadHash();
loadData();
setInterval(loadData, 10_000);

document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
document.getElementById('btn-next').addEventListener('click', () => navigate(+1));
document.getElementById('btn-current').addEventListener('click', jumpToCurrent);
document.getElementById('btn-auto').addEventListener('click', toggleAuto);
window.addEventListener('resize', updateIndexHint);

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowLeft')           navigate(-1);
  if (e.key === 'ArrowRight')          navigate(+1);
  if (e.key === 'a' || e.key === 'A')  toggleAuto();
  if (e.key === 'c' || e.key === 'C')  jumpToCurrent();
});

// Manuelles Scrollen → Auto-Modus deaktivieren
container.addEventListener('scroll', () => {
  if (!isProgrammatic && autoMode) setAuto(false);
}, { passive: true });

// ── Data ─────────────────────────────────────────────────────────

async function loadData() {
  try {
    const res = await fetch(WKR_DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    regatta = await res.json();

    races = (regatta.races || [])
      .filter(r => (r.competitions || []).some(c => c.scheduledStart))
      .sort((a, b) => (firstStart(a) || '').localeCompare(firstStart(b) || ''));

    if (autoMode) {
      const next = autoIdx();
      if (next !== currentIndex) {
        currentIndex = next;
        renderCards();
        scrollToIndex(currentIndex, 'smooth');
      } else {
        renderCards(); // Status-Updates rendern
      }
    } else {
      renderCards();
    }

    updateSync(true);
  } catch (err) {
    console.error('[wkr]', err);
    updateSync(false);
  }
}

// ── Navigation ───────────────────────────────────────────────────

function navigate(delta) {
  setAuto(false);
  currentIndex = Math.max(0, Math.min(races.length - 1, currentIndex + delta));
  saveHash();
  scrollToIndex(currentIndex, 'smooth');
  updateCurrentHighlight();
  updateNavButtons();
}

function jumpToCurrent() {
  setAuto(false);
  currentIndex = autoIdx();
  saveHash();
  scrollToIndex(currentIndex, 'smooth');
  updateCurrentHighlight();
  updateNavButtons();
}

function toggleAuto() {
  setAuto(!autoMode);
  if (autoMode) {
    currentIndex = autoIdx();
    saveHash();
    scrollToIndex(currentIndex, 'smooth');
    updateCurrentHighlight();
    updateNavButtons();
  }
}

function setAuto(val) {
  autoMode = val;
  const btn = document.getElementById('btn-auto');
  btn.classList.toggle('active', autoMode);
  btn.textContent = autoMode ? '⏸ Auto' : '▶ Auto';
  updateNavButtons();
}

// ── Scroll ───────────────────────────────────────────────────────

function scrollToIndex(i, behavior = 'instant') {
  const card = cardEls[i];
  if (!card) return;
  isProgrammatic = true;
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  card.scrollIntoView({
    behavior,
    block:  landscape ? 'nearest' : 'start',
    inline: landscape ? 'start'   : 'nearest',
  });
  setTimeout(() => { isProgrammatic = false; }, behavior === 'smooth' ? 900 : 50);
}

// ── IntersectionObserver — aktuelle Karte tracken ────────────────

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
      const i = parseInt(entry.target.dataset.idx);
      if (!isNaN(i) && i !== currentIndex && !isProgrammatic) {
        currentIndex = i;
        updateCurrentHighlight();
        updateNavButtons();
        updateIndexHint();
        if (!autoMode) saveHash();
      }
    }
  }
}, { root: container, threshold: 0.5 });

// ── Render ───────────────────────────────────────────────────────

function renderCards() {
  isProgrammatic = true; // verhindert Auto-Deaktivierung durch replaceChildren
  cardEls.forEach(el => observer.unobserve(el));
  cardEls = [];

  if (!races.length) {
    container.innerHTML = '<div class="center-msg">Keine Rennen verfügbar</div>';
    isProgrammatic = false;
    return;
  }

  const entryMap  = buildEntryMap(races);
  const fragment  = document.createDocumentFragment();

  races.forEach((race, i) => {
    const card = buildRaceCard(race, i, entryMap);
    cardEls.push(card);
    fragment.appendChild(card);
  });

  container.replaceChildren(fragment);
  cardEls.forEach(el => observer.observe(el));

  requestAnimationFrame(() => {
    scrollToIndex(currentIndex, 'instant');
    updateCurrentHighlight();
    updateNextHighlight();
    updateNavButtons();
    updateIndexHint();
  });
}

function updateCurrentHighlight() {
  cardEls.forEach((el, i) => el.classList.toggle('is-current', i === currentIndex));
  updateNextHighlight();
}

function updateNextHighlight() {
  const n = nextUnstartedIdx();
  cardEls.forEach((el, i) => el.classList.toggle('is-next', i === n));
}

function updateNavButtons() {
  document.getElementById('btn-prev').disabled = currentIndex <= 0 || autoMode;
  document.getElementById('btn-next').disabled = currentIndex >= races.length - 1 || autoMode;
}

function updateIndexHint() {
  const el = document.getElementById('index-hint');
  if (!races.length) { el.textContent = ''; return; }
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  if (landscape && currentIndex < races.length - 1) {
    el.textContent = `${currentIndex + 1}–${currentIndex + 2} / ${races.length}`;
  } else {
    el.textContent = `${currentIndex + 1} / ${races.length}`;
  }
}

// ── Race Card ────────────────────────────────────────────────────

function buildRaceCard(race, idx, entryMap) {
  const card   = document.createElement('div');
  const status = raceStatus(race);
  const labels = { scheduled: 'Geplant', running: 'Laufend', im_ziel: 'Im Ziel', finished: 'Offiziell' };

  card.className = 'race-card' + (idx === currentIndex ? ' is-current' : '');
  card.dataset.idx = String(idx);

  // Header
  const top = document.createElement('div');
  top.className = 'race-top';
  top.innerHTML = `
    <div class="race-num-badge">${esc(String(race.number))}</div>
    <div class="race-info-col">
      <div class="race-name">${esc(race.shortLabel || race.longLabel || '–')}</div>
      <div class="race-meta-bar">
        ${firstStart(race) ? `<span class="race-clock">${fmtClock(firstStart(race))}</span>` : ''}
        <span>${race.distance || '–'} m</span>
        <span>${race.entryCount} Boote</span>
        <span class="status-pill ${status}">${labels[status] || status}</span>
      </div>
    </div>`;
  card.appendChild(top);

  // Competitions
  const comps = race.competitions || [];
  if (!comps.length) {
    const p = document.createElement('p');
    p.className = 'no-entries';
    p.textContent = 'Noch keine Einteilungen vorhanden.';
    card.appendChild(p);
    return card;
  }

  const showHeadings = comps.length > 1;
  for (const comp of comps) {
    if (showHeadings) {
      const h = document.createElement('div');
      h.className = 'comp-heading';
      const t = fmtClock(comp.scheduledStart);
      h.textContent = 'Abteilung' + (t ? ' · ' + t : '');
      card.appendChild(h);
    }
    card.appendChild(buildBoatTable(comp, entryMap));
  }

  return card;
}

// ── Boat Table ───────────────────────────────────────────────────

function buildBoatTable(comp, entryMap) {
  const hasResults = !!comp.hasResults;
  const table      = document.createElement('table');
  table.className  = 'boat-table';

  const thead = document.createElement('thead');
  thead.innerHTML = hasResults
    ? `<tr>
         <th class="col-rank">Pl.</th>
         <th class="col-narrow">Bahn</th>
         <th class="col-narrow">SN</th>
         <th>Boot</th>
         <th class="col-time">Zeit</th>
         <th class="col-delta">Δ</th>
       </tr>`
    : `<tr>
         <th class="col-narrow">Bahn</th>
         <th class="col-narrow">SN</th>
         <th>Boot</th>
       </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const boat of comp.boats || []) {
    const entry = entryMap.get(boat.entryId);
    const tr    = document.createElement('tr');

    const clubHtml = entry
      ? `<span class="club-strong">${esc(entry.boatLabel || entry.club?.name || '–')}</span>
         ${entry.club?.short ? `<span class="club-abbr"> (${esc(entry.club.short)})</span>` : ''}`
      : '–';

    const athleteHtml = (entry?.athletes || [])
      .map(a => `<span class="athlete-line ${a.isCox ? 'athlete-cox' : ''}">
                   ${esc(`${a.firstName} ${a.lastName}`)}${a.isCox ? ' (St.)' : ''}
                 </span>`)
      .join('');

    if (hasResults) {
      tr.innerHTML = `
        <td>${rankBadge(boat.rank)}</td>
        <td>${boat.lane ?? '–'}</td>
        <td>${entry?.bowNumber ?? '–'}</td>
        <td>${clubHtml}${athleteHtml}</td>
        <td class="col-time mono">${fmtTime(boat.finalTimeMs)}</td>
        <td class="col-delta mono" style="color:var(--text-soft)">${fmtDelta(boat.deltaMs)}</td>`;
    } else {
      tr.innerHTML = `
        <td>${boat.lane ?? '–'}</td>
        <td>${entry?.bowNumber ?? '–'}</td>
        <td>${clubHtml}${athleteHtml}</td>`;
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}

// ── Race Logic ───────────────────────────────────────────────────

function nextUnstartedIdx() {
  for (let i = 0; i < races.length; i++) {
    const comps = races[i].competitions || [];
    if (comps.length && comps.every(c => c.status <= 1)) return i;
  }
  return Math.max(0, races.length - 1);
}

function raceStatus(race) {
  const comps = race.competitions || [];
  if (!comps.length)                                     return 'scheduled';
  if (comps.every(c => c.status === 4))                  return 'finished';
  if (comps.some(c => c.status === 2))                   return 'running';
  if (comps.some(c => c.status === 3 || c.status === 5)) return 'im_ziel';
  return 'scheduled';
}

function firstStart(race) {
  for (const c of race.competitions || [])
    if (c.scheduledStart) return c.scheduledStart;
  return null;
}

function buildEntryMap(races) {
  const map = new Map();
  for (const race of races)
    for (const e of race.entries || []) map.set(e.id, e);
  return map;
}

// ── Sync Badge ───────────────────────────────────────────────────

function updateSync(ok) {
  const dot   = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');

  if (!ok) {
    dot.className    = 'sync-dot stale';
    label.textContent = 'Fehler';
    return;
  }

  const ts   = regatta?.lastSync;
  const mins = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 60_000) : null;
  dot.className    = 'sync-dot' + (mins === null || mins > 3 ? ' stale' : '');
  label.textContent = mins === null ? '–' : mins === 0 ? 'gerade eben' : `vor ${mins} min`;
}

// ── URL Hash ─────────────────────────────────────────────────────

function saveHash() {
  history.replaceState(null, '', '#' + (autoMode ? 'auto' : currentIndex));
}

function loadHash() {
  const h = location.hash.replace('#', '');
  if (h === 'auto') {
    autoMode = true;
    const btn = document.getElementById('btn-auto');
    btn.classList.add('active');
    btn.textContent = '⏸ Auto';
  } else if (/^\d+$/.test(h)) {
    currentIndex = parseInt(h, 10);
  }
}

// ── Formatters ───────────────────────────────────────────────────

function fmtClock(iso) {
  if (!iso) return '';
  const d  = new Date(iso);
  const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  const t  = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${wd} ${t}`;
}

function fmtTime(ms) {
  if (!ms) return '–';
  const total = Math.round(ms / 10);
  return `${Math.floor(total / 6000)}:${String(Math.floor(total / 100) % 60).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`;
}

function fmtDelta(ms) {
  if (!ms || ms <= 0) return '';
  const total = Math.round(ms / 10);
  return `+${Math.floor(total / 100)}.${String(total % 100).padStart(2, '0')}`;
}

function rankBadge(rank) {
  if (rank == null) return '–';
  if (rank <= 3) return `<span class="rank-badge rank-${rank}">${rank}</span>`;
  return String(rank);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
