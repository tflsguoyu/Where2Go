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
    event-sources.json        30-minute township/source registry
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
10-minute, 20-minute, and 30-minute driving contours from the last
location/search point; the compact legend labels them as 10m, 20m, and 30m.

## Analytics Setup

The app can use Google Analytics 4 for free visitor tracking and coarse
town/city events. Create a GA4 web data stream, copy its Measurement ID, and put
it in:

```js
analytics: {
  googleAnalyticsMeasurementId: "G-XXXXXXXXXX",
  statsEndpoint: "https://where2go-tau.vercel.app/api/stats",
  areaMaxDistanceMiles: 12
}
```

in `config.js`. Leave `googleAnalyticsMeasurementId` empty to disable GA4. The
analytics script is skipped on localhost so local testing does not count as live
traffic.

GA4's built-in geography reports can show visitor city/region from IP-derived
data. In addition, Where2Go sends two custom events after user actions:
`search_area` when a town/ZIP search succeeds, and `located_area` when location
permission maps the user to a nearby covered town. The app sends only coarse
event parameters such as `area_town`, `area_city`, `area_state`, `area_zip`,
`area_county`, and `area_town_id`; it does not send precise GPS coordinates,
raw search strings, IP addresses, or user IDs.

To break down the custom events by town/city in GA4, create event-scoped custom
dimensions for the event parameters `area_town`, `area_city`, `area_state`,
`area_zip`, `area_county`, `area_town_id`, and `area_source`. Then use GA4
`Reports > Engagement > Events` or `Explore` to view `search_area` and
`located_area` by those dimensions.

The right-menu Stats panel reads a public aggregate JSON response from
`analytics.statsEndpoint`. On Vercel, `/api/stats` queries the GA4 Data API and
returns only `state`, `zip`, and `visits` rows for the last 28 days. To enable
it, add these Vercel environment variables:

```text
GA4_PROPERTY_ID=YOUR_NUMERIC_PROPERTY_ID
GOOGLE_CLIENT_EMAIL=service-account-name@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

Alternatively, set `GOOGLE_SERVICE_ACCOUNT_JSON` to the full service account JSON.
Grant that service account Viewer access to the GA4 property. The Stats panel
depends on the GA4 custom dimensions above, especially `area_state` and
`area_zip`, and will show data only after new matching events have arrived.

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
