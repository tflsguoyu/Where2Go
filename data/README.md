# Event Data

The app loads `data/events.json` first, then falls back to
`data/sample-events.json` if imported data is unavailable.

The broader source-driven workflow uses two durable files:

- `data/event-sources.json`: Warren-centered 30-minute coverage, township
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
- `summary`: Useful activity-only description shown in the detail panel; do not
  include date, time, venue, room, place, or address text.
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

### New Town Source Sweep

For every newly added town, source discovery must go beyond government and
library calendars. A town source update is incomplete until every category in
`townExpansion.requiredSourceSweep.minimumChecklist` has either a recorded source
entry or a note explaining why no useful dated-event source was found.

Search the town itself plus nearby venues inside the active drive-time coverage
area. Treat any place where children can play, learn, watch, build, craft, read,
explore, or attend seasonal programs as a potential event source. This includes:

- Municipal calendars, parks/recreation pages, registration portals, municipal
  alliance pages, official news/flyers, and community supplement pages.
- Public library branches, county library systems, service-area branches, and
  youth/teen/family pages.
- Downtown/SID/chamber/business association calendars, street fairs, farmers
  markets, and local business district pages.
- County parks, nature centers, environmental education centers, gardens,
  arboretums, farms, wildlife centers, zoos, and seasonal outdoor venues.
- Museums, science centers, art centers, historic sites, theaters, music venues,
  maker spaces, and cultural centers with family or youth programs.
- Indoor playgrounds, trampoline parks, sensory gyms, kids gyms, sports
  complexes, swim schools, dance/martial arts studios, STEM/coding centers,
  party venues, and camp/class providers.
- Malls, shopping centers, bookstores, toy/game stores, LEGO/Apple-style retail
  programs, craft stores, home-improvement kids workshops, and restaurants or
  cafes that host family events.
- Regional festival, carnival, fair, market, and tourism directories that can be
  mapped back to covered towns.

Record useful sources even when they are not importable yet. Use
`manual_review`, `blocked_by_bot_protection`, or `service_area` rather than
dropping the source. Use `reference_only` only for directories or venues with no
real dated-event potential.

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
coordinates when an address can be geocoded. Summaries should contain activity
content only; date, time, venue, room, place, and address belong in structured
fields. Any remaining missing time, place, coordinates, source URL, or concrete
summary must be reported for manual review; do not invent descriptions when the
source page does not provide one.

When an official event page includes flyer images or other event images, check
normal page text first. Only inspect image text when the HTML text does not
provide the needed address, room, date, or time. Use image alt text, captions,
visible flyer text, or OCR/manual review before deciding that the field is truly
missing.

## Source Crawl Runbook

Use this section before re-investigating source pages. The durable source of
truth remains `data/event-sources.json`; this runbook records the crawl path and
known blockers so future refreshes do not need fresh discovery.

### Parser Methods

