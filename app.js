const TIMEZONE = "America/New_York";
const APP_VERSION = "20260611-cache-v81";
const HOME = { lat: 40.619261, lng: -74.490372 };
const MAPTILER_KEY = String(window.Where2GoConfig?.mapTilerKey || "").trim();
const MAPTILER_STYLE = String(window.Where2GoConfig?.mapTilerStyle || "streets-v4").trim();
const USE_OSM_FALLBACK = window.Where2GoConfig?.useTemporaryOpenStreetMapFallback === true;
const GITHUB_REPO = String(window.Where2GoConfig?.githubRepo || "").trim();
const GITHUB_BRANCH = String(window.Where2GoConfig?.githubBranch || "main").trim();
const ANALYTICS_CONFIG = window.Where2GoConfig?.analytics || {};
const GOOGLE_ANALYTICS_MEASUREMENT_ID = String(ANALYTICS_CONFIG.googleAnalyticsMeasurementId || "").trim();
const STATS_ENDPOINT = String(ANALYTICS_CONFIG.statsEndpoint || "").trim();
const AREA_ANALYTICS_MAX_DISTANCE_MILES = Number.isFinite(Number(ANALYTICS_CONFIG.areaMaxDistanceMiles))
  ? Number(ANALYTICS_CONFIG.areaMaxDistanceMiles)
  : 12;
const EVENT_FILTERS = {
  all: "all",
  worldCup: "worldCup"
};
// Temporary 2026 World Cup filter; remove this block with the UI after the tournament.
const WORLD_CUP_TEXT_PATTERN = /\b(?:world\s*cup|fifa)\b|世界杯/i;
const WORLD_CUP_OBVIOUS_EVENT_PATTERN =
  /\b(?:dream fan fest|goal zone @ the commons|battle of basking ridge|summit downtown welcomes the world)\b/i;
const AREA_ANALYTICS_SENT_KEY = "where2go-area-analytics-sent-v1";
const STATS_ROW_LIMIT = 8;
const UPDATED_LABEL_CACHE_MS = 60 * 1000;
const DEFAULT_MAP_RADIUS_MILES = 5.6;
const MAP_FIT_PADDING = [52, 52];
const INSTALL_PROMPT_DISMISSED_KEY = "where2go-install-dismissed-at";
const INSTALL_PROMPT_DISMISSED_MS = 7 * 24 * 60 * 60 * 1000;
const INSTALL_PROMPT_DELAY_MS = 1600;
const DRIVE_TIME_CONFIG = window.Where2GoConfig?.driveTime || {};
const DRIVE_TIME_PROVIDER = String(DRIVE_TIME_CONFIG.provider || "openrouteservice").trim();
const DRIVE_TIME_KEY = String(DRIVE_TIME_CONFIG.apiKey || "").trim();
const DRIVE_TIME_PROFILE = String(DRIVE_TIME_CONFIG.profile || "driving-car").trim();
const DRIVE_TIME_ATTRIBUTION =
  '&copy; <a href="https://openrouteservice.org/" target="_blank" title="openrouteservice.org">ORS</a>/<a href="https://www.heigit.org/" target="_blank">HeiGIT</a>';
const DRIVE_TIME_RANGES_MINUTES = Array.isArray(DRIVE_TIME_CONFIG.rangesMinutes)
  ? DRIVE_TIME_CONFIG.rangesMinutes.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  : [10, 20, 30];
const DRIVE_TIME_CONTOURS = [...new Set(DRIVE_TIME_RANGES_MINUTES.length ? DRIVE_TIME_RANGES_MINUTES : [10, 20, 30])].sort(
  (a, b) => a - b
);
const DRIVE_TIME_BAND_STYLES = [
  { className: "is-near", color: "#1f7a4d", fillColor: "#56b87a", fillOpacity: 0.32 },
  { className: "is-middle", color: "#b46d24", fillColor: "#f0b35a", fillOpacity: 0.24 },
  { className: "is-far", color: "#6f63b6", fillColor: "#a28be7", fillOpacity: 0.18 }
];
const SUMMARY_PREVIEW_LIMIT = 130;
const MONTH_NAME_PATTERN =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_TEXT_PATTERN = `(?:${MONTH_NAME_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2})`;
const TIME_TEXT_PATTERN = "(?:\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)";
const TIME_RANGE_TEXT_PATTERN = `${TIME_TEXT_PATTERN}(?:\\s*(?:-|\\u2013|\\u2014|to)\\s*${TIME_TEXT_PATTERN})?`;
const LEADING_DATE_TIME_PATTERN = new RegExp(
  `^(?:(?:sun|mon|tue|wed|thu|fri|sat)(?:day)?[,]?\\s+)?${DATE_TEXT_PATTERN}(?:[,]?\\s+${TIME_RANGE_TEXT_PATTERN})?\\s*`,
  "i"
);
const LEADING_TIME_PATTERN = new RegExp(`^${TIME_RANGE_TEXT_PATTERN}\\s*`, "i");
const METADATA_LABEL_PATTERN = /\b(?:dates?|times?|when|locations?|venues?|addresses?|where):\s*[^.;]+[.;]?\s*/gi;
const SOURCE_PAGE_SENTENCE_PATTERN = /\b(?:Open|See|Visit|Check)\s+(?:the\s+)?source page\b[^.!?]*(?:[.!?]|$)/gi;
const SOURCE_LOGISTICS_CLAUSE_PATTERN =
  /\s+[-–—]\s*(?:see|check|visit|open|follow|be sure to follow)\b[^.!?]{0,180}\b(?:updates?|details?|current availability|confirm|registration|capacity)\b[^.!?]*(?:[.!?]|$)/gi;
const SOURCE_LOGISTICS_SENTENCE_PATTERN =
  /\b(?:open|see|visit|check|follow|be sure to follow|please register|register)\b[^.!?]{0,180}\b(?:updates?|details?|current availability|confirm|registration|capacity)\b[^.!?]*(?:[.!?]|$)/gi;
const GENERIC_SOURCE_SENTENCE_PATTERN = /\b(?:listed by [^.!?]+|[^.!?]*\byouth event)\b[^.!?]*(?:[.!?]|$)/gi;
const QUESTION_LIKE_TITLE_PATTERN = /^(?:how|what|why|when|where|who)\b/i;
const SUMMARY_TITLE_STOP_PATTERN =
  /\s+(?:Join|Learn|Enjoy|Come|Meet|Discover|Explore|Register|Presented|Presenter|Hosted|For|This|In this|During|Participants|All ages)\b/i;

const mapState = {
  map: null,
  markerLayer: null,
  driveTimeLayer: null,
  message: null,
  locateButton: null,
  driveTimeButton: null,
  driveTimeLegend: null,
  searchForm: null,
  searchInput: null,
  searchButton: null,
  userMarker: null,
  searchMarker: null,
  driveTimeCache: new Map(),
  driveTimeRequestId: 0,
  installPromptTimer: 0
};

const state = {
  events: [],
  dates: [],
  selectedDate: "",
  selectedEventId: "",
  dateStripAligned: false,
  mapFocus: "events",
  driveTimeEnabled: false,
  driveTimeLoading: false,
  driveTimeOrigin: null,
  eventFilter: EVENT_FILTERS.all,
  installPromptEvent: null,
  installPromptMode: "",
  initialLocationRequested: false,
  sourceRegistry: null,
  moreMenuOpen: false,
  aboutOpen: false,
  coveredTownsOpen: false,
  statsOpen: false,
  termsOpen: false,
  termsModalOpen: false,
  statsLoaded: false,
  statsLoading: false,
  statsRows: [],
  statsUpdatedAt: "",
  statsMessage: ""
};

const elements = {
  dateStrip: document.querySelector("#dateStrip"),
  eventFilterControl: document.querySelector("#eventFilterControl"),
  mapSurface: document.querySelector("#mapSurface"),
  eventDetail: document.querySelector("#eventDetail"),
  updatedLabel: document.querySelector("#updatedLabel"),
  aboutToggle: document.querySelector("#aboutToggle"),
  aboutPanel: document.querySelector("#aboutPanel"),
  aboutUpdatedLabel: document.querySelector("#aboutUpdatedLabel"),
  moreMenuButton: document.querySelector("#moreMenuButton"),
  moreMenuPanel: document.querySelector("#moreMenuPanel"),
  coveredTownsToggle: document.querySelector("#coveredTownsToggle"),
  coveredTownsPanel: document.querySelector("#coveredTownsPanel"),
  statsToggle: document.querySelector("#statsToggle"),
  statsPanel: document.querySelector("#statsPanel"),
  statsRows: document.querySelector("#statsRows"),
  statsStatus: document.querySelector("#statsStatus"),
  statsUpdated: document.querySelector("#statsUpdated"),
  termsToggle: document.querySelector("#termsToggle"),
  termsPanel: document.querySelector("#termsPanel"),
  termsTemplate: document.querySelector("#termsTemplate"),
  termsModal: document.querySelector("#termsModal"),
  termsModalContent: document.querySelector("#termsModalContent"),
  termsFooterButton: document.querySelector("#termsFooterButton"),
  termsModalClose: document.querySelector("#termsModalClose"),
  termsModalBackdrop: document.querySelector("#termsModalBackdrop"),
  coveredTownsList: document.querySelector("#coveredTownsList"),
  installPrompt: document.querySelector("#installPrompt"),
  installPromptTitle: document.querySelector("#installPromptTitle"),
  installPromptText: document.querySelector("#installPromptText"),
  installPromptAction: document.querySelector("#installPromptAction"),
  installPromptDismiss: document.querySelector("#installPromptDismiss")
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
}

