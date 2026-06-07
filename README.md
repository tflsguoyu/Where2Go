# Where2Go

Where2Go is a mobile-first static web app for checking kid-friendly events near 07059.

The current app is intentionally simple:

- Choose a date from the top timeline.
- See only that day's events on the map.
- Tap a map pin to view the event time, place, description, and source link.
- Use current location or a ZIP code to move the map.
- No login, no private family data, no playdate features yet.

## Folder Structure

```text
Where2Go/
  index.html                  App HTML shell
  app.js                      Date timeline, Leaflet map pins, and event detail logic
  config.js                   Public MapTiler key/config for the production basemap
  styles.css                  Mobile-first visual styling
  sw.js                       Service worker for basic offline/cache support
  manifest.webmanifest        PWA metadata for Add to Home Screen
  .nojekyll                   Keeps GitHub Pages from running Jekyll
  README.md                   This file
  assets/
    icon.svg                  App icon
  data/
    imported/
      sclsnj-events.json      Current real event data used by the app
    sample-events.json        Fallback sample data if imported data is missing
  scripts/
    import-libnet-events.mjs  SCLSNJ event importer used to refresh event data
```

## Run Locally

```bash
python3 -m http.server 4178
```

Then open:

```text
http://localhost:4178/
```

## Map Setup

The app uses Leaflet for map interactions and a MapTiler raster basemap for production. Add your public MapTiler key in:

```text
config.js
```

For beta testing, `useTemporaryOpenStreetMapFallback` can stay `true` so the map still works before a MapTiler key is added. For long-term public use, add a MapTiler key and restrict it to your GitHub Pages domain.

## Refresh Event Data

```bash
node scripts/import-libnet-events.mjs --days 21
```

This updates:

```text
data/imported/sclsnj-events.json
```

Commit and push that file when you want GitHub Pages to show fresh data.

## Deploy With GitHub Pages

1. Create a GitHub repo named `Where2Go`.
2. Push this folder to the repo.
3. Open the repo on GitHub.
4. Go to `Settings > Pages`.
5. Choose `Deploy from a branch`.
6. Select branch `main` and folder `/ (root)`.
7. Save.

Your public URL will look like:

```text
https://YOUR-GITHUB-USERNAME.github.io/Where2Go/
```

## Phone Install

On iPhone, open the GitHub Pages URL in Safari, tap Share, then tap Add to Home Screen.
