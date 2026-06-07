const TIMEZONE = "America/New_York";
const HOME = { lat: 40.619261, lng: -74.490372 };
const MAPTILER_KEY = String(window.Where2GoConfig?.mapTilerKey || "").trim();
const MAPTILER_STYLE = String(window.Where2GoConfig?.mapTilerStyle || "streets-v4").trim();
const USE_OSM_FALLBACK = window.Where2GoConfig?.useTemporaryOpenStreetMapFallback === true;

const mapState = {
  map: null,
  markerLayer: null,
  message: null
};

const state = {
  events: [],
  dates: [],
  selectedDate: "",
  selectedEventId: ""
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
    <div class="map-message" id="mapMessage" hidden></div>
  `;
  mapState.message = elements.mapSurface.querySelector("#mapMessage");
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
    zoomControl: true,
    scrollWheelZoom: false,
    tap: true
  }).setView([HOME.lat, HOME.lng], 12);

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
        render();
      });
  });

  if (state.selectedEventId && active && hasCoordinates(active)) {
    mapState.map.panTo([active.lat, active.lng], { animate: true });
  } else {
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
