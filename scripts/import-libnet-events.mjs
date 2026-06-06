#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";

const CLIENT = "sclsnj";
const TIMEZONE = "America/New_York";
const EVENT_ENDPOINT = `https://${CLIENT}.libnet.info/eeventcaldata`;
const LOCATION_ENDPOINT = `https://api.communico.co/v1/${CLIENT}/locations`;
const OUTPUT_DIR = new URL("../data/imported/", import.meta.url);
const EVENTS_OUTPUT = new URL("sclsnj-events.json", OUTPUT_DIR);

const HOME = {
  label: "Warren, NJ 07059",
  lat: 40.619261,
  lng: -74.490372
};

const NEARBY_BRANCH_IDS = ["478", "479", "475", "471"];
const LOW_AGE_FILTERS = ["Baby/Toddler", "Pre-School", "Kids", "Families"];
const AGE_ORDER = ["baby", "toddler", "preschool", "early-elementary"];

const FALLBACK_LOCATIONS = [
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
    id: "471",
    name: "Bridgewater branch",
    line1: "1 Vogt Dr.",
    locality: "Bridgewater",
    stateprovincecounty: "NJ",
    ziporpostcode: "08807",
    lat: "40.58792",
    lon: "-74.607602"
  }
];

const MAP_POINTS_BY_LOCATION_ID = {
  478: [42, 40],
  479: [57, 34],
  475: [66, 30],
  471: [30, 58]
};

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

