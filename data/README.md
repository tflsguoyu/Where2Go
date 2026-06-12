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
source-refresh-runbook.md Generated per-source refresh checklist
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
- Statewide, regional, county, tourism, directory, and carnival sources still
  write each event to the town where the event physically happens.
- If the physical town can be read from an address but that town is not yet in
  the registry, do not auto-add the town. Keep `event.townId` empty, preserve
  the raw locality/address, mark `townAssignmentStatus: "needs_registry_town"`,
  and treat the event as pending review.
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
  suitable for children. Municipal adult/senior programming such as chair yoga,
  senior-center movie days, adult wellness classes, and senior camp/social
  activities should not be imported even when the title contains otherwise
  kid-compatible words such as yoga, movie, or camp.

Every real imported event should include a stable `id`, `sourceId`, `title`,
`source`, `startsAt`, `endsAt`, `timezone`, `venue` or `venueName`, and `url` or
`sourceUrl`. Displayed map events should also have coordinates or a geocodable
address. Every event should ultimately have a `townId`; events from regional or
statewide sources are assigned by physical venue/address. If the town is outside
the current registry, leave the event pending review instead of adding a town
automatically.

Date ranges should be expanded so every calendar day inside the range is
represented. Prefer one event record per active day unless the source clearly
describes a single overnight event. If the source only gives a broad range and it
is unclear which days are active, keep the useful records but mark the
uncertainty with fields such as `dateStatus`, `dateExpansionStatus`, `status:
"review"`, lower `confidence`, or `reviewNotes`.

When a source says an event is all day, do not invent a start or end time. Check
official venue/source hours for that date first. If exact hours are confirmed,
use them. If exact hours are not available or not trustworthy, leave the exact
time blank where the event shape allows it, keep `timeLabel: "All day"` when
useful, and mark `timeStatus` as unconfirmed or needing review.

When a source gives a venue but no street address, search for the exact address
before writing the event: first the official venue/source page, then reliable map
or directory references. If an exact address still cannot be found, leave
`address` blank rather than guessing. If only a likely or approximate address is
available, mark `addressStatus: "approximate"` or `addressStatus:
"needs_review"` and lower `confidence`.

`venueName` is the app's readable place label. It should not be only a street
address, intersection, route, vague downtown area, or generic source placeholder.
If the source gives only an address but the registry has a confirmed venue or
library name, use the confirmed name for `venueName` and keep the street address
in `address`. For true street-fair, parade, downtown, route, or multi-site
events, keep the broad place label only with `addressStatus: "approximate"` or
`addressStatus: "needs_review"` and a short `reviewNotes` explanation.
When a source gives a place-like display name without a full address, such as a
gazebo, bandstand, field, playground, pavilion, plaza, or named room, look up
that display name together with the town/venue context and use the resolved
address or coordinates for navigation. Mark the lookup with
`addressLookupSource: "place_name_reverse_lookup"` when practical. If the lookup
finds a likely but not official match, keep the useful address, mark
`addressStatus: "approximate"` or `addressStatus: "needs_review"`, and preserve
the display name in `venueName` instead of falling back to a generic municipal
default.

When the same activity has multiple source pages, the app should display only
one source link. Prefer the official organizer, venue, municipal, library, or
program detail page. Use discovery, directory, ticketing, or reposted pages such
as Patch or Eventbrite only when no official page is available. Extra evidence
links may stay in source data for review, but the visible app button should
remain a single `Source page`.

Prefer accurate missing data plus explicit review markers over guessed data.
When page text is incomplete, inspect official images/flyers for date, time,
room, venue, or address details. If a value comes from weak evidence, image text,
or judgment, mark it clearly so the data status page and accuracy score can help
with later manual QA.

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

Field-level uncertainty should be explicit. Use markers such as `dateStatus`,
`dateExpansionStatus`, `timeStatus`, `addressStatus`, `townAssignmentStatus`,
`summaryStatus`, `status: "review"`, `confidence`, and `reviewNotes` when dates,
times, addresses, town assignment, or summaries are inferred, incomplete, or
need human confirmation.

## Source Crawl Runbook

Use this section before re-investigating source pages. The durable source of
truth remains `data/event-sources.json`; this runbook records the crawl path and
known blockers so future refreshes do not need fresh discovery.

For the complete per-source checklist, regenerate and read
`source-refresh-runbook.md`. That generated file lists every `importable` source
with source URL, parser, key parameters, configured event/workshop counts, and
the exact `event-sources.json` path that owns the refresh configuration:

