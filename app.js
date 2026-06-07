const TIMEZONE = "America/New_York";
const HOME = { lat: 40.619261, lng: -74.490372 };
const MAPTILER_KEY = String(window.Where2GoConfig?.mapTilerKey || "").trim();
const MAPTILER_STYLE = String(window.Where2GoConfig?.mapTilerStyle || "streets-v4").trim();
const USE_OSM_FALLBACK = window.Where2GoConfig?.useTemporaryOpenStreetMapFallback === true;
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
  driveTimeRequestId: 0
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
  initialLocationRequested: false
};

const elements = {
  dateStrip: document.querySelector("#dateStrip"),
  mapSurface: document.querySelector("#mapSurface"),
  eventDetail: document.querySelector("#eventDetail"),
  updatedLabel: document.querySelector("#updatedLabel")
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

function locationKey(event) {
  if (hasCoordinates(event)) {
    return `${event.lat.toFixed(5)},${event.lng.toFixed(5)}`;
  }
  return String(event.venueName || event.venue || event.address || event.id).trim().toLowerCase();
}

function placeLabel(event) {
  return event.venueName || event.venue || event.address || "Event location";
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
  return [...groups.values()];
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

function formatUpdatedLabel() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `Updated ${formatter.format(new Date())}`;
}

function summaryText(event) {
  const text = event.summary || "Open the source page for details.";
  if (text.length <= 130) {
    return text;
  }
  return `${text.slice(0, 130).trim()}...`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function moveMapToPoint({ lat, lng, zoom = 12, marker = "search" }) {
  if (!mapState.map || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  const markerOptions =
    marker === "user"
      ? { radius: 8, color: "#ffffff", weight: 3, fillColor: "#2f7de1", fillOpacity: 1 }
      : { radius: 7, color: "#ffffff", weight: 3, fillColor: "#c58338", fillOpacity: 1 };
  addOrMoveCircleMarker(marker === "user" ? "userMarker" : "searchMarker", lat, lng, markerOptions);
  mapState.map.setView([lat, lng], zoom, { animate: true });
  state.mapFocus = marker === "user" ? "user" : "search";
  setDriveTimeOrigin({ lat, lng, source: marker });
  if (!state.driveTimeLoading) {
    setMapMessage("");
  }
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
        zoom: 12,
        marker: "user"
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
      mapState.map.fitBounds(
        [
          [south, west],
          [north, east]
        ],
        { padding: [54, 54], maxZoom: 12, animate: true }
      );
    } else {
      mapState.map.setView([result.lat, result.lng], 11, { animate: true });
    }
  } else {
    mapState.map.setView([result.lat, result.lng], 11, { animate: true });
  }
  if (!state.driveTimeLoading) {
    setMapMessage("");
  }
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
    scrollWheelZoom: false,
    tap: true
  }).setView([HOME.lat, HOME.lng], 11);

  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  addBaseLayer(map);
  map.attributionControl.addAttribution(DRIVE_TIME_ATTRIBUTION);
  mapState.driveTimeLayer = L.layerGroup().addTo(map);
  mapState.markerLayer = L.layerGroup().addTo(map);
  mapState.map = map;
  setTimeout(() => map.invalidateSize(), 0);
  return true;
}

function fitMapToGroups(groups) {
  const points = groupsWithCoordinates(groups);
  if (!mapState.map || !points.length) {
    return;
  }
  if (points.length === 1) {
    mapState.map.setView([points[0].lat, points[0].lng], 12, { animate: true });
    return;
  }
  const bounds = L.latLngBounds(points.map((group) => [group.lat, group.lng]));
  mapState.map.fitBounds(bounds, { padding: [52, 52], maxZoom: 12, animate: true });
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
    fitMapToGroups(groups);
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
              <h2>${escapeHtml(event.title)}</h2>
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
  elements.updatedLabel.textContent = formatUpdatedLabel();
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