async function loadEventsData() {
  try {
    return await loadJson("data/events.json");
  } catch {
    return loadJson("data/sample-events.json");
  }
}

async function loadSourceRegistryData() {
  try {
    return await loadJson("data/event-sources.json");
  } catch {
    return null;
  }
}

function shouldLoadAnalytics() {
  return Boolean(window.location.hostname && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
}

function initGoogleAnalytics() {
  if (!GOOGLE_ANALYTICS_MEASUREMENT_ID || document.querySelector("[data-where2go-analytics='ga4']")) {
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ANALYTICS_MEASUREMENT_ID)}`;
  script.dataset.where2goAnalytics = "ga4";
  document.head.append(script);
}

function initAnalytics() {
  if (!shouldLoadAnalytics()) {
    return;
  }
  initGoogleAnalytics();
}

function shouldSendAreaAnalytics() {
  return Boolean(GOOGLE_ANALYTICS_MEASUREMENT_ID && shouldLoadAnalytics() && typeof window.gtag === "function");
}

function cleanAnalyticsText(value, maxLength = 80) {
  return String(value || "")
    .replace(/[^\w\s.,'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeFiveDigitZip(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 4) {
    return `0${digits}`;
  }
  if (digits.length === 5) {
    return digits;
  }
  if (digits.length === 9) {
    return digits.slice(0, 5);
  }
  return "";
}

function normalizeStatsZip(value) {
  return normalizeFiveDigitZip(value) || "ZIP TBD";
}

function normalizedAnalyticsArea(area = {}) {
  const town = cleanAnalyticsText(area.town || area.city);
  const city = cleanAnalyticsText(area.city || area.town);
  const state = cleanAnalyticsText(area.state || "NJ", 12).toUpperCase();
  const zip = normalizeFiveDigitZip(area.zip);
  const townId = cleanAnalyticsText(area.townId, 80).toLowerCase();
  const county = cleanAnalyticsText(area.county, 80);
  if (!town && !city && !zip) {
    return null;
  }
  return { town, city, state, zip, townId, county };
}

function areaAnalyticsDedupeSet() {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(AREA_ANALYTICS_SENT_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function rememberAreaAnalyticsKey(key) {
  try {
    const sent = areaAnalyticsDedupeSet();
    sent.add(key);
    window.sessionStorage.setItem(AREA_ANALYTICS_SENT_KEY, JSON.stringify([...sent].slice(-80)));
  } catch {
    // Session storage can be unavailable in strict privacy modes.
  }
}

function trackAreaAnalytics(type, area) {
  if (!shouldSendAreaAnalytics()) {
    return;
  }
  const normalizedArea = normalizedAnalyticsArea(area);
  if (!normalizedArea) {
    return;
  }
  const eventType = cleanAnalyticsText(type, 40);
  const dedupeKey = [localDateKey(new Date()), eventType, normalizedArea.state, normalizedArea.town, normalizedArea.zip].join("|");
  if (areaAnalyticsDedupeSet().has(dedupeKey)) {
    return;
  }
  rememberAreaAnalyticsKey(dedupeKey);

  window.gtag("event", eventType, {
    area_source: eventType,
    area_town: normalizedArea.town,
    area_city: normalizedArea.city,
    area_state: normalizedArea.state,
    area_zip: normalizedArea.zip,
    area_county: normalizedArea.county,
    area_town_id: normalizedArea.townId
  });
}

function eventStartDate(event) {
  if (event.startsAt) {
    return new Date(event.startsAt);
  }
  const [hours, minutes] = event.time.split(":").map(Number);
  const date = new Date();
  date.setDate(date.getDate() + event.dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function eventEndDate(event) {
  if (event.endsAt) {
    return new Date(event.endsAt);
  }
  const start = eventStartDate(event);
  return new Date(start.getTime() + (event.durationMinutes || 45) * 60000);
}

function isEventExpired(event, now = new Date()) {
  return eventEndDate(event) < now;
}

function isGroupExpired(group, now = new Date()) {
  return group.events.length > 0 && group.events.every((event) => isEventExpired(event, now));
}

function localDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeEvents(events) {
  return events
    .map((event) => {
      const startsAt = eventStartDate(event);
      const endsAt = eventEndDate(event);
      return {
        ...event,
        startsAt,
        endsAt,
        dateKey: localDateKey(startsAt),
        lat: Number(event.lat || 0),
        lng: Number(event.lng || 0)
      };
    })
    .filter((event) => event.status !== "review" && event.withinCoverage !== false)
    .sort((a, b) => a.startsAt - b.startsAt);
}

function eventTextForFilter(event) {
  return [
    event.id,
    event.title,
    event.summary,
    event.source,
    event.sourceId,
    event.venue,
    event.venueName,
    Array.isArray(event.tags) ? event.tags.join(" ") : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function isWorldCupRelatedEvent(event) {
  const text = eventTextForFilter(event);
  return WORLD_CUP_TEXT_PATTERN.test(text) || WORLD_CUP_OBVIOUS_EVENT_PATTERN.test(text);
}

function eventsForActiveFilter() {
  if (state.eventFilter === EVENT_FILTERS.worldCup) {
    return state.events.filter(isWorldCupRelatedEvent);
  }
  return state.events;
}

function uniqueDates(events) {
  return [...new Set(events.map((event) => event.dateKey))];
}

function visibleDates(events) {
  return [...new Set([...uniqueDates(events), localDateKey(new Date())])].sort();
}

function defaultSelectedDate(dates) {
  const today = localDateKey(new Date());
  return dates.includes(today) ? today : dates.find((dateKey) => dateKey >= today) || dates.at(-1) || "";
}

function alignActiveDateToStart() {
  window.requestAnimationFrame(() => {
    const activeChip = elements.dateStrip.querySelector(".date-chip.is-active");
    if (!activeChip) {
      return;
    }
    const paddingLeft = Number.parseFloat(window.getComputedStyle(elements.dateStrip).paddingLeft) || 0;
    elements.dateStrip.scrollLeft = Math.max(0, activeChip.offsetLeft - paddingLeft);
  });
}

function eventsForSelectedDate() {
  return eventsForActiveFilter().filter((event) => event.dateKey === state.selectedDate);
}

function normalizedLocationName(event) {
  return String(event.venueName || event.venue || event.address || event.source || event.id || "event-location")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function locationKey(event) {
  const nameKey = normalizedLocationName(event);
  if (hasCoordinates(event)) {
    return `${event.lat.toFixed(5)},${event.lng.toFixed(5)}|${nameKey}`;
  }
  return nameKey;
}

function placeLabel(event) {
  return event.venueName || event.venue || event.address || "Event location";
}

function hasUncertainAddress(event) {
  const status = String(event?.addressStatus || event?.addressConfidence || "").toLowerCase();
  return Boolean(event?.directionsDisabled || event?.addressApproximate || status === "approximate" || status === "uncertain");
}

function distanceMiles(pointA, pointB) {
  if (!hasCoordinates(pointA) || !hasCoordinates(pointB)) {
    return Number.POSITIVE_INFINITY;
  }
  const latMiles = (pointA.lat - pointB.lat) * 69;
  const lngScale = Math.cos((((pointA.lat + pointB.lat) / 2) * Math.PI) / 180);
  const lngMiles = (pointA.lng - pointB.lng) * 69 * lngScale;
  return Math.hypot(latMiles, lngMiles);
}

function distanceSortOrigin() {
  return state.driveTimeOrigin || HOME;
}

function locationGroupsForEvents(events) {
  const groups = new Map();
  events.forEach((event) => {
    const key = locationKey(event);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        lat: event.lat,
        lng: event.lng,
        place: placeLabel(event),
        address: event.address || "",
        hasUncertainAddress: hasUncertainAddress(event),
        events: []
      });
    }
    const group = groups.get(key);
    group.events.push(event);
    if (!group.address && event.address) {
      group.address = event.address;
    }
    if (hasUncertainAddress(event)) {
      group.hasUncertainAddress = true;
    }
  });
  const origin = distanceSortOrigin();
  return [...groups.values()].sort((a, b) => {
    const distanceCompare = distanceMiles(a, origin) - distanceMiles(b, origin);
    if (distanceCompare !== 0) {
      return distanceCompare;
    }
    return String(a.place || "").localeCompare(String(b.place || ""));
  });
}

function groupsWithCoordinates(groups) {
  return groups.filter(hasCoordinates);
}

function groupsForSelectedDate() {
  return locationGroupsForEvents(eventsForSelectedDate());
}

function selectedGroup() {
  const groups = groupsForSelectedDate();
  if (!state.selectedEventId) {
    return null;
  }
  return groups.find((group) => group.events.some((event) => event.id === state.selectedEventId)) || null;
}

function orderedGroupsForDetail() {
  const groups = groupsForSelectedDate();
  if (!state.selectedEventId) {
    return groups;
  }
  const activeGroup = groups.find((group) => group.events.some((event) => event.id === state.selectedEventId));
  if (!activeGroup) {
    return groups;
  }
  return [activeGroup, ...groups.filter((group) => group.key !== activeGroup.key)];
}

function groupPinNumber(group) {
  const index = groupsWithCoordinates(groupsForSelectedDate()).findIndex((item) => item.key === group?.key);
  return index === -1 ? "" : String(index + 1);
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function dateKeyParts(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function dateKeyFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyFromLocalDate(date) {
  return dateKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function dateFromParts(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

function addPublicHoliday(map, dateKey, name) {
  if (!map.has(dateKey)) {
    map.set(dateKey, name);
  }
}

function addFixedPublicHoliday(map, year, month, day, name) {
  const date = dateFromParts(year, month, day);
  addPublicHoliday(map, dateKeyFromLocalDate(date), name);

  if (date.getDay() === 6) {
    addPublicHoliday(map, dateKeyFromLocalDate(dateFromParts(year, month, day - 1)), `${name} (observed)`);
  } else if (date.getDay() === 0) {
    addPublicHoliday(map, dateKeyFromLocalDate(dateFromParts(year, month, day + 1)), `${name} (observed)`);
  }
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const date = dateFromParts(year, month, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return dateKeyFromLocalDate(date);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const date = dateFromParts(year, month + 1, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return dateKeyFromLocalDate(date);
}

const publicHolidayCache = new Map();

function publicHolidaysForYear(year) {
  if (publicHolidayCache.has(year)) {
    return publicHolidayCache.get(year);
  }

  const holidays = new Map();
  addFixedPublicHoliday(holidays, year, 1, 1, "New Year's Day");
  addPublicHoliday(holidays, nthWeekdayOfMonth(year, 1, 1, 3), "Martin Luther King Jr. Day");
  addPublicHoliday(holidays, nthWeekdayOfMonth(year, 2, 1, 3), "Presidents Day");
  addPublicHoliday(holidays, lastWeekdayOfMonth(year, 5, 1), "Memorial Day");
  addFixedPublicHoliday(holidays, year, 6, 19, "Juneteenth");
  addFixedPublicHoliday(holidays, year, 7, 4, "Independence Day");
  addPublicHoliday(holidays, nthWeekdayOfMonth(year, 9, 1, 1), "Labor Day");
  addPublicHoliday(holidays, nthWeekdayOfMonth(year, 10, 1, 2), "Columbus Day");
  addFixedPublicHoliday(holidays, year, 11, 11, "Veterans Day");
  addPublicHoliday(holidays, nthWeekdayOfMonth(year, 11, 4, 4), "Thanksgiving Day");
  addFixedPublicHoliday(holidays, year, 12, 25, "Christmas Day");

  publicHolidayCache.set(year, holidays);
  return holidays;
}

function publicHolidayName(dateKey) {
  const { year } = dateKeyParts(dateKey);
  for (let candidateYear = year - 1; candidateYear <= year + 1; candidateYear += 1) {
    const holidayName = publicHolidaysForYear(candidateYear).get(dateKey);
    if (holidayName) {
      return holidayName;
    }
  }
  return "";
}

function formatDateLabel(dateKey) {
  const date = dateFromKey(dateKey);
  const isToday = dateKey === localDateKey(new Date());
  const holidayName = publicHolidayName(dateKey);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  return {
    isToday,
    isWeekend,
    holidayName,
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
    day: isToday ? "Today" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
  };
}

function formatTimeRange(event) {
  if (event.timeLabel) {
    return event.timeLabel;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
  return `${formatter.format(event.startsAt)} - ${formatter.format(event.endsAt)}`;
}

function formatUpdatedShortLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: TIMEZONE
  }).format(date);
}

function formatUpdatedFullLabel(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
    timeZoneName: "short"
  });
  return formatter.format(date);
}

function setUpdatedLabels(date) {
  if (elements.updatedLabel) {
    elements.updatedLabel.textContent = formatUpdatedShortLabel(date);
  }
  if (elements.aboutUpdatedLabel) {
    elements.aboutUpdatedLabel.textContent = formatUpdatedFullLabel(date);
  }
}

function parseValidDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function latestEventRefreshDate(events) {
  return events
    .flatMap((event) => [event.lastSeenAt, event.firstSeenAt])
    .map(parseValidDate)
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
}

function updateCacheKey() {
  return `where2go-updated-at:v2:${GITHUB_REPO}:${GITHUB_BRANCH}`;
}

function readCachedPushDate() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(updateCacheKey()) || "null");
    if (!cached?.value || Date.now() - Number(cached.savedAt || 0) > UPDATED_LABEL_CACHE_MS) {
      return null;
    }
    return parseValidDate(cached.value);
  } catch {
    return null;
  }
}

function writeCachedPushDate(date) {
  try {
    window.localStorage.setItem(updateCacheKey(), JSON.stringify({ value: date.toISOString(), savedAt: Date.now() }));
  } catch {
    // Cache is optional; private browsing or storage limits should not affect the app.
  }
}

async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/vnd.github+json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Fetch failed ${response.status}`);
    }
    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function latestGitHubPushDate() {
  if (!GITHUB_REPO) {
    return null;
  }
  const cached = readCachedPushDate();
  if (cached) {
    return cached;
  }

  const repoPath = GITHUB_REPO.split("/").map(encodeURIComponent).join("/");
  const cacheMinute = Math.floor(Date.now() / UPDATED_LABEL_CACHE_MS);
  const eventsUrl = `https://api.github.com/repos/${repoPath}/events?per_page=30&_=${cacheMinute}`;
  const repoEvents = await fetchJsonWithTimeout(eventsUrl);
  const branchRef = `refs/heads/${GITHUB_BRANCH}`;
  const pushEvent = Array.isArray(repoEvents)
    ? repoEvents.find((event) => event.type === "PushEvent" && event.payload?.ref === branchRef)
    : null;
  const pushDate = parseValidDate(pushEvent?.created_at);
  if (pushDate) {
    writeCachedPushDate(pushDate);
    return pushDate;
  }

  const branchUrl = `https://api.github.com/repos/${repoPath}/branches/${encodeURIComponent(GITHUB_BRANCH)}?_=${cacheMinute}`;
  const branch = await fetchJsonWithTimeout(branchUrl);
  const commitDate = parseValidDate(branch?.commit?.commit?.committer?.date || branch?.commit?.commit?.author?.date);
  if (commitDate) {
    writeCachedPushDate(commitDate);
  }
  return commitDate;
}

