#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const TIMEZONE = "America/New_York";
const SOURCES_FILE = new URL("../data/event-sources.json", import.meta.url);
const EVENTS_FILE = new URL("../data/events.json", import.meta.url);

const SCLSNJ_FALLBACK_LOCATIONS = [
  {
    id: "471",
    name: "Bridgewater branch",
    line1: "1 Vogt Dr.",
    locality: "Bridgewater",
    stateprovincecounty: "NJ",
    ziporpostcode: "08807",
    lat: "40.58792",
    lon: "-74.607602"
  },
  {
    id: "475",
    name: "North Plainfield branch",
    line1: "6 Rockview Ave.",
    locality: "North Plainfield",
    stateprovincecounty: "NJ",
    ziporpostcode: "07060",
    lat: "40.620859",
    lon: "-74.43402"
  },
  {
    id: "477",
    name: "Somerville branch",
    line1: "35 West End Ave.",
    locality: "Somerville",
    stateprovincecounty: "NJ",
    ziporpostcode: "08876",
    lat: "40.5704",
    lon: "-74.618922"
  },
  {
    id: "478",
    name: "Warren Township branch",
    line1: "42 Mountain Blvd.",
    locality: "Warren",
    stateprovincecounty: "NJ",
    ziporpostcode: "07059",
    lat: "40.619261",
    lon: "-74.490372"
  },
  {
    id: "479",
    name: "Watchung branch",
    line1: "20 Stirling Rd.",
    locality: "Watchung",
    stateprovincecounty: "NJ",
    ziporpostcode: "07069",
    lat: "40.638195",
    lon: "-74.450275"
  }
];

const AGE_ORDER = ["baby", "toddler", "preschool", "early-elementary", "tween", "teen"];
const MONTHS = new Map([
  ["january", "01"],
  ["february", "02"],
  ["march", "03"],
  ["april", "04"],
  ["may", "05"],
  ["june", "06"],
  ["july", "07"],
  ["august", "08"],
  ["september", "09"],
  ["october", "10"],
  ["november", "11"],
  ["december", "12"]
]);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function todayInNewYork() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localIso(rawDateTime) {
  if (!rawDateTime) {
    return null;
  }
  return rawDateTime.replace(" ", "T");
}

