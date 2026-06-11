# Where2Go Data System

This folder owns source discovery, source configuration, event import, event
eligibility, data cleanup, and maintenance documentation.

The frontend reads standardized data from this folder. It should not know how a
source was found, how a website is crawled, or why an event was accepted or
excluded.

## Durable Files

```text
source-taxonomy.json    Source family tiers and sourceTypes
source-workflows.json   Add-town, refresh, manual source, rediscovery flows
event-rules.json        Event eligibility, lifecycle, and quality rules
event-sources.json      Durable town/source registry and parser config
events.json             Source-driven merged event history used by the app
sample-events.json      Fallback sample events
```

## Three Layers

The data backend has three layers:

- Source taxonomy: reusable source families. Tiers describe source type, not
  priority. A source may have multiple `sourceTypes`.
- Source registry: specific websites, URLs, parser names, parser parameters,
  service areas, source notes, and discovery audit results.
- Events: normalized activities in `data/events.json`, ready for app display.

## Source Taxonomy

Use `source-taxonomy.json` when adding a town or rediscovering sources.

Tier meaning is fixed:

- Tier 1: official public sources such as municipal government, county
  government, parks/recreation, public libraries, schools, municipal alliance,
  and official town news.
- Tier 2: public-interest institutions such as county parks, nature centers,
  museums, arts centers, historic sites, nonprofits, downtown groups, farmers
  markets, farms, gardens, and arboretums.
- Tier 3: commercial family activity sources such as malls, bookstores, craft
  stores, home-improvement workshops, indoor playgrounds, trampoline parks, kids
  gyms, sports complexes, studios, STEM centers, camps, restaurants, and cafes.
- Tier 4: regional discovery sources such as event directories, tourism
  calendars, fair/carnival directories, ticketing platforms, social/flyer
  sources, and search-result candidates.

Do not use tier as priority or trust. If priority is needed, use a separate
field such as `crawlPriority` or `authorityRank`.

## Source Registry

`event-sources.json` is the durable source registry. Existing fields should
continue to work, but new source records should prefer these fields when
practical:

- `id`: stable source id that should not change when URLs or parser notes change.
- `label`: human-readable source label.
- `tier`: source family tier from `source-taxonomy.json`.
- `sourceTypes`: one or more source type ids from `source-taxonomy.json`.
- `status`: importability/review status.
- `website`, `eventsUrl`: source URLs.
- `parser`, `parserVersion`: importer method and version/date when practical.
- `townId`: primary physical town for the source or venue.
- `servesTownIds`: towns served by a regional, county, library-system, mall, or
  nearby venue source.
- `address`, `lat`, `lng`: physical venue/source location when useful.
- `notes`: enough crawl notes to avoid rediscovery next time.
- `lastCheckedAt`, `lastSuccessfulImportAt`, `lastFailedImportAt`,
  `lastFailureReason`: source maintenance state when practical.

Relationship rules:

- `event.townId` means the event's actual location town.
- `source.townId` means the source or venue's primary physical town.
- `source.servesTownIds` means the source is relevant to those towns.
- Shared systems should keep branch/location fallback records in source config,
  not hard-coded importer logic.

## Status Rules

Use the existing source statuses and the workflow extensions below:

- `importable`: importer should automatically read this source.
- `manual_review`: useful source, but no stable importer exists yet or human
  review is needed.
- `service_area`: town is covered by a broader source or shared system.
- `blocked_by_bot_protection`: useful source, but direct script fetching is
  blocked.
- `reference_only`: keep for planning or discovery; do not import events
  automatically.
- `not_found`: a source type was checked for a town and no useful dated-event
  source was found.
- `broken`: a previously useful source or parser is currently failing and needs
  review.

## Event Rules

`event-rules.json` is the source of truth for event inclusion and quality.

Current policy:

- Routine refresh starts at today and looks forward, defaulting to 60 days unless
  source config says otherwise.
- Historical events already stored in `events.json` are kept.
- Do not delete future events only because they disappeared from a listing page.
- Mark an event cancelled only when the official source explicitly says
  cancelled.
- Keep kid-friendly and family-compatible events.
- Keep gray-area community events such as farmers markets, street fairs,
  outdoor concerts, movie nights, festivals, nature walks, and museum open days.
- Exclude only events children clearly cannot attend or that are clearly not
  suitable for children.

Every real imported event should include a stable `id`, `sourceId`, `title`,
`source`, `startsAt`, `endsAt`, `timezone`, `venue` or `venueName`, and `url` or
`sourceUrl`. Displayed map events should also have coordinates or a geocodable
address.