```bash
node scripts/generate-source-runbook.mjs
```

### Parser Methods

| Parser | Where used | Crawl method | Notes |
| --- | --- | --- | --- |
| `sclsnj-libnet` | Somerset County Library System shared source | Request `eventEndpoint` with `event_type=0` and a JSON `req` containing `date`, `days`, `private:false`, `locations:branchIds`, and encoded `ages:ageFilters`. Load `locationEndpoint` in parallel and fall back to `sharedSources.sclsnj-libnet.locations`. | Keep branch IDs and fallback coordinates in `event-sources.json`; do not rediscover branch addresses in code. |
| `communico-libnet` | Franklin Township Public Library and Maplewood Memorial Library | Request the source `eventEndpoint` with `event_type=0` and a JSON `req` containing `date`, `days`, `private:false`, configured `locations:branchIds`, and encoded `ages:ageFilters`. Load `locationEndpoint` in parallel and fall back to source `locations`. | Same Communico/LibNet shape as SCLSNJ, but each library has its own client host and branch IDs. |
| `librarycalendar-list` | Plainfield, South Plainfield, Piscataway, New Providence libraries | Fetch `/events/list`, parse `lc-event--list` cards, keep child/family audiences, then enrich each detail page with JSON-LD for exact time, image, and room/location. | Skip closings. If list HTML changes, inspect card `aria-label` first. |
| `libcal-list` | Berkeley Heights, Summit, and Bernardsville libraries | Call `{origin}/ajax/calendar/list` per date with `c`, `date`, `perpage=100`, `page`, and `audience` query params from the library config. | Calendar IDs and audience IDs are source config, not constants. Page through `total_results`. For a new LibCal source, confirm `calendarId` plus audience IDs from the rendered calendar page before changing status to `importable`. |
| `localhop-calendar` | Bernards Township Library | Fetch `WidgetConfigCalendar/{calendarObjectId}` with `X-Parse-Application-Id`, derive organizations when not configured, then page `EventInstance` with Parse `where` on organization, date range, status, event type, and age group IDs. | Bernards currently uses organization `vs20XMKDTh` and age groups `t6CVlW0P9v`, `FCD8Alsg84`. |
| `eventorganiser-fullcal` | Long Hill Township Library | Call WordPress AJAX `admin-ajax.php?action=eventorganiser-fullcal&start=YYYY-MM-DD&end=YYYY-MM-DD&timeformat=g:i a&users_events=false`, plus category slugs. | Current slugs are `kids` and `teens`. |
| `joomla-event-booking-calendar` | Mountainside Public Library | Fetch the youth calendar page, parse `eb_event_link` anchors and tooltip text for title/date/time, then open detail pages for `eb-description-details` summaries. | Calendar tooltip is the canonical date source. |
| `joomla-jevents-calendar` | Springfield Free Public Library | Fetch the Joomla JEvents calendar page, read the embedded `responsiveEvents` JSON, parse `eventcontent` for title, detail link, category, date, and time, then keep kids/teen rows. | The stored URL may include a dated month path; update it when the library changes its calendar route. |
| `engagedpatrons-list` | Harding Kemmerer and Whippanong libraries | Fetch EngagedPatrons `Events.cfm` audience pages, parse `LEEventWrapper` rows, normalize single or ranged times, and keep child/family-compatible programs. | Some useful event details are represented by image-backed rows on the library site; use the EngagedPatrons list as the stable text source. |
| `mylibrary-homepage-events` | Kenilworth and Hillside public libraries | Fetch the official homepage, read the server-rendered `Upcoming Events` list, parse title/date/time/location and mylibrary event IDs, then filter kid/family-compatible rows. | Detail pages on `mylibrary.digital` are Cloudflare-protected, but the official homepage exposes enough text for import. Check homepage slider images when a title looks incomplete. |
| `mylibrary-featured-carousel` | Highland Park and Union public libraries | Fetch the `embed/featured_carousel` page, parse carousel items for `/event?id=`, image title/alt text, and `<small>` date text, then keep featured child/family-compatible rows. | Detail pages may remain Cloudflare-protected; use the embed as the stable lightweight source. |
| `squarespace-library-calendar` | Cranford Public Library | Fetch the official Squarespace calendar page, parse summary/event cards for title, detail URL, date, 24-hour start/end times, image, and summary, then keep children/teen/family-compatible rows. | Use when a library calendar is rendered by Squarespace summary blocks or event list cards. Detail pages often expose Google Calendar/ICS links for manual verification. |
| `nbfpl-static-events` | New Brunswick Free Public Library | Fetch the official `/events` page, parse server-rendered `<div class="event">` rows with `event-title`, `details`, room/location text, summary, and registration links, then expand explicit multi-date and weekly rows. | Skip undated exhibits, appointment-only rows, and adult-only sections; keep kids, teens, all-ages, and family-compatible rows. |
| `assabet-rss` | Chester and Florham Park libraries | Fetch Assabet Interactive `/calendar/upcoming-events.rss`, parse RSS items for title, link, description, categories, `pubDate`, room/location, and `media:content` image, then keep children/teen/family/all-ages rows. | Use when the official site embeds an Assabet calendar iframe. Keep only one importable town record for a shared library to avoid duplicate events. Adult-tagged rows are skipped unless a child/family/teen category is also present. |
| `events-manager-grid` | Metuchen Public Library | Fetch the WordPress Events Manager grid page and paginated `?pno=N` pages, parse `em-event em-item` cards for title, detail URL, date, time, audience categories, and tags. | Store `maxPages` in source config. This parser uses server-rendered cards and does not need the Events Manager AJAX action. |
| `modern-events-calendar-html` | East Hanover Public Library | Fetch the public WordPress Modern Events Calendar page and parse server-rendered `mec-event-article` cards for title, detail URL, occurrence date, time, labels, and categories. | Current importer reads the public HTML list/month cards and filters Children, Pre-School, Teen, and family-compatible rows; extend to MEC AJAX pagination if the library stops rendering enough upcoming rows. |
| `configured-library-events` | Middlesex, Dunellen, Fanwood, Scotch Plains libraries | Use manually transcribed official flyer/search-indexed calendar data in `configuredEvents`; expand explicit dates and weekly/monthly recurrence. | Use only when source publishes flyer images, static program grids, or Cloudflare-blocked public calendar pages without a stable script-fetchable feed. |
| `configured-dated-workshops` | Lowe's, Michaels, arboretums, museums, nature centers, arts venues | Use dated `workshops[]` and `locations[]` from source config. | Refresh by checking the official program page and editing config, then run importer. |
| `configured-recurring-workshops` | Home Depot Kids Workshops, Sky Zone GLOW | Expand recurrence from source config across nearby locations. | Keep title/time/summary in source config; for Sky Zone, confirm the events-calendar JSON still lists Friday/Saturday GLOW before trusting recurrence. |
| `configured-regional-events` | Bridgewater Commons, The Mall at Short Hills, American Dream, Liberty Science Center, official municipal supplement pages, and downtown/SID sources | Use manually transcribed official/search-indexed event pages in `configuredEvents`; expand explicit dates and recurrence. | Use for strong regional or supplemental official sources whose public pages are blocked, JS-rendered, static, PDF-like, or outside the main municipal calendar feed. |
| `barnes-noble-store-calendar` | Barnes & Noble Bridgewater | Fetch the store calendar page, decode the Next.js/RSC hydration text, parse `monthEvents`, keep in-store child/family rows, and skip adult book clubs plus virtual national events. | The page may not honor future `month/year` query params; only import dates actually embedded in the current store page. |
| `today-at-apple-calendar` | Today at Apple Bridgewater | Fetch the Today at Apple calendar page, decode embedded Next.js/RSC data, read `topics[].collId === kids-and-families`, then join schedule IDs to `schedules` and `courses`. | Keep `storeNum` and `topicCollId` in source config. Use `/today/event/{courseSlug}/{scheduleId}/` as the official detail URL. |
| `wix-events-list` | The Dainty Den | Fetch `/event-list`, scan Wix Events warmup data for `scheduling.config`, title, slug, image, and ticketing, then convert UTC times to `America/New_York`. | Details URLs are `/event-details/{slug}`. Empty Wix descriptions should fall back to the official event title, not invented copy. |
| `firespring-calendar-grid` | Farmstead Arts Center | Fetch `event-calendar.html/calendar/YYYY/M` for every month in the window, parse `calendar-grid-event` anchors, derive the date from the event URL, and enrich detail pages for summaries. | Skip open hours/gallery hours; keep arts/theater/workshop-style events only. |
| `squarespace-eventlist` | Wagner Farm Arboretum | Fetch the Squarespace `/events` page, parse upcoming `eventlist-event` articles, read 24-hour time tags and inline descriptions, and expand long-running weekday listings into weekly records. | Skip past/cancelled entries. Use the source article text to decide RSVP vs see-source. |
| `civicplus-calendar` | Warren, Berkeley Heights, New Providence, Summit, and Madison municipal calendars | For every configured `calendarIds[]` and every month in the import window, fetch `calendar.aspx?view=list&month=M&year=YYYY&CID=ID`. Parse `eventTitle_` list items, microdata dates/addresses, then open detail pages for summary and image. | Keep venue aliases in `municipal.locationOverrides`. Filter with `MUNICIPAL_COMMUNITY_EVENT_PATTERN` and `MUNICIPAL_SKIP_TITLE_PATTERN`. When converting a Manual CivicPlus source, save all confirmed CIDs in `event-sources.json` so normal refreshes can repeat the same crawl. |
| `joomla-dpcalendar-raw` | Bernards municipal calendar | Call the DPCalendar raw endpoint with `option=com_dpcalendar&view=events&format=raw&limit=0`, optional `Itemid`, `start`, and `end`. Map `data.events`, tooltip calendar label, summary, and location. | Bernards current raw URL is stored in `municipal.rawEventsUrl`; do not scrape rendered calendar HTML. |
| `county-events-calendar` | Shared county calendar sources and Somerset County Government | Import only from `sharedSources` or configured county regional sources. Prefer JSON-LD `Event` records; fall back to source-specific HTML/calendar parsing for Union, Middlesex, Somerset, Morris, and Essex when needed. | Somerset month pages use a configured month query and should be crawled month-by-month through the import window. |
| `govoffice-calendar` | Garwood and Morristown municipal calendars | Fetch the GovOffice calendar month pages through the import window with configured `Type`, `SEC`, month, and year parameters. Parse `eventLink` and `eventTip` for title, date/time, and detail link. | Apply municipal default venue/address and location overrides after parsing. |
| `eventespresso-datetimes` | Morris Plains municipal recreation registrations | Fetch the Event Espresso `/wp-json/ee/v4.8.36/datetimes` endpoint with `order_by=DTT_EVT_start`, then fetch `/events/{EVT_ID}` for summaries and source links. | Keep `eventEspressoApiBase` and `eventEspressoLimit` in source config. Filter to kid/family programs such as camps, LEGO, science, sports, art, theatre, and workshops; skip memberships, permits, early drop-off, and admin registration rows. |
| `revize-calendar` | Far Hills and Branchburg municipal calendars | Fetch the municipal calendar page and parse JSON-LD `Event` records. Use noon fallback for date-only rows and apply municipal venue/default address logic. | Confirm the page still emits JSON-LD before trusting future refreshes. |
| `granicus-calendar` | Franklin Township municipal calendar | Fetch the Granicus municipal calendar page, parse JSON-LD `Event` rows, filter family/community content, and normalize location/address details. | This is a municipal JSON-LD importer, separate from county Granicus-style calendars. |
| `alphadog-recreation-page` | Raritan recreation page | Fetch the recreation page and parse JSON-LD `Event` rows from the page. | Keep this source tied to the official recreation page and recheck if the page stops publishing JSON-LD. |
| `squarespace-calendar-list` | Middlesex municipal calendar | Fetch calendar page, read the `<noscript>` event list, split by event `<li><h1>`, parse title link, date range, image, and nested location list. | Do not stop at inner location `</ul>`. Community events can include "Committee Presents"; skip only explicit meetings/notices. |
| `greenbrook-ajax-calendar` | Green Brook municipal calendar | Fetch official `/ajax/get_all_events.php` JSON rows, strip leading time from titles, and keep community/family-safe rows. | Current future rows after 2026-06-11 are meetings/recycling/service items, so the parser may import zero visible events. |
| `ai1ec-ical-calendar` | Bound Brook municipal calendar | Fetch WordPress All-in-One Event Calendar iCal export, parse VEVENT date/title/description/URL, and keep community/family-safe rows. | Current future rows after 2026-06-11 are meetings/court/commission rows, so the parser may import zero visible events. |
| `savvycitizen-plugin` | Millstone municipal calendar | Fetch the official embedded SavvyCitizen agenda plugin, parse month/day/item blocks, and keep community/family-safe rows. | Millstone `calendar.php` uses a monthly plugin view; the homepage agenda plugin has the stable list format. Yard sales are imported as family-safe gray-area events, while bulk pickup and meetings are skipped. |
| `eggzack-event-archive` | Hillside municipal events archive | Fetch EggZack server-rendered event archive cards, parse title/detail URL/listing date/time, and keep community/family-safe rows. | Current archive has only past May 2026 events after the project cutoff, so the parser may import zero visible events. |
| `tribe-events-calendar` | Visit Somerset, Cora Hartshorn, Downtown Metuchen, South Bound Brook, and other WordPress Tribe sources | Call `/wp-json/tribe/events/v1/events` with `per_page`, `start_date`, `end_date`, and `page`. Page through `total_pages` or configured `maxPages`, then map venue city/address to a town. | Store nonstandard endpoint/per-page/max-page settings in source config. |
| `newark-museum-events` | Newark Museum of Art | Fetch the official events listing HTML, parse `event-item` cards for `data-datetime`, title, link, terms, and image, then keep family/kids/community rows. | Use source terms and title/summary text for eligibility; do not import adult-only museum programming. |
| `njpac-events-list` | New Jersey Performing Arts Center | Fetch the official tickets/events listing, parse `content-row` blocks, read `data-performances`, genre/highlight text, title link, and lazy image, then keep family/kids/arts-education/community rows. | One listing may contain multiple performances; emit one event per performance. |
| `prudential-center-events` | Prudential Center Family Events | Fetch the official events page and parse only event cards marked `family-shows`. Read month/day/time/title/link/image and build ticketed event records. | Recheck year handling around New Year because listing cards may omit the year. |
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
| Madison | `https://www.rosenet.org/Calendar.aspx` | `importable` | `civicplus-calendar`, CIDs `61`, `34`, `24`, `25`, `52`, `23`, `31`, `37`, `49`; confirmed on 2026-06-12 from the official RoseNet calendar filter/list page. |
| Millstone | `https://millstoneboro.org/calendar.php` | `importable` | `savvycitizen-plugin`; fetch the official homepage agenda plugin and keep community/family rows such as Annual Yard Sale while skipping bulk pickup and meetings. |
| Morris Plains | `https://morrisplainsboro.org/wp-json/ee/v4.8.36/datetimes` | `importable` | `eventespresso-datetimes`; official recreation registration API exposes dated youth camps/classes. Fetch datetimes, then event details, and keep kid/family programs while skipping membership/permit/admin rows. |

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
| Bernardsville Public Library | `https://events.bernardsvillelibrary.org/` | `importable` | `libcal-list`, calendar `21381`, audience IDs `9909`, `9910`, `9908`. Confirmed 2026-06-12 via `/ajax/calendar/list`. |
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
| New Brunswick Free Public Library | `https://www.nbfpl.org/events` | `importable` | `nbfpl-static-events`; parse the official static event rows and expand dated kids/teen/all-ages programs. |
| Whippanong Library | `https://engagedpatrons.org/Events.cfm?SiteID=8537` | `importable` | `engagedpatrons-list`; use children/teen audience pages from the Engaged Patrons iframe linked by the official library page. |
| East Hanover Public Library | `https://easthanoverlibrary.com/calendar/` | `importable` | `modern-events-calendar-html`; parse server-rendered Modern Events Calendar cards for Children, Pre-School, and Teen rows. |
| Chester Library | `https://chesterlib.assabetinteractive.com/calendar/upcoming-events.rss` | `importable` | `assabet-rss`; one importable source under Chester borough serves both Chester borough and Chester township. |
| Florham Park Public Library | `https://florhamparklib.assabetinteractive.com/calendar/upcoming-events.rss` | `importable` | `assabet-rss`; official library page embeds Assabet Interactive and RSS imports children/family/teen rows. |
| Metuchen Public Library | `https://www.metuchenlibrary.org/calendar/event-grid/` | `importable` | `events-manager-grid`; parse paginated WordPress Events Manager cards up to configured `maxPages`. |
| Cranford Public Library | `https://www.cranfordlibrary.org/cranford-library-calendar` | `importable` | `squarespace-library-calendar`; parse the official Squarespace calendar cards and filter children, teen, family, storytime, craft, and similar rows. |
| Union Public Library | `https://uplnj.events.mylibrary.digital/embed/featured_carousel` | `importable` | `mylibrary-featured-carousel`; parse the public carousel embed because direct mylibrary event pages are Cloudflare-protected. |

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

Refresh only one or more importer families when a broad source refresh is
unnecessarily slow:

```bash
node scripts/import-source-events.mjs --days 60 --only libcal-list,mylibrary-homepage-events
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