async function updateUpdatedLabel(events) {
  const fallbackDate = latestEventRefreshDate(events) || new Date();
  setUpdatedLabels(fallbackDate);
  try {
    const pushDate = await latestGitHubPushDate();
    if (pushDate) {
      setUpdatedLabels(pushDate);
    }
  } catch {
    setUpdatedLabels(fallbackDate);
  }
}

function titleCaseTownName(value) {
  return collapseWhitespace(value).replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function compactTownMenuName(value) {
  return titleCaseTownName(value).replace(/\s+(Township|Borough|City)$/i, "").trim();
}

function compactCommunityMenuName(value) {
  return titleCaseTownName(value).replace(/\s+Mailing Area$/i, "").trim();
}

function compactPlaceName(value) {
  return collapseWhitespace(value)
    .replace(/\b(Township|Borough|City)\s+(Public\s+Library|Library)\b/gi, "$2")
    .replace(/\b(Township|Borough|City)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function zipCodesForTown(town) {
  if (Array.isArray(town?.zipCodes) && town.zipCodes.length) {
    return town.zipCodes.map(String).filter(Boolean);
  }
  const text = JSON.stringify([town?.municipal, town?.libraries] || []);
  return [...new Set(text.match(/\b\d{5}\b/g) || [])].sort();
}

function zipCommunitiesForTown(town) {
  if (!Array.isArray(town?.zipCommunities)) {
    return [];
  }
  return town.zipCommunities
    .map((community) => ({
      name: compactCommunityMenuName(community?.name || ""),
      zip: String(community?.zip || "").trim()
    }))
    .filter((community) => community.name || community.zip);
}

function coveredTownItems(sourceRegistry) {
  return (sourceRegistry?.towns || [])
    .map((town) => {
      const zipCodes = zipCodesForTown(town);
      return {
        id: town.id,
        name: compactTownMenuName(town.name || town.id || "Town"),
        zipCodes,
        communities: zipCommunitiesForTown(town)
      };
    })
    .sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
}

function areaFromCoveredTown(town, zip = "") {
  if (!town) {
    return null;
  }
  const zipCodes = zipCodesForTown(town);
  return {
    town: compactTownMenuName(town.name || town.id || ""),
    city: compactTownMenuName(town.name || town.id || ""),
    state: "NJ",
    zip: zip || zipCodes[0] || "",
    townId: town.id || "",
    county: town.county || ""
  };
}

function areaFromCoveredZip(zip) {
  const normalizedZip = normalizeFiveDigitZip(zip);
  if (!normalizedZip || !state.sourceRegistry?.towns) {
    return null;
  }
  const town = state.sourceRegistry.towns.find((item) => zipCodesForTown(item).includes(normalizedZip));
  return areaFromCoveredTown(town, normalizedZip);
}

function nearestCoveredTownArea(point) {
  if (!hasCoordinates(point) || !state.sourceRegistry?.towns) {
    return null;
  }
  let nearest = null;
  state.sourceRegistry.towns.forEach((town) => {
    const center = town?.center;
    if (!hasCoordinates(center)) {
      return;
    }
    const miles = distanceMiles(point, center);
    if (!nearest || miles < nearest.miles) {
      nearest = { town, miles };
    }
  });
  if (!nearest || nearest.miles > AREA_ANALYTICS_MAX_DISTANCE_MILES) {
    return null;
  }
  return areaFromCoveredTown(nearest.town);
}

function featureContextValue(feature, names) {
  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  const context = Array.isArray(feature?.context) ? feature.context : [];
  for (const item of context) {
    const id = String(item?.id || "").toLowerCase();
    const type = String(item?.type || "").toLowerCase();
    if ([...wanted].some((name) => id.startsWith(`${name}.`) || type === name)) {
      return item?.text || item?.name || "";
    }
  }
  return "";
}

function featurePropertyValue(feature, names) {
  const properties = feature?.properties || {};
  for (const name of names) {
    if (properties[name]) {
      return properties[name];
    }
  }
  return "";
}

function normalizeStateCode(value) {
  const text = cleanAnalyticsText(value, 40);
  if (!text || /new jersey/i.test(text)) {
    return "NJ";
  }
  return text.length === 2 ? text.toUpperCase() : text;
}

function areaFromGeocodeFeature(feature, point, query = "") {
  const queryZip = isPostalCode(query) ? query.trim() : "";
  const coveredZipArea = areaFromCoveredZip(queryZip);
  if (coveredZipArea) {
    return coveredZipArea;
  }

  const nearestArea = nearestCoveredTownArea(point);
  if (nearestArea) {
    return {
      ...nearestArea,
      zip: queryZip || nearestArea.zip
    };
  }

  const town =
    featurePropertyValue(feature, ["city", "locality", "municipality", "place", "name"]) ||
    featureContextValue(feature, ["place", "locality", "municipality", "localadmin"]);
  const zip =
    featurePropertyValue(feature, ["postal_code", "postcode", "zip"]) ||
    featureContextValue(feature, ["postcode", "postal_code"]) ||
    queryZip;
  const stateName = featurePropertyValue(feature, ["region", "state"]) || featureContextValue(feature, ["region"]);
  return normalizedAnalyticsArea({
    town,
    city: town,
    state: normalizeStateCode(stateName),
    zip
  });
}

function renderCoveredTowns(sourceRegistry) {
  if (!elements.coveredTownsList) {
    return;
  }
  const towns = coveredTownItems(sourceRegistry);
  if (!towns.length) {
    elements.coveredTownsList.innerHTML = `<li class="town-list-empty">No towns loaded</li>`;
    return;
  }
  elements.coveredTownsList.innerHTML = towns
    .map((town) => {
      const zipLabel = town.zipCodes.length ? town.zipCodes.join(", ") : "ZIP TBD";
      const itemClass = `town-list-item${town.communities.length ? " has-communities" : ""}`;
      if (town.communities.length) {
        const communities = town.communities
          .map((community) => {
            const communityName = community.name || "ZIP area";
            const communityZip = community.zip || "ZIP TBD";
            return `<li><span>${escapeHtml(communityName)}</span><span>${escapeHtml(communityZip)}</span></li>`;
          })
          .join("");
        return `<li class="${itemClass}"><div class="town-row"><strong>${escapeHtml(town.name)}</strong></div><ul class="town-sublist">${communities}</ul></li>`;
      }
      return `<li class="${itemClass}"><div class="town-row"><strong>${escapeHtml(town.name)}</strong><span>${escapeHtml(zipLabel)}</span></div></li>`;
    })
    .join("");
}

function renderCoveredTownsPanel() {
  if (!elements.coveredTownsToggle || !elements.coveredTownsPanel) {
    return;
  }
  elements.coveredTownsPanel.hidden = !state.coveredTownsOpen;
  elements.coveredTownsToggle.setAttribute("aria-expanded", String(state.coveredTownsOpen));
}

function renderAboutPanel() {
  if (!elements.aboutToggle || !elements.aboutPanel) {
    return;
  }
  elements.aboutPanel.hidden = !state.aboutOpen;
  elements.aboutToggle.setAttribute("aria-expanded", String(state.aboutOpen));
}

function toggleAboutPanel() {
  state.aboutOpen = !state.aboutOpen;
  renderAboutPanel();
}

function toggleCoveredTownsPanel() {
  state.coveredTownsOpen = !state.coveredTownsOpen;
  renderCoveredTownsPanel();
}

function normalizeStatsRows(rows = []) {
  return rows
    .map((row) => {
      const visits = Number(row.visits ?? row.count ?? row.eventCount ?? 0);
      return {
        state: cleanAnalyticsText(row.state || "NJ", 12).toUpperCase(),
        zip: normalizeStatsZip(row.zip),
        visits: Number.isFinite(visits) ? Math.max(0, Math.round(visits)) : 0
      };
    })
    .filter((row) => row.state && row.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, STATS_ROW_LIMIT);
}

function formatVisitCount(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatStatsUpdated(value) {
  if (!value) {
    return "Last 28 days";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Last 28 days";
  }
  return `Updated ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}`;
}

function renderStatsPanel() {
  if (!elements.statsPanel || !elements.statsToggle || !elements.statsRows || !elements.statsStatus || !elements.statsUpdated) {
    return;
  }
  elements.statsPanel.hidden = !state.statsOpen;
  elements.statsToggle.setAttribute("aria-expanded", String(state.statsOpen));
  elements.statsUpdated.textContent = formatStatsUpdated(state.statsUpdatedAt);

  elements.statsRows.innerHTML = state.statsRows
    .map((row) => {
      return `
        <div class="stats-row" role="row">
          <span role="cell">${escapeHtml(row.state)}</span>
          <span role="cell">${escapeHtml(row.zip)}</span>
          <span role="cell">${escapeHtml(formatVisitCount(row.visits))}</span>
        </div>
      `;
    })
    .join("");

  if (state.statsLoading) {
    elements.statsStatus.textContent = "Loading stats...";
  } else if (state.statsMessage) {
    elements.statsStatus.textContent = state.statsMessage;
  } else if (!state.statsRows.length) {
    elements.statsStatus.textContent = "No stats yet.";
  } else {
    elements.statsStatus.textContent = "";
  }
}

function hydrateTermsContent() {
  const template = elements.termsTemplate?.content;
  if (!template) {
    return;
  }
  if (elements.termsPanel) {
    elements.termsPanel.innerHTML = "";
    elements.termsPanel.appendChild(template.cloneNode(true));
  }
  if (elements.termsModalContent) {
    elements.termsModalContent.innerHTML = "";
    elements.termsModalContent.appendChild(template.cloneNode(true));
  }
}

async function loadStats() {
  if (!STATS_ENDPOINT || state.statsLoading) {
    state.statsMessage = STATS_ENDPOINT ? state.statsMessage : "Stats endpoint not configured.";
    renderStatsPanel();
    return;
  }
  state.statsLoading = true;
  state.statsMessage = "";
  renderStatsPanel();
  try {
    const response = await fetch(STATS_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("Stats unavailable");
    }
    const payload = await response.json();
    state.statsRows = normalizeStatsRows(payload.areas || payload.rows || []);
    state.statsUpdatedAt = payload.updatedAt || "";
    state.statsLoaded = true;
    state.statsMessage = payload.message || "";
  } catch {
    state.statsRows = [];
    state.statsMessage = "Stats unavailable.";
  } finally {
    state.statsLoading = false;
    renderStatsPanel();
  }
}

function toggleStatsPanel() {
  state.statsOpen = !state.statsOpen;
  renderStatsPanel();
  if (state.statsOpen && !state.statsLoaded) {
    loadStats();
  }
}

function renderTermsPanel() {
  if (!elements.termsPanel || !elements.termsToggle) {
    return;
  }
  elements.termsPanel.hidden = !state.termsOpen;
  elements.termsToggle.setAttribute("aria-expanded", String(state.termsOpen));
}

function toggleTermsPanel() {
  state.termsOpen = !state.termsOpen;
  renderTermsPanel();
}

function renderTermsModal() {
  if (!elements.termsModal) {
    return;
  }
  elements.termsModal.hidden = !state.termsModalOpen;
  elements.termsModal.setAttribute("aria-hidden", String(!state.termsModalOpen));
  document.body.classList.toggle("modal-open", state.termsModalOpen);
  if (state.termsModalOpen) {
    elements.termsModalClose?.focus();
  }
}

function openTermsModal() {
  if (state.termsModalOpen) {
    return;
  }
  state.termsModalOpen = true;
  renderTermsModal();
  if (state.termsOpen) {
    state.termsOpen = false;
    renderTermsPanel();
  }
  setMoreMenuOpen(false);
}

function closeTermsModal() {
  if (!state.termsModalOpen) {
    return;
  }
  state.termsModalOpen = false;
  renderTermsModal();
  elements.termsFooterButton?.focus();
}

function setMoreMenuOpen(isOpen) {
  state.moreMenuOpen = isOpen;
  if (elements.moreMenuPanel) {
    elements.moreMenuPanel.hidden = !isOpen;
  }
  if (elements.moreMenuButton) {
    elements.moreMenuButton.setAttribute("aria-expanded", String(isOpen));
  }
}

function toggleMoreMenu() {
  setMoreMenuOpen(!state.moreMenuOpen);
}

function bindMoreMenu() {
  elements.moreMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMoreMenu();
  });
  elements.aboutToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAboutPanel();
  });
  elements.coveredTownsToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCoveredTownsPanel();
  });
  elements.statsToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleStatsPanel();
  });
  elements.termsToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTermsPanel();
  });
  elements.termsFooterButton?.addEventListener("click", () => {
    openTermsModal();
  });
  elements.termsModalClose?.addEventListener("click", () => {
    closeTermsModal();
  });
  elements.termsModalBackdrop?.addEventListener("click", () => {
    closeTermsModal();
  });
  elements.moreMenuPanel?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", () => {
    if (state.moreMenuOpen) {
      setMoreMenuOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (state.termsModalOpen) {
      event.preventDefault();
      closeTermsModal();
      return;
    }
    if (state.moreMenuOpen) {
      setMoreMenuOpen(false);
      elements.moreMenuButton?.focus();
    }
  });
}

