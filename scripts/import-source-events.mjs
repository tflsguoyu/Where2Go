#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const TIMEZONE = "America/New_York";
const SOURCES_FILE = new URL("../data/event-sources.json", import.meta.url);
const EVENTS_FILE = new URL("../data/events.json", import.meta.url);
const DAY_MS = 24 * 60 * 60 * 1000;
const SCLSNJ_BRANCH_DISPLAY_NAMES = new Map([
  ["471", "Bridgewater Library"],
  ["475", "North Plainfield Library"],
  ["477", "Somerville Library"],
  ["478", "Warren Library"],
  ["479", "Watchung Library"]
]);

const SCLSNJ_FALLBACK_LOCATIONS = [
  {
    id: "471",
    name: "Bridgewater Library",
    line1: "1 Vogt Dr.",
    locality: "Bridgewater",
    stateprovincecounty: "NJ",
    ziporpostcode: "08807",
    lat: "40.58792",
    lon: "-74.607602"
  },
  {
    id: "475",
    name: "North Plainfield Library",
    line1: "6 Rockview Ave.",
    locality: "North Plainfield",
    stateprovincecounty: "NJ",
    ziporpostcode: "07060",
    lat: "40.620859",
    lon: "-74.43402"
  },
  {
    id: "477",
    name: "Somerville Library",
    line1: "35 West End Ave.",
    locality: "Somerville",
    stateprovincecounty: "NJ",
    ziporpostcode: "08876",
    lat: "40.5704",
    lon: "-74.618922"
  },
  {
    id: "478",
    name: "Warren Library",
    line1: "42 Mountain Blvd.",
    locality: "Warren",
    stateprovincecounty: "NJ",
    ziporpostcode: "07059",
    lat: "40.619261",
    lon: "-74.490372"
  },
  {
    id: "479",
    name: "Watchung Library",
    line1: "20 Stirling Rd.",
    locality: "Watchung",
    stateprovincecounty: "NJ",
    ziporpostcode: "07069",
    lat: "40.638195",
    lon: "-74.450275"
  }
];

const AGE_ORDER = ["baby", "toddler", "preschool", "early-elementary", "tween", "teen"];
const IMPORT_QUESTION_LIKE_TITLE_PATTERN = /^(?:how|what|why|when|where|who)\b/i;
const IMPORT_SUMMARY_TITLE_STOP_PATTERN =
  /\s+(?:Join|Learn|Enjoy|Come|Meet|Discover|Explore|Register|Presented|Presenter|Hosted|For|This|In this|During|Participants|All ages)\b/i;
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

function collapseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isQuestionLikeImportedTitle(title) {
  return IMPORT_QUESTION_LIKE_TITLE_PATTERN.test(title) || /\?$/.test(title);
}

function stripImportedSummaryDateTimePrefix(value) {
  const monthPattern =
    "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const timePattern = "(?:\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)";
  const prefixPattern = new RegExp(
    `^(?:(?:sun|mon|tue|wed|thu|fri|sat)(?:day)?[,]?\\s+)?${monthPattern}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?(?:[,]?\\s+${timePattern}(?:\\s*(?:-|\\u2013|\\u2014|to)\\s*${timePattern})?)?\\s*`,
    "i"
  );
  return collapseWhitespace(value).replace(prefixPattern, "").trim();
}

function normalizeImportedTitle(value) {
  return collapseWhitespace(value)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+A\s+USA\s+\d{3}\b.*$/i, "")
    .replace(/\s+[-\u2013\u2014]\s+/g, ": ")
    .trim();
}

function importedDisplayTitle(rawTitle, summary) {
  const title = collapseWhitespace(rawTitle);
  if (!isQuestionLikeImportedTitle(title)) {
    return title;
  }
  const body = stripImportedSummaryDateTimePrefix(summary);
  const stopMatch = body.match(IMPORT_SUMMARY_TITLE_STOP_PATTERN);
  const candidate = normalizeImportedTitle(stopMatch ? body.slice(0, stopMatch.index) : "");
  return candidate.length >= 12 && candidate.length <= 90 && !isQuestionLikeImportedTitle(candidate) ? candidate : title;
}

function localIso(rawDateTime) {
  if (!rawDateTime) {
    return null;
  }
  return rawDateTime.replace(" ", "T");
}

function dateStamp(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).valueOf();
}

function addDateDays(dateKey, days) {
  return new Date(dateStamp(dateKey) + days * DAY_MS).toISOString().slice(0, 10);
}

