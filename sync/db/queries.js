import { getPool } from "./connection.js";
import { config } from "../config.js";

export async function fetchEvent() {
  const pool = await getPool();
  const { eventId } = config.sync;

  const result = await pool.request().query(
    eventId
    ? `SELECT TOP 1 e.Event_ID AS id, e.Event_Title AS title,
    e.Event_SubTitle AS subTitle, e.Event_StartDate AS startDate,
    e.Event_EndDate AS endDate, e.Event_Venue AS location,
    e.Event_Url AS url, e.Event_DefaultDistance AS defaultDistance,
    e.Event_EnableLiveResults AS enableLiveResults,
    c.Club_ID AS clubId, c.Club_Name AS clubName, c.Club_Abbr AS clubShort,
    rm.RaceMode_ID AS raceModeId, rm.RaceMode_Title AS raceModeTitle
    FROM Event e
    LEFT JOIN Club c ON c.Club_ID = e.Event_Club_ID_FK
    LEFT JOIN RaceMode rm ON rm.RaceMode_ID = e.Event_DefaultRaceMode_ID_FK
    WHERE e.Event_ID = ${eventId}`
    : `SELECT TOP 1 e.Event_ID AS id, e.Event_Title AS title,
    e.Event_SubTitle AS subTitle, e.Event_StartDate AS startDate,
    e.Event_EndDate AS endDate, e.Event_Venue AS location,
    e.Event_Url AS url, e.Event_DefaultDistance AS defaultDistance,
    e.Event_EnableLiveResults AS enableLiveResults,
    c.Club_ID AS clubId, c.Club_Name AS clubName, c.Club_Abbr AS clubShort,
    rm.RaceMode_ID AS raceModeId, rm.RaceMode_Title AS raceModeTitle
    FROM Event e
    LEFT JOIN Club c ON c.Club_ID = e.Event_Club_ID_FK
    LEFT JOIN RaceMode rm ON rm.RaceMode_ID = e.Event_DefaultRaceMode_ID_FK
    ORDER BY e.Event_StartDate DESC`
  );
  return result.recordset[0] || null;
}

export async function fetchOffers(eventId) {
  const pool = await getPool();
  const result = await pool.request()
  .input("eventId", eventId)
  .query(`
  SELECT
  o.Offer_ID AS id,
  o.Offer_RaceNumber AS number,
  o.Offer_ShortLabel AS shortLabel,
  o.Offer_LongLabel AS longLabel,
  o.Offer_Distance AS distance,
  o.Offer_IsLightweight AS isLightweight,
  o.Offer_Comment AS comment,
  o.Offer_Cancelled AS isCancelled,
  o.Offer_SortValue AS sortValue,
  o.Offer_RaceMode_ID_FK AS raceModeDetailId
  FROM Offer o
  WHERE o.Offer_Event_ID_FK = @eventId
  ORDER BY o.Offer_SortValue, o.Offer_RaceNumber, o.Offer_ID
  `);
  return result.recordset;
}

export async function fetchEntries(eventId) {
  const pool = await getPool();
  const result = await pool.request()
  .input("eventId", eventId)
  .query(`
  SELECT
  e.Entry_ID AS id,
  e.Entry_Event_ID_FK AS eventId,
  e.Entry_Race_ID_FK AS raceId,
  e.Entry_Bib AS bowNumber,
  e.Entry_BoatNumber AS boatNumber,
  e.Entry_Comment AS comment,
  e.Entry_GroupValue AS groupValue,
  e.Entry_CancelValue AS cancelValue,
  e.Entry_IsLate AS isLate,
  e.Entry_BibPrefix AS bibPrefix,
  cl.Club_ID AS clubId,
  cl.Club_Abbr AS clubShort,
  cl.Club_Name AS clubName,
  lbl.Label_ID AS labelId,
  lbl.Label_Short AS boatLabelShort,
  lbl.Label_Long AS boatLabelLong,
  lbl.Label_IsTeam AS isTeam
  FROM Entry e
  LEFT JOIN Club cl ON cl.Club_ID = e.Entry_OwnerClub_ID_FK
  OUTER APPLY (
    SELECT TOP 1 l.*
    FROM EntryLabel el
    JOIN Label l ON l.Label_ID = el.EL_Label_ID_FK
    WHERE el.EL_Entry_ID_FK = e.Entry_ID
    AND (el.EL_RoundFrom IS NULL OR el.EL_RoundFrom <= 32767)
    AND (el.EL_RoundTo IS NULL OR el.EL_RoundTo >= 0)
    ORDER BY el.EL_RoundFrom DESC, el.EL_RoundTo DESC, el.EL_ID DESC
  ) lbl
  WHERE e.Entry_Event_ID_FK = @eventId
  ORDER BY e.Entry_Race_ID_FK, e.Entry_Bib, e.Entry_ID
  `);
  return result.recordset;
}

