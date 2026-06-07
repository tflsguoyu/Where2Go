#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const SOURCES_FILE = "data/event-sources.json";
const EVENTS_FILE = "data/events.json";
const TIMEZONE = "America/New_York";

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function dateKeyInNewYork(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function eventDateKey(event) {
  return String(event.startsAt || "").slice(0, 10);
}

function hasCoordinates(event) {
  const lat = Number(event.lat);
  const lng = Number(event.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function duplicateValues(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => `${value} (${count})`);
}

function sourceEntries(sources) {
  const entries = [];
  Object.entries(sources.sharedSources || {}).forEach(([id, source]) => {
    entries.push({ id, label: source.label || id, status: source.status, kind: "shared" });
  });
  (sources.regionalSources || []).forEach((source) => {
    entries.push({ id: source.id, label: source.label || source.id, status: source.status, kind: "regional" });
  });
  (sources.towns || []).forEach((town) => {
    if (town.municipal) {
      entries.push({
        id: `${town.id}:municipal`,
        label: `${town.name} municipal`,
        status: town.municipal.status,
        kind: "municipal"
      });
    }
    (town.libraries || []).forEach((library) => {
      entries.push({
        id: `${town.id}:library:${library.name}`,
        label: library.name,
        status: library.status,
        kind: "library",
        sourceRef: library.sourceRef
      });
    });
  });
  return entries;
}

function visibleImportableEvents(events, todayKey) {
  return events.filter((event) => {
    const dateKey = eventDateKey(event);
    return event.status !== "review" && event.withinCoverage !== false && dateKey && dateKey >= todayKey;
  });
}

function pushListIssues(target, label, values) {
  if (values.length) {
    target.push(`${label}: ${values.join(", ")}`);
  }
}

async function main() {
  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  const events = JSON.parse(await readFile(EVENTS_FILE, "utf8"));
  const errors = [];
  const warnings = [];
  const todayKey = dateKeyInNewYork();

  if (sources.coverage?.townCount !== sources.towns?.length) {
    errors.push(`coverage.townCount is ${sources.coverage?.townCount}, but towns[] has ${sources.towns?.length}`);
  }

  pushListIssues(errors, "duplicate town ids", duplicateValues((sources.towns || []).map((town) => town.id)));
  pushListIssues(
    errors,
    "duplicate regional source ids",
    duplicateValues((sources.regionalSources || []).map((source) => source.id))
  );
  pushListIssues(errors, "duplicate event ids", duplicateValues(events.map((event) => event.id)));

  const allowedStatuses = new Set(Object.keys(sources.sourceStatusVocabulary || {}));
  const badStatuses = sourceEntries(sources)
    .filter((entry) => entry.status && !allowedStatuses.has(entry.status))
    .map((entry) => `${entry.id} uses ${entry.status}`);
  pushListIssues(errors, "unknown source statuses", badStatuses);

  const missingSourceRefs = sourceEntries(sources)
    .filter((entry) => entry.sourceRef && !sources.sharedSources?.[entry.sourceRef])
    .map((entry) => `${entry.id} -> ${entry.sourceRef}`);
  pushListIssues(errors, "missing shared source refs", missingSourceRefs);

  Object.entries(sources.sharedSources || {}).forEach(([sourceId, source]) => {
    if (!Array.isArray(source.branchIds) || !source.branchIds.length) {
      return;
    }
    const locationIds = new Set((source.locations || []).map((location) => String(location.id)));
    const missingLocations = source.branchIds.filter((branchId) => !locationIds.has(String(branchId)));
    pushListIssues(errors, `${sourceId} branchIds missing registry locations`, missingLocations);
    const incompleteLocations = (source.locations || [])
      .filter((location) => source.branchIds.map(String).includes(String(location.id)))
      .filter((location) => {
        const hasAddress = isText(location.line1) && isText(location.locality) && isText(location.ziporpostcode);
        return !isText(location.name) || !hasAddress || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lon));
      })
      .map((location) => String(location.id));
    pushListIssues(errors, `${sourceId} registry locations missing name/address/coordinates`, incompleteLocations);
  });

  const townsMissingZip = (sources.towns || [])
    .filter((town) => !Array.isArray(town.zipCodes) || !town.zipCodes.length)
    .map((town) => town.id);
  pushListIssues(errors, "towns missing zipCodes", townsMissingZip);

  const multiZipWithoutCommunities = (sources.towns || [])
    .filter((town) => (town.zipCodes || []).length > 1 && !(town.zipCommunities || []).length)
    .map((town) => town.id);
  pushListIssues(errors, "multi-ZIP towns missing zipCommunities", multiZipWithoutCommunities);

  const mismatchedZipCommunities = (sources.towns || [])
    .filter((town) => {
      if (!(town.zipCommunities || []).length) {
        return false;
      }
      const zipCodes = [...(town.zipCodes || [])].map(String).sort().join(",");
      const communityZips = [...new Set((town.zipCommunities || []).map((community) => String(community.zip)))].sort().join(",");
      return zipCodes !== communityZips;
    })
    .map((town) => town.id);
  pushListIssues(errors, "zipCommunities do not match zipCodes", mismatchedZipCommunities);

  const visibleEvents = visibleImportableEvents(events, todayKey);
  const visibleWithoutCoordinates = visibleEvents
    .filter((event) => !hasCoordinates(event))
    .map((event) => `${event.id} (${eventDateKey(event)})`);
  pushListIssues(errors, "visible events missing coordinates", visibleWithoutCoordinates.slice(0, 12));

  const visibleWithoutSummary = visibleEvents
    .filter((event) => !isText(event.summary))
    .map((event) => `${event.id} (${eventDateKey(event)})`);
  pushListIssues(warnings, "visible events missing summary", visibleWithoutSummary.slice(0, 12));

  const visibleGenericSummaries = visibleEvents
    .filter((event) => /open the source page|for updates|current availability/i.test(event.summary || ""))
    .map((event) => `${event.id} (${eventDateKey(event)})`);
  pushListIssues(warnings, "visible events with generic source-page summary", visibleGenericSummaries.slice(0, 12));

  const visibleWithoutAddress = visibleEvents.filter((event) => !isText(event.address)).length;
  if (visibleWithoutAddress) {
    warnings.push(`visible events without address but with coordinate directions: ${visibleWithoutAddress}`);
  }

  console.log(`Source towns: ${sources.towns?.length || 0}`);
  console.log(`Event records: ${events.length}`);
  console.log(`Visible future/current events checked: ${visibleEvents.length}`);

  warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  if (errors.length) {
    errors.forEach((error) => console.error(`error: ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Project audit passed with ${warnings.length} warning(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
