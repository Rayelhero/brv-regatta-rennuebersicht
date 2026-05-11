# Aquarius Web — Projektdokumentation

> Öffentliche Live-Ergebnisseite für Ruder-Regatten auf Basis von Aquarius, AWS S3 und CloudFront.

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Architektur](#2-architektur)
3. [Voraussetzungen](#3-voraussetzungen)
4. [Projektstruktur](#4-projektstruktur)
5. [Konfiguration (.env)](#5-konfiguration-env)
6. [AWS-Infrastruktur](#6-aws-infrastruktur)
7. [Sync-Agent](#7-sync-agent)
8. [Website (Frontend)](#8-website-frontend)
9. [Deployment](#9-deployment)
10. [Befehle (npm scripts)](#10-befehle-npm-scripts)
11. [Aquarius-Datenbankschema](#11-aquarius-datenbankschema)
12. [Bekannte Eigenheiten & Fallstricke](#12-bekannte-eigenheiten--fallstricke)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Überblick

**Aquarius Web** stellt Regattadaten aus der lokalen Aquarius-Software öffentlich im Browser dar — ohne dass der Aquarius-Server direkt aus dem Internet erreichbar sein muss.

Ein lokaler **Sync-Agent** liest minütlich aus der Aquarius-MSSQL-Datenbank, transformiert die Daten in ein sauberes JSON-Format und schreibt sie in einen **AWS S3 Bucket**. Eine vollständig **statische Website** (HTML + CSS + JavaScript) liegt ebenfalls in S3 und wird über **AWS CloudFront** (CDN) weltweit ausgeliefert. Der Browser lädt beim Öffnen die JSON-Daten per `fetch()` und rendert alles clientseitig — kein Server-Rendering, kein Backend.

**Unterstützte Ansichten:**
- Rennliste mit Status (Geplant / Laufend / Beendet)
- Meldungen (Boote, Athleten, Vereine) je Rennen
- Einteilungen (Bahn, Startnummer) je Lauf
- Offizielle Ergebnisse (Platz, Zeit, Rückstand)
- Filter nach Status und Regatta-Tag
- Volltextsuche (Rennen, Verein, Athlet, Startnummer)

---

## 2. Architektur

```
┌─────────────────────────────┐
│  Lokaler Rechner            │
│                             │
│  ┌─────────────────────┐    │
│  │  Aquarius (Windows) │    │
│  │  via Winboat/Docker │    │
│  │                     │    │
│  │  MSSQL-Server :1433 │    │
│  │  Datenbank: Rudern  │    │
│  └────────┬────────────┘    │
│           │ SQL-Abfragen    │
│  ┌────────▼────────────┐    │
│  │  Sync-Agent (Node)  │    │
│  │  npm run sync       │    │
│  │  alle 60 Sekunden   │    │
│  └────────┬────────────┘    │
│           │ HTTPS PUT       │
└───────────┼─────────────────┘
            │
            ▼
┌───────────────────────────┐
│  AWS S3 Bucket            │
│                           │
│  data/regatta.json  ◄─────┤ Sync-Agent schreibt
│  data/status.json   ◄─────┤
│                           │
│  index.html               │
│  css/style.css            │ Deploy-Script schreibt
│  js/*.js                  │
│  admin/index.html         │
└────────────┬──────────────┘
             │ CloudFront Origin
             ▼
┌───────────────────────────┐
│  AWS CloudFront (CDN)     │
│  Cache TTL: 30s (JSON)    │
│             1h  (Assets)  │
└────────────┬──────────────┘
             │ HTTPS
             ▼
┌───────────────────────────┐
│  Browser (bis 2000 User)  │
│  Fetch → JSON → Render    │
│  Auto-Refresh: 60s        │
└───────────────────────────┘
```

**Warum statisch?** Die Aquarius-MSSQL-Datenbank soll nicht direkt unter Last von 2000 simultanen Nutzern stehen. Der Sync-Agent entkoppelt die Last komplett: Die DB bekommt maximal eine Abfrage pro Minute, egal wie viele Nutzer gleichzeitig auf die Website zugreifen. CloudFront cached die JSON-Datei zusätzlich, sodass S3 ebenfalls nur selten angefragt wird.

---

## 3. Voraussetzungen

### Lokal (Fedora)
- **Node.js ≥ 18** (`node --version`)
- **npm** (kommt mit Node.js)
- **AWS CLI v2** — Installation:
  ```bash
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip awscliv2.zip && sudo ./aws/install
  ```
- **Aquarius** läuft in Winboat (Windows 11 in Docker via `dockur/windows`)
- **MSSQL-Server** lauscht auf `localhost:1433` (durch Winboat-Port-Mapping)
- Nur **eine** MSSQL-Instanz auf Port 1433 aktiv (kein weiterer lokaler SQL Server)

### AWS
- AWS-Account mit IAM-User (Berechtigungen: `AmazonS3FullAccess`, `CloudFrontFullAccess`)
- Konfiguriert via `aws configure` (Access Key, Secret Key, Region `eu-central-1`)

---

## 4. Projektstruktur

```
aquarius-web/
│
├── sync/                        Sync-Agent (läuft lokal)
│   ├── index.js                 Einstiegspunkt & Scheduler
│   ├── config.js                Konfiguration aus .env
│   ├── db/
│   │   ├── connection.js        MSSQL Connection Pool
│   │   └── queries.js           Alle SQL-Abfragen
│   ├── transform/
│   │   └── regatta.js           DB-Zeilen → JSON-Struktur
│   └── upload/
│       └── s3.js                S3-Upload (regatta.json, status.json)
│
├── website/                     Statische Website (wird nach S3 deployt)
│   ├── index.html               Hauptseite
│   ├── admin/
│   │   └── index.html           Admin-Statusseite
│   ├── css/
│   │   └── style.css            Alle Styles (Design Tokens, Layout, Komponenten)
│   ├── js/
│   │   ├── app.js               Initialisierung, Datenladen, Event-Handler
│   │   ├── state.js             Zentraler State-Container (reaktiv)
│   │   ├── search.js            Such- und Filterlogik
│   │   ├── render.js            DOM-Rendering
│   │   └── utils.js             Hilfsfunktionen (Zeitformatierung etc.)
│   └── data/
│       ├── regatta.json         Platzhalterdaten (wird vom Sync überschrieben)
│       └── status.json          Sync-Status (wird vom Sync überschrieben)
│
├── infra/
│   ├── setup.sh                 AWS-Ressourcen anlegen (einmalig)
│   └── deploy.js                Website-Dateien nach S3 hochladen
│
├── .env                         Lokale Konfiguration (nicht ins Git!)
├── .env.example                 Vorlage für .env
├── package.json
└── package-lock.json
```

> **Wichtig:** `website/data/` wird **nicht** vom Deploy-Script hochgeladen — diese Dateien werden ausschließlich vom Sync-Agent verwaltet. Das verhindert, dass Platzhalterdaten die echten Regattadaten überschreiben.

---

## 5. Konfiguration (.env)

Kopiere `.env.example` nach `.env` und befülle alle Werte:

```env
# ── Aquarius MSSQL-Datenbank ─────────────────────────────────
DB_HOST=localhost          # Host des MSSQL-Servers
DB_PORT=1433               # Standard-Port (Winboat mapped diesen durch)
DB_USER=SA                 # SQL Server SA-User
DB_PASSWORD=               # SA-Passwort (aus Aquarius-Installation)
DB_NAME=Rudern             # Datenbankname (immer "Rudern" bei Aquarius)

# ── AWS ──────────────────────────────────────────────────────
AWS_REGION=eu-central-1    # AWS-Region (Frankfurt)
S3_BUCKET=mein-bucket-name # Name des S3-Buckets (weltweit eindeutig!)

# ── Sync-Einstellungen ────────────────────────────────────────
SYNC_INTERVAL_SECONDS=60   # Wie oft sync läuft (Sekunden)

# ── Veranstaltungsauswahl ─────────────────────────────────────
# Leer = automatisch die neueste Veranstaltung nach Startdatum.
# Zahl = immer diese Event_ID synchen (bei mehreren Veranstaltungen in der DB).
EVENT_ID=

# ── Admin ────────────────────────────────────────────────────
ADMIN_PASSWORD=changeme    # Passwort für /admin/ Seite
```

### Welche Event_ID hat meine Veranstaltung?

```sql
SELECT Event_ID, Event_Title, Event_StartDate
FROM Event
ORDER BY Event_StartDate DESC
```

In Azure Data Studio oder SSMS ausführen, dann die gewünschte `Event_ID` in `.env` eintragen.

---

## 6. AWS-Infrastruktur

### Einmalig: Infrastruktur anlegen

```bash
chmod +x infra/setup.sh
./infra/setup.sh mein-bucket-name
```

Das Script erstellt automatisch:

| Ressource | Details |
|---|---|
| **S3 Bucket** | Website-Hosting aktiviert, öffentlich lesbar |
| **Bucket Policy** | `s3:GetObject` für alle (`*`) |
| **CORS** | GET-Requests von allen Origins erlaubt |
| **CloudFront Distribution** | Origin: S3-Website-Endpoint, TTL 30s, HTTPS |

Am Ende gibt das Script die CloudFront-URL aus (`https://dXXXXXXXXX.cloudfront.net`).

### CloudFront konfigurieren

**Origin Path muss leer sein.** Wenn die Website falsche Inhalte zeigt (JS-Fehler "MIME type text/html"), ist der Origin Path in CloudFront auf `/index.html` gesetzt — das muss entfernt werden:

1. AWS Console → CloudFront → Distribution → Tab **Origins**
2. Origin anklicken → **Edit**
3. Feld **Origin path** komplett leeren
4. **Save changes** → Cache leeren

### Cache leeren (Invalidation)

Nach jedem `npm run deploy` und wenn Änderungen nicht sofort sichtbar sind:

```bash
aws cloudfront create-invalidation \
  --distribution-id DEINE_DISTRIBUTION_ID \
  --paths "/*"
```

Die Distribution-ID findest du mit:

```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[*].[Id,DomainName]" \
  --output table
```

### Kosten (Richtwert)

| Dienst | Kosten |
|---|---|
| S3 Storage + Requests | < 0,10 €/Regatta |
| CloudFront | 0 € (Free Tier: 1 TB/Monat, 10 Mio. Requests) |
| **Gesamt** | **~0 € pro Regatta-Wochenende** |

> CloudFront hat ein dauerhaftes Free Tier (nicht zeitlich begrenzt). Bei einer Regatta mit 2000 Nutzern bewegen sich die Datenmengen weit unter den Limits.

---

## 7. Sync-Agent

### Starten

```bash
# Dauerhafter Betrieb (empfohlen während Regatta)
npm run sync

# Einmaliger Lauf (zum Testen)
npm run sync:once
```

### Ablauf eines Sync-Zyklus

```
1. fetchEvent()        → Welche Veranstaltung? (Event_ID aus .env oder neueste)
2. fetchOffers()       → Alle Rennen (Offer-Tabelle = Rennklassen)
3. fetchEntries()      → Alle Meldungen (Boote + Vereine + Labels)
4. fetchAthletes()     → Alle Athleten je Meldung (Crew-Tabelle)
5. fetchCompetitions() → Alle Läufe (Comp-Tabelle = Abteilungen/Heats)
6. fetchLineups()      → Einteilungen (welches Boot auf welcher Bahn)
7. fetchResults()      → Ergebnisse (nur offizielle: Comp_State = 4)
         │
         ▼
8. buildRegattaData()  → Alles zu einem JSON-Objekt zusammenführen
         │
         ▼
9. uploadRegattaData() → data/regatta.json nach S3 (Cache-TTL: 30s)
   uploadSyncStatus()  → data/status.json nach S3 (Cache-TTL: 10s)
```

### Fehlerverhalten

- Wenn ein Sync-Zyklus fehlschlägt, wird `status.json` mit `state: "error"` und der Fehlermeldung hochgeladen.
- Ein laufender Zyklus wird nicht unterbrochen, wenn der nächste Timer feuert (Overlap-Schutz).
- Der Prozess läuft weiter, auch wenn einzelne Zyklen fehlschlagen.
- Beim Beenden (`Ctrl+C` / `SIGTERM`) wird der Connection Pool sauber geschlossen.

### Im Hintergrund laufen lassen

```bash
# Mit screen (empfohlen)
screen -S sync
npm run sync
# Strg+A, dann D → loslösen (läuft weiter)
# Wiederverbinden: screen -r sync

# Mit nohup
nohup npm run sync > sync.log 2>&1 &
tail -f sync.log   # Logs verfolgen
```

---

## 8. Website (Frontend)

### Datenstrom

```
S3: data/regatta.json
        │
        │ fetch() alle 60s
        ▼
    app.js: loadData()
        │
        │ update(state)
        ▼
    state.js: update()
        │
        │ notify listeners
        ▼
    render.js: render()
        │
        ├── renderHeader()     → Veranstaltungstitel, Ort, Datum
        ├── renderSyncBadge()  → Letzter Sync (grün/gelb)
        ├── renderFilters()    → Aktiver Filter-Button
        └── renderRaceList()   → Alle sichtbaren Race-Cards
```

### Datei-Übersicht

#### `js/app.js`
Einstiegspunkt. Zuständig für:
- Fetch von `data/regatta.json` (mit Cache-Buster `?t=timestamp`)
- Auto-Refresh alle 60 Sekunden
- Event-Handler für Suche, Status-Filter, Tag-Filter
- Dynamisches Rendern der Tag-Filter-Buttons nach Datenladen

#### `js/state.js`
Zentraler, reaktiver State-Container. Felder:

| Feld | Typ | Bedeutung |
|---|---|---|
| `status` | `"loading"` \| `"ready"` \| `"error"` | Ladezustand |
| `regatta` | `object` | Vollständiges Regatta-Objekt aus JSON |
| `searchQuery` | `string` | Aktueller Suchbegriff |
| `activeFilter` | `string` | `"all"` \| `"scheduled"` \| `"running"` \| `"finished"` |
| `activeDay` | `string` | `"all"` \| `"YYYY-MM-DD"` |
| `visibleRaces` | `array` | Gefilterte Rennliste |
| `openRaces` | `Set` | IDs der aufgeklappten Race-Cards |

#### `js/search.js`
Gesamte Filter- und Suchlogik, läuft clientseitig.

**Status-Bestimmung** (`getRaceStatus`): Leitet den Rennen-Status aus den `Comp_State`-Werten der Läufe ab:

| Comp_State | Bedeutung | Anzeige |
|---|---|---|
| 0, 1 | Geplant | GEPLANT |
| 2 | Laufend | LAUFEND |
| 3, 5 | Beendet (inoffiziell) | LAUFEND (noch kein Ergebnis) |
| 4 | Offiziell | BEENDET (mit Ergebnissen) |

**Textsuche:** Durchsucht Rennnummer, Bezeichnung, Vereinsname, Bootsname, Startnummer, Vorname, Nachname. Mehrere Suchbegriffe sind AND-verknüpft.

**Tag-Filter:** Erscheint nur automatisch, wenn die Regatta mehr als einen Tag umfasst. Bestimmt die verfügbaren Tage aus den `scheduledStart`-Timestamps der Läufe.

#### `js/render.js`
Baut den gesamten DOM. Wichtige Funktionen:

- `buildRaceCard(race, isOpen, entryMap)` — Eine Race-Card mit Header + Body
- `buildCompSection(comp, entryMap)` — Ein Lauf (Abteilung/Heat) mit Bootstabelle
- `buildBoatTable(boats, hasResults, entryMap)` — Tabelle mit Ergebnissen oder Einteilungen
- `buildEntriesList(entries)` — Meldungsliste ohne Einteilung (noch keine Läufe)

Die Race-Cards werden bei jedem State-Update komplett neu gebaut (`replaceChildren`). Performance ist bei Regattagrößen (< 200 Rennen) kein Problem.

#### `js/utils.js`
Hilfsfunktionen:

| Funktion | Beschreibung |
|---|---|
| `formatTime(ms)` | Millisekunden → `m:ss.xx` (Ruder-Format) |
| `formatDelta(ms)` | Rückstand → `+s.xx` |
| `formatClock(iso)` | Datetime → `Fr 14:00` (Wochentag + Uhrzeit, lokale Zeit) |
| `formatDate(iso)` | Datum → `Fr., 22.05.` |
| `formatRound(code, heat)` | Rundenkürzel → `"Vorlauf 2"`, `"Finale A"` etc. |
| `timeAgo(iso)` | Sync-Zeitstempel → `"vor 3 min"` |
| `isSyncStale(iso)` | `true` wenn letzter Sync > 3 Minuten her |

#### `css/style.css`
Design Tokens als CSS-Variablen in `:root`. Relevant für Anpassungen:

| Variable | Wert | Bedeutung |
|---|---|---|
| `--color-accent` | `#1d6fa5` | Hauptfarbe (Buttons, Links, Rennnummer) |
| `--color-success` | `#2d8a56` | BEENDET-Badge, Sync-Dot |
| `--color-rank-1/2/3` | Gold/Silber/Bronze | Platz-Badges |
| `--max-w` | `960px` | Maximale Inhaltsbreite |

### Admin-Interface

Erreichbar unter `https://deine-domain.cloudfront.net/admin/`. Zeigt den letzten Sync-Status aus `data/status.json` an. Das Passwort aus `.env` (`ADMIN_PASSWORD`) ist aktuell im Frontend hinterlegt und schützt die Seite nur rudimentär — für öffentlich zugängliche Seiten reicht das als Basis-Schutz, ist aber kein echtes Access-Control.

---

## 9. Deployment

### Erstes Setup (einmalig)

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Konfiguration anlegen
cp .env.example .env
# .env befüllen (DB-Zugangsdaten, AWS-Bucket, etc.)

# 3. AWS-Infrastruktur erstellen
chmod +x infra/setup.sh
./infra/setup.sh mein-bucket-name

# 4. Website hochladen
npm run deploy

# 5. Sync starten und testen
npm run sync:once
```

### Regatta-Betrieb (jede Regatta)

```bash
# Aquarius + Winboat starten (Windows in Docker)
# Sync starten
npm run sync

# → läuft im Hintergrund, aktualisiert alle 60s
```

### Website-Updates (nach Code-Änderungen)

```bash
npm run deploy

aws cloudfront create-invalidation \
  --distribution-id DEINE_ID \
  --paths "/*"
```

> **Achtung:** `npm run deploy` überschreibt **nicht** `data/regatta.json` und `data/status.json` in S3. Diese werden ausschließlich vom Sync-Agent verwaltet.

### Nach der Regatta

Den Sync-Prozess stoppen (`Ctrl+C` oder `kill`). Die Website bleibt mit dem letzten Stand erreichbar. Der S3-Bucket und die CloudFront-Distribution können bleiben — Kosten entstehen praktisch keine.

---

## 10. Befehle (npm scripts)

| Befehl | Beschreibung |
|---|---|
| `npm run sync` | Sync-Agent dauerhaft starten (alle N Sekunden) |
| `npm run sync:once` | Einmaliger Sync-Lauf (zum Testen) |
| `npm run deploy` | Website-Dateien nach S3 hochladen |
| `npm run dev` | Website lokal auf Port 3000 starten (ohne Sync) |

---

## 11. Aquarius-Datenbankschema

Die Aquarius-Datenbank heißt `Rudern`. Alle relevanten Tabellen liegen im Schema `dbo`.

### Verwendete Tabellen

#### `Event` — Veranstaltung
| Spalte | Typ | Verwendung |
|---|---|---|
| `Event_ID` | int (PK) | Primärschlüssel |
| `Event_Title` | varchar | Veranstaltungstitel |
| `Event_SubTitle` | varchar | Untertitel |
| `Event_StartDate` | datetime | Startdatum |
| `Event_EndDate` | datetime | Enddatum |
| `Event_Venue` | varchar | Veranstaltungsort |
| `Event_Club_ID_FK` | int → Club | Ausrichtender Verein |
| `Event_DefaultRaceMode_ID_FK` | int → RaceMode | Standard-Renndurchführungsart |
| `Event_DefaultDistance` | int | Standard-Strecke (m) |
| `Event_EnableLiveResults` | bit | Live-Ergebnisse aktiv |

#### `Offer` — Rennangebot (Rennklasse)
Das ist das, was in der Website als „Rennen" erscheint.

| Spalte | Typ | Verwendung |
|---|---|---|
| `Offer_ID` | int (PK) | Primärschlüssel |
| `Offer_Event_ID_FK` | int → Event | Zugehörige Veranstaltung |
| `Offer_RaceNumber` | varchar(8) | Rennnummer (z. B. „1", „2a") |
| `Offer_ShortLabel` | varchar(32) | Kurzbezeichnung (z. B. „SM 2x A") |
| `Offer_LongLabel` | varchar(64) | Langbezeichnung |
| `Offer_Distance` | smallint | Streckenlänge (m) |
| `Offer_IsLightweight` | bit | Leichtgewichtsrennen |
| `Offer_Cancelled` | bit | Abgesagt |
| `Offer_SortValue` | int | Sortierreihenfolge |

#### `Entry` — Meldung (Boot)
| Spalte | Typ | Verwendung |
|---|---|---|
| `Entry_ID` | int (PK) | Primärschlüssel |
| `Entry_Event_ID_FK` | int → Event | Veranstaltung |
| `Entry_Race_ID_FK` | int → Offer | Zugehöriges Rennen |
| `Entry_Bib` | smallint | Startnummer |
| `Entry_OwnerClub_ID_FK` | int → Club | Verein |
| `Entry_CancelValue` | tinyint | Abgemeldet (> 0 = storniert) |
| `Entry_IsLate` | bit | Nachnennung |
| `Entry_BibPrefix` | char(1) | Präfix der Startnummer |

Das Bootslabel (Bootsbezeichnung) wird über die `EntryLabel`-/`Label`-Tabellen per `OUTER APPLY` geladen.

#### `Crew` — Besatzungsmitglied
| Spalte | Typ | Verwendung |
|---|---|---|
| `Crew_Entry_ID_FK` | int → Entry | Zugehörige Meldung |
| `Crew_Athlete_ID_FK` | int → Athlet | Athlet |
| `Crew_Pos` | tinyint | Position im Boot |
| `Crew_IsCox` | bit | Steuermann/frau |
| `Crew_Club_ID_FK` | int → Club | Verein des Athleten |

#### `Athlet` — Athlet
| Spalte | Typ | Verwendung |
|---|---|---|
| `Athlet_ID` | int (PK) | Primärschlüssel |
| `Athlet_FirstName` | varchar(32) | Vorname |
| `Athlet_LastName` | varchar(64) | Nachname |
| `Athlet_Gender` | char(1) | Geschlecht |
| `Athlet_DOB` | datetime | Geburtsdatum |

#### `Comp` — Lauf / Abteilung / Heat
| Spalte | Typ | Verwendung |
|---|---|---|
| `Comp_ID` | int (PK) | Primärschlüssel |
| `Comp_Race_ID_FK` | int → Offer | Zugehöriges Rennen |
| `Comp_Event_ID_FK` | int → Event | Veranstaltung |
| `Comp_Round` | smallint | Runde |
| `Comp_HeatNumber` | smallint | Laufnummer innerhalb der Runde |
| `Comp_RoundCode` | varchar(8) | Kürzel (V, H, S, FA, FB, A …) |
| `Comp_DateTime` | datetime | Geplante Startzeit (lokale Zeit!) |
| `Comp_State` | tinyint | Status (siehe unten) |
| `Comp_Number` | smallint | Startnummer des Laufs |
| `Comp_Cancelled` | bit | Abgesagt |

**Comp_State-Werte:**

| Wert | Bedeutung | Website-Anzeige |
|---|---|---|
| 0, 1 | Geplant | GEPLANT |
| 2 | Laufend | LAUFEND |
| 3, 5 | Beendet (inoffiziell) | LAUFEND |
| 4 | Offiziell | BEENDET |

#### `CompEntries` — Einteilung (Boot in Lauf)
| Spalte | Typ | Verwendung |
|---|---|---|
| `CE_Comp_ID_FK` | int → Comp | Lauf |
| `CE_Entry_ID_FK` | int → Entry | Boot |
| `CE_Lane` | smallint | Bahn |

#### `Result` — Ergebnis
| Spalte | Typ | Verwendung |
|---|---|---|
| `Result_CE_ID_FK` | int → CompEntries | Einteilung |
| `Result_SplitNr` | smallint | Split-Nummer (höchste = Endzeit) |
| `Result_NetTime` | int | Nettozeit in Millisekunden |
| `Result_Delta` | int | Rückstand auf Führenden (ms) |
| `Result_Rank` | smallint | Platzierung |
| `Result_SortValue` | int | Sortierwert |

> Es werden nur Ergebnisse geladen, wenn `Comp_State = 4` (offiziell) **und** `Result_SplitNr = MAX(SplitNr)` je Boot (= Endzeit, keine Zwischenzeiten).

#### `RaceMode` / `RaceMode_Detail` / `RaceMode_Range`
Beschreiben die Renndurchführungsart (Anzahl Bahnen etc.). Join-Kette:
`Comp` → `RaceMode_Detail` (via `Comp_RMDetail_ID_FK`) → `RaceMode_Range` (via `RMLap_Range_ID_FK`) → `RaceMode` (via `RMRange_RM_ID_FK`)

---

## 12. Bekannte Eigenheiten & Fallstricke

### Timezone-Problem bei Comp_DateTime

Die MSSQL-Spalte `Comp_DateTime` speichert Zeiten **ohne Timezone-Info** (lokale Uhrzeit). Die `mssql`-Node.js-Bibliothek interpretiert das als UTC, was zu einer Verschiebung von +2 Stunden im Browser führt (CEST = UTC+2 im Sommer).

**Lösung:** Die Query gibt die Zeit als String zurück (`CONVERT(varchar(19), c.Comp_DateTime, 126)`), nicht als `datetime`. Dadurch erfolgt keine UTC-Konvertierung, und der Browser behandelt den String als lokale Zeit.

### Zwei SQL-Server-Instanzen

Auf dem Entwicklungsrechner können mehrere MSSQL-Instanzen laufen (z. B. Winboat + lokale Docker-Instanz). Der Sync-Agent verbindet sich mit **Port 1433** — es muss sichergestellt sein, dass dort **nur die Winboat-Instanz** antwortet.

Diagnose:
```bash
sudo ss -tlnp | grep 1433
docker ps | grep -i sql
```

### `data/` nicht deployen

`npm run deploy` überschreibt **nicht** `data/regatta.json`. Das ist beabsichtigt — `infra/deploy.js` überspringt alle Dateien in `data/`:

```js
if (file.s3Key.startsWith("data/")) continue;
```

Wird das vergessen und manuell `data/regatta.json` (Platzhalterdaten) hochgeladen, erscheinen auf der Website die Mock-Daten „42. Musterstadt-Regatta" statt der echten Daten. Fix: `npm run sync:once` ausführen.

### CloudFront Origin Path

Wenn der Origin Path der CloudFront-Distribution auf `/index.html` gesetzt ist, wird **jeder** S3-Key mit `index.html/` präfixiert. Symptome: alle JS/CSS-Dateien liefern HTML zurück, Fehler „MIME type text/html" in der Browser-Konsole. **Origin Path muss leer sein.**

### Ergebnisse erscheinen doppelt

Tritt auf wenn die Aquarius-Ergebnistabelle Zwischenzeiten (Splits) enthält. Die SQL-Abfrage filtert auf `MAX(Result_SplitNr)` je Boot, sodass nur die Endzeit angezeigt wird.

---

## 13. Troubleshooting

### Sync-Fehler: `Invalid column name 'XYZ'`

Die SQL-Query referenziert eine Spalte die in dieser Aquarius-Version nicht existiert. Prüfen:

```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'TabellenName'
ORDER BY ORDINAL_POSITION
```

Dann `queries.js` entsprechend anpassen.

### Sync: `Keine Veranstaltung gefunden`

Ursachen:
1. Die `Event`-Tabelle ist leer → Aquarius starten und eine Veranstaltung anlegen
2. `EVENT_ID` in `.env` zeigt auf eine nicht existierende ID → ID prüfen oder leer lassen
3. Node.js verbindet sich mit der falschen SQL-Server-Instanz → `sudo ss -tlnp | grep 1433` prüfen

### Website zeigt „Lade Regattadaten…"

Die `data/regatta.json` ist nicht erreichbar. Prüfen:

```bash
curl -I https://DEINE-CF-URL/data/regatta.json
```

Erwarteter Status: `200 OK`. Bei `404`: Sync noch nicht ausgeführt oder falsche Bucket-Konfiguration.

### Zeiten auf der Website um X Stunden verschoben

Timezone-Problem → `CONVERT(varchar(19), c.Comp_DateTime, 126)` in `fetchCompetitions` muss gesetzt sein (siehe Abschnitt 12).

### Website sieht kaputt aus (kein CSS, falsche MIME-Types)

CloudFront Origin Path ist nicht leer → in der AWS Console unter CloudFront → Distribution → Origins → Edit → Origin path leeren.

### Sync läuft, aber Website aktualisiert sich nicht

CloudFront cached die JSON-Datei. Cache leeren:

```bash
aws cloudfront create-invalidation \
  --distribution-id DEINE_ID \
  --paths "/data/*"
```

Oder auf die natürliche TTL warten (30 Sekunden für `regatta.json`).

### `config is not defined` in queries.js

Import fehlt. Ganz oben in `sync/db/queries.js` ergänzen:

```js
import { config } from "../config.js";
```
