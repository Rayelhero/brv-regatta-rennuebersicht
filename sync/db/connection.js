import sql from "mssql";
import { config } from "../config.js";

/**
 * MSSQL-Verbindungspool.
 *
 * Verwendet einen Connection-Pool, der bei Bedarf aufgebaut
 * und bei Programmende sauber geschlossen wird.
 */

const poolConfig = {
  server: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 5,
    min: 1,
    idleTimeoutMillis: 30_000,
  },
};

let pool = null;

/** Gibt den aktiven Connection-Pool zurück (lazy init). */
export async function getPool() {
  if (!pool) {
    pool = await new sql.ConnectionPool(poolConfig).connect();
    console.log("[db] Verbindung hergestellt");
  }
  return pool;
}

/** Schließt den Pool sauber — für graceful shutdown. */
export async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log("[db] Verbindung geschlossen");
  }
}
