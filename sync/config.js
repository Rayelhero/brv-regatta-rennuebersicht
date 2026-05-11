import "dotenv/config";

/**
 * Zentrale Konfiguration aus Umgebungsvariablen.
 *
 * Fehlende Pflichtfelder führen sofort zum Abbruch,
 * damit Fehler nicht erst zur Laufzeit auffallen.
 */

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    console.error(`[config] Fehlende Umgebungsvariable: ${key}`);
    process.exit(1);
  }
  return value;
}

export const config = Object.freeze({
  db: {
    host: requireEnv("DB_HOST"),
    port: parseInt(process.env.DB_PORT || "1433", 10),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
  },

  aws: {
    region: process.env.AWS_REGION || "eu-central-1",
    bucket: requireEnv("S3_BUCKET"),
  },

  sync: {
    intervalSeconds: parseInt(process.env.SYNC_INTERVAL_SECONDS || "60", 10),
    eventId: process.env.EVENT_ID ? parseInt(process.env.EVENT_ID, 10) : null,
  },
});
