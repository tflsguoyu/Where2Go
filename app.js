const TIMEZONE = "America/New_York";

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

function mapBounds(events) {
  const points = events.filter((event) => event.lat && event.lng);
  if (!points.length) {
    return null;
  }
  return points.reduce(
    (bounds, event) => ({
      minLat: Math.min(bounds.minLat, event.lat),
      maxLat: Math.max(bounds.maxLat, event.lat),
      minLng: Math.min(bounds.minLng, event.lng),
      maxLng: Math.max(bounds.maxLng, event.lng)
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng
    }
  );
}

function eventPosition(event, index, bounds) {
  if (!event.lat || !event.lng || !bounds) {
    const [x = 50, y = 50] = event.map || [];
    return { x, y };
  }

  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.01);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.01);
  const baseX = 14 + ((event.lng - bounds.minLng) / lngRange) * 72;
  const baseY = 86 - ((event.lat - bounds.minLat) / latRange) * 72;
  const offset = (index % 5) - 2;
  return {
    x: Math.max(8, Math.min(92, baseX + offset * 2.2)),
    y: Math.max(12, Math.min(88, baseY + offset * 1.7))
  };
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
  const bounds = mapBounds(state.events);

  if (!dayEvents.length) {
    elements.mapSurface.innerHTML = `
      <div class="map-empty">
        <strong>No events this day</strong>
        <span>Try another date</span>
      </div>
    `;
    return;
  }

  const pins = dayEvents
    .map((event, index) => {
      const position = eventPosition(event, index, bounds);
      const isActive = event.id === active?.id;
      return `
        <button
          class="event-pin ${isActive ? "is-active" : ""}"
          type="button"
          style="left:${position.x}%; top:${position.y}%"
          data-event-id="${event.id}"
          aria-label="${escapeHtml(event.title)}"
          aria-pressed="${isActive}"
        >
          <span>${index + 1}</span>
        </button>
      `;
    })
    .join("");

  elements.mapSurface.innerHTML = `
    <div class="map-place place-home">07059</div>
    <div class="map-place place-north">North Plainfield</div>
    <div class="map-place place-east">Watchung</div>
    <div class="map-place place-west">Bridgewater</div>
    <div class="route route-a"></div>
    <div class="route route-b"></div>
    <div class="route route-c"></div>
    ${pins}
  `;

  elements.mapSurface.querySelectorAll("[data-event-id]").forEach((pin) => {
    pin.addEventListener("click", () => {
      state.selectedEventId = pin.dataset.eventId;
      render();
    });
  });
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
  state.selectedEventId = eventsForSelectedDate()[0]?.id || "";
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
