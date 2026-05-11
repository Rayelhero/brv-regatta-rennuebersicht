import { config } from "./config.js";
import { closePool } from "./db/connection.js";
import * as queries from "./db/queries.js";
import { buildRegattaData } from "./transform/regatta.js";
import { uploadRegattaData, uploadSyncStatus } from "./upload/s3.js";

/**
 * Sync-Agent: Liest Regattadaten aus der Aquarius-MSSQL-Datenbank
 * und schreibt sie als JSON in den S3-Bucket.
 *
 * Aufruf:
 *   node sync/index.js          → läuft dauerhaft mit Intervall
 *   node sync/index.js --once   → einmaliger Sync, dann Ende
 */

const isOnce = process.argv.includes("--once");
let syncCount = 0;
let isRunning = false;

async function runSync() {
  if (isRunning) {
    console.log("[sync] Vorheriger Sync läuft noch, überspringe");
    return;
  }

  isRunning = true;
  const start = Date.now();

  try {
    console.log(`[sync] #${++syncCount} gestartet`);

    // 1. Daten aus Aquarius-DB laden
    const event = await queries.fetchEvent();

    if (!event) {
      console.log("[sync] Keine Veranstaltung gefunden");
      await uploadSyncStatus(buildStatus("warn", "Keine Veranstaltung", start));
      return;
    }

    // fetchOffers() liefert die Rennangebote (Offer-Tabelle = Rennklassen).
    // Im restlichen Code heißen sie weiterhin "races", da transform/regatta.js
    // und die Website diesen Begriff verwenden.
    const [races, entries, athletes, competitions, lineups, results] =
    await Promise.all([
      queries.fetchOffers(event.id),       // Offer → races
                      queries.fetchEntries(event.id),
                      queries.fetchAthletes(event.id),
                      queries.fetchCompetitions(event.id),
                      queries.fetchLineups(event.id),
                      queries.fetchResults(event.id),
    ]);

    // 2. In sauberes JSON transformieren
    const regattaData = buildRegattaData({
      event,
      races,       // wird in transform/regatta.js als "races" erwartet
      entries,
      athletes,
      competitions,
      lineups,
      results,
    });

    // 3. Nach S3 hochladen
    await uploadRegattaData(regattaData);

    const durationMs = Date.now() - start;
    const status = buildStatus("ok", null, start, {
      durationMs,
      raceCount: races.length,
      entryCount: entries.length,
      resultCount: results.length,
    });

    await uploadSyncStatus(status);
    console.log(`[sync] #${syncCount} abgeschlossen in ${durationMs} ms`);
  } catch (error) {
    const durationMs = Date.now() - start;
    console.error(`[sync] Fehler:`, error.message);
    await uploadSyncStatus(
      buildStatus("error", error.message, start, { durationMs })
    ).catch(() => {});
  } finally {
    isRunning = false;
  }
}

function buildStatus(state, message, startTime, extras = {}) {
  return {
    state,
    message,
    syncNumber: syncCount,
    timestamp: new Date().toISOString(),
    startedAt: new Date(startTime).toISOString(),
    intervalSeconds: config.sync.intervalSeconds,
    ...extras,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────

async function main() {
  console.log(`[sync] Aquarius Web Sync-Agent`);
  console.log(`[sync] DB: ${config.db.host}:${config.db.port}/${config.db.database}`);
  console.log(`[sync] S3: ${config.aws.bucket} (${config.aws.region})`);
  console.log(`[sync] Intervall: ${config.sync.intervalSeconds}s`);

  await runSync();

  if (isOnce) {
    await closePool();
    process.exit(0);
  }

  const intervalMs = config.sync.intervalSeconds * 1000;
  const timer = setInterval(runSync, intervalMs);

  const shutdown = async () => {
    console.log("\n[sync] Beende...");
    clearInterval(timer);
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[sync] Fataler Fehler:", err);
  process.exit(1);
});