function parseLocalDateTime(datePart, timePart) {
  const match = `${datePart} ${timePart}`.match(
    /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(?:@\s*)?(\d{1,2}):(\d{2})(am|pm)$/i
  );
  if (!match) {
    return null;
  }
  const [, monthName, day, year, hourRaw, minute, meridiem] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (!month) {
    return null;
  }
  let hour = Number(hourRaw);
  if (meridiem.toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem.toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${year}-${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function durationMinutes(startRaw, endRaw) {
  const start = new Date(localIso(startRaw));
  const end = new Date(localIso(endRaw));
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return null;
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

function addressFor(location) {
  return [location?.line1, location?.locality, location?.stateprovincecounty, location?.ziporpostcode]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .join(", ");
}

function hasChildAudience(audiences, title = "") {
  const audienceText = audiences.join(" ").toLowerCase();
  const titleText = title.toLowerCase();
  const explicitYouthTitle =
    /baby|babies|toddler|preschool|pre-school|children|child|kids|family|families|elem|tween|teen|storytime|lego/.test(
      titleText
    );
  const youthAudience =
    /baby|babies|toddler|preschool|pre-school|children|child|kids|family|families|elem|tween|teen/.test(
      audienceText
    );
  const adultsOnly = audiences.length > 0 && audiences.every((audience) => /adult|senior/.test(audience.toLowerCase()));
  if (adultsOnly && !explicitYouthTitle) {
    return false;
  }
  return explicitYouthTitle || youthAudience || (!adultsOnly && /everyone|all ages|open to all/.test(audienceText));
}

function inferAgeBandsFromText(...values) {
  const text = values.join(" ").toLowerCase();
  const bands = new Set();

  if (/baby|babies|birth/.test(text)) bands.add("baby");
  if (/toddler|0-2|ages 0|18 months/.test(text)) bands.add("toddler");
  if (/pre-school|preschool|ages 3|ages 4|ages 5/.test(text)) bands.add("preschool");
  if (/kids|children|child|grade k|grades k|elem|lego|chess|craft/.test(text)) bands.add("early-elementary");
  if (/tween|grades 3|grades 4|grades 5|grades 6|ages 9|ages 10|ages 11|ages 12/.test(text)) bands.add("tween");
  if (/teen|grades 7|grades 8|grades 9|ages 13|ages 14|ages 15|ages 16|ages 17/.test(text)) bands.add("teen");
  if (/families|family|all ages|everyone|open to all/.test(text)) {
    bands.add("baby");
    bands.add("toddler");
    bands.add("preschool");
    bands.add("early-elementary");
  }

  if (bands.size === 0) {
    bands.add("early-elementary");
  }
  return AGE_ORDER.filter((band) => bands.has(band));
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "Where2Go data importer"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,*/*",
      "user-agent": "Where2Go data importer"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

function buildSclsnjEventsUrl(source, startDate, days) {
  const request = {
    date: startDate,
    days,
    private: false,
    locations: source.branchIds,
    ages: source.ageFilters.map((age) => encodeURIComponent(age))
  };
  const params = new URLSearchParams({
    event_type: "0",
    req: JSON.stringify(request)
  });
  return `${source.eventEndpoint}?${params.toString()}`;
}

function isSclsnjLowAgeEvent(event, filters) {
  const ages = new Set(event.agesArray ?? []);
  return filters.some((age) => ages.has(age));
}

function sclsnjRegistrationLabel(event) {
  if (String(event.changed) === "1") return "Cancelled";
  if (event.reg_url || String(event.third_party_reg) === "1") return "Ticket";
  if (String(event.allow_reg) !== "1") return "Drop-in";
  return "RSVP";
}

function normalizeSclsnjUrl(event) {
  if (event.url) {
    return event.url.replace("https://sclsnj.libnet.info//event/", "https://sclsnj.libnet.info/event/");
  }
  return `https://sclsnj.libnet.info/event/${event.id}`;
}

async function loadSclsnjLocations(source) {
  try {
    const locations = await fetchJson(source.locationEndpoint);
    return new Map(locations.map((location) => [String(location.id), location]));
  } catch (error) {
    console.warn(`warning: SCLSNJ location API failed, using fallback locations: ${error.message}`);
    return new Map(SCLSNJ_FALLBACK_LOCATIONS.map((location) => [String(location.id), location]));
  }
}

function branchTownMap(sources) {
  const map = new Map();
  sources.towns.forEach((town) => {
    town.libraries?.forEach((library) => {
      if (library.branchId) {
        map.set(String(library.branchId), town.id);
      }
    });
  });
  return map;
}

async function importSclsnjEvents(sources, startDate, days) {
  const source = sources.sharedSources?.["sclsnj-libnet"];
  if (!source || source.status !== "importable") {
    return [];
  }

  let locationsById;
  let rawEvents;
  try {
    [locationsById, rawEvents] = await Promise.all([
      loadSclsnjLocations(source),
      fetchJson(buildSclsnjEventsUrl(source, startDate, days))
    ]);
  } catch (error) {
    console.warn(`warning: could not import ${source.eventsUrl}: ${error.message}`);
    return [];
  }
  const townByBranch = branchTownMap(sources);

  const events = rawEvents
    .filter((event) => isSclsnjLowAgeEvent(event, source.ageFilters))
    .map((event) => {
      const location = locationsById.get(String(event.location_id));
      const summary = stripHtml(event.description || event.long_description || "");
      const longSummary = stripHtml(event.long_description || "");
      const displayLocationName = location?.name || event.location;
      const venueParts = [displayLocationName, event.venues].filter(Boolean);
      const url = normalizeSclsnjUrl(event);

      return {
        id: `sclsnj-${event.id}`,
        externalId: String(event.id),
        sourceId: "sclsnj-libnet",
        townId: townByBranch.get(String(event.location_id)) || null,
        title: stripHtml(event.title),
        venue: venueParts.join(" · "),
        venueName: displayLocationName,
        room: event.venues || null,
        category: "library",
        source: source.label,
        startsAt: localIso(event.raw_start_time),
        endsAt: localIso(event.raw_end_time),
        timezone: TIMEZONE,
        durationMinutes: durationMinutes(event.raw_start_time, event.raw_end_time),
        ages: inferAgeBandsFromText(event.title, event.description, event.long_description, event.ages),
        cost: Number(event.registration_cost || 0),
        registration: sclsnjRegistrationLabel(event),
        summary: longSummary ? `${summary} ${longSummary}`.trim() : summary,
        url,
        sourceUrl: url,
        sourceCalendarUrl: source.eventsUrl,
        address: addressFor(location),
        lat: Number(location?.lat || 0),
        lng: Number(location?.lon || 0),
        tags: event.tagsArray ?? [],
        status: String(event.changed) === "1" ? "review" : "published",
        confidence: 0.95
      };
    })
    .filter((event) => event.startsAt && event.sourceUrl);

  return events;
}

function allLibraryCalendarSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "librarycalendar-list")
      .map((library) => ({ town, library }))
  );
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1] ?? "";
}

function absoluteUrl(base, value) {
  return new URL(decodeEntities(value), base).toString();
}

function parseLibraryCalendarCards(html, baseUrl, source) {
  const cards = html.split('<div class="lc-event lc-event--list"').slice(1);
  const events = [];
  const host = new URL(baseUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();

  cards.forEach((card) => {
    const selectorId = firstMatch(card, /data-drupal-selector="edit-([^"]+)"/);
    const linkMatch = card.match(/<a aria-label="([^"]+)" href="([^"]+)"/);
    if (!selectorId || !linkMatch) {
      return;
    }

    const actionLabel = decodeEntities(linkMatch[1]);
    const titleMatch = actionLabel.match(/^(?:View Details|Register Now) - "([\s\S]+)" on ([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}) @ (\d{1,2}:\d{2}(?:am|pm))$/i);
    if (!titleMatch) {
      return;
    }

    const [, title, datePart, timePart] = titleMatch;
    const audiences = [...card.matchAll(/This event is in the "([^"]+)" group/g)].map((match) => decodeEntities(match[1]));
    if (!hasChildAudience(audiences, title)) {
      return;
    }

    const description = stripHtml(firstMatch(card, /<div class="lc-list-event-description">([\s\S]*?)<\/div>/));
    const startsAt = parseLocalDateTime(datePart, timePart);
    if (!startsAt) {
      return;
    }

    const sourceUrl = absoluteUrl(baseUrl, linkMatch[2]);
    events.push({
      id: `librarycalendar-${host}-${selectorId}`,
      externalId: selectorId,
      sourceId: `librarycalendar-${host}`,
      townId: source.library.townId || source.town.id,
      title: stripHtml(title),
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt: null,
      timezone: TIMEZONE,
      durationMinutes: null,
      ages: inferAgeBandsFromText(title, audiences.join(" "), description),
      audiences,
      cost: null,
      registration: actionLabel.startsWith("Register Now") ? "RSVP" : "See source",
      summary: description || `${source.library.name} event. See source page for details.`,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: Number(source.library.lat ?? source.town.center?.lat ?? 0),
      lng: Number(source.library.lng ?? source.town.center?.lng ?? 0),
      status: "published",
      confidence: 0.8
    });
  });

  return events;
}

async function importLibraryCalendarEvents(sources) {
  const imported = [];
  for (const source of allLibraryCalendarSources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      imported.push(...parseLibraryCalendarCards(html, source.library.eventsUrl, source));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported;
}

function allLibCalSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "libcal-list")
      .map((library) => ({ town, library }))
  );
}

async function importLibCalEvents(sources, startDate) {
  const imported = [];

  for (const source of allLibCalSources(sources)) {
    const calendarUrl = new URL(source.library.eventsUrl);
    const ajaxUrl = new URL("/ajax/calendar/list", calendarUrl.origin);
    ajaxUrl.searchParams.set("c", source.library.calendarIds.join(","));
    ajaxUrl.searchParams.set("date", startDate);
    ajaxUrl.searchParams.set("perpage", "100");
    ajaxUrl.searchParams.set("page", "1");
    ajaxUrl.searchParams.set("audience", source.library.audienceIds.join(","));
    ajaxUrl.searchParams.set("cats", "");
    ajaxUrl.searchParams.set("camps", "");
    ajaxUrl.searchParams.set("inc", "0");

    try {
      const data = await fetchJson(ajaxUrl.toString());
      (data.results ?? []).forEach((event) => {
        if (!hasChildAudience((event.audiences ?? []).map((item) => item.name), event.title)) {
          return;
        }
        imported.push({
          id: `libcal-${source.library.siteId || calendarUrl.host}-${event.id}`,
          externalId: String(event.id),
          sourceId: `libcal-${calendarUrl.host}`,
          townId: source.library.townId || source.town.id,
          title: stripHtml(event.title),
          venue: event.location || source.library.name,
          venueName: source.library.name,
          category: "library",
          source: source.library.name,
          startsAt: event.start ? localIso(event.start) : null,
          endsAt: event.end ? localIso(event.end) : null,
          timezone: TIMEZONE,
          durationMinutes: null,
          ages: inferAgeBandsFromText(event.title, JSON.stringify(event.audiences ?? [])),
          audiences: (event.audiences ?? []).map((item) => item.name),
          cost: event.registration_cost ?? null,
          registration: event.registration_enabled ? "RSVP" : "See source",
          summary: stripHtml(event.shortdesc || event.description || ""),
          url: absoluteUrl(source.library.eventsUrl, event.url || `/event/${event.id}`),
          sourceUrl: absoluteUrl(source.library.eventsUrl, event.url || `/event/${event.id}`),
          sourceCalendarUrl: source.library.eventsUrl,
          address: source.library.address || null,
          lat: Number(source.library.lat ?? source.town.center?.lat ?? 0),
          lng: Number(source.library.lng ?? source.town.center?.lng ?? 0),
          status: "published",
          confidence: 0.8
        });
      });
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function mergeEvents(existing, incoming, importedAt) {
  const byId = new Map(existing.map((event) => [event.id, event]));

  incoming.forEach((event) => {
    const previous = byId.get(event.id);
    byId.set(event.id, {
      ...(previous ?? {}),
      ...event,
      firstSeenAt: previous?.firstSeenAt || importedAt,
      lastSeenAt: importedAt
    });
  });

  return [...byId.values()].sort((a, b) => {
    const dateCompare = String(a.startsAt || "").localeCompare(String(b.startsAt || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

async function main() {
  const startDate = argValue("--start", todayInNewYork());
  const days = Number(argValue("--days", "60"));
  const importedAt = new Date().toISOString();
  const sources = await readJson(SOURCES_FILE, null);
  const replace = process.argv.includes("--replace");
  const existingEvents = replace ? [] : await readJson(EVENTS_FILE, []);

  const importedGroups = await Promise.all([
    importSclsnjEvents(sources, startDate, days),
    importLibraryCalendarEvents(sources),
    importLibCalEvents(sources, startDate)
  ]);
  const incoming = importedGroups.flat();
  const events = mergeEvents(existingEvents, incoming, importedAt);

  await writeFile(EVENTS_FILE, `${JSON.stringify(events, null, 2)}\n`);
  console.log(`Imported or refreshed ${incoming.length} event records.`);
  console.log(`Stored ${events.length} total records in ${new URL(EVENTS_FILE).pathname}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
