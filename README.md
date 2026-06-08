# Where2Go

Where2Go is a mobile-first static PWA for checking kid-friendly events near
Warren, NJ 07059.

The app is intentionally small:

- Pick a date from the top timeline.
- See only that day's events on a Leaflet map.
- Tap a numbered map pin to view grouped event details for that location.
- Use current location or ZIP/town search to move the map.
- Keep family data out of the app: no login, profiles, or playdate features.

## Project Structure

```text
Where2Go/
  index.html                  App HTML shell
  app.js                      Date timeline, map pins, search, and detail rendering
  styles.css                  Mobile-first visual styling
  config.js                   Public MapTiler config for map tiles and search
  sw.js                       Basic app-shell/data service worker cache
  manifest.webmanifest        PWA metadata for Add to Home Screen
  .nojekyll                   Keeps GitHub Pages from running Jekyll
  assets/
    icon.svg                  Source app icon
    icon-192.png              Android/iOS home-screen icon
    icon-512.png              Large PWA icon
    share-card.png            Social link preview image
  data/
    README.md                 Event data contract and maintenance notes
    event-sources.json        20-minute township/source registry
    events.json               Source-driven merged event history
    sample-events.json        Fallback sample data if imported data is missing
  scripts/
    audit-project.mjs         Checks source registry consistency and visible event quality
    import-source-events.mjs  Refreshes source-driven events without deleting old events
    validate-events.mjs       Checks event JSON shape before deploy
```

## Run Locally

```bash
python3 -m http.server 4178
```

Then open:

```text
http://localhost:4178/
```

The app has no build step and no runtime npm dependencies.

## Data Workflow

Refresh the broader source-driven event history:

```bash
node scripts/import-source-events.mjs --days 60
```

Validate event data:

```bash
node scripts/validate-events.mjs
```

Audit source registry consistency and visible event quality:

```bash
node scripts/audit-project.mjs
```

The importer writes:

```text
data/events.json
```

Commit and push that JSON file when GitHub Pages should show fresh events.

The More menu is generated from `data/event-sources.json`: single-ZIP towns show
the town and ZIP in two compact columns, multi-ZIP towns show an indented
community/ZIP tree, and towns with at least one importable library source are
highlighted.

## Map Setup

The app uses Leaflet for map interactions, MapTiler for production raster map
tiles and ZIP/town search, and OpenRouteService for optional drive-time
isochrones. Configure public keys in:

```text
config.js
```

The MapTiler key should be restricted to the deployed GitHub Pages domain. During
early testing, `useTemporaryOpenStreetMapFallback` can be set to `true` so the map
still renders before a MapTiler key is available. Search still requires MapTiler.

Drive-time overlays use `driveTime.apiKey` in `config.js`. The current UI draws
10-minute and 20-minute driving contours from the last location/search point; the
inner contour is styled as 0-10 minutes and the outer visible area as 10-20
minutes.

## Analytics Setup

The app uses GoatCounter for simple visitor tracking. Create a GoatCounter site,
copy the `data-goatcounter` endpoint from its JavaScript snippet, and put it in:

```js
analytics: {
  goatCounterEndpoint: "https://where2go.goatcounter.com/count",
  cloudflareWebAnalyticsToken: "YOUR_TOKEN"
}
```

in `config.js`. Leave `goatCounterEndpoint` empty to disable analytics. The
Cloudflare token is optional and can stay empty. Analytics scripts are skipped on
localhost so local testing does not count as live traffic. The app does not send
precise GPS location to analytics.

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
