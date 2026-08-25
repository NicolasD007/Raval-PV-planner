# Raval PV Planner

Mobile-first React/Vite PWA für GitHub Pages: Ladeplanung für einen CUPRA Raval
(Endurance, 155 kW, 52 kWh) nach PV-Überschuss. Fester Standort: Spöck bei
Altusried, 87452 (47.78873, 10.173972).

Dies ist der tatsächliche, lauffähige Stand des Projekts (Planning Engine,
Verbrauchslernen, PV-/Wettermodell und komplette UI sind implementiert und
getestet) – nicht nur eine Beschreibung geplanter Funktionen.

## Funktionsumfang

- **Planning Engine** (`src/lib/planningEngine.js`): reine, deterministische
  Funktion, die aus SoC, gelerntem Verbrauch, Wetter/PV-Prognose, Sperrzeiten,
  Ladezielen und Wochenendregel eine Tages- und Wochenempfehlung berechnet.
  Harte Randbedingungen (werden nie verletzt): Sperrzeiten, 40 %-Fahrzeugreserve,
  70 %-Speicher-Nachtreserve. Reine Netzladung wird nie automatisch
  vorgeschlagen – nicht erreichbare Ziele werden klar als "gefährdet" markiert.
- **SoC-Lernfunktion** (`src/lib/consumption.js`): rollierender Werktags-/
  Wochenend-Verbrauch (getrennt), Ausreißer-Erkennung relativ zum Median,
  Ausschluss von Intervallen mit externer/unplanmäßiger Zwischenladung.
- **PV-/Wettermodell** (`src/lib/pvModel.js`, `src/lib/weather.js`): 5-Modell-
  Konsens über die kostenlose Open-Meteo-API (DWD ICON, ECMWF IFS, NOAA GFS,
  Météo-France, UK Met Office), Ost/West-gewichtete Tagesleistungskurve,
  Ladefenster-Suche unter Berücksichtigung von Sperrzeiten und Wallbox-Leistung.
  Anzeige je Tag zusätzlich mit Sonnenstunden, Temperaturspanne und
  Niederschlagsmenge. Prognosesicherheit (hoch/mittel/niedrig) basiert auf der
  Streuung der 5 Modelle; die Schwellenwerte sind bewusst so gewählt, dass
  normale, für mehrtägige Strahlungsprognosen typische Modellstreuung nicht
  sofort als "niedrig" markiert wird (siehe Kommentar bei
  `combineModelEstimates()` in `src/lib/weather.js`). Regen/Schnee an
  einzelnen Stunden bei gleichzeitig mehreren Sonnenstunden am selben Tag wird
  als gemischter Zustand ("Sonne & Regen") statt als reiner Regen-Text
  angezeigt (`classifyDay()`, `MEANINGFUL_SUN_HOURS`); Gewitter bleibt davon
  bewusst ausgenommen und immer als eigenständige Warnung sichtbar.
- **UI** (`src/pages/*`, "Liquid Glass"-Design): Heute, Woche, SoC, Ziele
  (inkl. Auto-Verfügbarkeit/Sperrzeiten), Setup. Mobile-first, 390 px, Safe-Area,
  Touch-Targets ≥ 44 px.
- **Persistenz**: ausschließlich `localStorage`, kein Backend.
- **PWA**: Manifest, Service Worker mit Offline-Shell, Apple-Meta-Tags,
  installierbar auf dem iPhone-Homescreen.
- **Verlauf/Auswertung** (`src/lib/history.js`, SoC-Tab): archiviert täglich
  automatisch, was die App empfohlen hat (Aktion, Ladefenster, Ziel-SoC,
  Prognose), und zeigt dazu den real gemessenen Folge-SoC aus der SoC-Historie
  – kein automatisches "hat geklappt/nicht geklappt"-Urteil (Abschnitt 33:
  nichts erfinden, keine Live-Messung von echten Ladevorgängen), sondern eine
  ehrliche Gegenüberstellung, mit der man selbst beurteilen kann, ob der Plan
  aufgegangen ist.
- **Backup/Export** (Setup-Tab): SoC-Historie, Ziele, Sperrzeiten, Setup und
  Verlauf lassen sich als JSON-Datei exportieren und wieder importieren –
  einzige Absicherung gegen Datenverlust, da alles nur in `localStorage` liegt.
- **Visualisierung**: PV-Wochenprognose als Balkendiagramm (`PvBarChart.jsx`,
  Woche-Tab) und SoC-Verlauf als Liniendiagramm (`SocChart.jsx`, SoC-Tab,
  inkl. Referenzlinien für Fahrzeug-Reserve/Wochenendziel) – reines SVG/CSS,
  keine Chart-Bibliothek.
