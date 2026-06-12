#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const SOURCES_FILE = "data/event-sources.json";
const OUTPUT_FILE = "data/source-refresh-runbook.md";

const GENERIC_KEYS = new Set([
  "id",
  "label",
  "name",
  "website",
  "eventsUrl",
  "url",
  "status",
  "parser",
  "parserVersion",
  "tier",
  "sourceTypes",
  "townId",
  "servesTownIds",
  "address",
  "lat",
  "lng",
  "notes",
  "lastCheckedAt",
  "lastSuccessfulImportAt",
  "lastFailedImportAt",
  "lastFailureReason"
]);

const IMPORTANT_KEYS = [
  "branchIds",
  "branchId",
  "client",
  "siteId",
  "calendarIds",
  "audienceIds",
  "categoryIds",
  "categorySlugs",
  "eventUrls",
  "calendarUrl",
  "rawEventsUrl",
  "itemId",
  "sectionId",
  "type",
  "ajaxUrl",
  "feedUrl",
  "rssUrl",
  "apiUrl",
  "embedUrl",
  "events",
  "workshops",
  "locations",
  "storeId",
  "storeNum",
  "topicCollId",
  "calendarId",
  "locationOverrides",
  "defaultVenueName",
  "defaultAddress"
];

function md(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    if (value.length > 6 && value.every((item) => typeof item !== "object" || item === null)) {
      return `${value.slice(0, 6).join(", ")} ... (${value.length} total)`;
    }
    if (value.length > 3 && value.some((item) => typeof item === "object" && item !== null)) {
      return `${value.length} configured rows`;
    }
    return value.map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : String(item))).join("; ");
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 6) {
      return `${keys.length} configured entries`;
    }
    return JSON.stringify(value);
  }
  return String(value ?? "");
}

function configDetails(source) {
  const details = [];
  for (const key of IMPORTANT_KEYS) {
    if (source[key] !== undefined) {
      details.push(`${key}: ${compact(source[key])}`);
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (!GENERIC_KEYS.has(key) && !IMPORTANT_KEYS.includes(key) && value !== undefined) {
      details.push(`${key}: ${compact(value)}`);
    }
  }
  return details.length ? details.join("; ") : "See source record notes.";
}

function shortNotes(notes) {
  if (!notes) {
    return "";
  }
  const text = md(notes);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function sourceEntries(sources) {
  const entries = [];

  for (const [id, source] of Object.entries(sources.sharedSources || {})) {
    if (source.status === "importable") {
      entries.push({ kind: "shared", town: "", name: source.label || source.name || id, path: `sharedSources.${id}`, source });
    }
  }

  (sources.regionalSources || []).forEach((source, index) => {
    if (source.status === "importable") {
      entries.push({
        kind: "regional",
        town: "",
        name: source.name || source.label || source.id || `regional ${index}`,
        path: `regionalSources[${index}]`,
        source
      });
    }
  });

  (sources.towns || []).forEach((town, townIndex) => {
    if (town.municipal?.status === "importable") {
      entries.push({
        kind: "municipal",
        town: town.name,
        name: `${town.name} municipal`,
        path: `towns[${townIndex}].municipal (${town.id})`,
        source: town.municipal
      });
    }
    (town.libraries || []).forEach((library, libraryIndex) => {
      if (library.status === "importable") {
        entries.push({
          kind: "library",
          town: town.name,
          name: library.name,
          path: `towns[${townIndex}].libraries[${libraryIndex}] (${town.id})`,
          source: library
        });
      }
    });
  });

  return entries.sort((a, b) =>
    `${a.kind}|${a.town}|${a.name}`.localeCompare(`${b.kind}|${b.town}|${b.name}`)
  );
}

function parserSummary(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const parser = entry.source.parser || "(configured/no parser field)";
    counts.set(parser, (counts.get(parser) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderSection(title, entries) {
  const lines = [`## ${title}`, "", "| Name | Town | Parser | URL | Key refresh details | Config path | Notes |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (const entry of entries) {
    const source = entry.source;
    const url = source.eventsUrl || source.website || source.url || "";
    lines.push(
      `| ${md(entry.name)} | ${md(entry.town)} | ${md(source.parser || "(configured/no parser field)")} | ${md(url)} | ${md(configDetails(source))} | ${md(entry.path)} | ${shortNotes(source.notes)} |`
    );
  }
  lines.push("");
  return lines;
}

const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
const entries = sourceEntries(sources);
const generatedAt = new Date().toISOString().slice(0, 10);

const lines = [
  "# Source Refresh Runbook",
  "",
  `Generated from \`${SOURCES_FILE}\` on ${generatedAt}. Do not hand-maintain individual rows here; update the source registry and rerun:`,
  "",
  "```bash",
  "node scripts/generate-source-runbook.mjs",
  "node scripts/import-source-events.mjs --days 60",
  "node scripts/validate-events.mjs",
  "node scripts/audit-project.mjs",
  "```",
  "",
  "This runbook exists so every site that has been made importable keeps a repeatable update path: source URL, parser, key parameters, and the exact registry location that owns the configuration.",
  "",
  "## Parser Counts",
  "",
  "| Parser | Importable sources |",
  "| --- | --- |",
  ...parserSummary(entries).map(([parser, count]) => `| ${md(parser)} | ${count} |`),
  "",
  ...renderSection("Libraries", entries.filter((entry) => entry.kind === "library")),
  ...renderSection("Municipal Sources", entries.filter((entry) => entry.kind === "municipal")),
  ...renderSection("Regional Sources", entries.filter((entry) => entry.kind === "regional")),
  ...renderSection("Shared Sources", entries.filter((entry) => entry.kind === "shared"))
];

await writeFile(OUTPUT_FILE, `${lines.join("\n")}\n`);
console.log(`wrote ${OUTPUT_FILE} with ${entries.length} importable sources`);