export async function fetchAthletes(eventId) {
  const pool = await getPool();
  const result = await pool.request()
  .input("eventId", eventId)
  .query(`
  SELECT
  cr.Crew_Entry_ID_FK AS entryId,
  a.Athlet_ID AS athleteId,
  a.Athlet_FirstName AS firstName,
  a.Athlet_LastName AS lastName,
  a.Athlet_Gender AS gender,
  a.Athlet_DOB AS dateOfBirth,
  cr.Crew_Pos AS position,
  cr.Crew_IsCox AS isCox,
  cr.Crew_Club_ID_FK AS clubId
  FROM Crew cr
  JOIN Athlet a ON a.Athlet_ID = cr.Crew_Athlete_ID_FK
  JOIN Entry e ON e.Entry_ID = cr.Crew_Entry_ID_FK
  WHERE e.Entry_Event_ID_FK = @eventId
  ORDER BY cr.Crew_Entry_ID_FK, cr.Crew_Pos, a.Athlet_LastName, a.Athlet_FirstName
  `);
  return result.recordset;
}

export async function fetchCompetitions(eventId) {
  const pool = await getPool();
  const result = await pool.request()
  .input("eventId", eventId)
  .query(`
  SELECT
  c.Comp_ID AS id,
  c.Comp_Race_ID_FK AS raceId,
  c.Comp_Event_ID_FK AS eventId,
  c.Comp_Round AS round,
  c.Comp_HeatNumber AS heatNumber,
  c.Comp_RoundCode AS roundCode,
  c.Comp_Label AS label,
  c.Comp_GroupValue AS groupValue,
  CONVERT(varchar(19), c.Comp_DateTime, 126) AS scheduledStart,
  c.Comp_State AS state,
  c.Comp_Number AS number,
  c.Comp_Locked AS isLocked,
  c.Comp_Dummy AS isDummy,
  c.Comp_Cancelled AS isCancelled,
  c.Comp_Distance AS distance,
  rm.RaceMode_ID AS raceModeId,
  rm.RaceMode_Title AS raceModeTitle,
  rmd.RMLap_ID AS raceModeDetailId
  FROM Comp c
  LEFT JOIN RaceMode_Detail rmd ON rmd.RMLap_ID = c.Comp_RMDetail_ID_FK
  LEFT JOIN RaceMode_Range rmr ON rmr.RMRange_ID = rmd.RMLap_Range_ID_FK
  LEFT JOIN RaceMode rm ON rm.RaceMode_ID = rmr.RMRange_RM_ID_FK
  WHERE c.Comp_Event_ID_FK = @eventId
  ORDER BY c.Comp_DateTime, c.Comp_Number, c.Comp_ID
  `);
  return result.recordset;
}

export async function fetchLineups(eventId) {
  const pool = await getPool();
  const result = await pool.request()
  .input("eventId", eventId)
  .query(`
  SELECT
  ce.CE_Comp_ID_FK AS compId,
  ce.CE_Entry_ID_FK AS entryId,
  ce.CE_Lane AS lane,
  ce.CE_HasYellowCard AS hasYellowCard
  FROM CompEntries ce
  JOIN Comp c ON c.Comp_ID = ce.CE_Comp_ID_FK
  WHERE c.Comp_Event_ID_FK = @eventId
  ORDER BY ce.CE_Comp_ID_FK, ce.CE_Lane, ce.CE_ID
  `);
  return result.recordset;
}

export async function fetchResults(eventId) {
  const pool = await getPool();
  const result = await pool.request()
  .input("eventId", eventId)
  .query(`
  SELECT
  r.Result_CE_ID_FK AS ceId,
  ce.CE_Comp_ID_FK AS compId,
  ce.CE_Entry_ID_FK AS entryId,
  ce.CE_Lane AS lane,
  r.Result_SplitNr AS splitNr,
  r.Result_DayTime AS dayTimeMs,
  r.Result_NetTime AS finalTimeMs,
  r.Result_Delta AS deltaMs,
  r.Result_Rank AS rank,
  r.Result_SortValue AS sortValue,
  r.Result_DisplayValue AS displayValue,
  r.Result_Params AS params,
  r.Result_ResultType AS resultType,
  r.Result_DisplayType AS displayType,
  r.Result_Comment AS comment
  FROM Result r
  JOIN CompEntries ce ON ce.CE_ID = r.Result_CE_ID_FK
  JOIN Comp c ON c.Comp_ID = ce.CE_Comp_ID_FK
  WHERE c.Comp_Event_ID_FK = @eventId
  AND c.Comp_State = 4
  AND r.Result_SplitNr = (
    SELECT MAX(r2.Result_SplitNr)
    FROM Result r2
    WHERE r2.Result_CE_ID_FK = r.Result_CE_ID_FK
  )
  ORDER BY ce.CE_Comp_ID_FK, r.Result_SortValue, r.Result_Rank
  `);
  return result.recordset;
}
