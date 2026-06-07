const TIMEZONE = "America/New_York";
const HOME = { lat: 40.619261, lng: -74.490372 };
const MAPTILER_KEY = String(window.Where2GoConfig?.mapTilerKey || "").trim();
const MAPTILER_STYLE = String(window.Where2GoConfig?.mapTilerStyle || "streets-v4").trim();
const USE_OSM_FALLBACK = window.Where2GoConfig?.useTemporaryOpenStreetMapFallback === true;
const GITHUB_REPO = String(window.Where2GoConfig?.githubRepo || "").trim();
const GITHUB_BRANCH = String(window.Where2GoConfig?.githubBranch || "main").trim();
const UPDATED_LABEL_CACHE_MS = 60 * 1000;
const DEFAULT_MAP_RADIUS_MILES = 7.5;
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
  : [10, 20];
const DRIVE_TIME_CONTOURS = DRIVE_TIME_RANGES_MINUTES.length ? DRIVE_TIME_RANGES_MINUTES : [10, 20];
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
  installPromptEvent: null,
  installPromptMode: "",
  initialLocationRequested: false
};

const elements = {
  dateStrip: document.querySelector("#dateStrip"),
  mapSurface: document.querySelector("#mapSurface"),
  eventDetail: document.querySelector("#eventDetail"),
  updatedLabel: document.querySelector("#updatedLabel"),
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
  return state.events.filter((event) => event.dateKey === state.selectedDate);
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
        events: []
      });
    }
    const group = groups.get(key);
    group.events.push(event);
    if (!group.address && event.address) {
      group.address = event.address;
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

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
    day: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
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

function formatUpdatedLabel(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `Updated ${formatter.format(date)}`;
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
  elements.updatedLabel.textContent = formatUpdatedLabel(fallbackDate);
  try {
    const pushDate = await latestGitHubPushDate();
    if (pushDate) {
      elements.updatedLabel.textContent = formatUpdatedLabel(pushDate);
    }
  } catch {
    elements.updatedLabel.textContent = formatUpdatedLabel(fallbackDate);
  }
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
  return stripLeadingDateTime(text);
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

function cleanedSummaryText(event) {
  let text = summaryWithoutRepeatedMetadata(event);
  if (!text) {
    return "";
  }
  text = stripLeadingDateTime(text);
  [summaryTitleSegment(event), displayTitle(event), event.title, event.venueName, event.venue, event.address, event.source].forEach(
    (value) => {
      text = stripLeadingKnownValue(text, value);
    }
  );
  return stripLeadingDateTime(collapseWhitespace(text));
}

function summaryText(event) {
  const text = cleanedSummaryText(event) || "Open the source page for details.";
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

function markerIcon(index, isActive) {
  return L.divIcon({
    className: `event-map-marker ${isActive ? "is-active" : ""}`,
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

function driveTimeFeatureStyle(feature) {
  const minutes = driveTimeFeatureMinutes(feature);
  const isInner = minutes <= DRIVE_TIME_CONTOURS[0];
  return {
    color: isInner ? "#2f7de1" : "#b46d24",
    weight: 2,
    opacity: 0.78,
    fillColor: isInner ? "#4e9ee8" : "#f0b35a",
    fillOpacity: isInner ? 0.34 : 0.24
  };
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
  setMapMessage("Loading drive time", "10 and 20 minute areas.");
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
      ? { radius: 8, color: "#ffffff", weight: 3, fillColor: "#2f7de1", fillOpacity: 1 }
      : { radius: 7, color: "#ffffff", weight: 3, fillColor: "#c58338", fillOpacity: 1 };
  addOrMoveCircleMarker(marker === "user" ? "userMarker" : "searchMarker", lat, lng, markerOptions);
  fitMapAroundPoint({ lat, lng });
  state.mapFocus = marker === "user" ? "user" : "search";
  const wasDriveTimeEnabled = state.driveTimeEnabled;
  setDriveTimeOrigin({ lat, lng, source: marker });
  if (autoEnableDriveTime && !wasDriveTimeEnabled) {
    state.driveTimeEnabled = true;
    updateDriveTimeControl();
    refreshDriveTimeLayer().catch((error) => {
      clearDriveTimeLayer();
      setMapMessage(error.message || "Drive time failed", driveTimeErrorBody(error));
    });
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
      moveMapToPoint({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        marker: "user",
        autoEnableDriveTime: true
      });
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
  return {
    lat: Number(center[1]),
    lng: Number(center[0]),
    bbox: feature.bbox
  };
}

function fitSearchResult(result) {
  if (!mapState.map || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
    setMapMessage("Place not found", "Try a ZIP code or township name.");
    return;
  }
  state.mapFocus = "search";
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
      <span aria-hidden="true">⌖</span>
    </button>
    <form class="search-form" id="searchForm" autocomplete="on">
      <label class="sr-only" for="searchInput">Search place or ZIP</label>
      <input id="searchInput" name="search" autocomplete="off" maxlength="40" placeholder="ZIP or town" aria-label="Search ZIP or township" />
      <button id="searchButton" type="submit">Go</button>
    </form>
    <button class="drive-time-button" id="driveTimeButton" type="button" aria-pressed="false" aria-label="Toggle drive-time areas" title="Toggle drive-time areas">Drive</button>
    <div class="drive-time-legend" id="driveTimeLegend" hidden>
      <span><i class="drive-time-swatch is-inner"></i>0-10 min</span>
      <span><i class="drive-time-swatch is-outer"></i>10-20 min</span>
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
  points.forEach((group, index) => {
    const isActive = group.key === activeGroup?.key;
    L.marker([group.lat, group.lng], { icon: markerIcon(index, isActive), keyboard: true })
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
      const { weekday, day } = formatDateLabel(dateKey);
      const count = state.events.filter((event) => event.dateKey === dateKey).length;
      const isActive = dateKey === state.selectedDate;
      return `
        <button class="date-chip ${isActive ? "is-active" : ""}" type="button" data-date="${dateKey}" aria-pressed="${isActive}">
          <span>${weekday}</span>
          <strong>${day}</strong>
          <small>${count}</small>
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
  const destination = hasCoordinates(group) ? `${group.lat},${group.lng}` : group?.address || group?.place || "";
  if (!destination) {
    return "#";
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
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
      const pinBadgeHtml = pinNumber
        ? `<span class="pin-badge" aria-label="Pin ${escapeHtml(pinNumber)}">${escapeHtml(pinNumber)}</span>`
        : "";
      const eventsHtml = group.events
        .map(
          (event) => `
            <article class="detail-event">
              <h2>${escapeHtml(displayTitle(event))}</h2>
              <p class="event-time">${formatTimeRange(event)}</p>
              <p class="event-summary">${escapeHtml(summaryText(event))}</p>
              <a class="source-link" href="${escapeHtml(sourceUrl(event))}" target="_blank" rel="noreferrer">Open source page</a>
            </article>
          `
        )
        .join("");

      return `
        <section class="detail-group ${isActive ? "is-active" : ""}" aria-label="${escapeHtml(group.place)}">
          <div class="place-line ${pinNumber ? "" : "has-no-pin"}">
            ${pinBadgeHtml}
            <strong class="place-name">${escapeHtml(group.place)}</strong>
            <a class="directions-link" href="${escapeHtml(directionsUrl(group))}" target="_blank" rel="noreferrer">Directions</a>
          </div>
          <div class="detail-events">${eventsHtml}</div>
        </section>
      `;
    })
    .join("");
}

function render() {
  renderDates();
  renderMap();
  renderDetail();
}

async function init() {
  const events = await loadEventsData();
  state.events = normalizeEvents(events);
  state.dates = visibleDates(state.events);
  state.selectedDate = defaultSelectedDate(state.dates);
  state.selectedEventId = "";
  updateUpdatedLabel(events);
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

setupInstallPrompt();

init().catch((error) => {
  elements.updatedLabel.textContent = "Load failed";
  elements.mapSurface.innerHTML = `<div class="map-empty"><strong>${escapeHtml(error.message)}</strong></div>`;
  elements.eventDetail.innerHTML = "";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