- **Tests**: 59 Unit-/Integrationstests (Node.js `node:test`, siehe unten).

## Lokal starten

```bash
npm install
npm run dev
```

Öffnet unter `http://localhost:5173/raval-pv-planner/`.

## Tests

```bash
npm test
```

Nutzt bewusst den in Node.js eingebauten Testrunner (`node --test`) statt
Vitest – keine zusätzliche Test-Abhängigkeit, läuft überall ohne weiteren
Installationsschritt. 59 Tests decken u. a. alle 12 in der Spec geforderten
Planning-Engine-Fälle ab (`src/lib/planningEngine.test.mjs`):

| # | Szenario |
|---|---|
| 1 | SoC 80 %, gute PV-Woche, keine Termine → kein unnötiges Laden |
| 2 | SoC 42 %, schlechte Folgetage → laden |
| 3 | SoC 70 %, Dienstag sehr gute PV, Mittwoch schlecht → Dienstag laden |
| 4 | Donnerstag-Ziel 100 %, Mittwoch gesperrt, Dienstag gute PV → Dienstag laden |
| 5 | Donnerstag-Ziel 100 %, Donnerstag selbst gesperrt+schlecht, Mittwoch gut → Mittwoch laden |
| 6 | Externe Zwischenladung wird vom Verbrauchsintervall ausgeschlossen |
| 7 | 80 %-Wochenendziel, SoC 60 % → Ladeplanung vor Freitag |
| 8 | SoC 85 %, kein Bedarf → "Diese Woche nicht laden" |
| 9 | Hausspeicher-Vorrang: Auto-Ladung nicht einfach aus PV-Rohschätzung ableiten |
| 10 | Stark abweichende Wetterquellen → confidence mittel/niedrig |
| 11 | Neuer SoC → Planung wird sofort neu berechnet |
| 12 | Sperrzeit → nie ein Ladefenster innerhalb dieser Zeit |

Weitere Tests: `date.test.mjs`, `pvModel.test.mjs`, `weather.test.mjs`,
`houseLoad.test.mjs`, `history.test.mjs`.

## Lint

```bash
npm run lint
```

## GitHub Pages

1. Repository `raval-pv-planner` anlegen, dieses Projekt pushen.
2. Unter **Settings → Pages** die Quelle auf "GitHub Actions" stellen.
3. Der mitgelieferte Workflow (`.github/workflows/deploy.yml`) installiert
   Dependencies, führt Tests + Lint aus, baut und deployed automatisch bei
   jedem Push auf `main`.
4. Auf dem iPhone die Pages-URL öffnen → **Teilen → Zum Home-Bildschirm**.

`vite.config.js` setzt bereits den korrekten `base: '/raval-pv-planner/'`.
Falls das Repository anders heißt, muss dieser Pfad angepasst werden
(und in `index.html`/`public/manifest.webmanifest`, die absolute Pfade nutzen).

## Wetterquellen

Bewusst Open-Meteo statt wetter.com/WetterOnline/meteoblue: Open-Meteo ist
kostenlos, benötigt keinen API-Key (wichtig für ein rein clientseitiges
GitHub-Pages-Deployment ohne Backend) und liefert direkten Zugriff auf die
Rohmodelle der nationalen Wetterdienste. wetter.com bietet nur ein B2B-Produkt
ohne Self-Service, WetterOnline hat keine offizielle öffentliche API, und
meteoblues kostenloser API-Key müsste – da er sonst im öffentlichen Client-Code
läge – über einen zusätzlichen Build-Zeit-Mechanismus (z. B. GitHub Actions +
Secret) abgesichert werden. Details siehe Chatverlauf zur Projektklärung.

## Bewusste Modellannahmen (dokumentiert, keine Messwerte)

Diese Werte wurden im Klärungsgespräch festgelegt und sind in
`src/lib/types.js` (`DEFAULT_SETUP`) zentral editierbar:

- Fahrzeug-Akku: 52 kWh (Raval Endurance, 155 kW). Herstellerangabe ist meist
  brutto; die real nutzbare Kapazität kann etwas niedriger liegen.
- Hausverbrauch: 7,7 kWh/Tag (Winter, Okt–Mär) bzw. 4,0 kWh/Tag (Sommer,
  Apr–Sep) – fester Stufenwert, kein weicher saisonaler Verlauf.