Summaries must contain activity content only. Date, time, venue, room, place,
and address belong in structured fields, not in `summary`.

## Workflows

Use `source-workflows.json` as the machine-readable workflow reference.

## Data Requests You Can Make

Use these request patterns for data work:

- "更新活动" or "refresh activities": refresh saved sources from today forward,
  keep historical events, and do not perform broad source rediscovery.
- "添加某 town": add or update the town record, discover source families from
  `source-taxonomy.json`, record found and `not_found` sources, then import
  eligible events from importable sources.
- "重新扫某 town 的信息源": run source rediscovery for that town, looking for new
  or missed sources such as malls, play venues, bookstores, farms, museums, kids
  gyms, parks, community sources, and regional directories.
- "添加这个信息源": classify and register the source. If it is ambiguous whether
  to import immediately, ask first.
- "添加这个信息源并抓活动": register the source, inspect or create parser notes,
  and import eligible kid/family-compatible events.
- "检查数据质量": run event validation and source/event audits, then report
  missing summaries, missing times, missing coordinates, broken source URLs, or
  parser failures.
- "整理规则/文档": update `source-taxonomy.json`, `source-workflows.json`,
  `event-rules.json`, or this README without changing frontend UI.
- "清理文件": identify obsolete generated files, temporary files, old audits, or
  duplicated docs before deleting them.

When the request says only "更新活动", do not search the wider web for new
venues. When the request says "新增 town" or "重新扫信息源", do perform source
discovery and record `not_found` results to avoid repeating the same search next
time.

### Add Town

When asked to add a town:

1. Create or update the town record with stable id, official name, county,
   state, ZIPs when known, and center coordinates when available.
2. Use `source-taxonomy.json` to search every source family, not just government
   and library sources.
3. Record found sources in `event-sources.json` with source types, status, URL
   fields, parser notes, and service-town relationships.
4. Record `not_found` discovery results for source families that were searched
   but produced no useful dated-event source.
5. Import eligible kid/family-compatible events from today forward for
   importable sources.
6. Merge events into `events.json` without deleting older historical records.
7. Run validation and record unresolved quality issues.

### Refresh Existing Sources

When asked to update activities without rediscovery:

1. Reuse known importable/configured sources from `event-sources.json`.
2. Reuse stored parser names, endpoints, parameters, fallback locations, and
   crawl notes.
3. Fetch events from today forward through the source lookahead window.
4. Merge by stable event id or duplicate matching rules.
5. Update `lastSeenAt` for observed events and preserve `firstSeenAt`.
6. Record source failures when practical.
7. Do not perform broad web search for newly opened venues.

### Rediscover Sources

Use rediscovery only when adding a new town or when explicitly asked to rescan a
town's sources. Rediscovery should look for newly opened or previously missed
malls, play venues, kids gyms, bookstores, farms, museums, parks, community
sources, and regional sources. Record both found and `not_found` results.

### Manually Add Source

When asked to add a specific source, ask whether the user wants source
registration only or registration plus immediate event import if the request is
ambiguous. Classify the source, record enough parser/review notes to revisit it,
and import events only when requested or clearly implied.

## Merge And Duplicate Rules

- `sourceId` should be stable.
- Prefer event ids based on `sourceId + upstream externalId + date`.
- If no upstream id exists, use `sourceId + normalized title + startsAt + venue
  hash`.
- Avoid creating new records for small title, URL, or summary changes.
- For duplicates, prefer organizer/venue official pages, then official
  municipal/county/library reposts, then ticketing pages, then third-party
  directories.

## Quality Rules

Every import should finish with a quality audit. The importer may repair
deterministic gaps such as mirrored `url`/`sourceUrl`, mirrored
`venue`/`venueName`, missing timezone, missing duration, and missing coordinates
when a known venue or address can be geocoded.

Do not invent activity descriptions. Extract concrete activity content from the
source page when possible; otherwise leave `summary` empty and report it.