function syncDatesForActiveFilter() {
  state.dates = visibleDates(eventsForActiveFilter());
  if (!state.dates.includes(state.selectedDate)) {
    state.selectedDate = defaultSelectedDate(state.dates);
    state.selectedEventId = "";
    state.mapFocus = "events";
  }
}

function renderEventFilter() {
  elements.eventFilterControl?.classList.toggle("is-world-cup", state.eventFilter === EVENT_FILTERS.worldCup);
  elements.eventFilterControl?.querySelectorAll("[data-event-filter]").forEach((button) => {
    const isActive = button.dataset.eventFilter === state.eventFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setEventFilter(filter) {
  if (!Object.values(EVENT_FILTERS).includes(filter) || filter === state.eventFilter) {
    return;
  }
  state.eventFilter = filter;
  state.selectedEventId = "";
  state.mapFocus = "events";
  state.dateStripAligned = false;
  syncDatesForActiveFilter();
  render();
}

function bindEventFilter() {
  elements.eventFilterControl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-filter]");
    if (!button || !elements.eventFilterControl.contains(button)) {
      return;
    }
    setEventFilter(button.dataset.eventFilter);
  });
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingKnownValue(text, value) {
  const phrase = collapseWhitespace(value);
  if (!phrase) {
    return text;
  }
  return text
    .replace(new RegExp(`^${escapeRegExp(phrase)}\\s*(?:[-:|,]|\\u2013|\\u2014)?\\s*`, "i"), "")
    .trim();
}

function stripLeadingDateTime(text) {
  let cleaned = text.trim();
  let previous = "";
  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned
      .replace(LEADING_DATE_TIME_PATTERN, "")
      .replace(LEADING_TIME_PATTERN, "")
      .replace(/^\s*(?:[-:|,]|\u2013|\u2014)+\s*/, "")
      .trim();
  }
  return cleaned;
}

