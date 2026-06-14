# Where2Go

Where2Go is a mobile-first static PWA for checking kid-friendly and
family-compatible events. The current deployment started around Warren, NJ, but
the project is structured so the data system can later expand to more New Jersey
towns and eventually broader coverage.

The project has two deliberately separate parts:

- Frontend UI: a static web app that renders dates, map pins, event details,
  search, drive-time overlays, install prompts, terms, and lightweight stats.
- Data system: structured source discovery, source configuration, event import,
  filtering, cleanup, and documentation under `data/`.

The frontend should stay small. It reads standardized JSON and should not own
web crawling, kid/family eligibility rules, source taxonomy, parser notes, or
data maintenance workflows.

## Frontend

The frontend files currently live at the repository root so GitHub Pages can
serve the app without a build step:

```text
index.html                  App HTML shell
app.js                      Date timeline, Leaflet map, search, detail rendering
styles.css                  Mobile-first visual styling
config.js                   Public map/search/analytics configuration
sw.js                       App-shell and data service worker cache
manifest.webmanifest        PWA metadata for Add to Home Screen
assets/                     App icons and share image
```

Frontend responsibilities:

- Load `data/events.json`, with `data/sample-events.json` as fallback.
- Load `data/event-sources.json` only for app display metadata such as covered
  towns and library-source highlighting.
- Render one selected date at a time on a Leaflet map.
- Use location or ZIP/town search to move the map.
- Keep the UI independent from source crawling and event cleanup rules.

Frontend non-goals:

- No login, profiles, playdate features, or family data storage.
- No scraping or source discovery in browser code.
- No app-specific parser logic in UI files.

## Data System

Data maintenance lives in `data/` and is documented in
`data/README.md`.

Key files:

```text
data/source-taxonomy.json    Source family tiers and sourceTypes
data/source-workflows.json   Add-town, refresh, manual source, rediscovery flows
data/event-rules.json        Event eligibility, lifecycle, and quality rules
data/event-sources.json      Durable town/source registry and parser config
data/events.json             Source-driven merged event history used by the app
data/sample-events.json      Fallback sample events
data/README.md               Data-system operating manual
```

The important boundary: `data/events.json` is the app contract. Data workflows
may add sources, refresh imports, keep history, and improve quality, but they
should keep the event shape stable for the frontend.

## Things You Can Ask For

Use these request patterns when working on this project:

- Explain the project structure or a specific file.
- Run the app locally.
- Validate the current event data.
- Audit the source registry and visible event quality.
- Refresh activities from all saved sources.
- Add a new town to the data system.
- Add a specific information source and optionally import its events.
- Rediscover sources for a town to find new or previously missed venues.
- Review or update the source taxonomy, event rules, or data workflows.
- Clean obsolete files or reorganize documentation.
- Commit local changes when ready.
- Push only when you explicitly ask for push.

For data-specific requests, see `data/README.md`.

## Project Structure

```text
Where2Go/
  README.md
  index.html
  app.js
  styles.css
  config.js
  sw.js
  manifest.webmanifest
  assets/
  api/
    stats.js                 Vercel endpoint for aggregate GA4 area stats
  data/
    README.md
    data-status.html
    data-status.js
    source-taxonomy.json
    source-workflows.json
    event-rules.json
    event-sources.json
    events.json
    sample-events.json
  scripts/
    audit-project.mjs
    import-source-events.mjs
    validate-events.mjs
```

## Run Locally

The app has no build step and no runtime npm dependencies.

```bash
python3 -m http.server 4178
```

Then open:

```text
http://localhost:4178/
```

To inspect local data coverage and quality without opening the app UI, open:

```text
http://localhost:4178/data/data-status.html
```

The data status page is read-only. It loads `data/event-sources.json` and
`data/events.json`, then shows town completion, source status, parser coverage,
remaining towns without future events, and visible event quality gaps.

## Data Commands

Refresh source-driven events while keeping historical records:

```bash
node scripts/import-source-events.mjs --days 60
```

Validate imported and sample events:

```bash
node scripts/validate-events.mjs
```

Audit source registry consistency and visible event quality:

```bash
node scripts/audit-project.mjs
```

Read `data/README.md` before adding towns, adding sources, rediscovering sources,
or changing event eligibility rules.

## Map Setup

The app uses Leaflet for map interactions, MapTiler for production raster map
tiles and ZIP/town search, and OpenRouteService for optional drive-time
isochrones. Configure public browser-safe keys in:

```text
config.js
```

Frontend keys must be safe to expose in browser code and should be restricted by
allowed domains in the provider dashboard. Private service credentials belong in
deployment environment variables, not in frontend files.

## Analytics Setup

The app can use Google Analytics 4 for free visitor tracking and coarse
town/city events. Leave `analytics.googleAnalyticsMeasurementId` empty in
`config.js` to disable GA4. Analytics is skipped on localhost so local testing
does not count as live traffic.

The right-menu Stats panel reads a public aggregate JSON response from
`analytics.statsEndpoint`. On Vercel, `api/stats.js` queries the GA4 Data API and
returns only aggregate area rows.

Required Vercel environment variables for stats:

```text
GA4_PROPERTY_ID=YOUR_NUMERIC_PROPERTY_ID
GOOGLE_CLIENT_EMAIL=service-account-name@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

Alternatively, set `GOOGLE_SERVICE_ACCOUNT_JSON` to the full service account
JSON. Do not put private service-account credentials in frontend files.

## Feedback And Likes

Report and toggleable like interactions can use a free Google Apps Script Web
App backed by a private Google Sheet. Copy
`scripts/google-apps-script-interactions.gs` into a Sheet-bound Apps Script
project, deploy it as a Web App, and set:

```js
interactions: {
  googleAppsScriptUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

in `config.js`. Leave the URL empty to show the Report UI locally while keeping
submissions and likes disabled.

## Offline Behavior

The service worker caches the app shell and event JSON with a network-first
strategy for frequently changed files. External Leaflet assets, map tiles, and
geocoding requests still depend on the network or the browser's own cache.

When changing cached app files, bump `CACHE_NAME` in `sw.js`.

## Deploy With GitHub Pages

1. Push this folder to a GitHub repo.
2. Open the repo on GitHub.
3. Go to `Settings > Pages`.
4. Choose `Deploy from a branch`.
5. Select branch `main` and folder `/ (root)`.
6. Save.

The public URL will look like:

```text
https://YOUR-GITHUB-USERNAME.github.io/Where2Go/
```

## Phone Install

On iPhone, open the GitHub Pages URL in Safari, tap Share, then tap Add to Home
Screen.