function buildEventsUrl({ startDate, days, branchIds, ageFilters }) {
  const request = {
    date: startDate,
    days,
    private: false,
    locations: branchIds,
    ages: ageFilters.map((age) => encodeURIComponent(age))
  };
  const params = new URLSearchParams({
    event_type: "0",
    req: JSON.stringify(request)
  });
  return `${EVENT_ENDPOINT}?${params.toString()}`;
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

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

function durationMinutes(startRaw, endRaw) {
  const start = new Date(localIso(startRaw));
  const end = new Date(localIso(endRaw));
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return null;
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

function haversineMiles(a, b) {
  const radiusMiles = 3958.8;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusMiles * Math.asin(Math.sqrt(h));
}

function addressFor(location) {
  return [location?.line1, location?.locality, location?.stateprovincecounty, location?.ziporpostcode]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .join(", ");
}

function inferAgeBands(event) {
  const text = [
    event.title,
    event.sub_title,
    event.description,
    event.long_description,
    event.ages,
    ...(event.agesArray ?? [])
  ]
    .join(" ")
    .toLowerCase();
  const bands = new Set();

  if (text.includes("baby/toddler") || text.includes("baby") || text.includes("birth")) {
    bands.add("baby");
    bands.add("toddler");
  }
  if (text.includes("toddler") || text.includes("18 months")) {
    bands.add("toddler");
  }
  if (text.includes("pre-school") || text.includes("preschool")) {
    bands.add("preschool");
  }
  if (text.includes("families")) {
    bands.add("baby");
    bands.add("toddler");
    bands.add("preschool");
    bands.add("early-elementary");
  }
  if (text.includes("kids") || text.includes("grades k") || text.includes("grade k")) {
    bands.add("early-elementary");
  }

  const ageRange = text.match(/ages?\s*(\d+)\s*[-–]\s*(\d+)/);
  if (ageRange) {
    const min = Number(ageRange[1]);
    const max = Number(ageRange[2]);
    if (min <= 1) bands.add("baby");
    if (min <= 3 && max >= 1) bands.add("toddler");
    if (min <= 5 && max >= 3) bands.add("preschool");
    if (max >= 6) bands.add("early-elementary");
  }

  const gradeRange = text.match(/grades?\s*([k\d])\s*[-–]\s*(\d)/);
  if (gradeRange) {
    bands.add("early-elementary");
  }

  if (bands.size === 0) {
    bands.add("toddler");
    bands.add("preschool");
    bands.add("early-elementary");
  }

  return AGE_ORDER.filter((band) => bands.has(band));
}

function isLowAgeEvent(event) {
  const ages = new Set(event.agesArray ?? []);
  return LOW_AGE_FILTERS.some((age) => ages.has(age));
}

function inferIndoors(event) {
  const text = [event.title, event.description, event.long_description, event.venues]
    .join(" ")
    .toLowerCase();
  return !/(outdoor|outside|garden|trail|arboretum|lawn)/.test(text);
}

function registrationLabel(event) {
  if (String(event.changed) === "1") {
    return "Cancelled";
  }
  if (event.reg_url || String(event.third_party_reg) === "1") {
    return "Ticket";
  }
  if (String(event.allow_reg) !== "1") {
    return "Drop-in";
  }

  const max = Number(event.max_attendee || 0);
  const total = Number(event.total_registrants || 0);
  if (max > 0 && total >= max) {
    return String(event.allow_waitlist) === "1" ? "Waitlist" : "Full";
  }

  if (event.reg_opens && !event.reg_opens.startsWith("0000-00-00")) {
    const opensAt = new Date(localIso(event.reg_opens));
    if (!Number.isNaN(opensAt.valueOf()) && opensAt > new Date()) {
      return `Opens ${new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(opensAt)}`;
    }
  }

  return "RSVP";
}

function normalizeUrl(event) {
  if (event.url) {
    return event.url.replace("https://sclsnj.libnet.info//event/", "https://sclsnj.libnet.info/event/");
  }
  return `https://sclsnj.libnet.info/event/${event.id}`;
}

function normalizeEvent(event, locationsById) {
  const location = locationsById.get(String(event.location_id));
  const lat = Number(location?.lat || 0);
  const lng = Number(location?.lon || 0);
  const distanceMiles =
    lat && lng ? Math.round(haversineMiles(HOME, { lat, lng }) * 10) / 10 : null;
  const summary = stripHtml(event.description || event.long_description || "");
  const longSummary = stripHtml(event.long_description || "");
  const displayLocationName = location?.name || event.location;
  const venueParts = [displayLocationName, event.venues].filter(Boolean);

  return {
    id: `sclsnj-${event.id}`,
    externalId: String(event.id),
    sourceId: "sclsnj-events",
    title: stripHtml(event.title),
    venue: venueParts.join(" · "),
    venueName: displayLocationName,
    room: event.venues || null,
    category: "library",
    source: "Somerset County Library System",
    startsAt: localIso(event.raw_start_time),
    endsAt: localIso(event.raw_end_time),
    timezone: TIMEZONE,
    durationMinutes: durationMinutes(event.raw_start_time, event.raw_end_time),
    ages: inferAgeBands(event),
    distanceMiles,
    cost: Number(event.registration_cost || 0),
    indoors: inferIndoors(event),
    registration: registrationLabel(event),
    summary: longSummary ? `${summary} ${longSummary}`.trim() : summary,
    url: normalizeUrl(event),
    sourceUrl: normalizeUrl(event),
    address: addressFor(location),
    lat,
    lng,
    map: MAP_POINTS_BY_LOCATION_ID[String(event.location_id)] ?? [50, 50],
    tags: event.tagsArray ?? [],
    status: String(event.changed) === "1" ? "review" : "published",
    confidence: 0.95
  };
}

async function loadLocationsById() {
  try {
    const locations = await fetchJson(LOCATION_ENDPOINT);
    return new Map(locations.map((location) => [String(location.id), location]));
  } catch (error) {
    console.warn(`Location API failed, using fallback locations: ${error.message}`);
    return new Map(FALLBACK_LOCATIONS.map((location) => [String(location.id), location]));
  }
}

async function main() {
  const startDate = argValue("--start", todayInNewYork());
  const days = Number(argValue("--days", "21"));
  const branchIds = argValue("--branches", NEARBY_BRANCH_IDS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const url = buildEventsUrl({
    startDate,
    days,
    branchIds,
    ageFilters: LOW_AGE_FILTERS
  });

  const [locationsById, rawEvents] = await Promise.all([
    loadLocationsById(),
    fetchJson(url)
  ]);

  const events = rawEvents
    .filter(isLowAgeEvent)
    .map((event) => normalizeEvent(event, locationsById))
    .filter((event) => event.startsAt && event.sourceUrl)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(EVENTS_OUTPUT, `${JSON.stringify(events, null, 2)}\n`);

  console.log(`Imported ${events.length} SCLSNJ events from ${rawEvents.length} raw records.`);
  console.log(`Events: ${new URL(EVENTS_OUTPUT).pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
