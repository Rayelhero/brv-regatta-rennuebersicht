#!/usr/bin/env bash
#
# Erstellt die AWS-Infrastruktur für Aquarius Web:
#   1. S3-Bucket (Website + Daten)
#   2. CloudFront-Distribution
#
# Voraussetzung: AWS CLI konfiguriert (aws configure)
#
# Nutzung:
#   chmod +x infra/setup.sh
#   ./infra/setup.sh <bucket-name>
#
# Beispiel:
#   ./infra/setup.sh meine-regatta-2026

set -euo pipefail

BUCKET="${1:?Bitte Bucket-Namen angeben: ./infra/setup.sh <bucket-name>}"
REGION="${AWS_REGION:-eu-central-1}"

echo "╔══════════════════════════════════════════════╗"
echo "║  Aquarius Web — AWS Setup                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Bucket:  $BUCKET"
echo "║  Region:  $REGION"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. S3-Bucket erstellen ─────────────────────────────────────

echo "→ S3-Bucket erstellen…"
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" \
  2>/dev/null || echo "  (Bucket existiert bereits)"

# Statisches Website-Hosting aktivieren
aws s3 website "s3://$BUCKET" \
  --index-document index.html \
  --error-document index.html

echo "  ✓ Bucket konfiguriert"

# ── 2. Bucket Policy für CloudFront (OAC) ──────────────────────

# Wir erstellen zunächst eine Policy, die öffentlichen Zugriff
# für CloudFront erlaubt. Bei Bedarf kann das auf OAC umgestellt
# werden (erfordert die CloudFront Distribution-ID).

echo "→ Bucket-Policy setzen…"
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForCloudFront",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/*"
    }
  ]
}
EOF

# Public Access Block entfernen (nötig für Website-Hosting)
aws s3api delete-public-access-block --bucket "$BUCKET" 2>/dev/null || true
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/bucket-policy.json
echo "  ✓ Policy gesetzt"

# ── 3. CORS für fetch()-Zugriff ────────────────────────────────

echo "→ CORS konfigurieren…"
cat > /tmp/cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedOrigins": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration file:///tmp/cors.json
echo "  ✓ CORS konfiguriert"

# ── 4. CloudFront Distribution ─────────────────────────────────

echo "→ CloudFront Distribution erstellen…"
echo "  (Dies kann 5-10 Minuten dauern)"

ORIGIN_DOMAIN="${BUCKET}.s3-website.${REGION}.amazonaws.com"

cat > /tmp/cf-config.json <<EOF
{
  "CallerReference": "aquarius-web-$(date +%s)",
  "Comment": "Aquarius Regatta Website",
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    },
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": { "Forward": "none" }
    },
    "MinTTL": 0,
    "DefaultTTL": 30,
    "MaxTTL": 60
  },
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-${BUCKET}",
        "DomainName": "${ORIGIN_DOMAIN}",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "PriceClass": "PriceClass_100"
}
EOF

CF_RESULT=$(aws cloudfront create-distribution \
  --distribution-config file:///tmp/cf-config.json \
  --output json 2>/dev/null || echo "EXISTING")

if [ "$CF_RESULT" = "EXISTING" ]; then
  echo "  (Distribution existiert möglicherweise bereits)"
  echo "  Prüfe: aws cloudfront list-distributions"
else
  CF_DOMAIN=$(echo "$CF_RESULT" | grep -o '"DomainName": "[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  ✓ Distribution erstellt"
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║  Website erreichbar unter:                   ║"
  echo "║  https://${CF_DOMAIN}"
  echo "╚══════════════════════════════════════════════╝"
fi

# ── Aufräumen ──────────────────────────────────────────────────

rm -f /tmp/bucket-policy.json /tmp/cors.json /tmp/cf-config.json

echo ""
echo "Nächste Schritte:"
echo "  1. .env befüllen (S3_BUCKET=$BUCKET)"
echo "  2. npm run deploy   (Website hochladen)"
echo "  3. npm run sync     (Sync starten)"