function summaryWithoutRepeatedMetadata(event) {
  let text = collapseWhitespace(event.summary);
  if (!text) {
    return "";
  }
  text = collapseWhitespace(text.replace(METADATA_LABEL_PATTERN, " "));
  text = collapseWhitespace(text.replace(SOURCE_PAGE_SENTENCE_PATTERN, " "));
  text = collapseWhitespace(text.replace(SOURCE_LOGISTICS_CLAUSE_PATTERN, "."));
  text = collapseWhitespace(text.replace(SOURCE_LOGISTICS_SENTENCE_PATTERN, " "));
  text = collapseWhitespace(text.replace(GENERIC_SOURCE_SENTENCE_PATTERN, " "));
  return stripLeadingDateTime(text.replace(/\s+([,.!?])/g, "$1").replace(/\.{2,}/g, "."));
}

function normalizeDisplayTitle(value) {
  return collapseWhitespace(value)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+A\s+USA\s+\d{3}\b.*$/i, "")
    .replace(/\s+[-\u2013\u2014]\s+/g, ": ")
    .trim();
}

function isQuestionLikeTitle(title) {
  return QUESTION_LIKE_TITLE_PATTERN.test(title) || /\?$/.test(title);
}

function summaryTitleSegment(event) {
  const text = summaryWithoutRepeatedMetadata(event);
  const stopMatch = text.match(SUMMARY_TITLE_STOP_PATTERN);
  return stopMatch ? text.slice(0, stopMatch.index).trim() : "";
}

function summaryTitleCandidate(event) {
  const normalized = normalizeDisplayTitle(summaryTitleSegment(event));
  if (normalized.length >= 12 && normalized.length <= 90 && !isQuestionLikeTitle(normalized)) {
    return normalized;
  }
  return "";
}

function displayTitle(event) {
  const title = collapseWhitespace(event.title) || "Event";
  if (!isQuestionLikeTitle(title)) {
    return title;
  }
  return summaryTitleCandidate(event) || title;
}

function repeatedSummaryTitleSegment(event) {
  const segment = summaryTitleSegment(event);
  if (!segment) {
    return "";
  }
  return normalizeDisplayTitle(segment) === normalizeDisplayTitle(displayTitle(event)) ? segment : "";
}

function cleanedSummaryText(event) {
  let text = summaryWithoutRepeatedMetadata(event);
  if (!text) {
    return "";
  }
  text = stripLeadingDateTime(text);
  const titleSegment = repeatedSummaryTitleSegment(event);
  [titleSegment, displayTitle(event), event.title, event.venueName, event.venue, event.address, event.source].forEach((value) => {
    text = stripLeadingKnownValue(text, value);
  });
  return stripLeadingDateTime(collapseWhitespace(text));
}

function summaryText(event) {
  const text = cleanedSummaryText(event);
  if (text.length <= SUMMARY_PREVIEW_LIMIT) {
    return text;
  }
  return `${text.slice(0, SUMMARY_PREVIEW_LIMIT).trim()}...`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readStorageValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return "";
  }
}

function writeStorageValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function appRunsStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
}

function isIosLikeDevice() {
  const userAgent = window.navigator?.userAgent || "";
  const platform = window.navigator?.platform || "";
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && window.navigator?.maxTouchPoints > 1);
}

function installPromptDismissedRecently() {
  const dismissedAt = Number(readStorageValue(INSTALL_PROMPT_DISMISSED_KEY));
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < INSTALL_PROMPT_DISMISSED_MS;
}

function rememberInstallPromptDismissed() {
  writeStorageValue(INSTALL_PROMPT_DISMISSED_KEY, String(Date.now()));
}

function shouldSuppressInstallPrompt() {
  return appRunsStandalone() || installPromptDismissedRecently();
}

function hideInstallPrompt() {
  if (elements.installPrompt) {
    elements.installPrompt.hidden = true;
  }
  state.installPromptMode = "";
}

function setInstallPromptContent(mode) {
  if (!elements.installPromptTitle || !elements.installPromptText || !elements.installPromptAction) {
    return;
  }
  const iosMode = mode === "ios";
  elements.installPromptTitle.textContent = iosMode ? "Add Where2Go" : "Install Where2Go";
  elements.installPromptText.textContent = iosMode
    ? "Use Share, then Add to Home Screen."
    : "Open faster from your home screen.";
  elements.installPromptAction.textContent = iosMode ? "Got it" : "Install";
}

function showInstallPrompt(mode) {
  if (!elements.installPrompt || shouldSuppressInstallPrompt()) {
    return;
  }
  state.installPromptMode = mode;
  setInstallPromptContent(mode);
  elements.installPrompt.hidden = false;
}

function scheduleInstallPrompt(mode = "") {
  if (mapState.installPromptTimer || shouldSuppressInstallPrompt()) {
    return;
  }
  mapState.installPromptTimer = window.setTimeout(() => {
    mapState.installPromptTimer = 0;
    if (shouldSuppressInstallPrompt()) {
      return;
    }
    if (mode) {
      showInstallPrompt(mode);
      return;
    }
    if (state.installPromptEvent) {
      showInstallPrompt("native");
    } else if (isIosLikeDevice()) {
      showInstallPrompt("ios");
    }
  }, INSTALL_PROMPT_DELAY_MS);
}

async function handleInstallPromptAction() {
  if (state.installPromptMode === "ios") {
    rememberInstallPromptDismissed();
    hideInstallPrompt();
    return;
  }
  const promptEvent = state.installPromptEvent;
  if (!promptEvent) {
    hideInstallPrompt();
    return;
  }
  hideInstallPrompt();
  state.installPromptEvent = null;
  try {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome !== "accepted") {
      rememberInstallPromptDismissed();
    }
  } catch {
    rememberInstallPromptDismissed();
  }
}

