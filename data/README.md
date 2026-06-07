# Event Data

The app loads `data/imported/sclsnj-events.json` first and falls back to
`data/sample-events.json` if the imported file is unavailable.

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

Refresh imported SCLSNJ data:

```bash
node scripts/import-libnet-events.mjs --days 21
```

Validate both imported and sample data:

```bash
node scripts/validate-events.mjs
```
