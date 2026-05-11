import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config.js";

/**
 * S3-Upload für Regatta-Daten und Sync-Status.
 *
 * Schreibt JSON-Dateien mit korrektem Content-Type und
 * kurzer Cache-Duration, damit CloudFront regelmäßig
 * frische Daten holt.
 */

const s3 = new S3Client({ region: config.aws.region });
const BUCKET = config.aws.bucket;

/**
 * Lädt die Regatta-Daten als JSON nach S3.
 *
 * @param {object} data - Das vollständige Regatta-Objekt
 */
export async function uploadRegattaData(data) {
  await putJson("data/regatta.json", data, { cacheTtl: 30 });
}

/**
 * Aktualisiert die Status-Datei für das Admin-Interface.
 *
 * @param {object} status - Sync-Metadaten
 */
export async function uploadSyncStatus(status) {
  await putJson("data/status.json", status, { cacheTtl: 10 });
}

// ── Internals ─────────────────────────────────────────────────

async function putJson(key, data, { cacheTtl = 60 } = {}) {
  const body = JSON.stringify(data);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/json; charset=utf-8",
    CacheControl: `public, max-age=${cacheTtl}`,
  });

  await s3.send(command);
  const sizeKb = (Buffer.byteLength(body) / 1024).toFixed(1);
  console.log(`[s3] ${key} hochgeladen (${sizeKb} KB)`);
}