- Wärmepumpe: 16 kWh/Tag Winter, rechnerisch ≈ 3,3 kWh/Tag Sommer (aus der
  Jahressumme 3.500 kWh abgeleitet) – das sind weiterhin die Referenzwerte,
  aber der tatsächlich verwendete Tageswert berücksichtigt jetzt, wenn eine
  Temperaturprognose vorliegt, die Tagesmitteltemperatur (`src/lib/houseLoad.js`,
  `heatPumpKwhForTemp()`): linear interpoliert zwischen dem Sommer-Sockelwert
  (ab Heizgrenze 15 °C) und dem Winterwert bei einer angenommenen typischen
  Winter-Mitteltemperatur von 3 °C (Allgäu, ca. 700 m ü. NN – eine
  Modellannahme, keine Klimareihe). Ohne Temperaturprognose (z. B. Wetterdaten
  nicht verfügbar) fällt es auf den alten festen Saison-Stufenwert zurück.
- Speicher-Vorrangreserve fürs Auto (`houseBattery.dailyReplenishmentReserveKwh`,
  3 kWh): Da die App **keine Live-Anbindung an den Hausspeicher-SoC** hat,
  wird vom PV-Überschuss eines Tages pauschal ein konservativer Puffer
  abgezogen, bevor irgendetwas als "frei fürs Auto" gilt (TEST 9). Eine echte
  Verbesserung hier würde eine reale Speicher-Telemetrie voraussetzen.
- PV-Tagesverlauf: vereinfachtes Ost/West-Sinusmodell, kein exaktes
  Astronomie-/Verschattungsmodell. Ausreichend für Ladefenster-Empfehlungen,
  nicht für exakte Ertragsprognosen.

## Was noch echte externe Daten/Kalibrierung braucht

- **PV- und Hausverbrauchsmodell** sind Schätzungen (wie schon im
  ursprünglichen Projekt vermerkt), keine Zählerwerte. Eine Kalibrierung gegen
  echte Haushaltsdaten (z. B. Wechselrichter-/Zähler-API) würde die Prognose
  spürbar verbessern.
- **Hausspeicher-SoC** wird nicht live erfasst (siehe oben) – nur über eine
  feste Pauschalreserve modelliert.
- **Wärmepumpen-Verbrauch** ist jetzt temperaturabhängig, sobald eine
  Temperaturprognose vorliegt (siehe oben) – aber weiterhin ein vereinfachtes,
  lineares Modell (kein Gebäude-/Heizlastmodell, keine reale COP-Kennlinie).
- **Web-Push-Benachrichtigungen** (z. B. "heute laden!" ohne die App zu
  öffnen) sind nicht implementiert – eine iPhone-PWA kann ohne eigenen
  Push-Server nicht zuverlässig im Hintergrund aufwachen, und ein Push-Server
  würde der "kein Backend"-Vorgabe widersprechen. Die Planung aktualisiert
  sich beim Öffnen der App.

## Hinweis zur Entwicklungsumgebung dieses Durchlaufs

In der Sandbox, in der dieses Projekt gebaut wurde, war kein Zugriff auf die
npm-Registry möglich (`registry.npmjs.org` war für ausgehende Verbindungen
gesperrt) – `npm install`/`npm run build` mit Vite konnten deshalb dort nicht
direkt ausgeführt werden. Als Ersatz wurde:

- die gesamte Business-Logik (Planning Engine, Verbrauchsschätzung, PV-/
  Wettermodell, Datumshilfen – alles in `src/lib/`) mit dem in Node.js
  eingebauten Testrunner **tatsächlich ausgeführt** (59/59 Tests grün, daher
  jetzt auch der Umstieg von Vitest auf `node --test` als offizieller
  Testrunner des Projekts),
- die komplette React/JSX-App mit einer lokal vorhandenen esbuild-Kopie
  **tatsächlich gebündelt** (keine Syntax-/Importfehler) und
- die gebündelte App in einem headless Chromium (Playwright) **tatsächlich
  geladen und bedient** – Navigation durch alle 5 Tabs, kompletter
  "SoC aktualisieren"-Ablauf inkl. localStorage-Persistenz und sofortiger
  Neuberechnung der Empfehlung, geprüft auf Konsolenfehler.

`npm run build` mit dem echten Vite-Toolchain und `npm run lint` mit ESLint
selbst wurden nicht in dieser Sandbox ausgeführt, sollten aber nach `npm
install` in einer Umgebung mit normalem npm-Zugriff (z. B. lokal oder in der
mitgelieferten GitHub-Actions-Pipeline, die genau das automatisch tut)
funktionieren.

## Datenmodell

Siehe `src/lib/types.js` (JSDoc-Typen: `SocEntry`, `ChargingGoal`,
`AvailabilityBlock`, `WeatherDay`, `Plan`) sowie `PlanHistoryEntry` in
`src/lib/history.js` (Verlauf/Auswertung). Bewusst JavaScript + JSDoc statt
TypeScript, um am bestehenden Projekt-Setup (`main.jsx`, keine `.ts`-Dateien)
anzuknüpfen, statt die Toolchain grundlegend umzustellen.