| Parser | Where used | Crawl method | Notes |
| --- | --- | --- | --- |
| `sclsnj-libnet` | Somerset County Library System shared source | Request `eventEndpoint` with `event_type=0` and a JSON `req` containing `date`, `days`, `private:false`, `locations:branchIds`, and encoded `ages:ageFilters`. Load `locationEndpoint` in parallel and fall back to `sharedSources.sclsnj-libnet.locations`. | Keep branch IDs and fallback coordinates in `event-sources.json`; do not rediscover branch addresses in code. |
| `librarycalendar-list` | Plainfield, South Plainfield, Piscataway, New Providence libraries | Fetch `/events/list`, parse `lc-event--list` cards, keep child/family audiences, then enrich each detail page with JSON-LD for exact time, image, and room/location. | Skip closings. If list HTML changes, inspect card `aria-label` first. |
| `libcal-list` | Berkeley Heights and Summit libraries | Call `{origin}/ajax/calendar/list` per date with `c`, `date`, `perpage=100`, `page`, and `audience` query params from the library config. | Calendar IDs and audience IDs are source config, not constants. Page through `total_results`. |
| `localhop-calendar` | Bernards Township Library | Fetch `WidgetConfigCalendar/{calendarObjectId}` with `X-Parse-Application-Id`, derive organizations when not configured, then page `EventInstance` with Parse `where` on organization, date range, status, event type, and age group IDs. | Bernards currently uses organization `vs20XMKDTh` and age groups `t6CVlW0P9v`, `FCD8Alsg84`. |
| `eventorganiser-fullcal` | Long Hill Township Library | Call WordPress AJAX `admin-ajax.php?action=eventorganiser-fullcal&start=YYYY-MM-DD&end=YYYY-MM-DD&timeformat=g:i a&users_events=false`, plus category slugs. | Current slugs are `kids` and `teens`. |
| `joomla-event-booking-calendar` | Mountainside Public Library | Fetch the youth calendar page, parse `eb_event_link` anchors and tooltip text for title/date/time, then open detail pages for `eb-description-details` summaries. | Calendar tooltip is the canonical date source. |
| `configured-library-events` | Middlesex, Dunellen, Fanwood, Scotch Plains libraries | Use manually transcribed official flyer/search-indexed calendar data in `configuredEvents`; expand explicit dates and weekly/monthly recurrence. | Use only when source publishes flyer images, static program grids, or Cloudflare-blocked public calendar pages without a stable script-fetchable feed. |
| `configured-dated-workshops` | Lowe's, Michaels, arboretums, museums, nature centers, arts venues | Use dated `workshops[]` and `locations[]` from source config. | Refresh by checking the official program page and editing config, then run importer. |
| `configured-recurring-workshops` | Home Depot Kids Workshops, Sky Zone GLOW | Expand recurrence from source config across nearby locations. | Keep title/time/summary in source config; for Sky Zone, confirm the events-calendar JSON still lists Friday/Saturday GLOW before trusting recurrence. |
| `configured-regional-events` | Bridgewater Commons, The Mall at Short Hills, American Dream, Liberty Science Center, official municipal supplement pages, and downtown/SID sources | Use manually transcribed official/search-indexed event pages in `configuredEvents`; expand explicit dates and recurrence. | Use for strong regional or supplemental official sources whose public pages are blocked, JS-rendered, static, PDF-like, or outside the main municipal calendar feed. |
| `barnes-noble-store-calendar` | Barnes & Noble Bridgewater | Fetch the store calendar page, decode the Next.js/RSC hydration text, parse `monthEvents`, keep in-store child/family rows, and skip adult book clubs plus virtual national events. | The page may not honor future `month/year` query params; only import dates actually embedded in the current store page. |
| `today-at-apple-calendar` | Today at Apple Bridgewater | Fetch the Today at Apple calendar page, decode embedded Next.js/RSC data, read `topics[].collId === kids-and-families`, then join schedule IDs to `schedules` and `courses`. | Keep `storeNum` and `topicCollId` in source config. Use `/today/event/{courseSlug}/{scheduleId}/` as the official detail URL. |
| `wix-events-list` | The Dainty Den | Fetch `/event-list`, scan Wix Events warmup data for `scheduling.config`, title, slug, image, and ticketing, then convert UTC times to `America/New_York`. | Details URLs are `/event-details/{slug}`. Empty Wix descriptions should fall back to the official event title, not invented copy. |
| `firespring-calendar-grid` | Farmstead Arts Center | Fetch `event-calendar.html/calendar/YYYY/M` for every month in the window, parse `calendar-grid-event` anchors, derive the date from the event URL, and enrich detail pages for summaries. | Skip open hours/gallery hours; keep arts/theater/workshop-style events only. |
| `squarespace-eventlist` | Wagner Farm Arboretum | Fetch the Squarespace `/events` page, parse upcoming `eventlist-event` articles, read 24-hour time tags and inline descriptions, and expand long-running weekday listings into weekly records. | Skip past/cancelled entries. Use the source article text to decide RSVP vs see-source. |
| `civicplus-calendar` | Warren, Berkeley Heights, New Providence, Summit municipal calendars | For every configured `calendarIds[]` and every month in the import window, fetch `calendar.aspx?view=list&month=M&year=YYYY&CID=ID`. Parse `eventTitle_` list items, microdata dates/addresses, then open detail pages for summary and image. | Keep venue aliases in `municipal.locationOverrides`. Filter with `MUNICIPAL_COMMUNITY_EVENT_PATTERN` and `MUNICIPAL_SKIP_TITLE_PATTERN`. |
| `joomla-dpcalendar-raw` | Bernards municipal calendar | Call the DPCalendar raw endpoint with `option=com_dpcalendar&view=events&format=raw&limit=0`, optional `Itemid`, `start`, and `end`. Map `data.events`, tooltip calendar label, summary, and location. | Bernards current raw URL is stored in `municipal.rawEventsUrl`; do not scrape rendered calendar HTML. |
| `squarespace-calendar-list` | Middlesex municipal calendar | Fetch calendar page, read the `<noscript>` event list, split by event `<li><h1>`, parse title link, date range, image, and nested location list. | Do not stop at inner location `</ul>`. Community events can include "Committee Presents"; skip only explicit meetings/notices. |
| `nj-carnivals-jsonld-list` | NJ Carnivals shared source | Fetch paginated listing pages, parse structured Event JSON-LD inside listing sections, expand multi-day ranges, then open detail pages for per-date hours and better summary. | Use `locationOverrides` for noisy fair locations and intersection-based events. |