function dismissInstallPrompt() {
  rememberInstallPromptDismissed();
  hideInstallPrompt();
}

function sourceUrl(event) {
  return event.sourceUrl || event.url || "#";
}

function hasCoordinates(event) {
  return Number.isFinite(event.lat) && Number.isFinite(event.lng) && event.lat !== 0 && event.lng !== 0;
}

function eventsWithCoordinates(events) {
  return events.filter(hasCoordinates);
}

function boundsAroundPoint({ lat, lng }, radiusMiles = DEFAULT_MAP_RADIUS_MILES) {
  const latDelta = radiusMiles / 69;
  const lngScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lngDelta = radiusMiles / (69 * lngScale);
  return L.latLngBounds(
    [lat - latDelta, lng - lngDelta],
    [lat + latDelta, lng + lngDelta]
  );
}

function boundsWithMinimumRadius(bounds, center, radiusMiles = DEFAULT_MAP_RADIUS_MILES) {
  const minimumBounds = boundsAroundPoint(center, radiusMiles);
  const expanded = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
  expanded.extend(minimumBounds.getSouthWest());
  expanded.extend(minimumBounds.getNorthEast());
  return expanded;
}

function fitMapBounds(bounds, options = {}) {
  if (!mapState.map || !bounds?.isValid?.()) {
    return;
  }
  mapState.map.fitBounds(bounds, {
    padding: MAP_FIT_PADDING,
    animate: options.animate !== false
  });
}

function fitMapAroundPoint(point, options = {}) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) {
    return;
  }
  fitMapBounds(boundsAroundPoint(point, options.radiusMiles || DEFAULT_MAP_RADIUS_MILES), options);
}

