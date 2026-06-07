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

When adding a new town, use `townExpansion.sourceTypes` in
`data/event-sources.json` as the source checklist. Add links first, then run the
importer so `data/events.json` is refreshed from those sources. The app should
continue reading event records from `data/events.json`; `event-sources.json`
stays the durable source registry and expansion notes.

Use `sourceStatusVocabulary` in `data/event-sources.json` for source statuses:
`importable` means the importer should read it automatically, `manual_review`
means useful but not automated yet, `service_area` means covered by a broader
system source, `blocked_by_bot_protection` means direct script fetching is
blocked, and `reference_only` means keep the link but do not import it.

For towns with multiple ZIP codes, add `zipCommunities` so the app can show a
tree in the More menu. The menu display follows `appDisplayPolicy`: town labels
are shortened for readability, ZIPs are right-aligned without parentheses, and
towns with an importable library source are highlighted. Keep full official
venue names in source/event data even when the app shortens them for display.

Shared systems such as SCLSNJ should keep branch fallback locations in
`sharedSources[*].locations`, not in importer code. Each branch location should
include the external branch `id`, display `name`, address fields, and coordinates
so imports remain stable when an upstream location API fails or returns noisy
names.

Every import should finish with a quality audit. The importer automatically
repairs deterministic gaps such as mirrored `url`/`sourceUrl`, mirrored
`venue`/`venueName`, missing timezone, missing duration, and missing in-coverage
coordinates when an address can be geocoded. Any remaining missing time, place,
coordinates, source URL, or concrete summary must be reported for manual review;
do not invent descriptions when the source page does not provide one.

Refresh the source-driven event file:

```bash
node scripts/import-source-events.mjs --days 60
```

Validate both imported and sample data:

```bash
node scripts/validate-events.mjs
```

Audit source registry consistency, source statuses, ZIP/community structure, and
visible event quality:

```bash
node scripts/audit-project.mjs
```
