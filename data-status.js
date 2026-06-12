const TIMEZONE = "America/New_York";

const ZIP_CENTERS = {
  "07016": [40.656, -74.303],
  "07023": [40.6417, -74.3857],
  "07027": [40.6518, -74.3229],
  "07033": [40.6765, -74.2896],
  "07039": [40.7863, -74.3291],
  "07040": [40.7312, -74.2735],
  "07041": [40.724, -74.3046],
  "07059": [40.634, -74.5005],
  "07060": [40.615, -74.417],
  "07062": [40.6305, -74.405],
  "07063": [40.6015, -74.449],
  "07066": [40.6201, -74.3135],
  "07069": [40.6379, -74.4502],
  "07076": [40.642, -74.373],
  "07078": [40.741, -74.326],
  "07079": [40.7489, -74.2613],
  "07080": [40.574, -74.414],
  "07081": [40.701, -74.322],
  "07083": [40.695, -74.269],
  "07088": [40.719, -74.285],
  "07090": [40.651, -74.344],
  "07092": [40.681, -74.357],
  "07102": [40.7357, -74.1724],
  "07103": [40.738, -74.194],
  "07104": [40.767, -74.169],
  "07105": [40.727, -74.152],
  "07106": [40.744, -74.233],
  "07107": [40.762, -74.189],
  "07108": [40.723, -74.2],
  "07111": [40.7245, -74.2326],
  "07112": [40.711, -74.213],
  "07114": [40.696, -74.176],
  "07205": [40.7012, -74.2287],
  "07901": [40.7156, -74.3647],
  "07920": [40.706, -74.549],
  "07922": [40.677, -74.431],
  "07928": [40.7407, -74.3845],
  "07931": [40.684, -74.635],
  "07933": [40.678, -74.469],
  "07935": [40.742, -74.45],
  "07938": [40.665, -74.575],
  "07939": [40.684, -74.553],
  "07940": [40.7598, -74.4171],
  "07946": [40.672, -74.517],
  "07960": [40.797, -74.481],
  "07974": [40.6997, -74.4015],
  "07976": [40.742, -74.497],
  "07980": [40.672, -74.493],
  "08528": [40.375, -74.614],
  "08540": [40.3573, -74.6672],
  "08805": [40.568, -74.539],
  "08807": [40.592, -74.604],
  "08812": [40.589, -74.466],
  "08823": [40.438, -74.546],
  "08835": [40.5409, -74.5877],
  "08840": [40.5424, -74.3628],
  "08844": [40.4999, -74.5955],
  "08846": [40.5746, -74.4983],
  "08853": [40.515, -74.733],
  "08854": [40.5549, -74.463],
  "08869": [40.5695, -74.6329],
  "08873": [40.500, -74.488],
  "08876": [40.565, -74.616],
  "08880": [40.553, -74.531],
  "08890": [40.485, -74.576],
  "08901": [40.4862, -74.4518],
  "08904": [40.5008, -74.4274]
};

const state = {
  sources: null,
  events: [],
  towns: [],
  sourcesFlat: [],
  eventRows: [],
  townGeoJson: null,
  townBoundaryIds: new Set(),
  summaryText: "",
  map: null,
  markerLayer: null,
  townBoundaryLayer: null
};

const els = {
  subtitle: document.querySelector("#subtitle"),
  error: document.querySelector("#error"),
  metrics: document.querySelector("#metrics"),
  reloadButton: document.querySelector("#reloadButton"),
  copySummaryButton: document.querySelector("#copySummaryButton"),
  townMap: document.querySelector("#townMap"),
  townList: document.querySelector("#townList"),
  townStatusFilter: document.querySelector("#townStatusFilter"),
  townCountyFilter: document.querySelector("#townCountyFilter"),
  sourceSearchInput: document.querySelector("#sourceSearchInput"),
  sourceTownFilter: document.querySelector("#sourceTownFilter"),
  sourceStatusFilter: document.querySelector("#sourceStatusFilter"),
  sourceKindFilter: document.querySelector("#sourceKindFilter"),
  sourceTable: document.querySelector("#sourceTable"),
  eventSearchInput: document.querySelector("#eventSearchInput"),
  eventDateFilter: document.querySelector("#eventDateFilter"),
  eventTownFilter: document.querySelector("#eventTownFilter"),
  eventIssueFilter: document.querySelector("#eventIssueFilter"),
  eventAppVisibilityFilter: document.querySelector("#eventAppVisibilityFilter"),
  eventSortSelect: document.querySelector("#eventSortSelect"),
  eventTable: document.querySelector("#eventTable")
};

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function eventDate(event) {
  return String(event.startsAt || event.date || "").slice(0, 10);
}