### Current Municipal Links

| Town | Link | Status | Next crawl path |
| --- | --- | --- | --- |
| Green Brook | `https://www.greenbrooktwp.org/` | `manual_review` | JavaScript/challenge-like official site; check news and recreation flyers manually before writing a parser. |
| Warren | `https://www.warrennj.org/calendar.aspx` | `importable` | `civicplus-calendar`, CIDs `14`, `23`. Annual recreation PDF remains manual. |
| Dunellen | `https://www.dunellen-nj.gov/` | `manual_review` | No stable municipal event feed found yet; check official news/recreation pages. |
| North Plainfield | `https://northplainfieldnj.gov/` | `manual_review` | Homepage exposes borough calendar/news snippets; likely needs site-specific parser plus recreation portal check. |
| Middlesex | `https://www.middlesexboro-nj.gov/calendar` | `importable` | `squarespace-calendar-list`; read static `<noscript>` list and filter meetings. |
| Watchung | `https://watchungnj.gov/recreation-dates` | `manual_review` | Direct fetch returns challenge/sparse content; manual recreation-date review or browser-backed parser. |
| Plainfield | `https://plainfieldsid.org/events-calendar` | `manual_review` | Strong public events source but GoDaddy/JS rendered; needs browser/JS parser. |
| Bound Brook | `https://boundbrook-nj.org/calendar/` | `manual_review` | All-in-One Event Calendar page; good candidate for an `ai1ec` parser. |
| Long Hill | `https://www.longhillnj.gov/calendar` | `manual_review` | Angular/fullcalendar style site; inspect network/API route before scraping. |
| South Bound Brook | `https://sbbnj.com/events/` | `manual_review` | Needs source-specific event page check; library coverage is via SCLSNJ. |
| South Plainfield | `https://www.southplainfieldnj.com/spnj/Departments/Departments/Recreation%20Department/Recreation%20Home/Recreation%20Calendar/` | `manual_review` | Old Zumu-style calendar is sparse; recreation/program PDF parser may be more useful. |
| Berkeley Heights | `https://berkeleyheights.gov/calendar.aspx` | `importable` | `civicplus-calendar`, CIDs `43`, `52`, `59`, `32`; many venues need `locationOverrides`. |
| Piscataway | `https://drupalpway.piscatawaynj.org/calendar` | `manual_review` | Current URL is stale/TLS fragile; confirm official source before parser work. |
| Bernards | `https://www.bernards.org/resident-calendar` | `importable` | `joomla-dpcalendar-raw`, `Itemid=965`, raw endpoint in source config. |
| Fanwood | `https://fanwoodnj.org/calendar/` | `manual_review` | Avada/Cloudflare-style blocking seen; likely browser-backed or manual. |
| Scotch Plains | `https://scotchplainsnj.gov/index.php/events` | `manual_review` | TLS/static flyer issues; needs source-specific parser or manual flyer extraction. |
| Bridgewater | `https://www.bridgewaternj.gov/township-information/calendar` | `manual_review` | Official calendar source needs separate review; library is covered by SCLSNJ. |
| New Providence | `https://www.newprov.us/calendar.aspx` | `importable` | `civicplus-calendar`, CID `25`; meetings/garbage/recycling calendars intentionally excluded. |
| Somerville | `https://www.somervillenj.org/calendar/` | `manual_review` | WordPress calendar currently showed office/notice items; find family/community source first. |
| Mountainside | `https://www.mountainside-nj.com/` | `manual_review` | No stable dated municipal event feed found yet; library parser is separate. |
| Summit | `https://www.cityofsummit.org/Calendar.aspx` | `importable` | `civicplus-calendar`, CIDs `28`, `41`; enrich detail pages for summaries/images. |

