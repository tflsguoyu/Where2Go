const TIMEZONE = "America/New_York";
const HOME = { lat: 40.619261, lng: -74.490372 };
const MAPTILER_KEY = String(window.Where2GoConfig?.mapTilerKey || "").trim();
const MAPTILER_STYLE = String(window.Where2GoConfig?.mapTilerStyle || "streets-v4").trim();
const USE_OSM_FALLBACK = window.Where2GoConfig?.useTemporaryOpenStreetMapFallback === true;

const mapState = {
  map: null,
  markerLayer: null,
  message: null,
  locateButton: null,
  zipForm: null,
  zipInput: null,
  zipButton: null,
  userMarker: null,
  searchMarker: null
};

const state = {
  events: [],
  dates: [],
  selectedDate: "",
  selectedEventId: "",
  mapFocus: "events"
};

const elements = {
  dateStrip: document.querySelector("#dateStrip"),
  mapSurface: document.querySelector("#mapSurface"),
  eventDetail: document.querySelector("#eventDetail"),
  updatedLabel: document.querySelector("#updatedLabel"),
  locationLabel: document.querySelector("#locationLabel")
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
    return await loadJson("data/imported/sclsnj-events.json");
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
    .filter((event) => event.startsAt >= startOfToday() && event.status !== "review")
    .sort((a, b) => a.startsAt - b.startsAt);
}

function startOfToday() {
  const todayKey = localDateKey(new Date());
  return new Date(`${todayKey}T00:00:00`);
}

function uniqueDates(events) {
  return [...new Set(events.map((event) => event.dateKey))];
}

function eventsForSelectedDate() {
  return state.events.filter((event) => event.dateKey === state.selectedDate);
}

function selectedEvent() {
  return (
    state.events.find((event) => event.id === state.selectedEventId) ||
    eventsForSelectedDate()[0] ||
    null
  );
}

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
    day: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
  };
}

function formatTimeRange(event) {
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
  if (text.length <= 180) {
    return text;
  }
  return `${text.slice(0, 180).trim()}...`;
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
    iconSize: [38, 48],
    iconAnchor: [19, 44],
    popupAnchor: [0, -42]
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

function setLocationLabel(text) {
  if (elements.locationLabel) {
    elements.locationLabel.textContent = text;
  }
}

function setControlLoading(kind, isLoading) {
  if (kind === "locate" && mapState.locateButton) {
    mapState.locateButton.disabled = isLoading;
    mapState.locateButton.classList.toggle("is-loading", isLoading);
    mapState.locateButton.setAttribute("aria-busy", String(isLoading));
  }
  if (kind === "zip") {
    if (mapState.zipButton) {
      mapState.zipButton.disabled = isLoading;
      mapState.zipButton.textContent = isLoading ? "..." : "Go";
    }
    if (mapState.zipInput) {
      mapState.zipInput.disabled = isLoading;
    }
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

function moveMapToPoint({ lat, lng, zoom = 13, marker = "search", label = "" }) {
  if (!mapState.map || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  const markerOptions =
    marker === "user"
      ? { radius: 8, color: "#ffffff", weight: 3, fillColor: "#2f7de1", fillOpacity: 1 }
      : { radius: 7, color: "#ffffff", weight: 3, fillColor: "#c58338", fillOpacity: 1 };
  addOrMoveCircleMarker(marker === "user" ? "userMarker" : "searchMarker", lat, lng, markerOptions);
  mapState.map.setView([lat, lng], zoom, { animate: true });
  state.mapFocus = marker === "user" ? "user" : "zip";
  if (label) {
    setLocationLabel(label);
  }
  setMapMessage("");
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
        zoom: 13,
        marker: "user",
        label: "Near you"
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

function validZip(value) {
  return /^\d{5}$/.test(value.trim());
}

async function geocodeZip(zip) {
  if (!MAPTILER_KEY) {
    throw new Error("ZIP search needs a MapTiler key.");
  }
  const params = new URLSearchParams({
    key: MAPTILER_KEY,
    country: "us",
    types: "postal_code",
    limit: "1",
    language: "en"
  });
  const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(zip)}.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error("ZIP lookup failed.");
  }
  const data = await response.json();
  const feature = data.features?.[0];
  const center = feature?.center || feature?.geometry?.coordinates;
  if (!Array.isArray(center) || center.length < 2) {
    throw new Error("ZIP code not found.");
  }
  return {
    lat: Number(center[1]),
    lng: Number(center[0]),
    bbox: feature.bbox
  };
}

function fitZipResult(zip, result) {
  if (!mapState.map || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
    setMapMessage("ZIP code not found", "Try another 5-digit ZIP code.");
    return;
  }
  state.mapFocus = "zip";
  addOrMoveCircleMarker("searchMarker", result.lat, result.lng, {
    radius: 7,
    color: "#ffffff",
    weight: 3,
    fillColor: "#c58338",
    fillOpacity: 1
  });

  if (Array.isArray(result.bbox) && result.bbox.length === 4) {
    const [west, south, east, north] = result.bbox.map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      mapState.map.fitBounds(
        [
          [south, west],
          [north, east]
        ],
        { padding: [54, 54], maxZoom: 13, animate: true }
      );
    } else {
      mapState.map.setView([result.lat, result.lng], 12, { animate: true });
    }
  } else {
    mapState.map.setView([result.lat, result.lng], 12, { animate: true });
  }
  setLocationLabel(`Near ${zip}`);
  setMapMessage("");
}

async function handleZipSubmit(event) {
  event.preventDefault();
  const zip = mapState.zipInput?.value.trim() || "";
  if (!validZip(zip)) {
    setMapMessage("Enter a 5-digit ZIP code", "Example: 07059");
    mapState.zipInput?.focus();
    return;
  }

  setControlLoading("zip", true);
  setMapMessage("Finding ZIP code", zip);
  try {
    const result = await geocodeZip(zip);
    fitZipResult(zip, result);
  } catch (error) {
    setMapMessage(error.message || "ZIP lookup failed", "Try another ZIP code.");
  } finally {
    setControlLoading("zip", false);
  }
}

function bindMapControls() {
  mapState.locateButton = elements.mapSurface.querySelector("#locateButton");
  mapState.zipForm = elements.mapSurface.querySelector("#zipForm");
  mapState.zipInput = elements.mapSurface.querySelector("#zipInput");
  mapState.zipButton = elements.mapSurface.querySelector("#zipButton");

  mapState.locateButton?.addEventListener("click", locateUser);
  mapState.zipForm?.addEventListener("submit", handleZipSubmit);
  mapState.zipInput?.addEventListener("input", () => {
    mapState.zipInput.value = mapState.zipInput.value.replace(/\D/g, "").slice(0, 5);
  });
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
          '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
    <div class="map-controls" aria-label="Map location controls">
      <button class="locate-button" id="locateButton" type="button" aria-label="Use my location" title="Use my location">
        <span aria-hidden="true">⌖</span>
      </button>
      <form class="zip-form" id="zipForm" autocomplete="on">
        <label class="sr-only" for="zipInput">ZIP code</label>
        <input id="zipInput" name="postal-code" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]*" placeholder="ZIP" aria-label="ZIP code" />
        <button id="zipButton" type="submit">Go</button>
      </form>
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
  }).setView([HOME.lat, HOME.lng], 12);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  addBaseLayer(map);
  mapState.markerLayer = L.layerGroup().addTo(map);
  mapState.map = map;
  setTimeout(() => map.invalidateSize(), 0);
  return true;
}

