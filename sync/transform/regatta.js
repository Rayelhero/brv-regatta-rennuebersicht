export function buildRegattaData(raw) {
  const { event, races, entries, athletes, competitions, lineups, results } = raw;

  if (!event) return { event: null, races: [], clubs: [], lastSync: now() };

  const athletesByEntry = groupBy(athletes, "entryId");
  const lineupsByComp = groupBy(lineups, "compId");
  const resultsByComp = groupBy(results, "compId");
  const entriesByRace = groupBy(entries, "raceId");
  const compsByRace = groupBy(competitions, "raceId");

  const clubs = buildClubList(entries);

  const enrichedRaces = races.map((race) => ({
    id: race.id,
    number: race.number,
    shortLabel: race.shortLabel,
    longLabel: race.longLabel,
    distance: race.distance,
    isLightweight: Boolean(race.isLightweight),
                                             comment: race.comment || null,
                                             entryCount: (entriesByRace[race.id] || []).filter((e) => !e.isCancelled).length,
                                             entries: buildEntries(entriesByRace[race.id] || [], athletesByEntry),
                                             competitions: buildCompetitions(compsByRace[race.id] || [], lineupsByComp, resultsByComp),
  }));

  return {
    event: {
      id: event.id,
      title: event.title,
      subTitle: event.subTitle || null,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location || null,
      url: event.url || null,
      defaultDistance: event.defaultDistance ?? null,
        enableLiveResults: Boolean(event.enableLiveResults),
        club: event.clubId ? { id: event.clubId, short: event.clubShort, name: event.clubName } : null,
        raceMode: event.raceModeId ? { id: event.raceModeId, title: event.raceModeTitle } : null,
    },
    races: enrichedRaces,
    clubs,
    lastSync: now(),
  };
}

function buildEntries(entries, athletesByEntry) {
  return entries.map((entry) => ({
    id: entry.id,
    bowNumber: entry.bowNumber,
    boatLabel: entry.boatLabelLong || entry.boatLabelShort || null,
    isCancelled: Boolean(entry.cancelValue),
                                 isLate: Boolean(entry.isLate),
                                 bibPrefix: entry.bibPrefix || null,
                                 comment: entry.comment || null,
                                 club: {
                                   id: entry.clubId,
                                   short: entry.clubShort,
                                   name: entry.clubName,
                                 },
                                 athletes: (athletesByEntry[entry.id] || []).map((a) => ({
                                   id: a.athleteId,
                                   firstName: a.firstName,
                                   lastName: a.lastName,
                                   gender: a.gender,
                                   dateOfBirth: a.dateOfBirth,
                                   position: a.position,
                                   isCox: Boolean(a.isCox),
                                                                                         clubId: a.clubId,
                                 })),
  }));
}

function buildCompetitions(comps, lineupsByComp, resultsByComp) {
  return comps.map((comp) => {
    const compResults = resultsByComp[comp.id] || [];
    const compLineups = lineupsByComp[comp.id] || [];
    const hasResults = compResults.length > 0 && comp.state === 4;

    return {
      id: comp.id,
      round: comp.round,
      roundCode: comp.roundCode,
      heatNumber: comp.heatNumber,
      label: comp.label || null,
      groupValue: comp.groupValue ?? null,
      scheduledStart: comp.scheduledStart,
      status: comp.state,
      number: comp.number,
      isLocked: Boolean(comp.isLocked),
                   isDummy: Boolean(comp.isDummy),
                   isCancelled: Boolean(comp.isCancelled),
                   distance: comp.distance ?? null,
                   hasResults,
                   boats: hasResults
                   ? compResults.map((r) => ({
                     ceId: r.ceId,
                     entryId: r.entryId,
                     lane: r.lane,
                     rank: r.rank,
                     splitNr: r.splitNr,
                     dayTimeMs: r.dayTimeMs,
                     finalTimeMs: r.finalTimeMs,
                     deltaMs: r.deltaMs,
                     sortValue: r.sortValue,
                     displayValue: r.displayValue,
                     params: r.params,
                     resultType: r.resultType,
                     displayType: r.displayType,
                     comment: r.comment,
                   }))
                   : compLineups.map((l) => ({
                     ceId: null,
                     entryId: l.entryId,
                     lane: l.lane,
                     rank: null,
                     splitNr: null,
                     dayTimeMs: null,
                     finalTimeMs: null,
                     deltaMs: null,
                     sortValue: null,
                     displayValue: null,
                     params: null,
                     resultType: null,
                     displayType: null,
                     comment: null,
                   })),
    };
  });
}

function buildClubList(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!seen.has(entry.clubId)) {
      seen.set(entry.clubId, { id: entry.clubId, short: entry.clubShort, name: entry.clubName });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function groupBy(items, key) {
  const map = {};
  for (const item of items) {
    const k = item[key];
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

function now() {
  return new Date().toISOString();
}