### Current Library Links

| Source | Link | Status | Crawl path |
| --- | --- | --- | --- |
| SCLSNJ branches: Bridgewater, North Plainfield, Somerville, Warren, Watchung | `https://sclsnj.libnet.info/events` | `importable` | Shared `sclsnj-libnet` endpoint with branch IDs `471`, `475`, `477`, `478`, `479`. |
| Plainfield Public Library | `https://plainfieldnj.librarycalendar.com/events/list` | `importable` | `librarycalendar-list`. |
| South Plainfield Public Library | `https://southplainfield.librarycalendar.com/events/list` | `importable` | `librarycalendar-list`. |
| Piscataway Public Library | `https://piscataway.librarycalendar.com/events/list` | `importable` | `librarycalendar-list`. |
| New Providence Memorial Library | `https://newprovidence.librarycalendar.com/events/list` | `importable` | `librarycalendar-list`. |
| Berkeley Heights Public Library | `https://bhplnj.libcal.com/calendar` | `importable` | `libcal-list`, calendar `21879`, child/family audience IDs in source config. |
| Summit Free Public Library | `https://summitlibrary.libcal.com/calendar` | `importable` | `libcal-list`, calendar `12857`, audience IDs `320`, `795`, `397`. |
| Bernards Township Library | `https://bernardslibrary.org/event-calendar/` | `importable` | `localhop-calendar`; use LocalHop Parse API, not rendered HTML. |
| Long Hill Township Library | `https://longhilllibrary.org/events-calendar/` | `importable` | `eventorganiser-fullcal`, categories `kids`, `teens`. |
| Mountainside Public Library | `https://mountainsidelibrary.org/programs/youth-calendar` | `importable` | `joomla-event-booking-calendar`. |
| Middlesex Public Library | `https://www.middlesexlibrarynj.org/kids/` | `importable` | `configured-library-events` from official flyer/program data. |
| Dunellen Public Library | `https://dunellenlibrary.events.mylibrary.digital/` | `importable` | `configured-library-events` from public search-indexed mylibrary.digital pages; direct fetch still gets Cloudflare challenge. |
| Fanwood Memorial Library | `https://fanwoodlibrary.events.mylibrary.digital/` | `importable` | `configured-library-events` from public search-indexed mylibrary.digital pages; direct fetch still gets Cloudflare challenge. |
| Scotch Plains Public Library | `https://scotlib.events.mylibrary.digital/` | `importable` | `configured-library-events` from public search-indexed mylibrary.digital pages; direct fetch still gets Cloudflare challenge. |

### Regional Links

Configured regional sources are intentionally data-driven. Do not write a new
parser unless the source exposes a stable feed.