function fitMapToEvents(events) {
  const points = eventsWithCoordinates(events);
  if (!mapState.map || !points.length) {
    return;
  }
  if (points.length === 1) {
    mapState.map.setView([points[0].lat, points[0].lng], 13, { animate: true });
    return;
  }
  const bounds = L.latLngBounds(points.map((event) => [event.lat, event.lng]));
  mapState.map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13, animate: true });
}

function syncMarkers(dayEvents, active) {
  if (!mapState.markerLayer || !mapState.map) {
    return;
  }
  mapState.markerLayer.clearLayers();

  const points = eventsWithCoordinates(dayEvents);
  points.forEach((event, index) => {
    const isActive = event.id === active?.id;
    L.marker([event.lat, event.lng], { icon: markerIcon(index, isActive), keyboard: true })
      .addTo(mapState.markerLayer)
      .on("click", () => {
        state.selectedEventId = event.id;
        state.mapFocus = "event";
        render();
      });
  });

  if (state.selectedEventId && active && hasCoordinates(active)) {
    mapState.map.panTo([active.lat, active.lng], { animate: true });
  } else if (state.mapFocus === "events") {
    fitMapToEvents(points);
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
      if (state.mapFocus === "event") {
        state.mapFocus = "events";
      }
      render();
    });
  });
}

function renderMap() {
  const dayEvents = eventsForSelectedDate();
  const active = selectedEvent();
  if (!initMap()) {
    return;
  }

  syncMarkers(dayEvents, active);

  if (!dayEvents.length) {
    setMapMessage("No events this day", "Try another date.");
    return;
  }
  if (!eventsWithCoordinates(dayEvents).length) {
    setMapMessage("No mapped locations", "This date has events without coordinates.");
    return;
  }
  if (MAPTILER_KEY || !USE_OSM_FALLBACK) {
    setMapMessage("");
  }
}

function renderDetail() {
  const event = selectedEvent();
  if (!event) {
    elements.eventDetail.innerHTML = `
      <div class="empty-detail">
        <strong>Choose a date</strong>
        <span>Event details will appear here.</span>
      </div>
    `;
    return;
  }

  const distance = typeof event.distanceMiles === "number" ? `${event.distanceMiles.toFixed(1)} mi` : "";
  elements.eventDetail.innerHTML = `
    <p class="detail-kicker">${formatDateLabel(event.dateKey).weekday} · ${distance}</p>
    <h2>${escapeHtml(event.title)}</h2>
    <dl class="detail-facts">
      <div>
        <dt>Time</dt>
        <dd>${formatTimeRange(event)}</dd>
      </div>
      <div>
        <dt>Place</dt>
        <dd>${escapeHtml(event.venue || event.venueName || "")}</dd>
      </div>
      <div>
        <dt>What it is</dt>
        <dd>${escapeHtml(summaryText(event))}</dd>
      </div>
    </dl>
    <a class="source-link" href="${escapeHtml(sourceUrl(event))}" target="_blank" rel="noreferrer">Open source page</a>
  `;
}

function render() {
  renderDates();
  renderMap();
  renderDetail();
}

async function init() {
  const events = await loadEventsData();
  state.events = normalizeEvents(events);
  state.dates = uniqueDates(state.events);
  state.selectedDate = state.dates[0] || "";
  state.selectedEventId = "";
  elements.updatedLabel.textContent = formatUpdatedLabel();
  render();
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