When an official event page includes flyer images or other event images, check
normal page text first. Only inspect image text when the HTML text does not
provide the needed address, room, date, or time. Use image alt text, captions,
visible flyer text, OCR, or manual review before deciding that the field is truly
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
| `engagedpatrons-list` | Harding Kemmerer Library | Fetch EngagedPatrons `Events.cfm` audience pages, parse `LEEventWrapper` rows, normalize single or ranged times, and keep child/family-compatible programs. | Some useful event details are represented by image-backed rows on the library site; use the EngagedPatrons list as the stable text source. |
| `mylibrary-homepage-events` | Kenilworth and Hillside public libraries | Fetch the official WordPress homepage, read the server-rendered `Upcoming Events` list, parse title/date/time/location and mylibrary event IDs, then filter kid/family-compatible rows. | Detail pages on `mylibrary.digital` are Cloudflare-protected, but the official homepage exposes enough text for import. Check homepage slider images when a title looks incomplete. |
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
| `greenbrook-ajax-calendar` | Green Brook municipal calendar | Fetch official `/ajax/get_all_events.php` JSON rows, strip leading time from titles, and keep community/family-safe rows. | Current future rows after 2026-06-11 are meetings/recycling/service items, so the parser may import zero visible events. |
| `ai1ec-ical-calendar` | Bound Brook municipal calendar | Fetch WordPress All-in-One Event Calendar iCal export, parse VEVENT date/title/description/URL, and keep community/family-safe rows. | Current future rows after 2026-06-11 are meetings/court/commission rows, so the parser may import zero visible events. |
| `savvycitizen-plugin` | Millstone municipal calendar | Fetch the official embedded SavvyCitizen agenda plugin, parse month/day/item blocks, and keep community/family-safe rows. | Millstone `calendar.php` uses a monthly plugin view; the homepage agenda plugin has the stable list format. Yard sales are imported as family-safe gray-area events, while bulk pickup and meetings are skipped. |
| `eggzack-event-archive` | Hillside municipal events archive | Fetch EggZack server-rendered event archive cards, parse title/detail URL/listing date/time, and keep community/family-safe rows. | Current archive has only past May 2026 events after the project cutoff, so the parser may import zero visible events. |
| `nj-carnivals-jsonld-list` | NJ Carnivals shared source | Fetch paginated listing pages, parse structured Event JSON-LD inside listing sections, expand multi-day ranges, then open detail pages for per-date hours and better summary. | Use `locationOverrides` for noisy fair locations and intersection-based events. |

### Current Municipal Links

| Town | Link | Status | Next crawl path |
| --- | --- | --- | --- |
| Green Brook | `https://www.greenbrooktwp.org/ajax/get_all_events.php` | `importable` | `greenbrook-ajax-calendar`; official AJAX JSON currently has no future kid/family rows after 2026-06-11, only meetings/recycling/service items. |
| Warren | `https://www.warrennj.org/calendar.aspx` | `importable` | `civicplus-calendar`, CIDs `14`, `23`. Annual recreation PDF remains manual. |
| Dunellen | `https://www.dunellen-nj.gov/` | `manual_review` | No stable municipal event feed found yet; check official news/recreation pages. |
| North Plainfield | `https://northplainfieldnj.gov/` | `manual_review` | Homepage exposes borough calendar/news snippets; likely needs site-specific parser plus recreation portal check. |
| Middlesex | `https://www.middlesexboro-nj.gov/calendar` | `importable` | `squarespace-calendar-list`; read static `<noscript>` list and filter meetings. |
| Watchung | `https://watchungnj.gov/recreation-dates` | `manual_review` | Direct fetch returns challenge/sparse content; manual recreation-date review or browser-backed parser. |
| Plainfield | `https://plainfieldsid.org/events-calendar` | `manual_review` | Strong public events source but GoDaddy/JS rendered; needs browser/JS parser. |
| Bound Brook | `https://boundbrook-nj.org/calendar/` | `importable` | `ai1ec-ical-calendar`; official iCal export currently has no future kid/family rows after 2026-06-11, only meetings/court/commission rows. |
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
| Millstone | `https://millstoneboro.org/calendar.php` | `importable` | `savvycitizen-plugin`; fetch the official homepage agenda plugin and keep community/family rows such as Annual Yard Sale while skipping bulk pickup and meetings. |

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
| Harding Kemmerer Library | `https://engagedpatrons.org/Events.cfm?SiteID=4662&Audience=C` | `importable` | `engagedpatrons-list`; use children/teen audience pages from EngagedPatrons. |
| Kenilworth Public Library | `https://kenilworthlibrary.org/` | `importable` | `mylibrary-homepage-events`; parse the official homepage `Upcoming Events` list because detail pages are Cloudflare-protected. |
| Hillside Public Library | `https://hillsidepl.org/` | `importable` | `mylibrary-homepage-events`; parse homepage text and cross-check slideshow images for flyer-only clues. |

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