function datesInRange(startDate, endDate) {
  const dates = [];
  const endStamp = Math.max(dateStamp(startDate), dateStamp(endDate || startDate));
  for (let stamp = dateStamp(startDate); stamp <= endStamp; stamp += DAY_MS) {
    dates.push(new Date(stamp).toISOString().slice(0, 10));
  }
  return dates;
}

function isDateWithinWindow(dateKey, startDate, days) {
  const stamp = dateStamp(dateKey);
  const startStamp = dateStamp(startDate);
  const endStamp = dateStamp(addDateDays(startDate, Math.max(0, days - 1)));
  return stamp >= startStamp && stamp <= endStamp;
}

function formatDateForSummary(dateKey) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function formatDateRangeForSummary(startDate, endDate) {
  if (!endDate || startDate === endDate) {
    return formatDateForSummary(startDate);
  }
  return `${formatDateForSummary(startDate)} - ${formatDateForSummary(endDate)}`;
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

function numericCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
}

function libraryLat(source) {
  return numericCoordinate(source.library.lat);
}

function libraryLng(source) {
  return numericCoordinate(source.library.lng);
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

function isClosureOrNonEvent(title, description = "") {
  const text = `${title} ${description}`.toLowerCase();
  const youthSignal =
    /\b(story|craft|club|kids|children|family|baby|toddler|preschool|teen|teens|tween|tweens|lego|magic|workshop|camp|play|jump)\b/.test(
      text
    );
  if (youthSignal) {
    return false;
  }
  return /\b(closed|closure|closing|holiday hours|library is closed|board meeting|trustee meeting)\b/.test(text);
}

function normalizeLabelList(values) {
  return (Array.isArray(values) ? values : [values])
    .flatMap((value) => {
      if (typeof value === "string") {
        return [value];
      }
      if (value?.name) {
        return [value.name];
      }
      if (value?.label) {
        return [value.label];
      }
      if (value?.title) {
        return [value.title];
      }
      return [];
    })
    .map(stripHtml)
    .filter(Boolean);
}

function localDateTime(dateKey, time = "12:00") {
  return `${dateKey}T${time.length === 5 ? `${time}:00` : time}`;
}

function parseUsNumericDateTime(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?$/i);
  if (!match) {
    return null;
  }
  const [, monthRaw, dayRaw, year, hourRaw = "12", minute = "00", meridiem = "pm"] = match;
  let hour = Number(hourRaw);
  if (meridiem.toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem.toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${year}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
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

function sclsnjDisplayLocationName(location, event) {
  const locationId = String(location?.id || event.location_id || "");
  return SCLSNJ_BRANCH_DISPLAY_NAMES.get(locationId) || location?.name || event.location;
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
      const displayLocationName = sclsnjDisplayLocationName(location, event);
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

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromUrl(value) {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    return slugify(parts.at(-1) || value);
  } catch {
    return slugify(value);
  }
}

function normalizePlaceName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(township|borough|city|town)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTownLookup(sources) {
  const lookup = new Map();
  sources.towns.forEach((town) => {
    const variants = new Set([
      normalizePlaceName(town.name),
      normalizePlaceName(town.id),
      normalizePlaceName(town.name.replace(/\b(township|borough|city|town)\b/gi, ""))
    ]);
    variants.forEach((variant) => {
      if (variant && !lookup.has(variant)) {
        lookup.set(variant, town);
      }
    });
  });
  return lookup;
}

function addressFromPostalAddress(address) {
  return [
    address?.streetAddress,
    address?.addressLocality,
    address?.addressRegion,
    address?.postalCode,
    address?.addressCountry
  ]
    .filter(Boolean)
    .map((part) => stripHtml(part))
    .join(", ");
}

function collectTagsFromListingSection(section) {
  const tagBlock = firstMatch(section, /<div class="tag-links">([\s\S]*?)<\/div>/);
  return [...tagBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => stripHtml(match[1]).replace(/^#/, "").trim())
    .filter(Boolean);
}

function parseJsonLdEvent(section) {
  const scripts = [...section.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const data = JSON.parse(script[1].trim());
      if (data?.["@type"] === "Event") {
        return data;
      }
      const graphEvent = data?.["@graph"]?.find((item) => item?.["@type"] === "Event");
      if (graphEvent) {
        return graphEvent;
      }
    } catch {
      // Ignore non-event JSON-LD blocks. The listing card fallback will skip them.
    }
  }
  return null;
}

function cleanNjCarnivalsTitle(eventName, listingTitle) {
  const title = stripHtml(listingTitle || eventName);
  return title
    .replace(/\s+20\d{2}\s+in\s+.+?,\s*NJ$/i, "")
    .replace(/\s+in\s+.+?,\s*NJ$/i, "")
    .trim();
}

function njCarnivalsSearchUrl(source, page = 1) {
  const base = new URL(source.searchUrl || source.eventsUrl || source.website);
  const url = page === 1 ? base : new URL(`/customsearch/page/${page}/`, base.origin);
  url.searchParams.set("timeframe", source.timeframe || "all");
  url.searchParams.set("county", source.county || "all");
  return url.toString();
}

function njCarnivalsHighestPage(html, maxPages) {
  const pageNumbers = [...html.matchAll(/customsearch\/page\/(\d+)\//g)].map((match) => Number(match[1]));
  if (!pageNumbers.length) {
    return 1;
  }
  return Math.min(maxPages, Math.max(1, ...pageNumbers));
}

function parseNjCarnivalsClockTime(value, fallbackMeridiem = "") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bnoon\b/g, "12pm")
    .replace(/\bmidnight\b/g, "12am")
    .trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }
  const [, hourRaw, minuteRaw = "00", meridiemRaw = fallbackMeridiem] = match;
  const meridiem = meridiemRaw.toLowerCase();
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

function inferStartMeridiem(startHour, endHour, endMeridiem) {
  if (endMeridiem.toLowerCase() === "am") {
    return "am";
  }
  if (startHour === 12 || startHour <= endHour) {
    return "pm";
  }
  return "am";
}

function timeStringFromParts(parts) {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function parseNjCarnivalsTimeRange(value) {
  const normalized = stripHtml(value)
    .replace(/\./g, "")
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am");
  const match = normalized.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(am|pm))/i
  );
  if (!match) {
    return null;
  }
  const [, startRaw, endRaw, endMeridiem] = match;
  const startHour = Number(startRaw.match(/\d{1,2}/)?.[0]);
  const endHour = Number(endRaw.match(/\d{1,2}/)?.[0]);
  const startMeridiem = /(?:am|pm)/i.test(startRaw)
    ? ""
    : inferStartMeridiem(startHour, endHour, endMeridiem);
  const start = parseNjCarnivalsClockTime(startRaw, startMeridiem);
  const end = parseNjCarnivalsClockTime(endRaw);
  if (!start || !end) {
    return null;
  }
  let startMinutes = start.hour * 60 + start.minute;
  let endMinutes = end.hour * 60 + end.minute;
  if (endMinutes <= startMinutes) {
    endMinutes += 12 * 60;
  }
  return {
    start: timeStringFromParts(start),
    end: timeStringFromParts({ hour: Math.floor((endMinutes % (24 * 60)) / 60), minute: endMinutes % 60 }),
    durationMinutes: Math.max(0, endMinutes - startMinutes)
  };
}

function parseNjCarnivalsOpenTime(value) {
  const normalized = stripHtml(value)
    .replace(/\./g, "")
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am");
  const match = normalized.match(/\b(?:opens?|starts?)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (!match) {
    return null;
  }
  const start = parseNjCarnivalsClockTime(match[1]);
  if (!start) {
    return null;
  }
  return {
    start: timeStringFromParts(start),
    end: null,
    durationMinutes: null,
    timeLabel: stripHtml(value)
  };
}

function parseNjCarnivalsDateLabel(value, fallbackYear) {
  const normalized = stripHtml(value).replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const match = normalized.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?/i
  );
  if (!match) {
    return null;
  }
  const [, monthName, dayRaw, yearRaw] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (!month) {
    return null;
  }
  return `${yearRaw || fallbackYear}-${month}-${String(dayRaw).padStart(2, "0")}`;
}

function extractNjCarnivalsDetailHours(html, dateKeys) {
  const dates = [...new Set(dateKeys)].sort();
  const fallbackYear = dates[0]?.slice(0, 4) || String(new Date().getFullYear());
  const hoursByDate = new Map();
  const rowPattern =
    /<span\b(?=[^>]*class=["'][^"']*\btimeDay\b[^"']*["'])[^>]*>([\s\S]*?)<\/span>\s*<span\b(?=[^>]*class=["'][^"']*\btimeHour\b[^"']*["'])[^>]*>([\s\S]*?)<\/span>/gi;

  [...html.matchAll(rowPattern)].forEach((match) => {
    const dayLabel = stripHtml(match[1]);
    const hourLabel = stripHtml(match[2]);
    const hours = parseNjCarnivalsTimeRange(hourLabel) || parseNjCarnivalsOpenTime(hourLabel);
    if (!hours) {
      return;
    }
    const explicitDate = parseNjCarnivalsDateLabel(dayLabel, fallbackYear);
    const targetDates = explicitDate ? [explicitDate] : dates;
    targetDates
      .filter((dateKey) => dates.includes(dateKey))
      .forEach((dateKey) => {
        hoursByDate.set(dateKey, hours);
      });
  });

  if (!hoursByDate.size) {
    const fallbackText = stripHtml(html);
    const hoursSentence = fallbackText.match(/\bHours?\s+(?:are|is)\s+([^.!?]+(?:am|pm|noon)[^.!?]*)/i)?.[1];
    const hours = parseNjCarnivalsTimeRange(hoursSentence || "") || parseNjCarnivalsOpenTime(hoursSentence || "");
    if (hours) {
      dates.forEach((dateKey) => hoursByDate.set(dateKey, hours));
    }
  }

  return hoursByDate;
}

async function enrichNjCarnivalsDetailHours(events) {
  const eventsByUrl = new Map();
  events.forEach((event) => {
    if (!event.sourceUrl) {
      return;
    }
    if (!eventsByUrl.has(event.sourceUrl)) {
      eventsByUrl.set(event.sourceUrl, []);
    }
    eventsByUrl.get(event.sourceUrl).push(event);
  });

  await Promise.all(
    [...eventsByUrl.entries()].map(async ([sourceUrl, group]) => {
      try {
        const detailHtml = await fetchText(sourceUrl);
        const dateKeys = group.map((event) => String(event.startsAt || "").slice(0, 10)).filter(Boolean);
        const hoursByDate = extractNjCarnivalsDetailHours(detailHtml, dateKeys);
        group.forEach((event) => {
          const dateKey = String(event.startsAt || "").slice(0, 10);
          const hours = hoursByDate.get(dateKey);
          if (!hours) {
            return;
          }
          event.startsAt = `${dateKey}T${hours.start}:00`;
          event.endsAt = hours.end ? `${dateKey}T${hours.end}:00` : null;
          event.durationMinutes = hours.durationMinutes;
          event.summary = event.summary.replace("Open the source page for daily hours and updates.", "Open the source page for updates.");
          event.timeLabel = hours.timeLabel || null;
          event.confidence = Math.max(Number(event.confidence || 0), event.withinCoverage ? 0.88 : 0.78);
        });
      } catch (error) {
        console.warn(`warning: could not enrich NJ Carnivals hours for ${sourceUrl}: ${error.message}`);
      }
    })
  );

  return events;
}

function parseNjCarnivalsListings(html, source, sources, startDate, days) {
  const townLookup = buildTownLookup(sources);
  const sections = html.split('<section class="main-listing">').slice(1);
  const events = [];

  sections.forEach((section) => {
    const event = parseJsonLdEvent(section);
    if (!event?.url || !event.startDate) {
      return;
    }

    const startDateOnly = String(event.startDate).slice(0, 10);
    const endDateOnly = String(event.endDate || event.startDate).slice(0, 10);
    if (Number.isNaN(dateStamp(startDateOnly)) || Number.isNaN(dateStamp(endDateOnly))) {
      return;
    }

    const listingTitle = firstMatch(section, /<h3>([\s\S]*?)<\/h3>/);
    const title = cleanNjCarnivalsTitle(event.name, listingTitle);
    const location = event.location || {};
    const address = location.address || {};
    const locality = stripHtml(address.addressLocality || "");
    const matchedTown = townLookup.get(normalizePlaceName(locality));
    const eventSlug = slugFromUrl(event.url);
    const tags = collectTagsFromListingSection(section);
    const venueName = stripHtml(location.name || locality || "NJ Carnivals event");
    const fullAddress = addressFromPostalAddress(address);
    const dateRange = formatDateRangeForSummary(startDateOnly, endDateOnly);
    const summary = `${title} listed by ${source.label}. Dates: ${dateRange}. ${fullAddress ? `Location: ${fullAddress}. ` : ""}Open the source page for daily hours and updates.`;

    datesInRange(startDateOnly, endDateOnly)
      .filter((dateKey) => isDateWithinWindow(dateKey, startDate, days))
      .forEach((dateKey) => {
        const occurrenceSuffix = startDateOnly === endDateOnly ? "" : `-${dateKey}`;
        events.push({
          id: `nj-carnivals-${eventSlug}${occurrenceSuffix}`,
          externalId: eventSlug,
          sourceId: "nj-carnivals",
          townId: matchedTown?.id || null,
          withinCoverage: Boolean(matchedTown),
          title,
          venue: locality ? `${venueName} · ${locality}` : venueName,
          venueName,
          category: "festival",
          source: source.label,
          startsAt: `${dateKey}T12:00:00`,
          endsAt: null,
          timezone: TIMEZONE,
          durationMinutes: 480,
          timeLabel: "See source for hours",
          ages: inferAgeBandsFromText(title, tags.join(" "), "family fun rides games carnival festival fair"),
          cost: null,
          registration: "See source",
          summary,
          url: event.url,
          sourceUrl: event.url,
          sourceCalendarUrl: source.eventsUrl || source.website,
          address: fullAddress || null,
          lat: matchedTown ? Number(matchedTown.center?.lat || 0) : undefined,
          lng: matchedTown ? Number(matchedTown.center?.lng || 0) : undefined,
          image: event.image || null,
          tags,
          status: "published",
          confidence: matchedTown ? 0.82 : 0.72
        });
      });
  });

  return events;
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
    const description = stripHtml(firstMatch(card, /<div class="lc-list-event-description">([\s\S]*?)<\/div>/));
    if (isClosureOrNonEvent(title, description)) {
      return;
    }
    if (!hasChildAudience(audiences, title)) {
      return;
    }

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
      lat: libraryLat(source),
      lng: libraryLng(source),
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

function libCalDateTime(event, key, dateKey) {
  const value = event[`${key}dt`] || event[key];
  if (!value) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    return localIso(String(value));
  }
  const timeMatch = String(value).match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!timeMatch || !dateKey) {
    return null;
  }
  let hour = Number(timeMatch[1]);
  if (timeMatch[3].toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (timeMatch[3].toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${timeMatch[2]}:00`;
}

function buildLibCalListUrl(source, dateKey, page = 1) {
  const calendarUrl = new URL(source.library.eventsUrl);
  const ajaxUrl = new URL("/ajax/calendar/list", calendarUrl.origin);
  ajaxUrl.searchParams.set("c", source.library.calendarIds.join(","));
  ajaxUrl.searchParams.set("date", dateKey);
  ajaxUrl.searchParams.set("perpage", "100");
  ajaxUrl.searchParams.set("page", String(page));
  ajaxUrl.searchParams.set("audience", source.library.audienceIds.join(","));
  ajaxUrl.searchParams.set("cats", "");
  ajaxUrl.searchParams.set("camps", "");
  ajaxUrl.searchParams.set("inc", "0");
  return ajaxUrl.toString();
}

function mapLibCalEvent(source, event, calendarUrl, dateKey) {
  const audiences = normalizeLabelList(event.audiences ?? []);
  const categories = normalizeLabelList(event.categories_arr ?? event.categories ?? []);
  const summary = stripHtml(event.shortdesc || event.description || "");
  if (isClosureOrNonEvent(event.title, summary) || !hasChildAudience(audiences, event.title)) {
    return null;
  }

  const startsAt = libCalDateTime(event, "start", dateKey);
  const endsAt = libCalDateTime(event, "end", dateKey);
  const url = absoluteUrl(source.library.eventsUrl, event.url || `/event/${event.id}`);
  return {
    id: `libcal-${source.library.siteId || calendarUrl.host}-${event.id}`,
    externalId: String(event.id),
    sourceId: `libcal-${calendarUrl.host}`,
    townId: source.library.townId || source.town.id,
    title: stripHtml(event.title),
    venue: event.location || source.library.name,
    venueName: source.library.name,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: startsAt && endsAt ? durationMinutes(startsAt, endsAt) : null,
    ages: inferAgeBandsFromText(event.title, audiences.join(" "), categories.join(" "), summary),
    audiences,
    cost: event.registration_cost ?? null,
    registration: event.registration_enabled ? "RSVP" : "See source",
    summary: summary || `${source.library.name} event. See source page for details.`,
    url,
    sourceUrl: url,
    sourceCalendarUrl: source.library.eventsUrl,
    address: source.library.address || null,
    lat: libraryLat(source),
    lng: libraryLng(source),
    image: event.featured_image || null,
    tags: categories,
    status: "published",
    confidence: 0.82
  };
}

async function importLibCalEvents(sources, startDate, days) {
  const imported = [];

  for (const source of allLibCalSources(sources)) {
    const calendarUrl = new URL(source.library.eventsUrl);
    for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
      const dateKey = addDateDays(startDate, dayOffset);
      try {
        const firstPage = await fetchJson(buildLibCalListUrl(source, dateKey, 1));
        const pageCount = Math.max(1, Math.ceil(Number(firstPage.total_results || 0) / Number(firstPage.perpage || 100)));
        const pages = [firstPage];
        for (let page = 2; page <= pageCount; page += 1) {
          pages.push(await fetchJson(buildLibCalListUrl(source, dateKey, page)));
        }

        pages
          .flatMap((data) => data.results ?? [])
          .map((event) => mapLibCalEvent(source, event, calendarUrl, dateKey))
          .filter(Boolean)
          .forEach((event) => imported.push(event));
      } catch (error) {
        console.warn(`warning: could not import ${source.library.eventsUrl} for ${dateKey}: ${error.message}`);
      }
    }
  }

  return [...new Map(imported.filter((event) => event.startsAt && event.sourceUrl).map((event) => [event.id, event])).values()];
}

function allEventOrganiserSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "eventorganiser-fullcal")
      .map((library) => ({ town, library }))
  );
}

function buildEventOrganiserUrl(source, startDate, days) {
  const ajaxUrl = new URL(source.library.ajaxUrl || "/wp-admin/admin-ajax.php", source.library.website);
  ajaxUrl.searchParams.set("action", "eventorganiser-fullcal");
  ajaxUrl.searchParams.set("start", startDate);
  ajaxUrl.searchParams.set("end", addDateDays(startDate, days));
  ajaxUrl.searchParams.set("timeformat", "g:i a");
  ajaxUrl.searchParams.set("users_events", "false");
  if (source.library.categorySlugs?.length) {
    ajaxUrl.searchParams.set("category", source.library.categorySlugs.join(","));
  }
  return ajaxUrl.toString();
}

function mapEventOrganiserEvent(source, rawEvent) {
  const rawTitle = stripHtml(rawEvent.title || rawEvent.event_title || "");
  const categories = normalizeLabelList(rawEvent.category ?? rawEvent.categories ?? []);
  const summary = stripHtml(rawEvent.description || rawEvent.excerpt || "");
  const title = importedDisplayTitle(rawTitle, summary);
  if (!title || isClosureOrNonEvent(title, summary)) {
    return null;
  }
  if (!hasChildAudience(categories, title) && !hasChildAudience([], `${title} ${summary}`)) {
    return null;
  }

  const startsAt = localIso(rawEvent.start || rawEvent.startDate || rawEvent.start_date);
  const endsAt = localIso(rawEvent.end || rawEvent.endDate || rawEvent.end_date);
  const sourceUrl = absoluteUrl(source.library.website, rawEvent.url || rawEvent.link || source.library.eventsUrl);
  const host = new URL(source.library.website).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const eventSlug = slugFromUrl(sourceUrl) || slugify(`${title}-${startsAt}`);
  const allDay = rawEvent.allDay === true || rawEvent.allDay === "true";

  return {
    id: `eventorganiser-${host}-${eventSlug}-${slugify(startsAt)}`,
    externalId: String(rawEvent.event_id || rawEvent.id || eventSlug),
    sourceId: `eventorganiser-${host}`,
    townId: source.library.townId || source.town.id,
    title,
    venue: rawEvent.venue || rawEvent.venue_name || source.library.name,
    venueName: source.library.name,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: startsAt && endsAt && !allDay ? durationMinutes(startsAt, endsAt) : null,
    timeLabel: allDay ? "All day" : undefined,
    ages: inferAgeBandsFromText(title, summary, categories.join(" ")),
    audiences: categories,
    cost: null,
    registration: "See source",
    summary: summary || `${source.library.name} event. See source page for details.`,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.library.eventsUrl,
    address: source.library.address || null,
    lat: libraryLat(source),
    lng: libraryLng(source),
    tags: categories,
    status: "published",
    confidence: 0.86
  };
}

async function importEventOrganiserEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allEventOrganiserSources(sources)) {
    try {
      const data = await fetchJson(buildEventOrganiserUrl(source, startDate, days));
      (Array.isArray(data) ? data : data.events ?? [])
        .map((event) => mapEventOrganiserEvent(source, event))
        .filter(Boolean)
        .forEach((event) => imported.push(event));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function allJoomlaEventBookingSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "joomla-event-booking-calendar")
      .map((library) => ({ town, library }))
  );
}

function parseJoomlaEventBookingCalendar(html, source, startDate, days) {
  const events = [];
  const host = new URL(source.library.website).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const anchors = html.matchAll(/<a\b(?=[^>]*\beb_event_link\b)[^>]*>[\s\S]*?<\/a>/gi);

  for (const anchorMatch of anchors) {
    const anchor = anchorMatch[0];
    const href = getAttr(anchor, "href");
    const tooltipText = stripHtml(getAttr(anchor, "title"));
    const visibleText = stripHtml(anchor);
    const tooltipTitle = firstMatch(tooltipText, /^Event\s+([\s\S]*?)\s+Event Date\b/i);
    const title = stripHtml(tooltipTitle || visibleText.replace(/\s*\(\d{1,2}:\d{2}\s*(?:am|pm)\)\s*$/i, ""));
    const startRaw = firstMatch(
      tooltipText,
      /Event Date\s+(\d{1,2}-\d{1,2}-\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i
    );
    const endRaw = firstMatch(
      tooltipText,
      /Event End Date\s+(\d{1,2}-\d{1,2}-\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i
    );
    const startsAt = parseUsNumericDateTime(startRaw);
    const endsAt = endRaw ? parseUsNumericDateTime(endRaw) : null;

    if (!title || !startsAt || !href || isClosureOrNonEvent(title, tooltipText)) {
      continue;
    }
    if (!isDateWithinWindow(startsAt.slice(0, 10), startDate, days)) {
      continue;
    }

    const sourceUrl = absoluteUrl(source.library.website, href);
    const price = firstMatch(tooltipText, /Individual Price\s+([^\s][\s\S]*?)$/i);
    events.push({
      id: `joomla-eventbooking-${host}-${slugFromUrl(sourceUrl)}-${startsAt.slice(0, 10)}`,
      externalId: slugFromUrl(sourceUrl),
      sourceId: `joomla-eventbooking-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, tooltipText),
      cost: /free/i.test(price) ? 0 : null,
      registration: /Registration Start Date|Cut Off Date|Available Place/i.test(tooltipText) ? "RSVP" : "See source",
      summary: `${source.library.name} youth event. Open the source page for registration, capacity, and updates.`,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      status: "published",
      confidence: 0.84
    });
  }

  return events;
}

async function importJoomlaEventBookingEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allJoomlaEventBookingSources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      imported.push(...parseJoomlaEventBookingCalendar(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

const WEEKDAY_INDEX = new Map([
  ["sunday", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6]
]);

function recurrenceMatches(dateKey, recurrence) {
  if (recurrence?.frequency !== "monthly") {
    return false;
  }
  const date = new Date(`${dateKey}T12:00:00Z`);
  const weekday = WEEKDAY_INDEX.get(String(recurrence.weekday || "").toLowerCase());
  if (weekday === undefined || date.getUTCDay() !== weekday) {
    return false;
  }
  const dayOfMonth = Number(dateKey.slice(8, 10));
  return Math.floor((dayOfMonth - 1) / 7) + 1 === Number(recurrence.ordinal || 1);
}

function configuredWorkshopEvent(source, location, workshop, dateKey) {
  const title = stripHtml(workshop.title || source.recurrence?.title || source.label);
  const sourceUrl = workshop.url || location.storeUrl || source.eventsUrl || source.website;
  const startsAt = localDateTime(dateKey, workshop.startTime || source.recurrence?.startTime || "12:00");
  const endsAt = localDateTime(dateKey, workshop.endTime || source.recurrence?.endTime || "13:00");
  const summary = stripHtml(workshop.summary || source.recurrence?.summary || `${source.label}. Open the source page for details.`);

  return {
    id: `${source.id}-${location.id}-${dateKey}-${slugify(title)}`,
    externalId: `${location.id}-${dateKey}-${slugify(title)}`,
    sourceId: source.id,
    townId: location.townId || null,
    title,
    venue: location.name,
    venueName: location.name,
    category: workshop.category || source.recurrence?.category || "workshop",
    source: source.label,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: durationMinutes(startsAt, endsAt),
    ages: inferAgeBandsFromText(title, summary, "kids children family workshop craft build"),
    cost: workshop.cost ?? null,
    registration: workshop.registration || source.recurrence?.registration || "See source",
    summary,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.eventsUrl || source.website,
    address: location.address || null,
    lat: Number(location.lat || 0),
    lng: Number(location.lng || 0),
    tags: [source.type, "kids", "family"].filter(Boolean),
    status: "published",
    confidence: source.parser === "configured-recurring-workshops" ? 0.68 : 0.76
  };
}

function importConfiguredWorkshopEvents(sources, startDate, days) {
  const imported = [];
  const regionalSources = sources.regionalSources ?? [];

  regionalSources
    .filter((source) => source.status === "importable" && source.parser === "configured-dated-workshops")
    .forEach((source) => {
      (source.workshops ?? []).forEach((workshop) => {
        if (!workshop.date || !isDateWithinWindow(workshop.date, startDate, days)) {
          return;
        }
        (source.locations ?? []).forEach((location) => {
          imported.push(configuredWorkshopEvent(source, location, workshop, workshop.date));
        });
      });
    });

  regionalSources
    .filter((source) => source.status === "importable" && source.parser === "configured-recurring-workshops")
    .forEach((source) => {
      datesInRange(startDate, addDateDays(startDate, Math.max(0, days - 1)))
        .filter((dateKey) => recurrenceMatches(dateKey, source.recurrence))
        .forEach((dateKey) => {
          (source.locations ?? []).forEach((location) => {
            imported.push(configuredWorkshopEvent(source, location, source.recurrence ?? {}, dateKey));
          });
        });
    });

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

async function importNjCarnivalsEvents(sources, startDate, days) {
  const source = sources.sharedSources?.["nj-carnivals"];
  if (!source || source.status !== "importable") {
    return [];
  }

  const imported = [];
  const seenPages = new Set();
  const maxPages = Number(source.maxPages || 6);

  try {
    const firstUrl = njCarnivalsSearchUrl(source, 1);
    const firstHtml = await fetchText(firstUrl);
    seenPages.add(1);
    imported.push(...parseNjCarnivalsListings(firstHtml, source, sources, startDate, days));

    const highestPage = njCarnivalsHighestPage(firstHtml, maxPages);
    for (let page = 2; page <= highestPage; page += 1) {
      if (seenPages.has(page)) {
        continue;
      }
      const html = await fetchText(njCarnivalsSearchUrl(source, page));
      seenPages.add(page);
      imported.push(...parseNjCarnivalsListings(html, source, sources, startDate, days));
    }
  } catch (error) {
    console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
  }

  const enriched = await enrichNjCarnivalsDetailHours(imported.filter((event) => event.startsAt && event.sourceUrl));
  return [...new Map(enriched.map((event) => [event.id, event])).values()];
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

  return [...byId.values()].filter((event) => !isClosureOrNonEvent(event.title, event.summary)).sort((a, b) => {
    const dateCompare = String(a.startsAt || "").localeCompare(String(b.startsAt || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

async function main() {
  const importedAt = new Date().toISOString();
  const sources = await readJson(SOURCES_FILE, null);
  const explicitStart = process.argv.includes("--start");
  const defaultLookaheadDays = Number(sources?.eventPolicy?.defaultLookaheadDays || 60);
  const requestedDays = Math.max(1, Number(argValue("--days", String(defaultLookaheadDays))) || defaultLookaheadDays);
  const defaultLookbackDays = Math.max(0, Number(sources?.eventPolicy?.importLookbackDays || 0) || 0);
  const lookbackDays = explicitStart ? 0 : Math.max(0, Number(argValue("--past-days", String(defaultLookbackDays))) || 0);
  const today = todayInNewYork();
  const startDate = explicitStart ? argValue("--start", today) : addDateDays(today, -lookbackDays);
  const days = requestedDays + (explicitStart ? 0 : lookbackDays);
  const replace = process.argv.includes("--replace");
  const existingEvents = replace ? [] : await readJson(EVENTS_FILE, []);

  const importedGroups = await Promise.all([
    importSclsnjEvents(sources, startDate, days),
    importLibraryCalendarEvents(sources),
    importLibCalEvents(sources, startDate, days),
    importEventOrganiserEvents(sources, startDate, days),
    importJoomlaEventBookingEvents(sources, startDate, days),
    importConfiguredWorkshopEvents(sources, startDate, days),
    importNjCarnivalsEvents(sources, startDate, days)
  ]);
  const incoming = importedGroups.flat();
  const events = mergeEvents(existingEvents, incoming, importedAt);

  await writeFile(EVENTS_FILE, `${JSON.stringify(events, null, 2)}\n`);
  console.log(`Import window: ${startDate} through ${addDateDays(startDate, days - 1)}.`);
  console.log(`Imported or refreshed ${incoming.length} event records.`);
  console.log(`Stored ${events.length} total records in ${new URL(EVENTS_FILE).pathname}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
