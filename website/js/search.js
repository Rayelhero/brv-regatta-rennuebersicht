/**
 * Such- und Filterlogik für die Rennliste.
 */

/**
 * Ermittelt den aggregierten Status eines Rennens.
 *
 * Comp_State-Werte (Aquarius):
 *   0/1 = geplant
 *   2   = laufend
 *   3/5 = beendet (inoffiziell) → zeigen als laufend
 *   4   = offiziell → beendet
 */
export function getRaceStatus(race) {
  const comps = race.competitions || [];
  if (comps.length === 0) return "scheduled";

  if (comps.every((c) => c.status === 4))                    return "finished";
  if (comps.some((c) => c.status === 2))                     return "running";
  if (comps.some((c) => c.status === 3 || c.status === 5))   return "im_ziel";
  return "scheduled";
}

/**
 * Gibt alle einzigartigen Regatta-Tage (YYYY-MM-DD) sortiert zurück.
 */
export function getRegattaDays(races) {
  const days = new Set();
  for (const race of races) {
    for (const comp of race.competitions || []) {
      if (comp.scheduledStart) {
        days.add(comp.scheduledStart.slice(0, 10));
      }
    }
  }
  return [...days].sort();
}

/**
 * Filtert und durchsucht die Rennliste.
 */
export function filterRaces(races, query, filter, activeDay = "all", activeSort = "number") {
  let result = races;

  result = result.filter((race) =>
  (race.competitions || []).some((c) => c.scheduledStart)
  );

  if (filter !== "all") {
    result = result.filter((race) => getRaceStatus(race) === filter);
  }

  if (activeDay !== "all") {
    result = result.filter((race) =>
      (race.competitions || []).some(
        (c) => c.scheduledStart && c.scheduledStart.slice(0, 10) === activeDay
      )
    );
  }

  if (query.trim()) {
    const terms = normalizeQuery(query);
    result = result.filter((race) => matchesRace(race, terms));
  }

  if (activeSort === 'time') {
    result = [...result].sort((a, b) => {
      const ta = firstCompStart(a) || 'zzz';
      const tb = firstCompStart(b) || 'zzz';
      return ta.localeCompare(tb);
    });
  } else {
    // Nach Rennnummer — führende Zahl numerisch, Rest alphabetisch
    result = [...result].sort((a, b) => {
      const na = parseFloat(a.number) || 0;
      const nb = parseFloat(b.number) || 0;
      return na !== nb ? na - nb : String(a.number).localeCompare(String(b.number));
    });
  }

  return result;
}

function normalizeQuery(query) {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function firstCompStart(race) {
  for (const c of race.competitions || [])
    if (c.scheduledStart) return c.scheduledStart;
    return null;
}

function matchesRace(race, terms) {
  return terms.every((term) => buildSearchHaystack(race).includes(term));
}

function buildSearchHaystack(race) {
  const parts = [race.number, race.shortLabel, race.longLabel, race.comment];
  for (const entry of race.entries || []) {
    parts.push(entry.boatLabel, entry.club?.short, entry.club?.name, entry.bowNumber?.toString());
    for (const a of entry.athletes || []) parts.push(a.firstName, a.lastName);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}
