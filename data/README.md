# Event Data

The app loads `data/events.json` first, then falls back to
`data/sample-events.json` if imported data is unavailable.

The broader source-driven workflow uses two durable files:

- `data/event-sources.json`: Warren-centered 20-minute coverage, township
  websites, library websites, event URLs, and parser status.
- `data/events.json`: merged event records from all importable sources. This
  file is append/update oriented: old events are kept so source pages can be
  revisited later.

## Required Fields

Each event should include:

- `id`: Stable unique ID.
- `title`: Event name shown in the detail panel.
- `venue` or `venueName`: Human-readable location.
- `source`: Calendar/provider label.
- `summary`: Short description shown in the detail panel.
- `url` or `sourceUrl`: Link to the source event page.

Real imported events should also include:

- `startsAt`: Local ISO timestamp, for example `2026-06-06T11:00:00`.
- `endsAt`: Local ISO timestamp.
- `timezone`: Currently `America/New_York`.
- `lat` and `lng`: Coordinates used by Leaflet markers.
- `address`: Used for Google Maps directions when coordinates are missing.

Sample events may use `dayOffset`, `time`, and `durationMinutes` instead of
absolute timestamps.

## Maintenance

Refresh the source-driven event file:

```bash
node scripts/import-source-events.mjs --days 60
```

Validate both imported and sample data:

```bash
node scripts/validate-events.mjs
```
