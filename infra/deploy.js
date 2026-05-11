/**
 * Deployment-Script: Lädt die statische Website nach S3.
 *
 * Setzt korrekte Content-Types und Cache-Header.
 * Website-Assets werden länger gecached als Daten.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || "eu-central-1";
const WEBSITE_DIR = new URL("../website", import.meta.url).pathname;

if (!BUCKET) {
  console.error("S3_BUCKET nicht in .env gesetzt");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

/**
 * Sammelt rekursiv alle Dateien in einem Verzeichnis.
 */
function collectFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push({
        localPath: full,
        s3Key: relative(base, full),
      });
    }
  }
  return files;
}

async function deploy() {
  const files = collectFiles(WEBSITE_DIR);
  console.log(`Deploye ${files.length} Dateien nach s3://${BUCKET}/\n`);

  for (const file of files) {
    if (file.s3Key.startsWith("data/")) continue;
    const ext = extname(file.localPath);
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

    // HTML/JS: kurzer Cache (30s), Assets (CSS/Fonts): länger (1h)
    const isAsset = [".css", ".svg", ".png", ".ico"].includes(ext);
    const cacheControl = isAsset
      ? "public, max-age=3600"
      : "public, max-age=30";

    const body = readFileSync(file.localPath);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: file.s3Key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }));

    console.log(`  ✓ ${file.s3Key} (${contentType})`);
  }

  console.log(`\n✓ Deploy abgeschlossen`);
  console.log(`  https://${BUCKET}.s3-website.${REGION}.amazonaws.com`);
}

deploy().catch((err) => {
  console.error("Deploy fehlgeschlagen:", err);
  process.exit(1);
});
