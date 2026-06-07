#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const DEFAULT_FILES = [
  "data/imported/sclsnj-events.json",
  "data/sample-events.json"
];

const REQUIRED_TEXT_FIELDS = ["id", "title", "source"];
const ALLOWED_STATUSES = new Set(["published", "review"]);

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  return isText(value) && !Number.isNaN(new Date(value).valueOf());
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidUrl(value) {
  if (!isText(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function pushIssue(collection, file, index, id, message) {
  collection.push(`${file} [${index}] ${id || "(missing id)"}: ${message}`);
}

function validateEvent(event, context) {
  const { file, index, ids, errors, warnings } = context;
  const id = isText(event.id) ? event.id.trim() : "";

  REQUIRED_TEXT_FIELDS.forEach((field) => {
    if (!isText(event[field])) {
      pushIssue(errors, file, index, id, `missing ${field}`);
    }
  });

  if (id) {
    if (ids.has(id)) {
      pushIssue(errors, file, index, id, "duplicate id");
    }
    ids.add(id);
  }

  if (!isText(event.venue) && !isText(event.venueName)) {
    pushIssue(errors, file, index, id, "missing venue or venueName");
  }

  const sourceUrl = event.sourceUrl || event.url;
  if (!isValidUrl(sourceUrl)) {
    pushIssue(errors, file, index, id, "missing valid url or sourceUrl");
  }

  if (!isText(event.summary)) {
    pushIssue(warnings, file, index, id, "missing summary");
  }

  if (event.startsAt) {
    if (!isValidDate(event.startsAt)) {
      pushIssue(errors, file, index, id, "startsAt is not a valid date");
    }
    if (event.endsAt && !isValidDate(event.endsAt)) {
      pushIssue(errors, file, index, id, "endsAt is not a valid date");
    }
    if (isValidDate(event.startsAt) && isValidDate(event.endsAt)) {
      const startsAt = new Date(event.startsAt);
      const endsAt = new Date(event.endsAt);
      if (endsAt < startsAt) {
        pushIssue(errors, file, index, id, "endsAt is before startsAt");
      }
    }
  } else {
    if (!Number.isFinite(Number(event.dayOffset))) {
      pushIssue(errors, file, index, id, "missing startsAt or dayOffset");
    }
    if (!isValidTime(event.time)) {
      pushIssue(errors, file, index, id, "missing valid time");
    }
  }

  const hasLat = event.lat !== undefined;
  const hasLng = event.lng !== undefined;
  if (hasLat || hasLng) {
    const lat = Number(event.lat);
    const lng = Number(event.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      pushIssue(errors, file, index, id, "lat/lng must both be finite numbers");
    }
    if ((lat === 0 || lng === 0) && file.includes("/imported/")) {
      pushIssue(warnings, file, index, id, "imported event has zero coordinates");
    }
  }

  if (event.ages !== undefined && !Array.isArray(event.ages)) {
    pushIssue(warnings, file, index, id, "ages should be an array");
  }

  if (event.status !== undefined && !ALLOWED_STATUSES.has(String(event.status))) {
    pushIssue(warnings, file, index, id, `unexpected status "${event.status}"`);
  }
}

async function validateFile(file) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  let events;

  try {
    events = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    return {
      file,
      count: 0,
      errors: [`${file}: could not parse JSON (${error.message})`],
      warnings
    };
  }

  if (!Array.isArray(events)) {
    return {
      file,
      count: 0,
      errors: [`${file}: root value must be an array`],
      warnings
    };
  }

  events.forEach((event, index) => {
    validateEvent(event, { file, index, ids, errors, warnings });
  });

  return { file, count: events.length, errors, warnings };
}

async function main() {
  const files = process.argv.slice(2);
  const targets = files.length ? files : DEFAULT_FILES;
  const results = await Promise.all(targets.map(validateFile));
  const errors = results.flatMap((result) => result.errors);
  const warnings = results.flatMap((result) => result.warnings);

  results.forEach((result) => {
    console.log(`${result.file}: ${result.count} events`);
  });

  warnings.forEach((warning) => {
    console.warn(`warning: ${warning}`);
  });

  if (errors.length) {
    errors.forEach((error) => {
      console.error(`error: ${error}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log(`Data validation passed with ${warnings.length} warning(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