function markerIcon(index, isActive, isExpired) {
  const classNames = ["event-map-marker"];
  if (isActive) {
    classNames.push("is-active");
  }
  if (isExpired) {
    classNames.push("is-expired");
  }
  return L.divIcon({
    className: classNames.join(" "),
    html: `<span>${index + 1}</span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 31],
    popupAnchor: [0, -30]
  });
}

function setMapMessage(title, body = "") {
  if (!mapState.message) {
    return;
  }
  if (!title) {
    mapState.message.hidden = true;
    mapState.message.innerHTML = "";
    return;
  }
  mapState.message.hidden = false;
  mapState.message.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${body ? `<span>${escapeHtml(body)}</span>` : ""}
  `;
}

function setControlLoading(kind, isLoading) {
  if (kind === "locate" && mapState.locateButton) {
    mapState.locateButton.disabled = isLoading;
    mapState.locateButton.classList.toggle("is-loading", isLoading);
    mapState.locateButton.setAttribute("aria-busy", String(isLoading));
  }
  if (kind === "search") {
    if (mapState.searchButton) {
      mapState.searchButton.disabled = isLoading;
      mapState.searchButton.textContent = isLoading ? "..." : "Go";
    }
    if (mapState.searchInput) {
      mapState.searchInput.disabled = isLoading;
    }
  }
  if (kind === "driveTime" && mapState.driveTimeButton) {
    mapState.driveTimeButton.disabled = isLoading;
    mapState.driveTimeButton.textContent = isLoading ? "..." : "Drive";
    mapState.driveTimeButton.setAttribute("aria-busy", String(isLoading));
  }
}

function updateDriveTimeControl() {
  if (!mapState.driveTimeButton) {
    return;
  }
  mapState.driveTimeButton.classList.toggle("is-active", state.driveTimeEnabled);
  mapState.driveTimeButton.setAttribute("aria-pressed", String(state.driveTimeEnabled));
  if (!state.driveTimeLoading) {
    mapState.driveTimeButton.textContent = "Drive";
  }
  if (mapState.driveTimeLegend) {
    mapState.driveTimeLegend.hidden = !state.driveTimeEnabled || state.driveTimeLoading;
  }
}

function driveTimeErrorBody(error) {
  if (String(error?.message || "").includes("API key")) {
    return "Add driveTime.apiKey in config.js.";
  }
  return "Try again later.";
}

function setDriveTimeOrigin({ lat, lng, source }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  state.driveTimeOrigin = { lat, lng, source };
  if (state.driveTimeEnabled) {
    refreshDriveTimeLayer().catch((error) => {
      setMapMessage(error.message || "Drive time failed", driveTimeErrorBody(error));
    });
  }
}

function driveTimeCacheKey(origin) {
  return [
    DRIVE_TIME_PROVIDER,
    DRIVE_TIME_PROFILE,
    DRIVE_TIME_CONTOURS.join(","),
    origin.lat.toFixed(5),
    origin.lng.toFixed(5)
  ].join("|");
}

function driveTimeFeatureMinutes(feature) {
  const properties = feature?.properties || {};
  const rawValue = Number(properties.value ?? properties.contour ?? properties.range ?? 0);
  if (!Number.isFinite(rawValue)) {
    return 0;
  }
  return rawValue > 60 ? Math.round(rawValue / 60) : Math.round(rawValue);
}

function driveTimeBandIndex(minutes) {
  const index = DRIVE_TIME_CONTOURS.findIndex((contour) => minutes <= contour);
  return index === -1 ? DRIVE_TIME_CONTOURS.length - 1 : index;
}

function driveTimeBandStyle(index) {
  return DRIVE_TIME_BAND_STYLES[Math.min(index, DRIVE_TIME_BAND_STYLES.length - 1)];
}

function driveTimeFeatureStyle(feature) {
  const minutes = driveTimeFeatureMinutes(feature);
  const bandStyle = driveTimeBandStyle(driveTimeBandIndex(minutes));
  return {
    color: bandStyle.color,
    weight: 2,
    opacity: 0.78,
    fillColor: bandStyle.fillColor,
    fillOpacity: bandStyle.fillOpacity
  };
}

function driveTimeLegendItems() {
  return DRIVE_TIME_CONTOURS.map((minutes, index) => {
    const bandStyle = driveTimeBandStyle(index);
    const label = `${minutes}m`;
    return `<span><i class="drive-time-swatch ${bandStyle.className}"></i>${label}</span>`;
  }).join("");
}

function driveTimeLoadingBody() {
  if (DRIVE_TIME_CONTOURS.length === 1) {
    return `${DRIVE_TIME_CONTOURS[0]} minute area.`;
  }
  const values = DRIVE_TIME_CONTOURS.map((minutes) => String(minutes));
  const last = values.pop();
  return `${values.join(", ")}${values.length > 1 ? "," : ""} and ${last} minute areas.`;
}

function normalizedDriveTimeFeatures(geojson) {
  return (geojson?.features || [])
    .filter((feature) => feature?.geometry)
    .sort((a, b) => driveTimeFeatureMinutes(b) - driveTimeFeatureMinutes(a));
}

function renderDriveTimeLayer(geojson) {
  if (!mapState.driveTimeLayer || !mapState.map) {
    return;
  }
  mapState.driveTimeLayer.clearLayers();
  normalizedDriveTimeFeatures(geojson).forEach((feature) => {
    L.geoJSON(feature, {
      interactive: false,
      style: driveTimeFeatureStyle
    }).addTo(mapState.driveTimeLayer);
  });
  updateDriveTimeControl();
}

async function fetchOpenRouteServiceIsochrones(origin) {
  if (!DRIVE_TIME_KEY) {
    throw new Error("Drive-time API key needed");
  }
  const response = await fetch(
    `https://api.openrouteservice.org/v2/isochrones/${encodeURIComponent(DRIVE_TIME_PROFILE)}`,
    {
      method: "POST",
      headers: {
        Authorization: DRIVE_TIME_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        locations: [[origin.lng, origin.lat]],
        range_type: "time",
        range: DRIVE_TIME_CONTOURS.map((minutes) => minutes * 60)
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Drive time failed (${response.status})`);
  }
  const geojson = await response.json();
  if (!Array.isArray(geojson.features)) {
    throw new Error("Drive time returned no areas");
  }
  return geojson;
}

async function fetchDriveTimeIsochrones(origin) {
  if (DRIVE_TIME_PROVIDER !== "openrouteservice") {
    throw new Error("Unsupported drive-time provider");
  }
  const key = driveTimeCacheKey(origin);
  if (mapState.driveTimeCache.has(key)) {
    return mapState.driveTimeCache.get(key);
  }
  const geojson = await fetchOpenRouteServiceIsochrones(origin);
  mapState.driveTimeCache.set(key, geojson);
  return geojson;
}

async function refreshDriveTimeLayer() {
  if (!state.driveTimeOrigin) {
    throw new Error("Use location or search first");
  }
  const requestId = (mapState.driveTimeRequestId += 1);
  state.driveTimeLoading = true;
  setControlLoading("driveTime", true);
  updateDriveTimeControl();
  setMapMessage("Loading drive time", driveTimeLoadingBody());
  try {
    const geojson = await fetchDriveTimeIsochrones(state.driveTimeOrigin);
    if (requestId !== mapState.driveTimeRequestId) {
      return;
    }
    renderDriveTimeLayer(geojson);
    setMapMessage("");
  } finally {
    if (requestId === mapState.driveTimeRequestId) {
      state.driveTimeLoading = false;
      setControlLoading("driveTime", false);
      updateDriveTimeControl();
    }
  }
}

function clearDriveTimeLayer() {
  state.driveTimeEnabled = false;
  state.driveTimeLoading = false;
  mapState.driveTimeLayer?.clearLayers();
  updateDriveTimeControl();
}

function autoEnableDriveTimeLayer() {
  if (state.driveTimeEnabled) {
    return;
  }
  state.driveTimeEnabled = true;
  updateDriveTimeControl();
  refreshDriveTimeLayer().catch((error) => {
    clearDriveTimeLayer();
    setMapMessage(error.message || "Drive time failed", driveTimeErrorBody(error));
  });
}

async function toggleDriveTimeLayer() {
  if (state.driveTimeEnabled) {
    clearDriveTimeLayer();
    setMapMessage("");
    return;
  }
  if (!state.driveTimeOrigin) {
    setMapMessage("Use location or search first", "Then turn on drive time.");
    return;
  }
  state.driveTimeEnabled = true;
  updateDriveTimeControl();
  try {
    await refreshDriveTimeLayer();
  } catch (error) {
    clearDriveTimeLayer();
    setMapMessage(error.message || "Drive time failed", driveTimeErrorBody(error));
  }
}

function addOrMoveCircleMarker(markerName, lat, lng, options) {
  if (!mapState.map) {
    return;
  }
  if (mapState[markerName]) {
    mapState[markerName].setLatLng([lat, lng]);
    return;
  }
  mapState[markerName] = L.circleMarker([lat, lng], options).addTo(mapState.map);
}

function moveMapToPoint({ lat, lng, marker = "search", autoEnableDriveTime = false }) {
  if (!mapState.map || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  const markerOptions =
    marker === "user"
      ? { radius: 8, color: "#ffffff", weight: 3, fillColor: "#2f7de1", fillOpacity: 1, className: "user-location-dot" }
      : { radius: 7, color: "#ffffff", weight: 3, fillColor: "#c58338", fillOpacity: 1 };
  addOrMoveCircleMarker(marker === "user" ? "userMarker" : "searchMarker", lat, lng, markerOptions);
  fitMapAroundPoint({ lat, lng });
  state.mapFocus = marker === "user" ? "user" : "search";
  const wasDriveTimeEnabled = state.driveTimeEnabled;
  setDriveTimeOrigin({ lat, lng, source: marker });
  if (autoEnableDriveTime && !wasDriveTimeEnabled) {
    autoEnableDriveTimeLayer();
  }
  if (!state.driveTimeLoading) {
    setMapMessage("");
  }
  render();
}

function geolocationErrorMessage(error) {
  if (error?.code === 1) {
    return ["Location permission denied", "Enter a ZIP code instead."];
  }
  if (error?.code === 2) {
    return ["Location unavailable", "Try again or enter a ZIP code."];
  }
  if (error?.code === 3) {
    return ["Location timed out", "Try again or enter a ZIP code."];
  }
  return ["Could not get location", "Try again or enter a ZIP code."];
}

function locateUser() {
  if (!navigator.geolocation) {
    setMapMessage("Location is not supported", "Enter a ZIP code instead.");
    return;
  }
  setControlLoading("locate", true);
  setMapMessage("Finding your location", "Allow location access when prompted.");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setControlLoading("locate", false);
      const point = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      moveMapToPoint({
        lat: point.lat,
        lng: point.lng,
        marker: "user",
        autoEnableDriveTime: true
      });
      trackAreaAnalytics("located_area", nearestCoveredTownArea(point));
    },
    (error) => {
      setControlLoading("locate", false);
      const [title, body] = geolocationErrorMessage(error);
      setMapMessage(title, body);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function isPostalCode(value) {
  return /^\d{5}$/.test(value.trim());
}

async function geocodePlace(query) {
  const trimmed = query.trim();
  if (!MAPTILER_KEY) {
    throw new Error("Search needs a MapTiler key.");
  }
  const params = new URLSearchParams({
    key: MAPTILER_KEY,
    country: "us",
    limit: "1",
    language: "en",
    proximity: `${HOME.lng},${HOME.lat}`
  });
  if (isPostalCode(trimmed)) {
    params.set("types", "postal_code");
  }
  const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Search failed.");
  }
  const data = await response.json();
  const feature = data.features?.[0];
  const center = feature?.center || feature?.geometry?.coordinates;
  if (!Array.isArray(center) || center.length < 2) {
    throw new Error("Place not found.");
  }
  const result = {
    lat: Number(center[1]),
    lng: Number(center[0]),
    bbox: feature.bbox
  };
  return {
    ...result,
    area: areaFromGeocodeFeature(feature, result, trimmed)
  };
}

function fitSearchResult(result) {
  if (!mapState.map || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
    setMapMessage("Place not found", "Try a ZIP code or township name.");
    return;
  }
  state.mapFocus = "search";
  const wasDriveTimeEnabled = state.driveTimeEnabled;
  addOrMoveCircleMarker("searchMarker", result.lat, result.lng, {
    radius: 7,
    color: "#ffffff",
    weight: 3,
    fillColor: "#c58338",
    fillOpacity: 1
  });
  setDriveTimeOrigin({ lat: result.lat, lng: result.lng, source: "search" });

  if (Array.isArray(result.bbox) && result.bbox.length === 4) {
    const [west, south, east, north] = result.bbox.map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      const searchBounds = L.latLngBounds(
        [
          [south, west],
          [north, east]
        ]
      );
      fitMapBounds(boundsWithMinimumRadius(searchBounds, result));
    } else {
      fitMapAroundPoint(result);
    }
  } else {
    fitMapAroundPoint(result);
  }
  if (!wasDriveTimeEnabled) {
    autoEnableDriveTimeLayer();
  }
  if (!state.driveTimeLoading) {
    setMapMessage("");
  }
  render();
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  const query = mapState.searchInput?.value.trim() || "";
  if (query.length < 2) {
    setMapMessage("Enter a place", "Try 07059, Watchung, or Bridgewater.");
    mapState.searchInput?.focus();
    return;
  }

  setControlLoading("search", true);
  setMapMessage("Searching", query);
  try {
    const result = await geocodePlace(query);
    fitSearchResult(result);
    trackAreaAnalytics("search_area", result.area);
  } catch (error) {
    setMapMessage(error.message || "Search failed", "Try a ZIP code or township name.");
  } finally {
    setControlLoading("search", false);
  }
}

function bindMapControls() {
  mapState.locateButton = elements.mapSurface.querySelector("#locateButton");
  mapState.searchForm = elements.mapSurface.querySelector("#searchForm");
  mapState.searchInput = elements.mapSurface.querySelector("#searchInput");
  mapState.searchButton = elements.mapSurface.querySelector("#searchButton");
  mapState.driveTimeButton = elements.mapSurface.querySelector("#driveTimeButton");
  mapState.driveTimeLegend = elements.mapSurface.querySelector("#driveTimeLegend");

  mapState.locateButton?.addEventListener("click", locateUser);
  mapState.searchForm?.addEventListener("submit", handleSearchSubmit);
  mapState.driveTimeButton?.addEventListener("click", toggleDriveTimeLayer);
  updateDriveTimeControl();
}

function addBaseLayer(map) {
  if (MAPTILER_KEY) {
    const layer = L.tileLayer(
      `https://api.maptiler.com/maps/${MAPTILER_STYLE}/{z}/{x}/{y}.png?key=${encodeURIComponent(MAPTILER_KEY)}`,
      {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 19,
        crossOrigin: true,
        attribution:
          '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" title="OpenStreetMap contributors">&copy; OSM</a>'
      }
    );
    layer.on("tileerror", () => {
      setMapMessage("Map tiles could not load", "Check the MapTiler key and allowed domains.");
    });
    layer.addTo(map);
    return;
  }

  if (USE_OSM_FALLBACK) {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" title="OpenStreetMap contributors">OSM</a>'
    }).addTo(map);
    setMapMessage("Temporary map layer", "Add a MapTiler key to use the production basemap.");
    return;
  }

  setMapMessage("MapTiler key needed", "Add your key in config.js to show the production map.");
}

function ensureMapShell() {
  if (mapState.message) {
    return;
  }
  elements.mapSurface.innerHTML = `
    <div class="leaflet-map" id="leafletMap" aria-label="Interactive event map"></div>
    <button class="locate-button" id="locateButton" type="button" aria-label="Use my location" title="Use my location">
      <span class="locate-glyph" aria-hidden="true"></span>
    </button>
    <form class="search-form" id="searchForm" autocomplete="on">
      <label class="sr-only" for="searchInput">Search place or ZIP</label>
      <input id="searchInput" name="search" autocomplete="off" maxlength="40" placeholder="ZIP or town" aria-label="Search ZIP or township" />
      <button id="searchButton" type="submit">Go</button>
    </form>
    <button class="drive-time-button" id="driveTimeButton" type="button" aria-pressed="false" aria-label="Toggle drive-time areas" title="Toggle drive-time areas">Drive</button>
    <div class="drive-time-legend" id="driveTimeLegend" hidden>
      ${driveTimeLegendItems()}
    </div>
    <div class="map-message" id="mapMessage" hidden></div>
  `;
  mapState.message = elements.mapSurface.querySelector("#mapMessage");
  bindMapControls();
}

function initMap() {
  if (mapState.map) {
    return true;
  }
  ensureMapShell();
  if (typeof L === "undefined") {
    setMapMessage("Map library failed to load", "Check your connection and refresh.");
    return false;
  }

  const map = L.map("leafletMap", {
    zoomControl: false,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    scrollWheelZoom: false,
    tap: true
  });

  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  addBaseLayer(map);
  map.attributionControl.addAttribution(DRIVE_TIME_ATTRIBUTION);
  mapState.driveTimeLayer = L.layerGroup().addTo(map);
  mapState.markerLayer = L.layerGroup().addTo(map);
  mapState.map = map;
  fitMapAroundPoint(HOME, { animate: false });
  setTimeout(() => map.invalidateSize(), 0);
  return true;
}

function fitMapToEventArea() {
  if (!mapState.map) {
    return;
  }
  fitMapAroundPoint(distanceSortOrigin());
}

function syncMarkers(dayEvents, activeGroup) {
  if (!mapState.markerLayer || !mapState.map) {
    return;
  }
  mapState.markerLayer.clearLayers();

  const groups = locationGroupsForEvents(dayEvents);
  const points = groupsWithCoordinates(groups);
  const now = new Date();
  points.forEach((group, index) => {
    const isActive = group.key === activeGroup?.key;
    const isExpired = isGroupExpired(group, now);
    L.marker([group.lat, group.lng], { icon: markerIcon(index, isActive, isExpired), keyboard: true })
      .addTo(mapState.markerLayer)
      .on("click", () => {
        state.selectedEventId = group.events[0].id;
        state.mapFocus = "event";
        render();
      });
  });

  if (state.selectedEventId && activeGroup && hasCoordinates(activeGroup)) {
    mapState.map.panTo([activeGroup.lat, activeGroup.lng], { animate: true });
  } else if (state.mapFocus === "events") {
    fitMapToEventArea();
  }
}

function renderDates() {
  elements.dateStrip.innerHTML = state.dates
    .map((dateKey) => {
      const { isToday, isWeekend, holidayName, weekday, day } = formatDateLabel(dateKey);
      const isActive = dateKey === state.selectedDate;
      const label = isToday ? "Today" : `${weekday} ${day}`;
      const ariaLabel = holidayName ? `${label}, ${holidayName}` : label;
      const dateClass = [
        "date-chip",
        isActive ? "is-active" : "",
        isToday ? "is-today" : "",
        isWeekend ? "is-weekend" : "",
        holidayName ? "is-holiday" : ""
      ]
        .filter(Boolean)
        .join(" ");
      const title = holidayName ? ` title="${escapeHtml(holidayName)}"` : "";
      return `
        <button class="${dateClass}" type="button" data-date="${dateKey}" aria-pressed="${isActive}" aria-label="${escapeHtml(ariaLabel)}"${title}>
          ${isToday ? "" : `<span>${weekday}</span>`}
          <strong>${day}</strong>
        </button>
      `;
    })
    .join("");

  elements.dateStrip.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      state.selectedEventId = "";
      state.mapFocus = "events";
      render();
    });
  });
  if (!state.dateStripAligned) {
    alignActiveDateToStart();
    state.dateStripAligned = true;
  }
}

