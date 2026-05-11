/**
 * Gemeinsame Hilfsfunktionen.
 */

/**
 * Formatiert Millisekunden als Ruder-Zeit (m:ss.xx).
 * @param {number|null} ms
 * @returns {string}
 */
export function formatTime(ms) {
  if (ms == null) return "–";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

/**
 * Formatiert eine Differenz in ms als +s.xx.
 * @param {number|null} deltaMs
 * @returns {string}
 */
export function formatDelta(deltaMs) {
  if (deltaMs == null || deltaMs === 0) return "";
  const seconds = deltaMs / 1000;
  return `+${seconds.toFixed(2)}`;
}

/**
 * Formatiert ein ISO-Datum als "Sa, 14.06." (deutsches Kurzformat).
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Formatiert eine Startzeit als "10:30" (Uhrzeit).
 * @param {string|null} isoDateTime
 * @returns {string}
 */
export function formatClock(isoDateTime) {
  if (!isoDateTime) return "";
  const d = new Date(isoDateTime);
  const weekday = d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${weekday} ${time}`;
}

/**
 * Gibt den lesbaren Rundennamen zurück.
 * @param {string} roundCode
 * @param {number} heatNumber
 * @returns {string}
 */
export function formatRound(roundCode, heatNumber) {
  const names = {
    V: "Vorlauf",
    Q: "Viertelfinale",
    H: "Hoffnungslauf",
    S: "Halbfinale",
    FA: "Finale A",
    FB: "Finale B",
    FC: "Finale C",
    FD: "Finale D",
    R: "Finale",
    A: "Abteilung",
  };

  const name = names[roundCode] || roundCode || "Lauf";
  return heatNumber ? `${name} ${heatNumber}` : name;
}

/**
 * Formatiert "vor X Minuten" relativ zu jetzt.
 * @param {string} isoString
 * @returns {string}
 */
export function timeAgo(isoString) {
  if (!isoString) return "–";
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return "gerade eben";
  if (seconds < 60) return `vor ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `vor ${hours}h`;
}

/**
 * Prüft ob ein Sync-Zeitpunkt als „veraltet" gilt (> 3 min).
 * @param {string} isoString
 * @returns {boolean}
 */
export function isSyncStale(isoString) {
  if (!isoString) return true;
  return Date.now() - new Date(isoString).getTime() > 3 * 60 * 1000;
}

/**
 * Escapet HTML-Sonderzeichen.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Kürze: document.getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function $(id) {
  return document.getElementById(id);
}
