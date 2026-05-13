const listeners = new Set();

const state = {
  activeSort: 'time',  // 'number' | 'time'
  status: "loading",
  errorMessage: null,
  regatta: null,
  searchQuery: "",
  activeFilter: "all",
  activeDay: "all",      // "all" | "YYYY-MM-DD"
  visibleRaces: [],
  openRaces: new Set(),
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error("[state] Listener-Fehler:", e); }
  }
}

export function getState() {
  return state;
}