function eventTime(event) {
  const value = String(event.startsAt || "");
  return value.includes("T") ? value.slice(11, 16) : "";
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasReviewStatus(value) {
  return /\b(?:approx(?:imate)?|fallback|image|implied|inferred|manual|missing|needs?_?review|ocr|uncertain|unconfirmed|unknown)\b/i.test(
    String(value || "")
  );
}

function hasCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function statusClass(value) {
  return String(value || "neutral").toLowerCase().replace(/_/g, "-");
}

function labelStatus(value) {
  const labels = {
    good: "Good",
    needs_events: "Needs events",
    source_gap: "Source gap",
    importable: "Importable",
    manual_review: "Manual",
    service_area: "Service area",
    reference_only: "Reference",
    blocked_by_bot_protection: "Blocked",
    not_found: "Not found",
    broken: "Broken",
    ok: "OK",
    approximate: "Approximate"
  };
  return labels[value] || value || "Unknown";
}

function townSourceStats(town) {
  const records = [];
  if (town.municipal) records.push(town.municipal);
  records.push(...(town.libraries || []), ...(town.venues || []), ...(town.regionalSources || []));

  const importable = records.filter((source) => source.status === "importable").length;
  const manual = records.filter((source) => source.status === "manual_review").length;
  const serviceArea = records.filter((source) => source.status === "service_area").length;
  const broken = records.filter((source) => source.status === "broken").length;
  const parsers = [...new Set(records.map((source) => source.parser).filter(Boolean))];
  const statuses = [...new Set(records.map((source) => source.status).filter(Boolean))];
  return { records, importable, manual, serviceArea, broken, parsers, statuses };
}

function computeTownRows(sources, events, today) {
  return (sources.towns || []).map((town) => {
    const sourceStats = townSourceStats(town);
    const townEvents = events.filter((event) => event.townId === town.id);
    const futureEvents = townEvents.filter((event) => {
      const date = eventDate(event);
      return event.status !== "cancelled" && date && date >= today;
    });
    const visibleFutureEvents = futureEvents.filter((event) => event.status !== "review" && event.withinCoverage !== false);
    const status = visibleFutureEvents.length > 0 ? "good" : sourceStats.importable > 0 ? "needs_events" : "source_gap";
    const missingSummary = visibleFutureEvents.filter((event) => !hasText(event.summary)).length;
    const missingCoordinates = visibleFutureEvents.filter((event) => !hasCoordinates(event)).length;
    const missingAddress = visibleFutureEvents.filter((event) => hasCoordinates(event) && !hasText(event.address)).length;
    const approximateAddress = visibleFutureEvents.filter((event) => event.addressStatus === "approximate" || event.directionsDisabled).length;
    const missingSourceUrl = visibleFutureEvents.filter((event) => !hasText(event.sourceUrl || event.url)).length;

    return {
      id: town.id,
      name: town.name,
      county: town.county || "",
      zipCodes: town.zipCodes || [],
      center: town.center || null,
      status,
      totalEvents: townEvents.length,
      futureEvents: visibleFutureEvents.length,
      importableSources: sourceStats.importable,
      manualSources: sourceStats.manual,
      serviceAreaSources: sourceStats.serviceArea,
      brokenSources: sourceStats.broken,
      parsers: sourceStats.parsers,
      sourceStatuses: sourceStats.statuses,
      missingSummary,
      missingCoordinates,
      missingAddress,
      approximateAddress,
      missingSourceUrl
    };
  });
}

function townNameById(id) {
  return state.towns.find((town) => town.id === id)?.name || id || "";
}

function sourceUrl(source) {
  return source.eventsUrl || source.website || source.storeUrl || source.url || "";
}

function sourceKindLabel(kind) {
  return {
    shared: "Shared",
    regional: "Regional",
    municipal: "Municipal",
    library: "Library",
    venue: "Venue",
    townRegional: "Town regional"
  }[kind] || kind;
}

function pushSource(entries, source, context) {
  if (!source) return;
  const id = source.id || source.name || source.label || context.id;
  entries.push({
    id: `${context.kind}:${context.townId || "shared"}:${id}`,
    label: source.label || source.name || context.label || id,
    kind: context.kind,
    status: source.status || "unknown",
    parser: source.parser || "",
    townId: source.townId || context.townId || "",
    townName: context.townName || townNameById(source.townId || context.townId),
    servesTownIds: source.servesTownIds || [],
    url: sourceUrl(source),
    notes: source.notes || "",
    sourceTypes: source.sourceTypes || (source.type ? [source.type] : [])
  });
}

function pushCoveredSource(entries, source, context) {
  const coveredTownIds = source?.servesTownIds?.length ? source.servesTownIds : [];
  if (!coveredTownIds.length) {
    pushSource(entries, source, context);
    return;
  }
  coveredTownIds.forEach((townId) => {
    pushSource(entries, source, { ...context, townId, townName: townNameById(townId) });
  });
}

function sourceEntries(sources) {
  const entries = [];

  Object.entries(sources.sharedSources || {}).forEach(([id, source]) => {
    pushCoveredSource(entries, { ...source, id }, { kind: "shared", id, label: source.label || id });
  });

  (sources.regionalSources || []).forEach((source) => {
    pushCoveredSource(entries, source, { kind: "regional", id: source.id, townId: source.townId });
  });

  (sources.towns || []).forEach((town) => {
    pushSource(entries, town.municipal, {
      kind: "municipal",
      id: "municipal",
      label: `${town.name} municipal`,
      townId: town.id,
      townName: town.name
    });
    (town.libraries || []).forEach((library) =>
      pushSource(entries, library, { kind: "library", townId: town.id, townName: town.name })
    );
    (town.venues || []).forEach((venue) =>
      pushSource(entries, venue, { kind: "venue", townId: town.id, townName: town.name })
    );
    (town.regionalSources || []).forEach((source) =>
      pushSource(entries, source, { kind: "townRegional", townId: town.id, townName: town.name })
    );
  });

  return entries;
}

function eventIssues(event) {
  const issues = [];
  if (!hasText(event.summary)) issues.push("summary");
  if (!hasText(event.summary) && hasText(event.summaryStatus)) issues.push("summaryStatus");
  if (!hasText(event.townId)) issues.push("town");
  if (!hasCoordinates(event)) issues.push("coordinates");
  if (hasCoordinates(event) && !hasText(event.address)) issues.push("address");
  if (!hasText(event.sourceUrl || event.url)) issues.push("sourceUrl");
  if (!hasText(event.venue || event.venueName)) issues.push("venue");
  if (!hasText(event.startsAt || event.date)) issues.push("date");
  if (hasReviewStatus(event.dateStatus || event.dateExpansionStatus)) issues.push("dateReview");
  if (hasReviewStatus(event.timeStatus)) issues.push("timeReview");
  if (hasReviewStatus(event.addressStatus) || event.directionsDisabled) issues.push("addressReview");
  if (hasReviewStatus(event.townAssignmentStatus)) issues.push("townReview");
  return issues;
}

function issueLabel(issue) {
  return {
    summary: "Missing summary",
    summaryStatus: "Needs source summary",
    town: "Missing town",
    coordinates: "Missing coordinates",
    address: "Missing address",
    sourceUrl: "Missing source URL",
    venue: "Missing venue",
    date: "Missing date",
    dateReview: "Date review",
    timeReview: "Time review",
    addressReview: "Address review",
    townReview: "Town review"
  }[issue] || issue;
}

function eventAccuracy(event) {
  let score = 100;
  if (!hasText(event.summary)) score -= 15;
  if (!hasText(event.townId)) score -= 30;
  if (!hasCoordinates(event)) score -= 25;
  if (hasCoordinates(event) && !hasText(event.address)) score -= 10;
  if (!hasText(event.sourceUrl || event.url)) score -= 20;
  if (!hasText(event.venue || event.venueName)) score -= 10;
  if (hasReviewStatus(event.dateStatus || event.dateExpansionStatus)) score -= 10;
  if (hasReviewStatus(event.timeStatus)) score -= 8;
  if (hasReviewStatus(event.addressStatus) || event.directionsDisabled) score -= 12;
  if (hasReviewStatus(event.townAssignmentStatus)) score -= 10;
  if (event.status === "review") score -= 15;
  return Math.max(0, score);
}

function computeEventRows(events, today) {
  return events.map((event) => {
    const issues = eventIssues(event);
    return {
      ...event,
      dateKey: eventDate(event),
      timeKey: eventTime(event),
      townName: townNameById(event.townId),
      accuracy: eventAccuracy(event),
      issues,
      isFuture: eventDate(event) >= today
    };
  });
}

function isVisibleInApp(event) {
  return event.status !== "review" && event.status !== "hidden" && event.withinCoverage !== false;
}

function countBy(rows, getKey) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = getKey(row) || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function renderMetrics(rows, events, sources, eventRows, today) {
  const visibleFutureEvents = eventRows.filter(
    (event) => event.status !== "review" && event.withinCoverage !== false && event.dateKey && event.dateKey >= today
  );
  const good = rows.filter((row) => row.status === "good").length;
  const needsEvents = rows.filter((row) => row.status === "needs_events").length;
  const sourceGap = rows.filter((row) => row.status === "source_gap").length;
  const sourceCount = sourceEntries(sources).length;
  const qualityGaps = visibleFutureEvents.filter((event) => event.issues.length > 0).length;
  const latestSeen = events
    .map((event) => event.lastSeenAt || event.firstSeenAt || "")
    .filter(Boolean)
    .sort()
    .at(-1);

  const metrics = [
    ["Towns", rows.length, `${good} good, ${needsEvents} waiting, ${sourceGap} gaps`],
    ["Future events", visibleFutureEvents.length, `Starting ${today}`],
    ["Quality gaps", qualityGaps, "Future/current visible events"],
    ["Sources", sourceCount, "Shared, regional, municipal, library, venue"],
    ["Last import", latestSeen ? latestSeen.slice(0, 10) : "Unknown", latestSeen ? latestSeen.slice(11, 19) : ""]
  ];

  els.metrics.innerHTML = metrics
    .map(
      ([label, value, note]) => `
        <div class="metric">
          <div class="metric-label">${escapeHtml(label)}</div>
          <div class="metric-value">${escapeHtml(value)}</div>
          <div class="metric-note">${escapeHtml(note)}</div>
        </div>
      `
    )
    .join("");
}

function fillSelect(select, values, labelFor, allLabel) {
  const current = select.value;
  select.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labelFor?.(value) || value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function fillFilters() {
  fillSelect(els.townStatusFilter, [...new Set(state.towns.map((town) => town.status))].sort(), labelStatus, "All town statuses");
  fillSelect(els.townCountyFilter, [...new Set(state.towns.map((town) => town.county).filter(Boolean))].sort(), null, "All counties");
  fillSelect(
    els.sourceTownFilter,
    [...new Set(state.sourcesFlat.map((source) => source.townId).filter(Boolean))].sort((a, b) =>
      townNameById(a).localeCompare(townNameById(b))
    ),
    townNameById,
    "All towns"
  );
  fillSelect(
    els.sourceStatusFilter,
    [...new Set(state.sourcesFlat.map((source) => source.status).filter(Boolean))].sort(),
    labelStatus,
    "All source statuses"
  );
  fillSelect(
    els.sourceKindFilter,
    [...new Set(state.sourcesFlat.map((source) => source.kind).filter(Boolean))].sort(),
    sourceKindLabel,
    "All source kinds"
  );
  fillSelect(
    els.eventTownFilter,
    [...new Set(state.eventRows.map((event) => event.townId).filter(Boolean))].sort((a, b) =>
      townNameById(a).localeCompare(townNameById(b))
    ),
    townNameById,
    "All towns"
  );
}

function filteredTownRows() {
  return state.towns.filter(
    (town) =>
      (!els.townStatusFilter.value || town.status === els.townStatusFilter.value) &&
      (!els.townCountyFilter.value || town.county === els.townCountyFilter.value)
  );
}

function markerColor(status) {
  return {
    good: "#15803d",
    needs_events: "#b45309",
    source_gap: "#b42318"
  }[status] || "#2563eb";
}

function zipCoverageForTown(town) {
  const communities = town.zipCommunities || [];
  const rows = communities.length
    ? communities.map((community) => ({
        zip: String(community.zip || ""),
        name: community.name || "",
        type: /mailing/i.test(community.name || "") ? "mailing" : "zip"
      }))
    : (town.zipCodes || []).map((zip) => ({ zip: String(zip), name: town.name, type: "zip" }));

  return rows
    .filter((row) => row.zip)
    .map((row) => {
      const center = ZIP_CENTERS[row.zip];
      return {
        ...row,
        lat: center?.[0],
        lng: center?.[1],
        hasCentroid: Boolean(center),
        hasBoundary: state.townBoundaryIds.has(town.id)
      };
    });
}

function zipColor(zip) {
  if (!zip.hasBoundary) return "#8a8580";
  if (zip.type === "mailing") return "#b45309";
  return "#2563eb";
}

function zipLabel(zip) {
  return zip.name ? `${zip.zip} ${zip.name}` : zip.zip;
}

function initMap() {
  if (state.map || !window.L) return;
  state.map = L.map(els.townMap, { scrollWheelZoom: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.townBoundaryLayer = L.featureGroup().addTo(state.map);
}

function renderTownCoverage() {
  const rows = filteredTownRows();
  const townLookup = new Map(rows.map((town) => [town.id, town]));

  els.townList.innerHTML = rows
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (town) => `
        <div class="town-row">
          <div>
            <strong>${escapeHtml(town.name)}</strong>
            <div class="muted small">${escapeHtml(town.county)} County · ${escapeHtml(town.zipCodes.join(", ") || "ZIP TBD")}</div>
            <div class="small">${town.futureEvents} future · ${town.importableSources} importable · ${town.manualSources} manual</div>
            <div class="zip-list">
              ${zipCoverageForTown(town)
                .map(
                  (zip) =>
                    `<span class="zip-chip ${zip.hasBoundary ? zip.type : "missing"}" title="${escapeHtml(
                      zip.hasBoundary ? "Town boundary shown on map" : "No town boundary found"
                    )}">${escapeHtml(zipLabel(zip))}</span>`
                )
                .join("")}
            </div>
          </div>
          <span class="pill ${statusClass(town.status)}">${escapeHtml(labelStatus(town.status))}</span>
        </div>
      `
    )
    .join("");

  initMap();
  if (!state.map || !state.markerLayer || !state.townBoundaryLayer) return;
  state.markerLayer.clearLayers();
  state.townBoundaryLayer.clearLayers();
  const bounds = [];

  if (state.townGeoJson) {
    L.geoJSON(state.townGeoJson, {
      filter: (feature) => townLookup.has(String(feature.properties?.townId || "")),
      style: (feature) => {
        const town = townLookup.get(String(feature.properties?.townId || ""));
        const color = markerColor(town?.status);
        return {
          color,
          weight: 2,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.11
        };
      },
      onEachFeature: (feature, layer) => {
        const town = townLookup.get(String(feature.properties?.townId || ""));
        layer.bindPopup(
          `<strong>${escapeHtml(town?.name || feature.properties?.name || "Town boundary")}</strong><br>${escapeHtml(
            town?.county || feature.properties?.county || ""
          )} County<br>${escapeHtml(labelStatus(town?.status))}`
        );
      }
    }).addTo(state.townBoundaryLayer);
    const layerBounds = state.townBoundaryLayer.getBounds();
    if (layerBounds.isValid()) {
      bounds.push(layerBounds.getSouthWest(), layerBounds.getNorthEast());
    }
  }

  rows.forEach((town) => {
    if (!hasCoordinates(town.center)) return;
    const lat = Number(town.center.lat);
    const lng = Number(town.center.lng);
    bounds.push([lat, lng]);
    L.circleMarker([lat, lng], {
      radius: 5,
      color: markerColor(town.status),
      weight: 1.5,
      fillColor: markerColor(town.status),
      fillOpacity: 0.82
    })
      .bindPopup(
        `<strong>${escapeHtml(town.name)}</strong><br>${escapeHtml(labelStatus(town.status))}<br>${town.futureEvents} future events`
      )
      .addTo(state.markerLayer);
  });
  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
  }
  setTimeout(() => state.map.invalidateSize(), 0);
}

function filteredSourceRows() {
  const query = els.sourceSearchInput.value.trim().toLowerCase();
  return state.sourcesFlat.filter((source) => {
    const haystack = [
      source.townName,
      source.label,
      source.kind,
      source.status,
      source.parser,
      source.url,
      source.notes,
      source.sourceTypes.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (!els.sourceTownFilter.value || source.townId === els.sourceTownFilter.value) &&
      (!els.sourceStatusFilter.value || source.status === els.sourceStatusFilter.value) &&
      (!els.sourceKindFilter.value || source.kind === els.sourceKindFilter.value)
    );
  });
}

function renderSourceTable() {
  const rows = filteredSourceRows().sort(
    (a, b) =>
      String(a.townName || "zzz").localeCompare(String(b.townName || "zzz")) ||
      sourceKindLabel(a.kind).localeCompare(sourceKindLabel(b.kind)) ||
      a.label.localeCompare(b.label)
  );
  els.sourceTable.innerHTML = rows
    .map(
      (source) => `
        <tr>
          <td>${escapeHtml(source.townName || (source.servesTownIds.length ? "Shared" : ""))}</td>
          <td>
            <strong>${escapeHtml(source.label)}</strong>
            <div class="muted small">${escapeHtml(source.sourceTypes.join(", "))}</div>
          </td>
          <td>${escapeHtml(sourceKindLabel(source.kind))}</td>
          <td><span class="pill ${statusClass(source.status)}">${escapeHtml(labelStatus(source.status))}</span></td>
          <td>${source.parser ? `<span class="pill neutral">${escapeHtml(source.parser)}</span>` : '<span class="muted">None</span>'}</td>
          <td>${
            source.url
              ? `<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open</a>`
              : '<span class="muted">No link</span>'
          }</td>
          <td class="small">${escapeHtml(source.notes).slice(0, 360)}</td>
        </tr>
      `
    )
    .join("");
}

function filteredEventRows() {
  const query = els.eventSearchInput.value.trim().toLowerCase();
  const date = els.eventDateFilter.value;
  const town = els.eventTownFilter.value;
  const issue = els.eventIssueFilter.value;
  const appVisibility = els.eventAppVisibilityFilter.value;
  const rows = state.eventRows.filter((event) => {
    const haystack = [
      event.title,
      event.townName,
      event.venueName,
      event.venue,
      event.address,
      event.townNameRaw,
      event.townAssignmentStatus,
      event.source,
      event.summary,
      event.summaryStatus,
      event.issues.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    const hasMissing = event.issues.length > 0;
    const issueMatch =
      !issue ||
      (issue === "missing" && hasMissing) ||
      (issue === "ok" && event.issues.length === 0) ||
      event.issues.includes(issue);
    const appVisible = isVisibleInApp(event);
    const appVisibilityMatch =
      !appVisibility || (appVisibility === "visible" && appVisible) || (appVisibility === "hidden" && !appVisible);
    return (
      (!query || haystack.includes(query)) &&
      (!date || event.dateKey === date) &&
      (!town || event.townId === town) &&
      issueMatch &&
      appVisibilityMatch
    );
  });

  rows.sort((a, b) => {
    const sort = els.eventSortSelect.value;
    if (sort === "accuracyDesc") return b.accuracy - a.accuracy || a.dateKey.localeCompare(b.dateKey);
    if (sort === "dateAsc") return a.dateKey.localeCompare(b.dateKey) || a.timeKey.localeCompare(b.timeKey);
    if (sort === "dateDesc") return b.dateKey.localeCompare(a.dateKey) || b.timeKey.localeCompare(a.timeKey);
    if (sort === "town") return a.townName.localeCompare(b.townName) || a.dateKey.localeCompare(b.dateKey);
    return a.accuracy - b.accuracy || a.dateKey.localeCompare(b.dateKey);
  });

  return rows;
}

function scoreClass(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "mid";
  return "low";
}

function renderEventTable() {
  const rows = filteredEventRows();
  els.eventTable.innerHTML = rows
    .slice(0, 1000)
    .map((event) => {
      const source = event.sourceUrl || event.url || "";
      const issuesHtml = event.issues.length
        ? event.issues
            .map((issue) => `<span class="pill ${issue === "approximate" ? "approximate" : "missing"}">${escapeHtml(issueLabel(issue))}</span>`)
            .join("")
        : '<span class="pill ok">OK</span>';
      return `
        <tr>
          <td>
            <strong>${escapeHtml(event.dateKey || "No date")}</strong>
            <div class="muted small">${escapeHtml(event.timeKey)}</div>
          </td>
	          <td>
	            <strong>${escapeHtml(event.title || "Untitled")}</strong>
	            <div class="muted small">${escapeHtml(event.summary || event.summaryStatus || "").slice(0, 180)}</div>
	          </td>
          <td>
            ${escapeHtml(event.townName || event.townId || event.townNameRaw || "")}
            ${
              event.townAssignmentStatus
                ? `<div class="muted small">${escapeHtml(event.townAssignmentStatus)}</div>`
                : ""
            }
          </td>
          <td>
            ${escapeHtml(event.venueName || event.venue || "")}
            <div class="muted small">${escapeHtml(event.address || "No address")}</div>
          </td>
          <td><span class="score ${scoreClass(event.accuracy)}">${event.accuracy}</span></td>
          <td>${issuesHtml}</td>
          <td>
            ${escapeHtml(event.source || "")}
            <div class="small">${
              source ? `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noreferrer">Open</a>` : '<span class="muted">No link</span>'
            }</div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildSummary(rows, events, today) {
  const counts = Object.fromEntries(countBy(rows, (row) => row.status));
  const futureEvents = events.filter((event) => {
    const date = eventDate(event);
    return event.status !== "review" && event.withinCoverage !== false && date && date >= today;
  }).length;
  const remaining = rows.filter((row) => row.status !== "good").map((row) => `${row.name} (${labelStatus(row.status)})`);
  return [
    `Where2Go data status (${today})`,
    `Towns: ${rows.length}; good: ${counts.good || 0}; needs events: ${counts.needs_events || 0}; source gaps: ${
      counts.source_gap || 0
    }.`,
    `Events: ${events.length} total; ${futureEvents} future/current visible.`,
    `Needs attention: ${remaining.length ? remaining.join(", ") : "none"}.`
  ].join("\n");
}

async function loadJson(path) {
  const url = `${path}?t=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadData() {
  els.error.hidden = true;
  els.subtitle.textContent = "Loading local JSON...";

  const [sources, events, townGeoJson] = await Promise.all([
    loadJson("data/event-sources.json"),
    loadJson("data/events.json"),
    loadJson("data/geo/town-boundaries.geojson")
  ]);
  const today = todayInNewYork();
  const townRows = computeTownRows(sources, events, today);
  const flatSources = sourceEntries(sources);
  const eventRows = computeEventRows(events, today);

  state.sources = sources;
  state.events = events;
  state.townGeoJson = townGeoJson;
  state.townBoundaryIds = new Set((townGeoJson.features || []).map((feature) => String(feature.properties?.townId || "")));
  state.towns = townRows;
  state.sourcesFlat = flatSources;
  state.eventRows = eventRows;
  state.summaryText = buildSummary(townRows, events, today);

  els.subtitle.textContent = `Read ${sources.towns?.length || 0} towns, ${flatSources.length} sources, and ${events.length} events. Today: ${today}.`;
  if (!els.eventDateFilter.value) {
    els.eventDateFilter.value = today;
  }

  fillFilters();
  renderMetrics(townRows, events, sources, eventRows, today);
  renderTownCoverage();
  renderSourceTable();
  renderEventTable();
}

async function copySummary() {
  await navigator.clipboard.writeText(state.summaryText);
  els.copySummaryButton.textContent = "Copied";
  setTimeout(() => {
    els.copySummaryButton.textContent = "Copy Summary";
  }, 1200);
}

function showError(error) {
  els.error.hidden = false;
  els.error.textContent = `${error.message}. Start a local server from the project root, then open /data-status.html.`;
}

els.reloadButton.addEventListener("click", () => loadData().catch(showError));
els.copySummaryButton.addEventListener("click", () => copySummary().catch(showError));
els.townStatusFilter.addEventListener("change", renderTownCoverage);
els.townCountyFilter.addEventListener("change", renderTownCoverage);
els.sourceSearchInput.addEventListener("input", renderSourceTable);
els.sourceTownFilter.addEventListener("change", renderSourceTable);
els.sourceStatusFilter.addEventListener("change", renderSourceTable);
els.sourceKindFilter.addEventListener("change", renderSourceTable);
els.eventSearchInput.addEventListener("input", renderEventTable);
els.eventDateFilter.addEventListener("change", renderEventTable);
els.eventTownFilter.addEventListener("change", renderEventTable);
els.eventIssueFilter.addEventListener("change", renderEventTable);
els.eventAppVisibilityFilter.addEventListener("change", renderEventTable);
els.eventSortSelect.addEventListener("change", renderEventTable);

loadData().catch(showError);