| Source group | Crawl path |
| --- | --- |
| Home Depot Kids Workshops | `configured-recurring-workshops`; update recurrence and nearby `locations[]` when the official workshop cadence changes. |
| Sky Zone South Plainfield | `configured-recurring-workshops`; official events-calendar JSON currently lists Friday/Saturday GLOW, 8-10 PM, linking to the GLOW program page. |
| Lowe's, Michaels, Reeves-Reed, Trailside, Somerset EEC, Raptor Trust, Wallace House, Visual Arts Center | `configured-dated-workshops`; update dated `workshops[]` from official pages and keep coordinates in `locations[]`. |
| Branchburg Sports Complex Tod Squad | `configured-recurring-workshops`; official page lists Tuesday-Friday toddler play, 9:30-11:30 AM, with special holiday parties noted for manual refresh. |
| Branchburg Sports Complex Summer Camps, Future Stars at RVCC, Franklin Twp YMCA Camp SOAR, Hummingbird Studio, Raritan Headwaters/Fairview Farm | `configured-dated-workshops`; these were added during the Somerset new-town sweep from official venue/program pages and should be refreshed from the same pages before each season. |
| Barnes & Noble Bridgewater | `barnes-noble-store-calendar`; parse embedded `monthEvents`, filter to in-store storytime/children/young-reader/summer-reading style rows. |
| Today at Apple Bridgewater | `today-at-apple-calendar`; parse embedded `courses`, `schedules`, `topics`, and `stores`, then keep only `kids-and-families`. |
| The Dainty Den | `wix-events-list`; parse Wix Events scheduling blocks from `/event-list`, including camp/workshop dates, ticket price, and image. |
| Farmstead Arts Center | `firespring-calendar-grid`; fetch each month URL under `event-calendar.html/calendar/YYYY/M`, skip open hours, and enrich event detail pages. |
| Wagner Farm Arboretum | `squarespace-eventlist`; parse upcoming event articles and expand weekly Saturday garden entries through the import window. |
| Official municipal/recreation supplemental pages | Store as `municipal-supplemental-events` in `regionalSources`; use `configured-regional-events` for dated official pages such as Bernards Health Municipal Alliance, Watchung Centennial, and Scotch Plains recreation/news events, and keep recreation landing pages as `manual_review` until a stable parser exists. |
| Downtown/SID event pages | Store as `downtown-sid-events` in `regionalSources`; use `configured-regional-events` for dated pages such as Downtown Somerville Alliance and Summit Downtown while evaluating WordPress/Tribe or CivicPlus overlap. |
| Bridgewater Commons | `configured-regional-events` from public search-indexed official event pages; direct fetch still gets Cloudflare challenge. |
| The Mall at Short Hills | `configured-regional-events` from public search-indexed Simon/Eventbrite event pages; Simon contentstream API still gets PerimeterX challenge. |
| American Dream | `configured-regional-events` from official Dream Fan Fest/Contentful data plus public announcement pages; rendered full schedule still needs browser/API review for precise clinic and daily activation times. |
| Liberty Science Center | `configured-regional-events` from official BASF Kids' Lab, member events, and camp pages; skip adult-only LSC After Dark rows unless specifically requested. |
| Code Ninjas local centers | Keep as `manual_review`; NJ center pages do not expose dated schedules, and codeninjascamps.com results can be for other states. |
| ClubAir Warren | Keep as `manual_review`; specials page currently says weekly specials are not available/coming soon. |
| LEGO Store Bridgewater Commons | Keep as `manual_review`; StoreEvent promo cards are visible, but current store cards do not include local dated sessions. |
| KidStrong Watchung | Keep as `manual_review`; camp page asks users to view/contact for dates but does not expose dated sessions in HTML. |
| Fun Factory Sensory Gym, Kids Empire Watchung, Valhallan Bridgewater | Keep as `manual_review`; current public pages are service/location oriented without stable dated feeds. |
| Somerset new-town manual venues | Kids Empire Manville, Franklin Youth Center/Recreation, Colonial Park Spray Park and Gardens, Wonderworld Playzone, Snyder's Farm, Modern Motion, RVCC Planetarium, Leonard J. Buck Garden, Far Hills Race Meeting, Raritan Music Center, Millstone Valley Scenic Byway, and D&R Canal State Park - Millstone Valley are recorded as `manual_review`; keep them in the source sweep even when no dated feed is available yet. |
| Other manual regional venues | Keep as `manual_review` until a stable booking/calendar feed is found. |

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
