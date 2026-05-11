# Aquarius Web — Regatta Live-Ergebnisse

Öffentliche Website zur Darstellung von Rennen, Meldungen und Ergebnissen
einer Aquarius-Regatta. Die Daten werden regelmäßig aus der lokalen
Aquarius-MSSQL-Datenbank gezogen und als JSON in einen S3-Bucket geschrieben.
Die Website ist vollständig statisch und wird über CloudFront ausgeliefert.

## Architektur

```
┌─────────────────────┐       JSON/S3 PUT        ┌──────────────┐
│  Lokaler Rechner    │ ──────────────────────▶   │  AWS S3       │
│  (Regattaort)       │   alle 60 s              │  Bucket       │
│                     │                           │               │
│  Aquarius MSSQL     │                           │  regatta.json │
│       ▲             │                           │  status.json  │
│       │ SQL         │                           │  index.html   │
│  Sync-Agent (Node)  │                           │  css/  js/    │
└─────────────────────┘                           └───────┬───────┘
                                                          │
                                                   CloudFront CDN
                                                          │
                                                    ┌─────▼─────┐
                                                    │  Browser   │
                                                    │  (2000+)   │
                                                    └───────────┘
```

## Projektstruktur

```
aquarius-web/
├── sync/                   Sync-Agent (Node.js)
│   ├── index.js            Einstiegspunkt, Scheduler
│   ├── config.js           Konfiguration aus Umgebungsvariablen
│   ├── db/
│   │   ├── connection.js   MSSQL-Verbindungsmanagement
│   │   └── queries.js      SQL-Abfragen gegen Aquarius-DB
│   ├── transform/
│   │   └── regatta.js      DB-Zeilen → sauberes JSON
│   └── upload/
│       └── s3.js           S3-Upload mit Status-Tracking
├── website/                Statische Website
│   ├── index.html          Hauptseite
│   ├── css/
│   │   └── style.css       Styles
│   ├── js/
│   │   ├── app.js          Initialisierung, Daten laden
│   │   ├── state.js        Zentraler State-Container
│   │   ├── search.js       Such- und Filterlogik
│   │   ├── render.js       DOM-Rendering
│   │   └── utils.js        Hilfsfunktionen
│   └── admin/
│       └── index.html      Admin-Statusseite
├── infra/
│   └── setup.sh            AWS-Ressourcen anlegen (CLI)
├── package.json
├── .env.example
└── README.md
```

## Setup

### Voraussetzungen

- Node.js ≥ 18
- AWS CLI konfiguriert mit passendem Profil
- Zugang zur Aquarius-MSSQL-Datenbank

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Konfiguration

```bash
cp .env.example .env
# .env mit den eigenen Werten befüllen
```

### 3. AWS-Infrastruktur anlegen

```bash
chmod +x infra/setup.sh
./infra/setup.sh
```

### 4. Website deployen

```bash
npm run deploy
```

### 5. Sync starten

```bash
npm run sync
```

## Befehle

| Befehl             | Beschreibung                              |
|--------------------| ----------------------------------------- |
| `npm run sync`     | Sync-Agent starten (läuft dauerhaft)      |
| `npm run sync:once`| Einmaliger Sync (für Tests)               |
| `npm run deploy`   | Website-Dateien nach S3 deployen          |
| `npm run dev`      | Website lokal mit Live-Server entwickeln  |