function renderMap() {
  const dayEvents = eventsForSelectedDate();
  const activeGroup = selectedGroup();
  if (!initMap()) {
    return;
  }

  syncMarkers(dayEvents, activeGroup);

  if (!dayEvents.length) {
    setMapMessage("No events this day", "Try another date.");
    return;
  }
  if (!groupsWithCoordinates(locationGroupsForEvents(dayEvents)).length) {
    setMapMessage("No mapped locations", "This date has events without coordinates.");
    return;
  }
  if (MAPTILER_KEY || !USE_OSM_FALLBACK) {
    setMapMessage("");
  }
}

function directionsUrl(group) {
  if (group?.hasUncertainAddress) {
    return "#";
  }
  const address = String(group?.address || "").trim();
  const place = String(group?.place || "").trim();
  const hasExactStreetAddress = /\d/.test(address) && !/\b(?:from|behind|between|near)\b|&/i.test(address);
  const destination =
    hasExactStreetAddress && place
      ? `${place}, ${address}`
      : hasCoordinates(group)
        ? `${group.lat},${group.lng}`
        : address || place;
  if (!destination) {
    return "#";
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function directionsControlHtml(group) {
  if (group?.hasUncertainAddress) {
    return `<span class="directions-link is-disabled" aria-disabled="true" title="Directions are unavailable because this address is approximate">Directions</span>`;
  }
  return `<a class="directions-link" href="${escapeHtml(directionsUrl(group))}" target="_blank" rel="noreferrer">Directions</a>`;
}

function renderDetail() {
  const groups = orderedGroupsForDetail();
  if (!groups.length) {
    elements.eventDetail.innerHTML = `
      <div class="empty-detail">
        <strong>Choose a date</strong>
        <span>Event details will appear here.</span>
      </div>
    `;
    return;
  }

  elements.eventDetail.innerHTML = groups
    .map((group) => {
      const pinNumber = groupPinNumber(group);
      const isActive = group.events.some((event) => event.id === state.selectedEventId);
      const isExpired = isGroupExpired(group);
      const displayPlace = compactPlaceName(group.place);
      const pinBadgeHtml = pinNumber
        ? `<span class="pin-badge ${isExpired ? "is-expired" : ""}" aria-label="Pin ${escapeHtml(pinNumber)}">${escapeHtml(pinNumber)}</span>`
        : "";
      const eventsHtml = group.events
        .map(
          (event) => {
            const summary = summaryText(event);
            return `
              <article class="detail-event">
                <h2>${escapeHtml(displayTitle(event))}</h2>
                <p class="event-time">${formatTimeRange(event)}</p>
                ${summary ? `<p class="event-summary">${escapeHtml(summary)}</p>` : ""}
                <a class="source-link" href="${escapeHtml(sourceUrl(event))}" target="_blank" rel="noreferrer">Open source page</a>
              </article>
            `;
          }
        )
        .join("");

      return `
        <section class="detail-group ${isActive ? "is-active" : ""}" aria-label="${escapeHtml(group.place)}">
          <div class="place-line ${pinNumber ? "" : "has-no-pin"}">
            ${pinBadgeHtml}
            <strong class="place-name">${escapeHtml(displayPlace || group.place)}</strong>
            ${directionsControlHtml(group)}
          </div>
          <div class="detail-events">${eventsHtml}</div>
        </section>
      `;
    })
    .join("");
}

function render() {
  syncDatesForActiveFilter();
  renderEventFilter();
  renderDates();
  renderMap();
  renderDetail();
}

async function init() {
  const [events, sourceRegistry] = await Promise.all([loadEventsData(), loadSourceRegistryData()]);
  state.sourceRegistry = sourceRegistry;
  state.events = normalizeEvents(events);
  syncDatesForActiveFilter();
  state.selectedDate = defaultSelectedDate(state.dates);
  state.selectedEventId = "";
  updateUpdatedLabel(events);
  renderCoveredTowns(sourceRegistry);
  renderAboutPanel();
  renderCoveredTownsPanel();
  hydrateTermsContent();
  renderTermsPanel();
  renderTermsModal();
  render();
  requestInitialLocation();
}

function requestInitialLocation() {
  if (state.initialLocationRequested) {
    return;
  }
  state.initialLocationRequested = true;
  window.requestAnimationFrame(() => {
    locateUser();
  });
}

function setupInstallPrompt() {
  if (!elements.installPrompt || appRunsStandalone()) {
    return;
  }
  elements.installPromptAction?.addEventListener("click", handleInstallPromptAction);
  elements.installPromptDismiss?.addEventListener("click", dismissInstallPrompt);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    scheduleInstallPrompt("native");
  });
  window.addEventListener("appinstalled", () => {
    rememberInstallPromptDismissed();
    state.installPromptEvent = null;
    hideInstallPrompt();
  });
  scheduleInstallPrompt();
}

initAnalytics();
setupInstallPrompt();
bindMoreMenu();
bindEventFilter();

init().catch((error) => {
  if (elements.updatedLabel) {
    elements.updatedLabel.textContent = "Load failed";
  }
  if (elements.aboutUpdatedLabel) {
    elements.aboutUpdatedLabel.textContent = "Load failed";
  }
  elements.mapSurface.innerHTML = `<div class="map-empty"><strong>${escapeHtml(error.message)}</strong></div>`;
  elements.eventDetail.innerHTML = "";
});

if ("serviceWorker" in navigator) {
  let serviceWorkerReloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (serviceWorkerReloading) {
      return;
    }
    serviceWorkerReloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`sw.js?v=${APP_VERSION}`)
      .then((registration) => {
        registration.update().catch(() => {});
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) {
            return;
          }
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});
  });
}
