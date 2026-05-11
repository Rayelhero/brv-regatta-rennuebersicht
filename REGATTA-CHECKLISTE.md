# Aquarius Web — Regatta-Checkliste
## Vor der Regatta: .env prüfen

Öffne die Datei `aquarius-web-clean/.env` in einem Texteditor:

```bash
nano ~/Documents/ergebnisse_seite_aws/aquarius-web-clean/.env
```

Prüfe und passe folgende Werte an:

```env
# IP/Host des MSSQL-Servers
DB_HOST=192.168.1.XXX

# SQL Server Passwort (SA-User)
DB_PASSWORD=dein-passwort

# Welche Veranstaltung soll gesynct werden?
# Leer lassen = automatisch die neueste Veranstaltung
EVENT_ID=
```

Alle anderen Werte (`DB_PORT`, `DB_USER`, `DB_NAME`, `S3_BUCKET`, `AWS_REGION`) bleiben in der Regel unverändert.

### Event_ID herausfinden (optional)

Falls mehrere Veranstaltungen in der Datenbank sind, in **Azure Data Studio** / **SQL Server Management Studio** verbinden und ausführen:

```sql
SELECT Event_ID, Event_Title, Event_StartDate
FROM Event
ORDER BY Event_StartDate DESC
```

Die gewünschte `Event_ID` in `.env` eintragen.

---

## Sync starten

```bash
cd ~/Documents/ergebnisse_seite_aws/aquarius-web-clean

# Einmaliger Test-Sync
npm run sync:once
```

**Erwartete Ausgabe:**

```
[sync] #1 gestartet
[db] Verbindung hergestellt
[s3] data/regatta.json hochgeladen (XX KB)
[s3] data/status.json hochgeladen (0.2 KB)
[sync] #1 abgeschlossen in XXX ms
```

Wenn das klappt, dauerhaft starten:

```bash
npm run sync
```

Der Sync läuft jetzt alle 60 Sekunden. Terminal offen lassen oder im Hintergrund laufen lassen:

```bash
npm run sync &
```

---

## Website prüfen

Die öffentliche URL aufrufen:

```
https://d1bna82monwvd5.cloudfront.net
```

Titel, Ort und Datum der Regatta sollten erscheinen. Die Rennen aus Aquarius werden angezeigt.

---

## Während der Regatta

Die Website aktualisiert sich **automatisch alle 60 Sekunden** im Browser. Es ist nichts weiter zu tun.

Der grüne Punkt oben rechts zeigt, wann zuletzt synchronisiert wurde. Wird er gelb, ist der letzte Sync mehr als 3 Minuten her — dann im Terminal nachschauen ob der Sync-Prozess noch läuft.

---

## Nach der Regatta

Sync stoppen:

```bash
# Wenn im Vordergrund: Strg+C
# Wenn per mit &:
jobs
# Zahl des Dienstes in nächsten Befehl
`kill %1`
```

Die Website bleibt mit dem letzten Stand erreichbar. Winboat kann heruntergefahren werden.

---

## Fehlerbehebung

|Problem|Lösung|
|---|---|
|`[sync] Keine Veranstaltung gefunden`|`Event_ID` in `.env` prüfen, oder leer lassen für automatische Auswahl|
|`[sync] Fehler: Login failed`|`DB_PASSWORD` in `.env` prüfen|
|`[sync] Fehler: connect ECONNREFUSED`|falscher `DB_HOST` / `DB_PORT`|
|Website zeigt alte Daten|Seite neu laden (Strg+F5)|
|Sync läuft, Website ändert sich nicht|Warten (CloudFront cached 30s)|
