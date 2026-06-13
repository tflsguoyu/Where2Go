#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";

const TIMEZONE = "America/New_York";
const SOURCES_FILE = new URL("../data/event-sources.json", import.meta.url);
const EVENTS_FILE = new URL("../data/events.json", import.meta.url);
const DAY_MS = 24 * 60 * 60 * 1000;
const GEOCODE_DELAY_MS = 1100;
const LOCALHOP_API_URL = "https://api.getlocalhop.com/1";
const LOCALHOP_PARSE_APP_ID = "zesqKJEzK7ncFXe57x4uWc4Moow3I2wGCq7zFcqI";
const LOCALHOP_PAGE_LIMIT = 500;
const IMPORT_CUTOFF_START_DATE = "2026-05-31";
const KID_SAFE_LATEST_START_HOUR = 22;
const KID_SAFE_EARLIEST_START_HOUR = 5;
const KID_SAFE_LATE_REVIEW_START_HOUR = 21;

const AGE_ORDER = ["baby", "toddler", "preschool", "early-elementary", "tween", "teen"];
const IMPORT_QUESTION_LIKE_TITLE_PATTERN = /^(?:how|what|why|when|where|who)\b/i;
const IMPORT_SUMMARY_TITLE_STOP_PATTERN =
  /\s+(?:Join|Learn|Enjoy|Come|Meet|Discover|Explore|Register|Presented|Presenter|Hosted|For|This|In this|During|Participants|All ages)\b/i;
const SOURCE_LOGISTICS_CLAUSE_PATTERN =
  /\s+[-–—]\s*(?:see|check|visit|open|follow|be sure to follow)\b[^.!?]{0,180}\b(?:updates?|details?|current availability|confirm|registration|capacity)\b[^.!?]*(?:[.!?]|$)/gi;
const SOURCE_LOGISTICS_SENTENCE_PATTERN =
  /\b(?:open|see|visit|check|follow|be sure to follow|please register|register)\b[^.!?]{0,180}\b(?:updates?|details?|current availability|confirm|registration|capacity)\b[^.!?]*(?:[.!?]|$)/gi;
const SOURCE_PAGE_SENTENCE_PATTERN = /\b(?:open|see|visit|check)\s+(?:the\s+)?source page\b[^.!?]*(?:[.!?]|$)/gi;
const CONTACT_DETAILS_SENTENCE_PATTERN = /\bplease contact\b[^.!?]*\bdetails?\b[^.!?]*(?:[.!?]|$)/gi;
const GENERIC_SUMMARY_PATTERN =
  /\b(?:open|see|visit|check)\s+(?:the\s+)?source page\b|\bfor updates?\b|\bcurrent availability\b/i;
const SUMMARY_WEEKDAY_PATTERN =
  "(?:sun(?:day)?s?|mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?)";
const SUMMARY_MONTH_PATTERN =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const SUMMARY_TIME_PATTERN = "(?:(?:\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)|(?:\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)))";
const SUMMARY_TIME_RANGE_PATTERN = `(?:${SUMMARY_TIME_PATTERN}|\\d{1,2})(?:\\s*(?:-|\\u2013|\\u2014|to|until|through|and)\\s*${SUMMARY_TIME_PATTERN})`;
const SUMMARY_TIME_SEQUENCE_PATTERN = `${SUMMARY_TIME_PATTERN}\\s+${SUMMARY_TIME_PATTERN}`;
const SUMMARY_TIME_BLOCK_PATTERN = `(?:${SUMMARY_TIME_SEQUENCE_PATTERN}|${SUMMARY_TIME_RANGE_PATTERN}|${SUMMARY_TIME_PATTERN})`;
const SUMMARY_DATE_PATTERN = `(?:(?:${SUMMARY_WEEKDAY_PATTERN})[,]?\\s+)?${SUMMARY_MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?`;
const SUMMARY_RECURRING_TIME_PREFIX_PATTERN = new RegExp(
  `^(?:every\\s+)?${SUMMARY_WEEKDAY_PATTERN}[,]?\\s+(?:from\\s+)?${SUMMARY_TIME_BLOCK_PATTERN}\\s*`,
  "i"
);
const SUMMARY_LEADING_TIME_PATTERN = new RegExp(`^${SUMMARY_TIME_BLOCK_PATTERN}\\s*`, "i");
const SUMMARY_LEADING_ADDRESS_PATTERN =
  /^\d{1,6}\s+[A-Za-z0-9 .'-]+(?:road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|highway|hwy|route|rte|commons way)\b(?:[\s,]+[A-Za-z .'-]+)?(?:,\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?\s*/i;
const SUMMARY_SOURCE_WIDGET_TAIL_PATTERN =
  /\b(?:Add To My Calendar|Contact Info|Related Links|Return to Calendar|Event Calendar|Event Sponsorship|Google Calendar|iCalendar|Outlook)\b[\s\S]*$/i;
const SUMMARY_EVENT_TIME_PHRASE_PATTERN = new RegExp(
  `(?:\\b(?:at|from|between)\\s+|@\\s*)${SUMMARY_TIME_BLOCK_PATTERN}(?:\\s*(?:and|to)\\s*${SUMMARY_TIME_PATTERN})?`,
  "gi"
);
const SUMMARY_DATE_TIME_PHRASE_PATTERN = new RegExp(
  `\\bon\\s+${SUMMARY_DATE_PATTERN}(?:\\s+(?:at|from)\\s+${SUMMARY_TIME_BLOCK_PATTERN})?`,
  "gi"
);
const SUMMARY_RECURRING_TIME_PHRASE_PATTERN = new RegExp(
  `\\b(?:every\\s+)?${SUMMARY_WEEKDAY_PATTERN}\\s+(?:morning|afternoon|evening|night|at\\s+${SUMMARY_TIME_BLOCK_PATTERN}|from\\s+${SUMMARY_TIME_BLOCK_PATTERN})\\b`,
  "gi"
);
const SUMMARY_STANDALONE_TIME_RANGE_PATTERN = new RegExp(`\\b${SUMMARY_TIME_BLOCK_PATTERN}\\b`, "gi");
const SUMMARY_DAY_ABBREV_TIME_PATTERN = new RegExp(`\\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\.?,?\\s*,?\\s*${SUMMARY_TIME_BLOCK_PATTERN}\\b`, "gi");
const SUMMARY_TEMP_LOCATION_BLOCK_PATTERN =
  /\bThe\s+[^.!?]{0,100}\bis temporarily located at\b[\s\S]{0,280}?(?=\b(?:Please note|Let us know|As the parent|If there are any issues|I do hereby waive|No registration|Registration|$))/gi;
const SUMMARY_TEMP_LOCATION_INTRO_PATTERN =
  /\bThe\s+[^.]{0,120}\bis temporarily located at\s+\d{1,6}\s+[^.]+(?:Rd|RD|Road|St|Street|Ave|Avenue|Dr|Drive|Ln|Lane)\.?\s*/gi;
const SUMMARY_TEMP_RENOVATION_SENTENCE_PATTERN = /\bin\s+[A-Z][A-Za-z .'-]+\s+while the building is under renovation\.\s*/g;
const SUMMARY_STREET_LOCATION_SENTENCE_PATTERN =
  /\b\d{1,6}\s+[A-Za-z0-9 .'-]+(?:Rd|RD|Road|St|Street|Ave|Avenue|Dr|Drive|Ln|Lane)\.?\s+is located\b[^.]*\.\s*/gi;
const SUMMARY_PARKING_SENTENCE_PATTERN = /\bYou may park\b[^.!?]*(?:[.!?]|$)/gi;
const SUMMARY_PARKING_FRAGMENT_PATTERN = /\bif there is space or at\b[^.]*\buse the sidewalk\b[^.]*\.\s*/gi;
const SUMMARY_WAIVER_TAIL_PATTERN =
  /\b(?:Please note we will be serving|Let us know if there are|As the parent or legal guardian|If there are any issues|I do hereby waive)\b[\s\S]*$/i;
const SUMMARY_PLACE_LOGISTICS_PATTERN =
  /\b(?:located at|temporarily located|held at|events are held at|meet at|meets at|parking|park at|driveway|transfer station|parking lot|children'?s room|kids department|near the playground)\b/i;
const SUMMARY_ACTIVITY_SIGNAL_PATTERN =
  /\b(?:story|craft|club|kids|children|family|families|baby|toddler|preschool|teen|tween|lego|game|games|movie|music|concert|festival|market|rides?|food|workshop|camp|art|paint|build|read|reading|learn|discover|explore|nature|garden|science|theater|performance|play|party|parade|fireworks|foam|jump|slime)\b/i;
const QUALITY_REPORT_SAMPLE_LIMIT = 8;
const MUNICIPAL_COMMUNITY_EVENT_PATTERN =
  /\b(?:america\s*250|battle|camp|celebration|charter day|children|community event|concert|cookies with a cop|fair|famil(?:y|ies)|festival|field of honor|fireworks|flag day|flag raising|free market|fun night|farm(?:ers)? market|garwood rocks|juneteenth|kids|kickoff|love is love|market|movie|musical|national night out|outdoor movie|parade|plays in the park|pool opening|pool party|pool safety|pride|revolution|screen on the green|shrek|street fair|time capsule|tree lighting|unity day|watch part(?:y|ies)|world cup|yard sale|yoga)\b/i;
const MUNICIPAL_SKIP_TITLE_PATTERN =
  /\b(?:adult|adults only|authority meeting|board .*meeting|bulk collection|chair yoga|commission|court|curbside|deadline|garbage|id photos|meeting|membership|municipal court|offices? closed|offices? close|office hours|planning board|recycling|senior|seniors|stormwater|township committee|wine tasting|zoning board)\b/i;
const ADULT_NIGHTLIFE_PATTERN =
  /\b(?:21\+|18\+|adults only|adult only|bar crawl|club night|nightclub|drag party|throwback party|dance tracks?|dj|sounds by|cocktails?|beer|brewery|wine tasting)\b/i;
const MONTHS = new Map([
  ["january", "01"],
  ["february", "02"],
  ["march", "03"],
  ["april", "04"],
  ["may", "05"],
  ["june", "06"],
  ["july", "07"],
  ["august", "08"],
  ["september", "09"],
  ["october", "10"],
  ["november", "11"],
  ["december", "12"]
]);

const MONTH_NAME_MAP = new Map([
  ["jan", "01"],
  ["feb", "02"],
  ["mar", "03"],
  ["apr", "04"],
  ["may", "05"],
  ["jun", "06"],
  ["jul", "07"],
  ["aug", "08"],
  ["sep", "09"],
  ["sept", "09"],
  ["oct", "10"],
  ["nov", "11"],
  ["dec", "12"]
]);

function eventStartsAtOrAfter(dateText, cutoffDate = IMPORT_CUTOFF_START_DATE) {
  const startsAt = String(dateText || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) {
    return true;
  }
  return startsAt >= cutoffDate;
}

function localStartHour(startsAt) {
  const match = String(startsAt || "").match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }
  return Number(match[1]) + Number(match[2]) / 60;
}

function hasExplicitOvernightTime(event) {
  const text = [event.timeLabel, event.rawTime, event.title, event.summary].filter(Boolean).join(" ");
  return /\b(?:midnight|12(?::00)?\s*a\.?m\.?|[1-4](?::\d{2})?\s*a\.?m\.?)\b/i.test(text);
}

function startsTooLateForKids(event) {
  const hour = localStartHour(event.startsAt);
  if (hour === null) {
    return false;
  }
  if (hour >= KID_SAFE_LATEST_START_HOUR) {
    return true;
  }
  return hour < KID_SAFE_EARLIEST_START_HOUR && hasExplicitOvernightTime(event);
}

function eventDurationMinutes(event) {
  if (!isValidDateText(event.startsAt) || !isValidDateText(event.endsAt)) {
    return null;
  }
  return durationMinutes(event.startsAt, event.endsAt);
}

function isAllDayTimeRange(event) {
  const start = String(event.startsAt || "");
  const end = String(event.endsAt || "");
  if (!start.includes("T00:00:00") || !end) {
    return false;
  }
  return /T23:5[89]:/.test(end) || eventDurationMinutes(event) >= 1439;
}

function isMidnightDateOnlyPlaceholder(event) {
  return String(event.startsAt || "").includes("T00:00:00") && !isValidDateText(event.endsAt) && !hasExplicitOvernightTime(event);
}

function isZeroDurationPlaceholder(event) {
  return isValidDateText(event.startsAt) && isValidDateText(event.endsAt) && event.startsAt === event.endsAt;
}

function formatSingleTimeLabel(startsAt) {
  if (!String(startsAt || "").includes("T")) {
    return "All day";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE
  }).format(new Date(startsAt));
}

function eventDateKey(event) {
  const dateKey = String(event.startsAt || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : "";
}

function weekdayIndex(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function timeLabelForRange(startTime, endTime) {
  const [startHour, startMinute = "00"] = startTime.split(":");
  const [endHour, endMinute = "00"] = endTime.split(":");
  const date = "2026-01-01";
  return `${formatSingleTimeLabel(`${date}T${startHour}:${startMinute}:00`)} - ${formatSingleTimeLabel(`${date}T${endHour}:${endMinute}:00`)}`;
}

function hoursForWeekday(weeklyHours, dateKey) {
  const weekday = weekdayIndex(dateKey);
  if (weekday === null) {
    return null;
  }
  return weeklyHours[weekday] || false;
}

function knownVenueOperatingHours(event) {
  const dateKey = eventDateKey(event);
  if (!dateKey) {
    return null;
  }
  const source = normalizePlaceName(event.source);
  const venue = normalizePlaceName(event.venueName || event.venue);

  if (source.includes("morristown and morris township library") || event.sourceId === "mmtlibrary-libcal") {
    const month = dateKey.slice(5, 7);
    const saturday = month === "07" || month === "08" ? ["10:00", "14:00"] : ["09:00", "17:00"];
    return hoursForWeekday(
      [["13:00", "17:00"], ["09:00", "21:00"], ["09:00", "21:00"], ["09:00", "21:00"], ["09:00", "21:00"], ["09:00", "17:00"], saturday],
      dateKey
    );
  }

  if (source.includes("south orange public library") || venue.includes("south orange public library")) {
    return hoursForWeekday(
      [null, ["08:30", "16:30"], ["08:30", "14:00"], ["08:30", "18:00"], ["08:30", "14:00"], ["08:30", "12:00"], null],
      dateKey
    );
  }

  if (source.includes("somerset county library system")) {
    if (venue.includes("north plainfield") || venue.includes("peapack and gladstone")) {
      return hoursForWeekday([null, ["10:00", "20:00"], ["10:00", "20:00"], ["10:00", "20:00"], ["10:00", "20:00"], ["10:00", "18:00"], ["10:00", "18:00"]], dateKey);
    }
    if (venue.includes("somerville")) {
      return hoursForWeekday([null, ["10:00", "20:00"], ["10:00", "20:00"], null, ["10:00", "20:00"], ["10:00", "18:00"], ["10:00", "18:00"]], dateKey);
    }
    if (venue.includes("raritan public library")) {
      return hoursForWeekday([null, ["09:00", "20:00"], ["09:00", "20:00"], ["09:00", "20:00"], ["09:00", "20:00"], ["09:00", "18:00"], ["09:00", "16:00"]], dateKey);
    }
  }

  return null;
}

function applyVenueHoursToAllDayEvent(event) {
  if (!isAllDayTimeRange(event) && event.timeLabel !== "All day") {
    return false;
  }
  const dateKey = eventDateKey(event);
  if (!dateKey) {
    return false;
  }
  const hours = knownVenueOperatingHours(event);
  if (hours === null) {
    return false;
  }
  if (hours === false) {
    event.status = "review";
    event.withinCoverage = false;
    event.timeStatus = "venue_closed_on_event_date";
    event.reviewNotes = [event.reviewNotes, "All-day source row falls on a day the venue is listed as closed; keep out of app until confirmed."]
      .filter(Boolean)
      .join(" ");
    return true;
  }
  const [startTime, endTime] = hours;
  event.startsAt = `${dateKey}T${startTime}:00`;
  event.endsAt = `${dateKey}T${endTime}:00`;
  event.durationMinutes = durationMinutes(event.startsAt, event.endsAt);
  event.timeLabel = timeLabelForRange(startTime, endTime);
  event.timeStatus = "official_venue_hours";
  return true;
}

function isDateOnlyUnknownVenueEvent(event) {
  const venue = normalizePlaceName(event.venueName || event.venue);
  return isAllDayTimeRange(event) && (
    normalizePlaceName(event.source).includes("eventbrite") ||
    venue === "tba" ||
    /\btba\b/.test(normalizePlaceName(event.address || "")) ||
    /eventbrite/.test(String(event.sourceId || ""))
  );
}

function isAdultNightlifeEvent(event) {
  const text = [event.title, event.summary, event.venueName, event.venue, event.tags?.join(" ")].filter(Boolean).join(" ");
  const hour = localStartHour(event.startsAt);
  const overnight = isValidDateText(event.startsAt) && isValidDateText(event.endsAt) && String(event.endsAt).slice(0, 10) > String(event.startsAt).slice(0, 10);
  return ADULT_NIGHTLIFE_PATTERN.test(text) && (overnight || hour >= KID_SAFE_LATE_REVIEW_START_HOUR);
}

function explicitMonthDateYearKeys(value) {
  const text = String(value || "").replace(/[-_]+/g, " ");
  const keys = [];
  const pattern = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,|\s)?\s+(20\d{2})\b/gi;
  let match;
  while ((match = pattern.exec(text))) {
    const month = MONTHS.get(match[1].toLowerCase()) || MONTH_NAME_MAP.get(match[1].toLowerCase().slice(0, 3));
    if (month) {
      keys.push(`${match[3]}-${month}-${String(Number(match[2])).padStart(2, "0")}`);
    }
  }
  return keys;
}

function hasStaleExplicitDate(event) {
  const startDate = String(event.startsAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return false;
  }
  const explicitDates = [
    ...explicitMonthDateYearKeys(event.title),
    ...explicitMonthDateYearKeys(event.sourceUrl || event.url)
  ];
  return explicitDates.some((dateKey) => dateKey.slice(5) === startDate.slice(5) && dateKey.slice(0, 4) < startDate.slice(0, 4));
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function selectedImporters() {
  const value = argValue("--only", "");
  if (!value) {
    return null;
  }
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

async function runSelectedImporters(importers, selected, sources, startDate, days) {
  const runnable = selected ? importers.filter((importer) => selected.has(importer.name)) : importers;
  if (selected) {
    const known = new Set(importers.map((importer) => importer.name));
    const unknown = [...selected].filter((name) => !known.has(name));
    if (unknown.length) {
      throw new Error(`Unknown --only importer(s): ${unknown.join(", ")}`);
    }
  }
  return Promise.all(runnable.map((importer) => importer.run(sources, startDate, days)));
}

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

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&thinsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&hellip;/g, "...")
    .replace(/&eacute;/g, "e")
    .replace(/&Eacute;/g, "E")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSummaryPunctuation(value) {
  return collapseWhitespace(value)
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+-\s*([.!?])/g, "$1")
    .replace(/\b(?:at|from|between|on|in)\s*([,.!?])/gi, "$1")
    .replace(/(?:[,;:]\s*){2,}/g, ", ")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.,;:!?|/\-]+(?:\s+|$)/, "")
    .replace(/\b(?:Join us|Come join us)\s*$/i, "")
    .replace(/\bNo\s*$/i, "")
    .replace(/\b(?:and|or|to|from|on)\s*$/i, "")
    .replace(/\s+in\s+[A-Z][A-Za-z .'-]+,\s*held\.?$/g, "")
    .replace(/,\s*held\.?$/i, ".")
    .replace(/\bPlease\s*$/i, "")
    .trim();
}

function stripLeadingEventTitleFromSummary(value, context = {}) {
  const title = collapseWhitespace(stripHtml(context.title || ""));
  if (title.length < 3) {
    return value;
  }
  const pattern = new RegExp(`^${escapeRegExp(title)}\\s*(?:[,.:;|/\\-\\u2013\\u2014]+\\s*)?`, "i");
  const match = value.match(pattern);
  if (!match || match[0].length >= value.length) {
    return value;
  }
  return value.slice(match[0].length).trim();
}

function summaryLocationCandidates(context = {}) {
  const values = [context.venueName, context.venue, context.address ? cleanAddress(context.address) : ""]
    .map((value) => collapseWhitespace(stripHtml(value || "")))
    .filter((value) => value.length >= 5);
  const address = values.find((value) => /\d/.test(value) && /,/.test(value));
  if (address) {
    values.push(address.split(",")[0].trim());
  }
  return [...new Set(values.filter(Boolean))];
}

function stripLeadingKnownLocationFromSummary(value, context = {}) {
  let text = value;
  for (const location of summaryLocationCandidates(context)) {
    const pattern = new RegExp(`^${escapeRegExp(location)}\\s*(?:[,.:;|/\\-\\u2013\\u2014]+\\s*)?`, "i");
    text = text.replace(pattern, "").trim();
  }
  return text.replace(SUMMARY_LEADING_ADDRESS_PATTERN, "").replace(/^(?:US|USA|United States)\b\s*/i, "").trim();
}

function stripLeadingSummaryLogistics(value, context = {}) {
  let text = collapseWhitespace(value);
  for (let index = 0; index < 8; index += 1) {
    const previous = text;
    text = stripLeadingEventTitleFromSummary(text, context);
    text = stripImportedSummaryDateTimePrefix(text);
    text = text.replace(SUMMARY_RECURRING_TIME_PREFIX_PATTERN, "");
    text = text.replace(SUMMARY_LEADING_TIME_PATTERN, "");
    text = stripLeadingKnownLocationFromSummary(text, context);
    text = normalizeSummaryPunctuation(text);
    if (text === previous) {
      break;
    }
  }
  return text;
}

function stripSummaryDateTimePhrases(value) {
  const bareDatePattern = new RegExp(`\\b${SUMMARY_DATE_PATTERN}\\b`, "gi");
  const numericDatePattern = /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])(?:\/\d{2,4})?\b/g;
  const recurringWeekdayPattern = new RegExp(`\\bevery\\s+${SUMMARY_WEEKDAY_PATTERN}\\b`, "gi");
  const weekdayProgramPattern = new RegExp(`\\b${SUMMARY_WEEKDAY_PATTERN}\\s+(kids storytime|storytime|chess program|program)\\b`, "gi");
  return value
    .replace(SUMMARY_DAY_ABBREV_TIME_PATTERN, "")
    .replace(SUMMARY_DATE_TIME_PHRASE_PATTERN, "")
    .replace(SUMMARY_RECURRING_TIME_PHRASE_PATTERN, "")
    .replace(SUMMARY_EVENT_TIME_PHRASE_PATTERN, "")
    .replace(SUMMARY_STANDALONE_TIME_RANGE_PATTERN, "")
    .replace(/\bNow through\s+[A-Za-z]+\b/gi, "")
    .replace(weekdayProgramPattern, "$1")
    .replace(recurringWeekdayPattern, "")
    .replace(bareDatePattern, "")
    .replace(numericDatePattern, "")
    .replace(/\b(?:a\.?m\.?|p\.?m\.?)\b(?=\s*(?:[,.!?]|$))/gi, "");
}

function removeKnownLocationPhrases(value, context = {}) {
  let text = value;
  for (const location of summaryLocationCandidates(context)) {
    const phrasePattern = new RegExp(`\\b(?:at|in|inside|outside|near|from)\\s+(?:the\\s+)?${escapeRegExp(location)}\\b`, "gi");
    text = text.replace(phrasePattern, "");
  }
  return text
    .replace(/\b(?:in|at)\s+(?:the\s+)?(?:kids department|children'?s room|community room|program room [a-z])\b/gi, "")
    .replace(/\s*,?\s*\b(?:held at|located at)\b[^.!?]*(?=[.!?])/gi, "");
}

function summarySentenceHasKnownLocation(sentence, context = {}) {
  const lower = sentence.toLowerCase();
  if (SUMMARY_LEADING_ADDRESS_PATTERN.test(sentence) || /\b\d{1,6}\s+[A-Za-z0-9 .'-]+(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|way)\b/i.test(sentence)) {
    return true;
  }
  return summaryLocationCandidates(context).some((location) => location.length >= 6 && lower.includes(location.toLowerCase()));
}

function isSummaryLogisticsSentence(sentence, context = {}) {
  const text = collapseWhitespace(sentence);
  if (!text) {
    return true;
  }
  const hasKnownLocation = summarySentenceHasKnownLocation(text, context);
  const hasDateOrTime = new RegExp(`${SUMMARY_DATE_PATTERN}|${SUMMARY_TIME_PATTERN}`, "i").test(text) || /\b\d{1,2}\/\d{1,2}\b/.test(text);
  if (hasKnownLocation && SUMMARY_PLACE_LOGISTICS_PATTERN.test(text)) {
    return true;
  }
  if (/\bruns?\b/i.test(text) && /\b(?:rain or shine|parking lot|from\s+to|every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|corner of)\b/i.test(text)) {
    return true;
  }
  if (/^(?:free parking|be prompt|entrance doors lock)\b/i.test(text)) {
    return true;
  }
  if (/^(?:no registration required|registration required|registration is required|required for children only|all meetings will be held|all children must be accompanied|you do not need to register|registration opens|registration begins|sign up|rsvp|tickets?|click here)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:hours? for|ride bracelet nights?|pay one price|wristbands?|advance sale|discounted advance sale|individual ride credits|registration begins|registration opens|all meetings will be held)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:first|second|third|fourth|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) && !SUMMARY_ACTIVITY_SIGNAL_PATTERN.test(text)) {
    return true;
  }
  if (hasDateOrTime && !SUMMARY_ACTIVITY_SIGNAL_PATTERN.test(text) && /\b(?:registration|register|hours?|runs?|held|meets?|starts?|ends?|first day|last day|schedule)\b/i.test(text)) {
    return true;
  }
  return false;
}

function filterSummaryLogisticsSentences(value, context = {}) {
  const sentences = collapseWhitespace(value).match(/[^.!?]+[.!?]*/g) || [];
  return sentences.filter((sentence) => !isSummaryLogisticsSentence(sentence, context)).join(" ");
}

function removeRepeatedSummarySentences(value) {
  const seen = new Set();
  return (collapseWhitespace(value).match(/[^.!?]+[.!?]*/g) || [])
    .filter((sentence) => {
      const key = normalizePlaceName(sentence);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(" ");
}

function cleanImportedSummary(value, context = {}) {
  let summary = stripHtml(value)
    .replace(SUMMARY_SOURCE_WIDGET_TAIL_PATTERN, "")
    .replace(/\bThursday is the new in [^.]+\.?\s*/gi, "")
    .replace(/\bAnnual festival hosted by ([^.]+?) in [A-Z][A-Za-z .'-]+(?=[.!?])/g, "Annual festival hosted by $1")
    .replace(/\bSuite\s+\d+,\s*[A-Za-z .'-]+,\s*NJ\s+\d{5}\.?/gi, "")
    .replace(/\bPresenter:\s*[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/\bRide (?:tickets|credits)\b[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/\bSpace is limited\b[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/\bNo registration (?:is )?required\.?/gi, "")
    .replace(/\bRegistration (?:not )?required\.?/gi, "")
    .replace(/\bFireworks will be held on two nights:[^.!?]*(?:[.!?]|$)?/gi, "")
    .replace(/\bStop in anytime\b[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/\s+\bat\b[^.!?]*\bon\s+[A-Z][A-Za-z .'-]+(?:Ave|Avenue|Road|Rd|Street|St|Drive|Dr|Lane|Ln)\b[^.!?]*(?=[.!?])/gi, "")
    .replace(/\s+in\s+[A-Z][A-Za-z .'-]+(?=[.!?])/g, "")
    .replace(/\s+on\s*\([^)]*rain date[^)]*\)/gi, "")
    .replace(/\s+\(rain date[^)]*\)/gi, "")
    .replace(/\s+at approximately\.?/gi, "")
    .replace(SUMMARY_TEMP_LOCATION_BLOCK_PATTERN, "")
    .replace(SUMMARY_TEMP_LOCATION_INTRO_PATTERN, "")
    .replace(SUMMARY_TEMP_RENOVATION_SENTENCE_PATTERN, "")
    .replace(SUMMARY_STREET_LOCATION_SENTENCE_PATTERN, "")
    .replace(SUMMARY_PARKING_SENTENCE_PATTERN, "")
    .replace(SUMMARY_PARKING_FRAGMENT_PATTERN, "")
    .replace(SUMMARY_WAIVER_TAIL_PATTERN, "")
    .replace(/^PROGRAM ROOM [A-Z]\s+/i, "")
    .replace(/\bRegister here\b[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/\bRegister for\b[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/\bOnline\.?\s*/gi, "")
    .replace(/\[&hellip;]|\[…]|&hellip;|\.\.\./gi, "")
    .replace(SOURCE_LOGISTICS_CLAUSE_PATTERN, ".")
    .replace(SOURCE_LOGISTICS_SENTENCE_PATTERN, "")
    .replace(SOURCE_PAGE_SENTENCE_PATTERN, "")
    .replace(CONTACT_DETAILS_SENTENCE_PATTERN, "");
  summary = stripLeadingSummaryLogistics(summary, context);
  summary = filterSummaryLogisticsSentences(summary, context);
  summary = stripSummaryDateTimePhrases(summary);
  summary = removeKnownLocationPhrases(summary, context);
  summary = filterSummaryLogisticsSentences(summary, context);
  summary = stripLeadingSummaryLogistics(summary, context);
  summary = removeRepeatedSummarySentences(summary);
  return normalizeSummaryPunctuation(summary);
}

function markSummaryStatus(event, status = "source_detail_unavailable") {
  if (isNonEmptyText(event.summary)) {
    delete event.summaryStatus;
    return event;
  }
  event.summary = "";
  event.summaryStatus = status;
  return event;
}

function collapseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isQuestionLikeImportedTitle(title) {
  return IMPORT_QUESTION_LIKE_TITLE_PATTERN.test(title) || /\?$/.test(title);
}

function stripImportedSummaryDateTimePrefix(value) {
  const monthPattern =
    "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const timePattern = "(?:\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)";
  const prefixPattern = new RegExp(
    `^(?:(?:sun|mon|tue|wed|thu|fri|sat)(?:day)?[,]?\\s+)?${monthPattern}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?(?:[,]?\\s+${timePattern}(?:\\s*(?:-|\\u2013|\\u2014|to)\\s*${timePattern})?)?\\s*`,
    "i"
  );
  return collapseWhitespace(value).replace(prefixPattern, "").trim();
}

function normalizeImportedTitle(value) {
  return collapseWhitespace(value)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+A\s+USA\s+\d{3}\b.*$/i, "")
    .replace(/\s+[-\u2013\u2014]\s+/g, ": ")
    .trim();
}

function importedDisplayTitle(rawTitle, summary) {
  const title = collapseWhitespace(rawTitle);
  if (!isQuestionLikeImportedTitle(title)) {
    return title;
  }
  const body = stripImportedSummaryDateTimePrefix(summary);
  const stopMatch = body.match(IMPORT_SUMMARY_TITLE_STOP_PATTERN);
  const candidate = normalizeImportedTitle(stopMatch ? body.slice(0, stopMatch.index) : "");
  return candidate.length >= 12 && candidate.length <= 90 && !isQuestionLikeImportedTitle(candidate) ? candidate : title;
}

function localIso(rawDateTime) {
  if (!rawDateTime) {
    return null;
  }
  return rawDateTime.replace(" ", "T");
}

function dateStamp(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).valueOf();
}

function addDateDays(dateKey, days) {
  return new Date(dateStamp(dateKey) + days * DAY_MS).toISOString().slice(0, 10);
}

function addMinutes(localDateTime, minutes) {
  const [datePart, timePart = "00:00:00"] = String(localDateTime).split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 19);
}

function datesInRange(startDate, endDate) {
  const dates = [];
  const endStamp = Math.max(dateStamp(startDate), dateStamp(endDate || startDate));
  for (let stamp = dateStamp(startDate); stamp <= endStamp; stamp += DAY_MS) {
    dates.push(new Date(stamp).toISOString().slice(0, 10));
  }
  return dates;
}

function isDateWithinWindow(dateKey, startDate, days) {
  const stamp = dateStamp(dateKey);
  const startStamp = dateStamp(startDate);
  const endStamp = dateStamp(addDateDays(startDate, Math.max(0, days - 1)));
  return stamp >= startStamp && stamp <= endStamp;
}

function parseLocalDateTime(datePart, timePart) {
  const match = `${datePart} ${timePart}`.match(
    /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(?:@\s*)?(\d{1,2}):(\d{2})(am|pm)$/i
  );
  if (!match) {
    return null;
  }
  const [, monthName, day, year, hourRaw, minute, meridiem] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (!month) {
    return null;
  }
  let hour = Number(hourRaw);
  if (meridiem.toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem.toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${year}-${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function durationMinutes(startRaw, endRaw) {
  const start = new Date(localIso(startRaw));
  const end = new Date(localIso(endRaw));
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return null;
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

function addressFor(location) {
  return [location?.line1, location?.locality, location?.stateprovincecounty, location?.ziporpostcode]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .join(", ");
}

function numericCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
}

function hasValidCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateText(value) {
  return isNonEmptyText(value) && !Number.isNaN(new Date(value).valueOf());
}

function isValidUrlText(value) {
  if (!isNonEmptyText(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function libraryLat(source) {
  return numericCoordinate(source.library.lat || source.town?.center?.lat);
}

function libraryLng(source) {
  return numericCoordinate(source.library.lng || source.town?.center?.lng);
}

function hasChildAudience(audiences, title = "") {
  const audienceText = audiences.join(" ").toLowerCase();
  const titleText = title.toLowerCase();
  const explicitYouthTitle =
    /baby|babies|toddler|preschool|pre-school|children|child|kids|family|families|elem|tween|teen|youth|storytime|story time|lego|chess|lap sit|lapsit/.test(
      titleText
    );
  const youthAudience =
    /baby|babies|toddler|preschool|pre-school|children|child|kids|family|families|elem|tween|teen|youth/.test(
      audienceText
    );
  const adultsOnly = audiences.length > 0 && audiences.every((audience) => /adult|senior/.test(audience.toLowerCase()));
  if (adultsOnly && !explicitYouthTitle) {
    return false;
  }
  return explicitYouthTitle || youthAudience || (!adultsOnly && /everyone|all ages|open to all/.test(audienceText));
}

function isClosureOrNonEvent(title, description = "") {
  const text = `${title} ${description}`.toLowerCase();
  const youthSignal =
    /\b(story|craft|club|kids|children|family|baby|toddler|preschool|teen|teens|tween|tweens|lego|magic|workshop|camp|play|jump)\b/.test(
      text
    );
  if (youthSignal) {
    return false;
  }
  return /\b(closed|closure|closing|holiday hours|library is closed|board meeting|trustee meeting)\b/.test(text);
}

function normalizeLabelList(values) {
  return (Array.isArray(values) ? values : [values])
    .flatMap((value) => {
      if (typeof value === "string") {
        return [value];
      }
      if (value?.name) {
        return [value.name];
      }
      if (value?.label) {
        return [value.label];
      }
      if (value?.title) {
        return [value.title];
      }
      return [];
    })
    .map(stripHtml)
    .filter(Boolean);
}

function localDateTime(dateKey, time = "12:00") {
  return `${dateKey}T${time.length === 5 ? `${time}:00` : time}`;
}

function parseUsNumericDateTime(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?$/i);
  if (!match) {
    return null;
  }
  const [, monthRaw, dayRaw, year, hourRaw = "12", minute = "00", meridiem = "pm"] = match;
  let hour = Number(hourRaw);
  if (meridiem.toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem.toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${year}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function countyMonthNumber(monthName) {
  const normalized = String(monthName ?? "")
    .trim()
    .toLowerCase();
  if (MONTH_NAME_MAP.has(normalized.slice(0, 3))) {
    return MONTH_NAME_MAP.get(normalized.slice(0, 3));
  }
  return MONTHS.get(normalized);
}

function countyInferDateKey(monthName, dayRaw, yearHint, startDate, days) {
  const month = countyMonthNumber(monthName);
  const day = Number(dayRaw);
  if (!month || Number.isNaN(day) || day < 1 || day > 31) {
    return "";
  }

  const preferredYears = [Number(yearHint || startDate.slice(0, 4)), Number(startDate.slice(0, 4)) + 1].filter((value, index, all) =>
    all.indexOf(value) === index
  );
  const candidates = preferredYears.map((year) => `${String(year)}-${month}-${String(day).padStart(2, "0")}`);
  const inWindow = candidates.find((dateKey) => isDateWithinWindow(dateKey, startDate, days));
  if (inWindow) {
    return inWindow;
  }
  const fallbackKey = candidates.find((dateKey) => Number.isFinite(dateStamp(dateKey)));
  if (fallbackKey) {
    return fallbackKey;
  }
  return "";
}

function countyNormalizeMeridiem(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase().replace(/\./g, "").slice(0, 2);
}

function countyToMilitaryClock(hourRaw, minuteRaw, meridiemRaw = "") {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw || "00");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  const meridiem = countyNormalizeMeridiem(meridiemRaw);
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseCountyTimeText(value, defaultMeridiem = "am") {
  const text = collapseWhitespace(String(value ?? "")).replace(/[\u2012\u2013\u2014]/g, "-");
  const range = text.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i);
  if (range) {
    const [, startHourRaw, startMinuteRaw = "00", startMeridiemRaw = "", endHourRaw, endMinuteRaw = "00", endMeridiemRaw = ""] = range;
    const normalizedEndMeridiem = countyNormalizeMeridiem(endMeridiemRaw || startMeridiemRaw || defaultMeridiem);
    const normalizedStartMeridiem = countyNormalizeMeridiem(startMeridiemRaw || normalizedEndMeridiem);
    const start = countyToMilitaryClock(startHourRaw, startMinuteRaw, normalizedStartMeridiem);
    const end = countyToMilitaryClock(endHourRaw, endMinuteRaw, normalizedEndMeridiem);
    if (!start) {
      return null;
    }
    return { startTime: `${start}:00`, endTime: end ? `${end}:00` : null };
  }

  const single = text.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i);
  if (!single) {
    return null;
  }
  const [, hourRaw, minuteRaw = "00", meridiemRaw] = single;
  const start = countyToMilitaryClock(hourRaw, minuteRaw, meridiemRaw || defaultMeridiem);
  if (!start) {
    return null;
  }
  return { startTime: `${start}:00`, endTime: null };
}

function parseCountyDateText(value, yearHint, startDate, days) {
  const raw = collapseWhitespace(stripHtml(value));
  let dateKey = "";
  let remainder = raw;

  const withWeekday = raw.match(/(?:\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b,?\s*)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?(?:\s*[•·]?\s*(.+))?/i);
  if (withWeekday) {
    dateKey = countyInferDateKey(withWeekday[1], withWeekday[2], withWeekday[3] || yearHint, startDate, days);
    remainder = withWeekday[4] || "";
    return { dateKey, timeText: remainder };
  }

  const alpha = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (alpha) {
    dateKey = countyInferDateKey(alpha[2], alpha[1], alpha[3], startDate, days);
    return { dateKey, timeText: "" };
  }

  const numeric = raw.match(/\b(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?/);
  if (numeric) {
    const [, monthRaw, dayRaw, yearRaw] = numeric;
    const month = countyMonthNumber(monthRaw);
    const day = Number(dayRaw);
    if (month && Number.isFinite(day)) {
      dateKey = countyInferDateKey(month, String(day), yearRaw, startDate, days);
      return { dateKey, timeText: raw.replace(numeric[0], "") };
    }
  }

  return { dateKey: "", timeText: raw };
}

function isCountyEventActionable(title, summary = "") {
  return !isClosureOrNonEvent(title, summary);
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function inferAgeBandsFromText(...values) {
  const text = values.join(" ").toLowerCase();
  const bands = new Set();

  if (/baby|babies|birth/.test(text)) bands.add("baby");
  if (/toddler|0-2|ages 0|18 months/.test(text)) bands.add("toddler");
  if (/pre-school|preschool|ages 3|ages 4|ages 5/.test(text)) bands.add("preschool");
  if (/kids|children|child|grade k|grades k|elem|lego|chess|craft/.test(text)) bands.add("early-elementary");
  if (/tween|grades 3|grades 4|grades 5|grades 6|ages 9|ages 10|ages 11|ages 12/.test(text)) bands.add("tween");
  if (/teen|grades 7|grades 8|grades 9|ages 13|ages 14|ages 15|ages 16|ages 17/.test(text)) bands.add("teen");
  if (/families|family|all ages|everyone|open to all/.test(text)) {
    bands.add("baby");
    bands.add("toddler");
    bands.add("preschool");
    bands.add("early-elementary");
  }

  if (bands.size === 0) {
    bands.add("early-elementary");
  }
  return AGE_ORDER.filter((band) => bands.has(band));
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function fetchJson(url, extraHeaders = {}) {
  const text = await fetchText(url, {
    ...extraHeaders,
    accept: "application/json,text/plain,*/*"
  });
  return JSON.parse(text);
}

async function fetchText(url, extraHeaders = {}) {
  return requestWithNativeHttp(url, {
    accept: "text/html,application/xhtml+xml,*/*",
    "user-agent": "Where2Go data importer",
    ...extraHeaders
  });
}

async function requestWithNativeHttp(url, headers = {}, redirectCount = 0) {
  if (redirectCount > 8) {
    throw new Error(`Fetch failed too many redirects for ${url}`);
  }
  const timeoutMs = 12000;
  const uri = new URL(url);
  const transport = uri.protocol === "https:" ? https : http;
  const requestOptions = {
    protocol: uri.protocol,
    hostname: uri.hostname,
    port: uri.port || undefined,
    path: `${uri.pathname}${uri.search}`,
    headers
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(requestOptions, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 307, 308].includes(status) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, uri);
        res.resume();
        return resolve(requestWithNativeHttp(nextUrl.toString(), headers, redirectCount + 1));
      }
      if (status >= 400) {
        res.resume();
        reject(new Error(`Fetch failed ${status} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Fetch timeout for ${url}`));
    });
    req.on("error", (error) => reject(error));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function geocodeableAddress(value) {
  const address = collapseWhitespace(value);
  if (address.length < 8 || !/[a-z]/i.test(address)) {
    return "";
  }
  return /\bNJ\b|New Jersey/i.test(address) ? address : `${address}, NJ`;
}

async function geocodeAddress(address) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", address);
  const results = await fetchJson(url.toString());
  const result = Array.isArray(results) ? results[0] : null;
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }
  return { lat, lng };
}

async function geocodeMissingEventCoordinates(events) {
  const cache = new Map();
  let filled = 0;
  let lookups = 0;
  let lastLookupAt = 0;

  for (const event of events) {
    if (hasValidCoordinates(event)) {
      continue;
    }
    const address = geocodeableAddress(event.address);
    if (!address) {
      continue;
    }
    if (!cache.has(address)) {
      const elapsed = Date.now() - lastLookupAt;
      if (lastLookupAt && elapsed < GEOCODE_DELAY_MS) {
        await sleep(GEOCODE_DELAY_MS - elapsed);
      }
      lastLookupAt = Date.now();
      lookups += 1;
      try {
        cache.set(address, await geocodeAddress(address));
      } catch (error) {
        console.warn(`warning: could not geocode ${address}: ${error.message}`);
        cache.set(address, null);
      }
    }
    const coordinates = cache.get(address);
    if (coordinates) {
      event.lat = coordinates.lat;
      event.lng = coordinates.lng;
      filled += 1;
    }
  }

  return { filled, lookups };
}

function repairEventQuality(events) {
  const repairs = new Map();
  const noteRepair = (field) => {
    repairs.set(field, (repairs.get(field) || 0) + 1);
  };

  events.forEach((event) => {
    if (!isNonEmptyText(event.sourceUrl) && isNonEmptyText(event.url)) {
      event.sourceUrl = event.url;
      noteRepair("sourceUrl");
    }
    if (!isNonEmptyText(event.url) && isNonEmptyText(event.sourceUrl)) {
      event.url = event.sourceUrl;
      noteRepair("url");
    }
    if (!isNonEmptyText(event.venueName) && isNonEmptyText(event.venue)) {
      event.venueName = event.venue;
      noteRepair("venueName");
    }
    if (!isNonEmptyText(event.venue) && isNonEmptyText(event.venueName)) {
      event.venue = event.venueName;
      noteRepair("venue");
    }
    if (!isNonEmptyText(event.timezone) && isValidDateText(event.startsAt)) {
      event.timezone = TIMEZONE;
      noteRepair("timezone");
    }
    if (!Number.isFinite(Number(event.durationMinutes)) && isValidDateText(event.startsAt) && isValidDateText(event.endsAt)) {
      event.durationMinutes = durationMinutes(event.startsAt, event.endsAt);
      noteRepair("durationMinutes");
    }
    if (isDateOnlyUnknownVenueEvent(event)) {
      event.endsAt = null;
      event.durationMinutes = null;
      event.timeLabel = "Date listed; time TBA";
      event.timeStatus = "date_only_time_unconfirmed";
      noteRepair("dateOnlyUnknownVenueTime");
    } else if (applyVenueHoursToAllDayEvent(event)) {
      noteRepair("allDayVenueHours");
    } else if (isAllDayTimeRange(event)) {
      if (event.timeLabel !== "All day") {
        event.timeLabel = "All day";
        noteRepair("timeLabel");
      }
      if (!isNonEmptyText(event.timeStatus)) {
        event.timeStatus = "all_day_source_time";
        noteRepair("timeStatus");
      }
    }
    if (isMidnightDateOnlyPlaceholder(event)) {
      if (!isNonEmptyText(event.timeLabel)) {
        event.timeLabel = "Date listed; time TBA";
        noteRepair("timeLabel");
      }
      if (!isNonEmptyText(event.timeStatus)) {
        event.timeStatus = "date_only_time_unconfirmed";
        noteRepair("timeStatus");
      }
    }
    if (isZeroDurationPlaceholder(event)) {
      if (!isNonEmptyText(event.timeLabel)) {
        event.timeLabel = formatSingleTimeLabel(event.startsAt);
        noteRepair("timeLabel");
      }
      event.endsAt = null;
      event.durationMinutes = null;
      if (!isNonEmptyText(event.timeStatus)) {
        event.timeStatus = String(event.startsAt || "").includes("T") ? "end_time_missing" : "date_only_time_unconfirmed";
      }
      noteRepair("zeroDurationTime");
    }
    if (isNonEmptyText(event.summary)) {
      const cleanedSummary = cleanImportedSummary(event.summary, event);
      if (cleanedSummary !== event.summary) {
        event.summary = cleanedSummary;
        noteRepair("summary");
      }
      delete event.summaryStatus;
    }
  });

  return Object.fromEntries(repairs);
}

function qualityEventLabel(event) {
  return [event.id, event.startsAt ? String(event.startsAt).slice(0, 10) : "", event.title, event.venueName || event.venue]
    .filter(Boolean)
    .join(" | ");
}

function noteQualityIssue(issues, field, event) {
  if (!issues[field]) {
    issues[field] = { count: 0, samples: [] };
  }
  issues[field].count += 1;
  if (issues[field].samples.length < QUALITY_REPORT_SAMPLE_LIMIT) {
    issues[field].samples.push(qualityEventLabel(event));
  }
}

function auditEventQuality(events) {
  const issues = {};

  events
    .filter((event) => event.status !== "review" && event.withinCoverage !== false)
    .forEach((event) => {
      if (!isNonEmptyText(event.title)) {
        noteQualityIssue(issues, "title", event);
      }
      if (!isValidDateText(event.startsAt) && !isNonEmptyText(event.timeLabel)) {
        noteQualityIssue(issues, "time", event);
      }
      if (!isNonEmptyText(event.venueName) && !isNonEmptyText(event.venue)) {
        noteQualityIssue(issues, "place", event);
      }
      if (!hasValidCoordinates(event)) {
        noteQualityIssue(issues, "coordinates", event);
      }
      if (!isValidUrlText(event.sourceUrl || event.url)) {
        noteQualityIssue(issues, "sourceUrl", event);
      }
      if (!isNonEmptyText(event.summary) || GENERIC_SUMMARY_PATTERN.test(event.summary)) {
        noteQualityIssue(issues, "summary", event);
      }
    });

  return {
    checked: events.filter((event) => event.status !== "review" && event.withinCoverage !== false).length,
    issues
  };
}

function printImportQualityReport({ audit, repairs, geocodeSummary }) {
  const repairEntries = Object.entries(repairs).filter(([, count]) => count > 0);
  const issueEntries = Object.entries(audit.issues);
  console.log(`Quality audit checked ${audit.checked} visible/importable event record(s).`);
  if (repairEntries.length) {
    const repairText = repairEntries.map(([field, count]) => `${field}:${count}`).join(", ");
    console.log(`Auto-repaired event fields: ${repairText}.`);
  }
  if (geocodeSummary.lookups) {
    console.log(`Geocoded ${geocodeSummary.filled} event record(s) from ${geocodeSummary.lookups} address lookup(s).`);
  }
  if (!issueEntries.length) {
    console.log("Quality audit found no unresolved gaps.");
    return;
  }
  console.log("Quality audit unresolved gaps:");
  issueEntries.forEach(([field, issue]) => {
    console.log(`- ${field}: ${issue.count}`);
    issue.samples.forEach((sample) => {
      console.log(`  ${sample}`);
    });
    if (issue.count > issue.samples.length) {
      console.log(`  ... ${issue.count - issue.samples.length} more`);
    }
  });
}

function buildSclsnjEventsUrl(source, startDate, days) {
  const request = {
    date: startDate,
    days,
    private: false,
    locations: source.branchIds,
    ages: source.ageFilters.map((age) => encodeURIComponent(age))
  };
  const params = new URLSearchParams({
    event_type: "0",
    req: JSON.stringify(request)
  });
  return `${source.eventEndpoint}?${params.toString()}`;
}

function isSclsnjLowAgeEvent(event, filters) {
  const ages = new Set(event.agesArray ?? []);
  return filters.some((age) => ages.has(age));
}

function sclsnjRegistrationLabel(event) {
  if (String(event.changed) === "1") return "Cancelled";
  if (event.reg_url || String(event.third_party_reg) === "1") return "Ticket";
  if (String(event.allow_reg) !== "1") return "Drop-in";
  return "RSVP";
}

function normalizeSclsnjUrl(event) {
  if (event.url) {
    return event.url.replace("https://sclsnj.libnet.info//event/", "https://sclsnj.libnet.info/event/");
  }
  return `https://sclsnj.libnet.info/event/${event.id}`;
}

function sclsnjRegistryLocations(source) {
  return new Map((source.locations || []).map((location) => [String(location.id), location]));
}

function mergeSclsnjLocation(apiLocation, registryLocation) {
  return {
    ...(apiLocation || {}),
    ...(registryLocation || {}),
    id: String(registryLocation?.id || apiLocation?.id || "")
  };
}

function sclsnjDisplayLocationName(location, event) {
  return location?.name || event.location;
}

async function loadSclsnjLocations(source) {
  const registryLocations = sclsnjRegistryLocations(source);
  try {
    const locations = await fetchJson(source.locationEndpoint);
    return new Map(
      locations.map((location) => {
        const locationId = String(location.id);
        return [locationId, mergeSclsnjLocation(location, registryLocations.get(locationId))];
      })
    );
  } catch (error) {
    console.warn(`warning: SCLSNJ location API failed, using registry locations: ${error.message}`);
    return registryLocations;
  }
}

function branchTownMap(sources) {
  const map = new Map();
  sources.towns.forEach((town) => {
    town.libraries?.forEach((library) => {
      if (library.branchId) {
        map.set(String(library.branchId), town.id);
      }
    });
  });
  return map;
}

async function importSclsnjEvents(sources, startDate, days) {
  const source = sources.sharedSources?.["sclsnj-libnet"];
  if (!source || source.status !== "importable") {
    return [];
  }

  let locationsById;
  let rawEvents;
  try {
    [locationsById, rawEvents] = await Promise.all([
      loadSclsnjLocations(source),
      fetchJson(buildSclsnjEventsUrl(source, startDate, days))
    ]);
  } catch (error) {
    console.warn(`warning: could not import ${source.eventsUrl}: ${error.message}`);
    return [];
  }
  const townByBranch = branchTownMap(sources);

  const events = rawEvents
    .filter((event) => isSclsnjLowAgeEvent(event, source.ageFilters))
    .map((event) => {
      const location = locationsById.get(String(event.location_id));
      const summary = cleanImportedSummary(event.description || event.long_description || "");
      const longSummary = cleanImportedSummary(event.long_description || "");
      const displayLocationName = sclsnjDisplayLocationName(location, event);
      const venueParts = [displayLocationName, event.venues].filter(Boolean);
      const url = normalizeSclsnjUrl(event);

      return {
        id: `sclsnj-${event.id}`,
        externalId: String(event.id),
        sourceId: "sclsnj-libnet",
        townId: townByBranch.get(String(event.location_id)) || null,
        title: stripHtml(event.title),
        venue: venueParts.join(" · "),
        venueName: displayLocationName,
        room: event.venues || null,
        category: "library",
        source: source.label,
        startsAt: localIso(event.raw_start_time),
        endsAt: localIso(event.raw_end_time),
        timezone: TIMEZONE,
        durationMinutes: durationMinutes(event.raw_start_time, event.raw_end_time),
        ages: inferAgeBandsFromText(event.title, event.description, event.long_description, event.ages),
        cost: Number(event.registration_cost || 0),
        registration: sclsnjRegistrationLabel(event),
        summary: longSummary ? `${summary} ${longSummary}`.trim() : summary,
        url,
        sourceUrl: url,
        sourceCalendarUrl: source.eventsUrl,
        address: addressFor(location),
        lat: Number(location?.lat || 0),
        lng: Number(location?.lon || 0),
        tags: event.tagsArray ?? [],
        status: String(event.changed) === "1" ? "review" : "published",
        confidence: 0.95
      };
    })
    .filter((event) => event.startsAt && event.sourceUrl);

  return events;
}

function allCommunicoLibnetLibrarySources(sources) {
  return (sources.towns ?? []).flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "communico-libnet")
      .map((library) => ({ town, library }))
  );
}

function buildCommunicoLibnetEventsUrl(source, startDate, days) {
  const request = {
    date: startDate,
    days,
    private: false,
    locations: source.library.branchIds || (source.library.branchId ? [source.library.branchId] : []),
    ages: (source.library.ageFilters || []).map((age) => encodeURIComponent(age))
  };
  const params = new URLSearchParams({
    event_type: "0",
    req: JSON.stringify(request)
  });
  return `${source.library.eventEndpoint}?${params.toString()}`;
}

function communicoLibnetRegistryLocations(source) {
  return new Map((source.library.locations || []).map((location) => [String(location.id), location]));
}

function mergeCommunicoLibnetLocation(apiLocation, registryLocation) {
  return {
    ...(apiLocation || {}),
    ...(registryLocation || {}),
    id: String(registryLocation?.id || apiLocation?.id || "")
  };
}

async function loadCommunicoLibnetLocations(source) {
  const registryLocations = communicoLibnetRegistryLocations(source);
  try {
    const locations = await fetchJson(source.library.locationEndpoint);
    return new Map(
      locations.map((location) => {
        const locationId = String(location.id);
        return [locationId, mergeCommunicoLibnetLocation(location, registryLocations.get(locationId))];
      })
    );
  } catch (error) {
    console.warn(`warning: ${source.library.name} location API failed, using registry locations: ${error.message}`);
    return registryLocations;
  }
}

function isCommunicoLibnetAgeEvent(event, filters) {
  if (!filters.length) {
    return true;
  }
  const ages = new Set(event.agesArray ?? []);
  return filters.some((age) => ages.has(age));
}

function communicoLibnetRegistrationLabel(event) {
  if (String(event.changed) === "1") return "Cancelled";
  if (event.reg_url || String(event.third_party_reg) === "1") return "Ticket";
  if (String(event.allow_reg) !== "1") return "Drop-in";
  return "RSVP";
}

function normalizeCommunicoLibnetUrl(source, event) {
  if (event.url) {
    return event.url.replace(/\/\/event\//, "/event/");
  }
  return absoluteUrl(source.library.eventsUrl, `/event/${event.id}`);
}

function mapCommunicoLibnetEvent(source, event, locationsById) {
  const location = locationsById.get(String(event.location_id));
  const summary = cleanImportedSummary(event.description || event.long_description || "");
  const longSummary = cleanImportedSummary(event.long_description || "");
  const title = stripHtml(event.title);
  if (!title || isClosureOrNonEvent(title, summary) || !hasChildAudience(event.agesArray ?? [], title)) {
    return null;
  }

  const displayLocationName = location?.displayName || location?.name || event.location || source.library.name;
  const venueParts = [displayLocationName, event.venues].filter(Boolean);
  const startsAt = localIso(event.raw_start_time);
  const endsAt = localIso(event.raw_end_time);
  const url = normalizeCommunicoLibnetUrl(source, event);
  const mapped = {
    id: `${slugify(source.library.name)}-libnet-${event.id}`,
    externalId: String(event.id),
    sourceId: `${slugify(source.library.name)}-libnet`,
    townId: source.library.townId || source.town.id,
    title,
    venue: venueParts.join(" · "),
    venueName: displayLocationName,
    room: event.venues || null,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: startsAt && endsAt ? durationMinutes(startsAt, endsAt) : null,
    ages: inferAgeBandsFromText(event.title, event.description, event.long_description, event.ages),
    audiences: event.agesArray ?? [],
    cost: Number(event.registration_cost || 0),
    registration: communicoLibnetRegistrationLabel(event),
    summary: longSummary ? `${summary} ${longSummary}`.trim() : summary,
    url,
    sourceUrl: url,
    sourceCalendarUrl: source.library.eventsUrl,
    address: addressFor(location),
    lat: Number(location?.lat || 0),
    lng: Number(location?.lon || 0),
    tags: event.tagsArray ?? [],
    status: String(event.changed) === "1" ? "review" : "published",
    confidence: 0.93
  };

  if (event.event_type === "ONLINE" || eventLooksOnline(mapped)) {
    markOnlineEvent(mapped);
  }
  return mapped;
}

async function importCommunicoLibnetLibraryEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allCommunicoLibnetLibrarySources(sources)) {
    if (!source.library.eventEndpoint || !source.library.locationEndpoint) {
      console.warn(`warning: could not import ${source.library.name}: missing Communico endpoint config`);
      continue;
    }
    try {
      const [locationsById, rawEvents] = await Promise.all([
        loadCommunicoLibnetLocations(source),
        fetchJson(buildCommunicoLibnetEventsUrl(source, startDate, days))
      ]);
      rawEvents
        .filter((event) => isCommunicoLibnetAgeEvent(event, source.library.ageFilters || []))
        .map((event) => mapCommunicoLibnetEvent(source, event, locationsById))
        .filter(Boolean)
        .forEach((event) => imported.push(event));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function allLibraryCalendarSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "librarycalendar-list")
      .map((library) => ({ town, library }))
  );
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1] ?? "";
}

function absoluteUrl(base, value) {
  return new URL(decodeEntities(value), base).toString();
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromUrl(value) {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    return slugify(parts.at(-1) || value);
  } catch {
    return slugify(value);
  }
}

function normalizePlaceName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(township|borough|city|town)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTownLookup(sources) {
  const lookup = new Map();
  sources.towns.forEach((town) => {
    const variants = new Set([
      normalizePlaceName(town.name),
      normalizePlaceName(town.id),
      normalizePlaceName(town.name.replace(/\b(township|borough|city|town)\b/gi, ""))
    ]);
    variants.forEach((variant) => {
      if (variant && !lookup.has(variant)) {
        lookup.set(variant, town);
      }
    });
  });
  return lookup;
}

function cleanAddress(value) {
  return stripHtml(value)
    .replace(/,\s*(?:US|USA|United States)$/i, "")
    .replace(/,\s*([^,]+),\s*(NJ|NY|PA)\s+(\d{5}(?:-\d{4})?),\s*\1,\s*\2$/i, ", $1, $2 $3")
    .replace(/,\s*(NJ|NY|PA),\s*(\d{5}(?:-\d{4})?)\b/gi, ", $1 $2")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeStreetAddress(value) {
  return /^\s*\d+\s+.+\b(?:ave|avenue|st|street|rd|road|dr|drive|blvd|boulevard|ln|lane|way|hwy|highway|route|rt\.?)\b/i.test(
    String(value || "")
  );
}

function displayVenueName(rawVenueName, fallbackName) {
  const venueName = stripHtml(rawVenueName || "");
  return looksLikeStreetAddress(venueName) && fallbackName ? fallbackName : venueName || fallbackName || "";
}

function addressFromPostalAddress(address) {
  if (typeof address === "string") {
    return cleanAddress(address);
  }
  const regionPostal = [address?.addressRegion, address?.postalCode]
    .filter(Boolean)
    .map((part) => stripHtml(part))
    .join(" ");
  const country = stripHtml(address?.addressCountry || "");
  return [
    address?.streetAddress,
    address?.addressLocality,
    regionPostal,
    country && !/^US(?:A)?$/i.test(country) ? country : ""
  ]
    .filter(Boolean)
    .map((part) => stripHtml(part))
    .join(", ");
}

function canonicalVenueAddress(venueName, address) {
  return cleanAddress(address);
}

function findSourceLocationOverride(source, venueName, address) {
  const venueKey = normalizePlaceName(venueName);
  const addressKey = normalizePlaceName(address);
  return (source.locationOverrides || []).find((location) => {
    const names = [location.name, ...(location.aliases || [])].map(normalizePlaceName).filter(Boolean);
    const locationAddress = normalizePlaceName(location.address || "");
    const nameMatches = venueKey && names.includes(venueKey);
    const addressMatches = addressKey && locationAddress && addressKey === locationAddress;
    return nameMatches || addressMatches;
  });
}

function jsonLdNodes(data) {
  const nodes = [];
  const stack = [data];
  while (stack.length) {
    const item = stack.shift();
    if (!item) {
      continue;
    }
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (typeof item !== "object") {
      continue;
    }
    nodes.push(item);
    if (item["@graph"]) {
      stack.push(item["@graph"]);
    }
  }
  return nodes;
}

function jsonLdDeepNodes(data) {
  const nodes = [];
  const stack = [data];
  const seen = new Set();
  while (stack.length) {
    const item = stack.shift();
    if (!item) {
      continue;
    }
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (typeof item !== "object" || seen.has(item)) {
      continue;
    }
    seen.add(item);
    nodes.push(item);
    Object.values(item).forEach((value) => {
      if (value && typeof value === "object") {
        stack.push(value);
      }
    });
  }
  return nodes;
}

function isJsonLdType(item, typeName) {
  const type = item?.["@type"];
  return type === typeName || (Array.isArray(type) && type.includes(typeName));
}

function isJsonLdEventType(item) {
  const type = item?.["@type"];
  const values = Array.isArray(type) ? type : [type];
  return values.some((value) => typeof value === "string" && /Event$/.test(value));
}

function parseJsonLdEvents(section) {
  const scripts = [...section.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const events = [];
  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script[1].trim());
      jsonLdNodes(data)
        .filter((item) => isJsonLdType(item, "Event"))
        .forEach((item) => events.push(item));
    } catch {
      // Ignore non-event JSON-LD blocks. The listing card fallback will skip them.
    }
  });
  return events;
}

function parseJsonLdEvent(section) {
  return parseJsonLdEvents(section)[0] || null;
}

function locationAddress(location) {
  return cleanAddress(location?.address || addressFor(location));
}

function locationCoordinates(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng ?? location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }
  return { lat, lng };
}

function libraryLocationRegistry(source) {
  return [
    {
      name: source.library.name,
      address: source.library.address,
      lat: source.library.lat,
      lng: source.library.lng
    },
    ...(source.library.locations || [])
  ];
}

function findKnownLibraryLocation(source, details) {
  const targetNames = [details?.name, ...(details?.aliases || [])].map(normalizePlaceName).filter(Boolean);
  const targetAddress = normalizePlaceName(details?.address || "");
  return libraryLocationRegistry(source).find((location) => {
    const names = [location.name, ...(location.aliases || [])].map(normalizePlaceName).filter(Boolean);
    const locationAddressKey = normalizePlaceName(locationAddress(location));
    const nameMatches = targetNames.some((name) => names.includes(name));
    const addressMatches = targetAddress && locationAddressKey && targetAddress === locationAddressKey;
    return nameMatches || addressMatches;
  });
}

function jsonLdLocationDetails(event) {
  const location = Array.isArray(event?.location) ? event.location[0] : event?.location;
  if (!location) {
    return null;
  }
  const geo = location.geo || {};
  const lat = Number(geo.latitude);
  const lng = Number(geo.longitude);
  return {
    name: stripHtml(location.name || ""),
    address: addressFromPostalAddress(location.address),
    lat: Number.isFinite(lat) && lat !== 0 ? lat : undefined,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : undefined
  };
}

function applyLibraryLocationDetails(event, source, details) {
  if (!details?.name && !details?.address) {
    return;
  }
  const knownLocation = findKnownLibraryLocation(source, details);
  const coordinates =
    (Number.isFinite(details.lat) && Number.isFinite(details.lng) ? { lat: details.lat, lng: details.lng } : null) ||
    locationCoordinates(knownLocation);
  const placeName = details.name || knownLocation?.name || source.library.name;
  const address = cleanAddress(details.address || locationAddress(knownLocation) || source.library.address || "");

  event.venue = placeName;
  event.venueName = placeName;
  if (address) {
    event.address = address;
  }
  if (coordinates) {
    event.lat = coordinates.lat;
    event.lng = coordinates.lng;
    event.confidence = Math.max(Number(event.confidence || 0), 0.9);
  } else if (address) {
    event.lat = undefined;
    event.lng = undefined;
    event.confidence = Math.max(Number(event.confidence || 0), 0.86);
  }
}

function eventLooksOnline(event) {
  return /\b(?:online|virtual|zoom)\b/i.test(`${event.title || ""} ${event.venue || ""} ${event.summary || ""}`);
}

function markOnlineEvent(event) {
  event.venue = "Online";
  event.venueName = "Online";
  event.address = null;
  event.withinCoverage = false;
  event.lat = undefined;
  event.lng = undefined;
  event.confidence = Math.max(Number(event.confidence || 0), 0.82);
}

function collectTagsFromListingSection(section) {
  const tagBlock = firstMatch(section, /<div class="tag-links">([\s\S]*?)<\/div>/);
  return [...tagBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => stripHtml(match[1]).replace(/^#/, "").trim())
    .filter(Boolean);
}

function cleanNjCarnivalsDetailParagraph(value) {
  return cleanImportedSummary(value)
    .replace(/\bHours?\s+(?:are|is)\s+[^.!?]+[.!?]?/gi, "")
    .replace(/\bDates?, prices?, and hours? are subject to change[^.!?]*[.!?]?/gi, "")
    .replace(/\bNJ Carnivals does not operate[^.!?]*[.!?]?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulNjCarnivalsDetailParagraph(value) {
  if (value.length < 35) {
    return false;
  }
  if (/^(?:profits|proceeds)\b/i.test(value)) {
    return false;
  }
  if (/\bwill host\b/i.test(value) && !/\b(?:features?|includes?|rides?|games?|music|entertainment|vendors?|food|crafts?|fireworks|free|kids?|famil(?:y|ies)|activities)\b/i.test(value)) {
    return false;
  }
  return true;
}

function njCarnivalsDetailParagraphScore(value) {
  let score = 0;
  if (/\b(?:features?|includes?|rides?|games?|activities|entertainment|music|vendors?|food trucks?|crafts?|fireworks|performances?)\b/i.test(value)) {
    score += 4;
  }
  if (/\b(?:kids?|children|famil(?:y|ies)|all ages)\b/i.test(value)) {
    score += 2;
  }
  if (/\b(?:free|admission|tickets?|wristbands?)\b/i.test(value)) {
    score += 1;
  }
  if (/\b(?:will host|held along|located at)\b/i.test(value)) {
    score -= 1;
  }
  return score;
}

function extractNjCarnivalsDetailSummary(html) {
  const content =
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bpostContent\b[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*id=["']contentDisclaimer["']/i) ||
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)<h2\b[^>]*class=["']hoursLabel["']/i);
  const paragraphs = [...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanNjCarnivalsDetailParagraph(match[1]))
    .filter(isUsefulNjCarnivalsDetailParagraph);

  const selected = paragraphs
    .map((text, index) => ({ index, score: njCarnivalsDetailParagraphScore(text), text }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.text);

  if (selected.length) {
    return selected.join(" ");
  }

  const metaDescription =
    firstMatch(html, /<meta\b(?=[^>]*property=["']og:description["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>/i) ||
    firstMatch(html, /<meta\b(?=[^>]*name=["']description["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>/i);
  return cleanNjCarnivalsDetailParagraph(metaDescription);
}

function cleanNjCarnivalsTitle(eventName, listingTitle) {
  const title = stripHtml(listingTitle || eventName);
  return title
    .replace(/\s+20\d{2}\s+in\s+.+?,\s*NJ$/i, "")
    .replace(/\s+in\s+.+?,\s*NJ$/i, "")
    .trim();
}

function njCarnivalsSearchUrl(source, page = 1) {
  const base = new URL(source.searchUrl || source.eventsUrl || source.website);
  const url = page === 1 ? base : new URL(`/customsearch/page/${page}/`, base.origin);
  url.searchParams.set("timeframe", source.timeframe || "all");
  url.searchParams.set("county", source.county || "all");
  return url.toString();
}

function njCarnivalsHighestPage(html, maxPages) {
  const pageNumbers = [...html.matchAll(/customsearch\/page\/(\d+)\//g)].map((match) => Number(match[1]));
  if (!pageNumbers.length) {
    return 1;
  }
  return Math.min(maxPages, Math.max(1, ...pageNumbers));
}

function parseNjCarnivalsClockTime(value, fallbackMeridiem = "") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bnoon\b/g, "12pm")
    .replace(/\bmidnight\b/g, "12am")
    .trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }
  const [, hourRaw, minuteRaw = "00", meridiemRaw = fallbackMeridiem] = match;
  const meridiem = meridiemRaw.toLowerCase();
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

function inferStartMeridiem(startHour, endHour, endMeridiem) {
  if (endMeridiem.toLowerCase() === "am") {
    return "am";
  }
  if (startHour === 12 || startHour <= endHour) {
    return "pm";
  }
  return "am";
}

function timeStringFromParts(parts) {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function parseNjCarnivalsTimeRange(value) {
  const normalized = stripHtml(value)
    .replace(/\./g, "")
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am");
  const match = normalized.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(am|pm))/i
  );
  if (!match) {
    return null;
  }
  const [, startRaw, endRaw, endMeridiem] = match;
  const startHour = Number(startRaw.match(/\d{1,2}/)?.[0]);
  const endHour = Number(endRaw.match(/\d{1,2}/)?.[0]);
  const startMeridiem = /(?:am|pm)/i.test(startRaw)
    ? ""
    : inferStartMeridiem(startHour, endHour, endMeridiem);
  const start = parseNjCarnivalsClockTime(startRaw, startMeridiem);
  const end = parseNjCarnivalsClockTime(endRaw);
  if (!start || !end) {
    return null;
  }
  let startMinutes = start.hour * 60 + start.minute;
  let endMinutes = end.hour * 60 + end.minute;
  if (endMinutes <= startMinutes) {
    endMinutes += 12 * 60;
  }
  return {
    start: timeStringFromParts(start),
    end: timeStringFromParts({ hour: Math.floor((endMinutes % (24 * 60)) / 60), minute: endMinutes % 60 }),
    durationMinutes: Math.max(0, endMinutes - startMinutes)
  };
}

function parseNjCarnivalsOpenTime(value) {
  const normalized = stripHtml(value)
    .replace(/\./g, "")
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am");
  const match = normalized.match(/\b(?:opens?|starts?)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (!match) {
    return null;
  }
  const start = parseNjCarnivalsClockTime(match[1]);
  if (!start) {
    return null;
  }
  return {
    start: timeStringFromParts(start),
    end: null,
    durationMinutes: null,
    timeLabel: stripHtml(value)
  };
}

function parseNjCarnivalsDateLabel(value, fallbackYear) {
  const normalized = stripHtml(value).replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const match = normalized.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?/i
  );
  if (!match) {
    return null;
  }
  const [, monthName, dayRaw, yearRaw] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (!month) {
    return null;
  }
  return `${yearRaw || fallbackYear}-${month}-${String(dayRaw).padStart(2, "0")}`;
}

function extractNjCarnivalsDetailHours(html, dateKeys) {
  const dates = [...new Set(dateKeys)].sort();
  const fallbackYear = dates[0]?.slice(0, 4) || String(new Date().getFullYear());
  const hoursByDate = new Map();
  const rowPattern =
    /<span\b(?=[^>]*class=["'][^"']*\btimeDay\b[^"']*["'])[^>]*>([\s\S]*?)<\/span>\s*<span\b(?=[^>]*class=["'][^"']*\btimeHour\b[^"']*["'])[^>]*>([\s\S]*?)<\/span>/gi;

  [...html.matchAll(rowPattern)].forEach((match) => {
    const dayLabel = stripHtml(match[1]);
    const hourLabel = stripHtml(match[2]);
    const hours = parseNjCarnivalsTimeRange(hourLabel) || parseNjCarnivalsOpenTime(hourLabel);
    if (!hours) {
      return;
    }
    const explicitDate = parseNjCarnivalsDateLabel(dayLabel, fallbackYear);
    const targetDates = explicitDate ? [explicitDate] : dates;
    targetDates
      .filter((dateKey) => dates.includes(dateKey))
      .forEach((dateKey) => {
        hoursByDate.set(dateKey, hours);
      });
  });

  if (!hoursByDate.size) {
    const fallbackText = stripHtml(html);
    const hoursSentence = fallbackText.match(/\bHours?\s+(?:are|is)\s+([^.!?]+(?:am|pm|noon)[^.!?]*)/i)?.[1];
    const hours = parseNjCarnivalsTimeRange(hoursSentence || "") || parseNjCarnivalsOpenTime(hoursSentence || "");
    if (hours) {
      dates.forEach((dateKey) => hoursByDate.set(dateKey, hours));
    }
  }

  return hoursByDate;
}

async function enrichNjCarnivalsDetailHours(events) {
  const eventsByUrl = new Map();
  events.forEach((event) => {
    if (!event.sourceUrl) {
      return;
    }
    if (!eventsByUrl.has(event.sourceUrl)) {
      eventsByUrl.set(event.sourceUrl, []);
    }
    eventsByUrl.get(event.sourceUrl).push(event);
  });

  await Promise.all(
    [...eventsByUrl.entries()].map(async ([sourceUrl, group]) => {
      try {
        const detailHtml = await fetchText(sourceUrl);
        const dateKeys = group.map((event) => String(event.startsAt || "").slice(0, 10)).filter(Boolean);
        const hoursByDate = extractNjCarnivalsDetailHours(detailHtml, dateKeys);
        const detailSummary = extractNjCarnivalsDetailSummary(detailHtml);
        group.forEach((event) => {
          const dateKey = String(event.startsAt || "").slice(0, 10);
          const hours = hoursByDate.get(dateKey);
          if (detailSummary) {
            event.summary = detailSummary;
            event.confidence = Math.max(Number(event.confidence || 0), event.withinCoverage ? 0.88 : 0.78);
          }
          if (hours) {
            event.startsAt = `${dateKey}T${hours.start}:00`;
            event.endsAt = hours.end ? `${dateKey}T${hours.end}:00` : null;
            event.durationMinutes = hours.durationMinutes;
            event.timeLabel = hours.timeLabel || null;
            event.confidence = Math.max(Number(event.confidence || 0), event.withinCoverage ? 0.88 : 0.78);
          }
        });
      } catch (error) {
        console.warn(`warning: could not enrich NJ Carnivals hours for ${sourceUrl}: ${error.message}`);
      }
    })
  );

  return events;
}

function parseNjCarnivalsListings(html, source, sources, startDate, days) {
  const townLookup = buildTownLookup(sources);
  const sections = html.split('<section class="main-listing">').slice(1);
  const events = [];

  sections.forEach((section) => {
    const event = parseJsonLdEvent(section);
    if (!event?.url || !event.startDate) {
      return;
    }

    const startDateOnly = String(event.startDate).slice(0, 10);
    const endDateOnly = String(event.endDate || event.startDate).slice(0, 10);
    if (Number.isNaN(dateStamp(startDateOnly)) || Number.isNaN(dateStamp(endDateOnly))) {
      return;
    }

    const listingTitle = firstMatch(section, /<h3>([\s\S]*?)<\/h3>/);
    const title = cleanNjCarnivalsTitle(event.name, listingTitle);
    const location = event.location || {};
    const address = location.address || {};
    const locality = stripHtml(address.addressLocality || "");
    const matchedTown = townLookup.get(normalizePlaceName(locality));
    const townAssignmentStatus = matchedTown ? "assigned" : locality ? "needs_registry_town" : "unknown";
    const eventSlug = slugFromUrl(event.url);
    const tags = collectTagsFromListingSection(section);
    const venueName = stripHtml(location.name || locality || "NJ Carnivals event");
    const importedAddress = canonicalVenueAddress(venueName, addressFromPostalAddress(address));
    const locationOverride = findSourceLocationOverride(source, venueName, importedAddress);
    const fullAddress = locationOverride?.address || importedAddress;
    const coordinates = locationCoordinates(locationOverride);
    const summary = "";

    datesInRange(startDateOnly, endDateOnly)
      .filter((dateKey) => isDateWithinWindow(dateKey, startDate, days))
      .forEach((dateKey) => {
        const occurrenceSuffix = startDateOnly === endDateOnly ? "" : `-${dateKey}`;
        events.push({
          id: `nj-carnivals-${eventSlug}${occurrenceSuffix}`,
          externalId: eventSlug,
          sourceId: "nj-carnivals",
          townId: matchedTown?.id || null,
          townNameRaw: matchedTown ? null : locality || null,
          townAssignmentStatus,
          townAssignmentSource: locality ? "addressLocality" : "unresolved",
          withinCoverage: Boolean(matchedTown),
          title,
          venue: locality ? `${venueName} · ${locality}` : venueName,
          venueName,
          category: "festival",
          source: source.label,
          startsAt: `${dateKey}T12:00:00`,
          endsAt: null,
          timezone: TIMEZONE,
          durationMinutes: 480,
          timeLabel: "See source for hours",
          ages: inferAgeBandsFromText(title, tags.join(" "), "family fun rides games carnival festival fair"),
          cost: null,
          registration: "See source",
          summary,
          url: event.url,
          sourceUrl: event.url,
          sourceCalendarUrl: source.eventsUrl || source.website,
          address: fullAddress || null,
          lat: coordinates?.lat ?? (fullAddress ? undefined : matchedTown ? Number(matchedTown.center?.lat || 0) : undefined),
          lng: coordinates?.lng ?? (fullAddress ? undefined : matchedTown ? Number(matchedTown.center?.lng || 0) : undefined),
          image: event.image || null,
          tags,
          status: matchedTown ? "published" : "review",
          confidence: matchedTown ? 0.82 : 0.72
        });
      });
  });

  return events;
}

function allLocalHopSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "localhop-calendar")
      .map((library) => ({ town, library }))
  );
}

function localHopHeaders() {
  return { "X-Parse-Application-Id": LOCALHOP_PARSE_APP_ID };
}

function localHopPointer(className, objectId) {
  return { __type: "Pointer", className, objectId };
}

function localHopWallIso(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/);
  if (match) {
    return `${match[1]}T${match[2]}:${match[3] || "00"}`;
  }
  return localIso(raw.replace(/\.\d+Z$/, "").replace(/Z$/, ""));
}

function localHopDateBoundary(dateKey, time) {
  return `${dateKey}T${time}.000Z`;
}

function localHopAddress(address) {
  if (typeof address === "string") {
    return cleanAddress(address);
  }
  const regionPostal = [address?.state, address?.postalCode].filter(Boolean).join(" ");
  return [address?.address1, address?.address2, address?.city, regionPostal]
    .filter(Boolean)
    .map((part) => stripHtml(part))
    .join(", ");
}

function localHopCoordinates(...items) {
  for (const item of items) {
    const point = item?.addressLatLng || item;
    const lat = Number(point?.latitude ?? point?.lat);
    const lng = Number(point?.longitude ?? point?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
  }
  return null;
}

function localHopFileUrl(file) {
  return file?.secureUrl || file?.url || null;
}

function localHopOrganizationAgeGroupIds(instance) {
  return [instance.organizationAgeGroups, instance.event?.organizationAgeGroups]
    .flatMap((groups) => (Array.isArray(groups) ? groups : []))
    .map((group) => group?.objectId)
    .filter(Boolean);
}

function localHopAudienceLabels(instance) {
  const labels = [];
  [instance.organizationAgeGroups, instance.event?.organizationAgeGroups]
    .flatMap((groups) => (Array.isArray(groups) ? groups : []))
    .forEach((group) => {
      if (group?.name) {
        labels.push(group.name);
      }
      (group?.ageGroups || []).forEach((ageGroup) => {
        if (ageGroup?.name) {
          labels.push(ageGroup.name);
        }
      });
    });
  return [...new Set(labels.map(stripHtml).filter(Boolean))];
}

function localHopMatchesAgeGroups(source, instance, title) {
  const allowedIds = new Set(source.library.ageGroupIds || []);
  const audiences = localHopAudienceLabels(instance);
  if (!allowedIds.size) {
    return hasChildAudience(audiences, title);
  }
  const ids = localHopOrganizationAgeGroupIds(instance);
  return ids.some((id) => allowedIds.has(id)) || (!ids.length && hasChildAudience(audiences, title));
}

function localHopRegistrationLabel(event) {
  const ticketingConfig = event?.ticketingConfig || {};
  if (ticketingConfig.url || Number(ticketingConfig.type || 0) > 0 || (ticketingConfig.ticketTypes || []).length) {
    return "RSVP";
  }
  return "See source";
}

function localHopSourceId(source) {
  const host = new URL(source.library.eventsUrl || source.library.website).host;
  return `localhop-${slugify(source.library.siteId || host)}`;
}

function localHopEventUrl(source, instance) {
  const event = instance.event || {};
  const registrationUrl = event.ticketingConfig?.url || "";
  if (registrationUrl) {
    return registrationUrl;
  }
  if (event.objectId && instance.objectId && source.library.eventsUrl) {
    return `${source.library.eventsUrl.replace(/\/?$/, "/")}#/events/${event.objectId}/instances/${instance.objectId}/`;
  }
  if (event.slug && event.objectId) {
    return `https://events.getlocalhop.com/${event.slug}/event/${event.objectId}/`;
  }
  return source.library.eventsUrl || source.library.website;
}

async function fetchLocalHopCalendarConfig(library) {
  if (!library.calendarObjectId) {
    return null;
  }
  const url = new URL(`${LOCALHOP_API_URL}/classes/WidgetConfigCalendar/${library.calendarObjectId}`);
  url.searchParams.set("include", "calendarOrganizations,calendarEventCategories,selectedCalendarAgeGroups");
  return fetchJson(url.toString(), localHopHeaders());
}

function localHopOrganizationIds(source, config) {
  const configured = source.library.organizationIds || [];
  if (configured.length) {
    return configured;
  }
  const calendarOrganizations = config?.calendarOrganizations || [];
  const configOrganizationId = config?.organization?.objectId;
  return [...new Set([...calendarOrganizations.map((organization) => organization.objectId), configOrganizationId].filter(Boolean))];
}

function localHopEventTypes(source, config) {
  return source.library.eventTypes || config?.calendarEventTypes || [];
}

function buildLocalHopInstancesUrl(source, config, organizationIds, startDate, days, skip) {
  const endDate = addDateDays(startDate, Math.max(0, days - 1));
  const where = {
    organization: {
      $in: organizationIds.map((objectId) => localHopPointer("Organization", objectId))
    },
    standardStartDate: {
      $gte: { __type: "Date", iso: localHopDateBoundary(startDate, "00:00:00") },
      $lte: { __type: "Date", iso: localHopDateBoundary(endDate, "23:59:59") }
    },
    myCalendarOnly: { $ne: true },
    status: { $in: ["publish"] }
  };
  const eventTypes = localHopEventTypes(source, config);
  if (eventTypes.length) {
    where.type = { $in: eventTypes };
  }
  if (source.library.ageGroupIds?.length) {
    where.organizationAgeGroups = {
      $in: source.library.ageGroupIds.map((objectId) => localHopPointer("OrganizationAgeGroup", objectId))
    };
  }

  const url = new URL(`${LOCALHOP_API_URL}/classes/EventInstance`);
  url.searchParams.set("order", "standardStartDate");
  url.searchParams.set("skip", String(skip));
  url.searchParams.set("limit", String(LOCALHOP_PAGE_LIMIT));
  url.searchParams.set(
    "include",
    [
      "event",
      "event.eventCategories",
      "event.ticketingConfig",
      "event.ticketingConfig.ticketTypes",
      "event.organizationAgeGroups",
      "event.organizationAgeGroups.ageGroups",
      "organizationAgeGroups",
      "organization"
    ].join(",")
  );
  url.searchParams.set("where", JSON.stringify(where));
  return url.toString();
}

function mapLocalHopEvent(source, instance, orgById) {
  const rawEvent = instance.event || {};
  const title = stripHtml(rawEvent.name || instance.name || "");
  const summary = cleanImportedSummary(rawEvent.description || instance.description || "");
  if (!title || isClosureOrNonEvent(title, summary) || !localHopMatchesAgeGroups(source, instance, title)) {
    return null;
  }

  const startsAt = localHopWallIso(instance.standardStartDate?.iso);
  const endsAt = localHopWallIso(instance.standardEndDate?.iso);
  const sourceUrl = localHopEventUrl(source, instance);
  if (!startsAt || !sourceUrl) {
    return null;
  }

  const organization = instance.organization || orgById.get(rawEvent.organization?.objectId) || {};
  const addressObject = rawEvent.address || organization.address || {};
  const address = cleanAddress(localHopAddress(addressObject) || localHopAddress(organization.address) || source.library.address || "");
  const coordinates =
    localHopCoordinates(rawEvent.addressLatLng, instance.addressLatLng, organization.addressLatLng, source.library) || {};
  const venueName = stripHtml(addressObject.place || organization.address?.place || organization.name || source.library.name);
  const room = stripHtml(addressObject.room || "");
  const categories = normalizeLabelList(rawEvent.eventCategories ?? instance.eventCategories ?? []);
  const audiences = localHopAudienceLabels(instance);
  const allDay = instance.allDay === true || rawEvent.allDay === true;
  const cancelled = /cancel/i.test(`${instance.statusReason || ""} ${rawEvent.statusReason || ""}`);

  const event = {
    id: `${localHopSourceId(source)}-${instance.objectId}`,
    externalId: String(instance.objectId),
    sourceId: localHopSourceId(source),
    townId: source.library.townId || source.town.id,
    title,
    venue: [venueName, room].filter(Boolean).join(" · "),
    venueName,
    room: room || null,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: rawEvent.timezone || instance.timezone || TIMEZONE,
    durationMinutes: startsAt && endsAt && !allDay ? durationMinutes(startsAt, endsAt) : null,
    timeLabel: allDay ? "All day" : undefined,
    ages: inferAgeBandsFromText(title, summary, audiences.join(" "), categories.join(" ")),
    audiences,
    cost: categories.some((category) => /free/i.test(category)) ? 0 : null,
    registration: localHopRegistrationLabel(rawEvent),
    summary,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.library.eventsUrl,
    address: address || null,
    lat: coordinates.lat ?? libraryLat(source),
    lng: coordinates.lng ?? libraryLng(source),
    image: localHopFileUrl(rawEvent.photo),
    tags: categories,
    status: cancelled ? "review" : "published",
    confidence: coordinates.lat && coordinates.lng ? 0.9 : 0.82
  };

  if (rawEvent.virtual || instance.virtual || eventLooksOnline(event)) {
    markOnlineEvent(event);
  }
  return event;
}

async function importLocalHopEvents(sources, startDate, days) {
  const imported = [];

  for (const source of allLocalHopSources(sources)) {
    try {
      const config = await fetchLocalHopCalendarConfig(source.library);
      const organizationIds = localHopOrganizationIds(source, config);
      if (!organizationIds.length) {
        console.warn(`warning: could not import ${source.library.eventsUrl}: missing LocalHop organization ids`);
        continue;
      }

      const orgById = new Map((config?.calendarOrganizations || []).map((organization) => [organization.objectId, organization]));
      for (let skip = 0; ; skip += LOCALHOP_PAGE_LIMIT) {
        const data = await fetchJson(
          buildLocalHopInstancesUrl(source, config, organizationIds, startDate, days, skip),
          localHopHeaders()
        );
        const results = Array.isArray(data.results) ? data.results : [];
        results
          .map((instance) => mapLocalHopEvent(source, instance, orgById))
          .filter(Boolean)
          .forEach((event) => imported.push(event));
        if (results.length < LOCALHOP_PAGE_LIMIT) {
          break;
        }
      }
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }

  return [...new Map(imported.filter((event) => event.startsAt && event.sourceUrl).map((event) => [event.id, event])).values()];
}

function parseLibraryCalendarCards(html, baseUrl, source) {
  const cards = html.split(/<div(?=[^>]*class="[^"]*\blc-event\b)/i).slice(1);
  const events = [];
  const host = new URL(baseUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const idPrefix = source.library.idPrefix || host;

  cards.forEach((card) => {
    if (/\bnode--type-lc-closing\b|\blc-closing\b/i.test(card)) {
      return;
    }
    const linkMatch = card.match(/<a aria-label="([^"]+)" href="([^"]+)"/);
    if (!linkMatch) {
      return;
    }
    const selectorId = firstMatch(card, /data-drupal-selector="edit-([^"]+)"/) || slugFromUrl(linkMatch[2]);

    const actionLabel = decodeEntities(linkMatch[1]);
    const titleMatch = actionLabel.match(/^(?:View Details|Register Now) - "([\s\S]+)" on ([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}) @ (\d{1,2}:\d{2}(?:am|pm))$/i);
    if (!titleMatch) {
      return;
    }

    const [, title, datePart, timePart] = titleMatch;
    const audiences = [...card.matchAll(/This event is in the "([^"]+)" group/g)].map((match) => decodeEntities(match[1]));
    const description = cleanImportedSummary(firstMatch(card, /<div class="lc-list-event-description">([\s\S]*?)<\/div>/));
    if (isClosureOrNonEvent(title, description)) {
      return;
    }
    if (!hasChildAudience(audiences, title)) {
      return;
    }

    const startsAt = parseLocalDateTime(datePart, timePart);
    if (!startsAt) {
      return;
    }

    const sourceUrl = absoluteUrl(baseUrl, linkMatch[2]);
    events.push({
      id: `librarycalendar-${idPrefix}-${selectorId}`,
      externalId: selectorId,
      sourceId: `librarycalendar-${host}`,
      townId: source.library.townId || source.town.id,
      title: stripHtml(title),
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt: null,
      timezone: TIMEZONE,
      durationMinutes: null,
      ages: inferAgeBandsFromText(title, audiences.join(" "), description),
      audiences,
      cost: null,
      registration: actionLabel.startsWith("Register Now") ? "RSVP" : "See source",
      summary: description,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      status: "published",
      confidence: 0.8
    });
  });

  return events;
}

async function enrichLibraryCalendarDetails(events, source) {
  for (const event of events) {
    try {
      const html = await fetchText(event.sourceUrl);
      const detailEvent = parseJsonLdEvent(html);
      const details = jsonLdLocationDetails(detailEvent);
      if (details?.name || details?.address) {
        applyLibraryLocationDetails(event, source, details);
      } else if (eventLooksOnline(event)) {
        markOnlineEvent(event);
      }

      const startsAt = localIso(detailEvent?.startDate);
      const endsAt = localIso(detailEvent?.endDate);
      if (startsAt) {
        event.startsAt = startsAt;
      }
      if (endsAt) {
        event.endsAt = endsAt;
        event.durationMinutes = durationMinutes(event.startsAt, event.endsAt);
      }
      if (detailEvent?.image) {
        event.image = detailEvent.image;
      }
    } catch (error) {
      console.warn(`warning: could not enrich ${event.sourceUrl}: ${error.message}`);
      if (eventLooksOnline(event)) {
        markOnlineEvent(event);
      }
    }
  }
  return events;
}

async function importLibraryCalendarEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allLibraryCalendarSources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      const events = parseLibraryCalendarCards(html, source.library.eventsUrl, source).filter((event) =>
        isDateWithinWindow(String(event.startsAt || "").slice(0, 10), startDate, days)
      );
      imported.push(...(await enrichLibraryCalendarDetails(events, source)));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported;
}

function allEngagedPatronsLibrarySources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "engagedpatrons-list")
      .map((library) => ({ town, library }))
  );
}

function parseEngagedPatronsDateTime(value, startDate) {
  const normalized = collapseWhitespace(value)
    .replace(/\ba\.m\./gi, "AM")
    .replace(/\bp\.m\./gi, "PM")
    .replace(/\ba\.m\b/gi, "AM")
    .replace(/\bp\.m\b/gi, "PM");
  const dateMatch = normalized.match(
    /^[A-Za-z]+,\s+([A-Za-z]+)\.?\s+(\d{1,2}),\s+(.+?)$/i
  );
  if (!dateMatch) {
    return { startsAt: null, endsAt: null };
  }
  const month = MONTH_NAME_MAP.get(dateMatch[1].toLowerCase().slice(0, 3));
  if (!month) {
    return { startsAt: null, endsAt: null };
  }
  const day = String(dateMatch[2]).padStart(2, "0");
  let year = Number(startDate.slice(0, 4));
  if (`${year}-${month}-${day}` < startDate) {
    year += 1;
  }

  const formatTime = (hourRaw, minuteRaw, meridiemRaw) => {
    let hour = Number(hourRaw);
    const meridiem = meridiemRaw.toLowerCase();
    if (meridiem === "pm" && hour !== 12) {
      hour += 12;
    }
    if (meridiem === "am" && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, "0")}:${minuteRaw || "00"}:00`;
  };
  const dateKey = `${year}-${month}-${day}`;
  const timeMatch = dateMatch[3].match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|to|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i
  );
  if (timeMatch) {
    const startMeridiem = timeMatch[3] || timeMatch[6];
    return {
      startsAt: `${dateKey}T${formatTime(timeMatch[1], timeMatch[2], startMeridiem)}`,
      endsAt: `${dateKey}T${formatTime(timeMatch[4], timeMatch[5], timeMatch[6])}`
    };
  }
  const singleTimeMatch = dateMatch[3].match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!singleTimeMatch) {
    return { startsAt: null, endsAt: null };
  }
  const startsAt = `${dateKey}T${formatTime(singleTimeMatch[1], singleTimeMatch[2], singleTimeMatch[3])}`;
  return { startsAt, endsAt: addMinutes(startsAt, 60) };
}

function parseEngagedPatronsCards(html, source, calendarUrl, audience, startDate, days) {
  const cards = html.split('<div class="LEEventWrapper"').slice(1);
  const events = [];
  const siteId = firstMatch(calendarUrl, /SiteID=(\d+)/i) || slugify(source.library.name);
  cards.forEach((card) => {
    const titleMatch = card.match(/<div class="LETitle">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>/i);
    const eventId = firstMatch(card, /EventID=(\d+)/i);
    const dateText = stripHtml(firstMatch(card, /<div class="LEDate LEAgeRange">\s*([\s\S]*?)\s*<\/div>/i));
    if (!titleMatch || !eventId || !dateText) {
      return;
    }
    const title = stripHtml(titleMatch[2]);
    const description = cleanImportedSummary(firstMatch(card, /<div class="LEDescription">\s*([\s\S]*?)\s*<\/div>/i));
    if (isClosureOrNonEvent(title, description)) {
      return;
    }

    const { startsAt, endsAt } = parseEngagedPatronsDateTime(dateText, startDate);
    if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      return;
    }
    const audienceLabel = audience === "T" ? "Teens" : "Kids";
    if (!hasChildAudience([audienceLabel], title, description)) {
      return;
    }
    const branch = stripHtml(firstMatch(card, /<div class="LEBranch">\s*([\s\S]*?)\s*<\/div>/i));
    const venueName = displayVenueName(branch, source.library.name);
    const registrationLabel = stripHtml(firstMatch(card, /<input\b[^>]*class="button"[^>]*value="([^"]+)"/i));
    const sourceUrl = absoluteUrl(calendarUrl, titleMatch[1]);
    events.push({
      id: `engagedpatrons-${siteId}-${eventId}`,
      externalId: eventId,
      sourceId: `engagedpatrons-${siteId}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: venueName,
      venueName,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, audienceLabel, description),
      audiences: [audienceLabel],
      cost: "Free",
      registration: registrationLabel || "See source",
      summary: description,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: calendarUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      status: "published",
      confidence: 0.82
    });
  });
  return events;
}

async function importEngagedPatronsLibraryEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allEngagedPatronsLibrarySources(sources)) {
    const urls = source.library.eventUrls || [{ url: source.library.eventsUrl, audience: source.library.audience || "C" }];
    for (const entry of urls) {
      try {
        const html = await fetchText(entry.url);
        imported.push(...parseEngagedPatronsCards(html, source, entry.url, entry.audience, startDate, days));
      } catch (error) {
        console.warn(`warning: could not import ${entry.url}: ${error.message}`);
      }
    }
  }
  return imported;
}

function allMylibraryHomepageSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "mylibrary-homepage-events")
      .map((library) => ({ town, library }))
  );
}

function parseHomepageLibraryDateTime(value, startDate) {
  const normalized = collapseWhitespace(value)
    .replace(/\ba\.m\./gi, "AM")
    .replace(/\bp\.m\./gi, "PM")
    .replace(/\ba\.m\b/gi, "AM")
    .replace(/\bp\.m\b/gi, "PM");
  const match = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})\s+-\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) {
    return { startsAt: null, endsAt: null };
  }
  const month = MONTH_NAME_MAP.get(match[1].toLowerCase().slice(0, 3));
  if (!month) {
    return { startsAt: null, endsAt: null };
  }
  let year = Number(startDate.slice(0, 4));
  const day = String(match[2]).padStart(2, "0");
  if (`${year}-${month}-${day}` < startDate) {
    year += 1;
  }
  let hour = Number(match[3]);
  const meridiem = match[5].toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  const startsAt = `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${match[4] || "00"}:00`;
  return { startsAt, endsAt: addMinutes(startsAt, 60) };
}

function isFamilyCompatibleLibraryHomepageTitle(title) {
  if (!title || isClosureOrNonEvent(title)) {
    return false;
  }
  if (hasChildAudience([], title)) {
    return true;
  }
  return /\b(?:summer reading|music day|world music|hip hop|kickoff|challenge|game night|volunteer information)\b/i.test(title);
}

function isFamilyCompatibleMylibraryFeaturedTitle(title) {
  if (!title || isClosureOrNonEvent(title)) {
    return false;
  }
  if (hasChildAudience([], title)) {
    return true;
  }
  return /\b(?:summer reading|summer kickoff|kickoff|play-?doh|drum circle|juneteenth|family meal|library chef|craft|game|music|performance|extravaganza)\b/i.test(title);
}

function parseMylibraryHomepageEvents(html, source, startDate, days) {
  const sanitized = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ");
  const startIndex = sanitized.indexOf("Upcoming Events");
  const endIndex = sanitized.indexOf("View All Events", startIndex);
  if (startIndex === -1 || endIndex === -1) {
    return [];
  }
  const block = sanitized.slice(startIndex, endIndex);
  const cards = block.split('<li class="events"').slice(1);
  const imported = [];
  for (const card of cards) {
    const sourceUrl = firstMatch(card, /<a[^>]+href=["']([^"']+)["']/i);
    const title = stripHtml(firstMatch(card, /<h4[^>]*>([\s\S]*?)<\/h4>/i));
    const timeText = stripHtml(firstMatch(card, /<p class=["']time["'][^>]*>([\s\S]*?)<\/p>/i));
    const location = stripHtml(firstMatch(card, /<p class=["']location["'][^>]*>([\s\S]*?)<\/p>/i));
    const { startsAt, endsAt } = parseHomepageLibraryDateTime(timeText, startDate);
    if (!sourceUrl || !title || !startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    if (!isFamilyCompatibleLibraryHomepageTitle(title)) {
      continue;
    }
    const venue = location || source.library.name;
    imported.push({
      id: `mylibrary-homepage-${source.town.id}-${firstMatch(sourceUrl, /id=(\d+)/i) || slugify(title)}-${startsAt.slice(0, 10)}`,
      externalId: firstMatch(sourceUrl, /id=(\d+)/i) || slugify(title),
      sourceId: `mylibrary-homepage-${source.town.id}`,
      townId: source.library.townId || source.town.id,
      title,
      venue,
      venueName: venue,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title),
      audiences: hasChildAudience([], title) ? ["Kids"] : ["community"],
      cost: "Free",
      registration: "See source",
      summary: title,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl || source.library.website,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      tags: ["library", "mylibrary-homepage"],
      status: "published",
      confidence: 0.78
    });
  }
  return imported;
}

async function importMylibraryHomepageEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMylibraryHomepageSources(sources)) {
    try {
      const html = await fetchText(source.library.website);
      imported.push(...parseMylibraryHomepageEvents(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.website}: ${error.message}`);
    }
  }
  return imported;
}

function allNbfplStaticSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "nbfpl-static-events")
      .map((library) => ({ town, library }))
  );
}

function nbfplMonthDay(monthName, day, startDate) {
  const month = MONTH_NAME_MAP.get(String(monthName || "").toLowerCase().slice(0, 3));
  if (!month) {
    return null;
  }
  let year = Number(startDate.slice(0, 4));
  const dateKey = `${year}-${month}-${String(day).padStart(2, "0")}`;
  if (dateKey < startDate) {
    year += 1;
  }
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function nbfplTimeToIso(dateKey, timeText, fallbackMeridiem = "") {
  const match = String(timeText || "").match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!dateKey || !match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = String(match[3] || fallbackMeridiem || "").toLowerCase();
  if (meridiem.startsWith("p") && hour !== 12) {
    hour += 12;
  }
  if (meridiem.startsWith("a") && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function nbfplDatesFromMonthList(monthList, startDate) {
  const dates = [];
  let currentMonth = "";
  const normalized = monthList.replace(/\s*&\s*/g, ", ").replace(/\s+and\s+/gi, ", ");
  const tokens = normalized.split(/\s*,\s*/).map((token) => token.trim()).filter(Boolean);
  for (const token of tokens) {
    const withMonth = token.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (withMonth) {
      currentMonth = withMonth[1];
      const dateKey = nbfplMonthDay(currentMonth, withMonth[2], startDate);
      if (dateKey) {
        dates.push(dateKey);
      }
      continue;
    }
    const dayOnly = token.match(/^(\d{1,2})$/);
    if (dayOnly && currentMonth) {
      const dateKey = nbfplMonthDay(currentMonth, dayOnly[1], startDate);
      if (dateKey) {
        dates.push(dateKey);
      }
    }
  }
  return dates;
}

function nbfplWeekdayIndex(value) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(
    String(value || "").toLowerCase().replace(/s$/, "")
  );
}

function nbfplExpandWeekly(weekdayText, startKey, endKey) {
  const weekday = nbfplWeekdayIndex(weekdayText);
  if (weekday < 0 || !startKey || !endKey) {
    return [];
  }
  const dates = [];
  const cursor = new Date(`${startKey}T12:00:00-05:00`);
  const end = new Date(`${endKey}T12:00:00-05:00`);
  while (cursor.getDay() !== weekday && cursor <= end) {
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

function parseNbfplDateTimes(detailsText, startDate, days) {
  const details = collapseWhitespace(detailsText).replace(/\u00a0/g, " ");
  const fallbackMeridiem = (details.match(/\b([ap])\.?m\.?\b/gi) || []).at(-1) || "";
  const fromMatch = details.match(/\bfrom\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?\s+to\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i);
  const timeMatch = details.match(/\bat\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?/i);
  const startTime = fromMatch?.[1] || timeMatch?.[1];
  const startMeridiem = fromMatch?.[2] || timeMatch?.[2] || fallbackMeridiem;
  const endTime = fromMatch?.[3] || "";
  const endMeridiem = fromMatch?.[4] || startMeridiem;
  const dates = [];

  const rangeMatch = details.match(/\b(Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays),\s+([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2})/i);
  if (rangeMatch) {
    dates.push(...nbfplExpandWeekly(rangeMatch[1], nbfplMonthDay(rangeMatch[2], rangeMatch[3], startDate), nbfplMonthDay(rangeMatch[4], rangeMatch[5], startDate)));
  }

  const throughMatch = details.match(/\b(Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays)\s+at\b[\s\S]*?\bthrough\s+([A-Za-z]+)\s+(\d{1,2})/i);
  if (throughMatch) {
    dates.push(...nbfplExpandWeekly(throughMatch[1], startDate, nbfplMonthDay(throughMatch[2], throughMatch[3], startDate)));
  }

  const listMatch = details.match(/\b(?:Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays),\s+([A-Za-z]+[\s\S]*?),\s+at\b/i);
  if (listMatch && !rangeMatch) {
    dates.push(...nbfplDatesFromMonthList(listMatch[1], startDate));
  }

  const singleDatePattern = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s+\d{4})?/gi;
  let match;
  while ((match = singleDatePattern.exec(details))) {
    const dateKey = nbfplMonthDay(match[1], match[2], startDate);
    if (dateKey) {
      dates.push(dateKey);
    }
  }

  return [...new Set(dates)]
    .map((dateKey) => {
      const startsAt = nbfplTimeToIso(dateKey, startTime, startMeridiem);
      if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
        return null;
      }
      const endsAt = endTime ? nbfplTimeToIso(dateKey, endTime, endMeridiem) : addMinutes(startsAt, 60);
      return { startsAt, endsAt };
    })
    .filter(Boolean);
}

function parseNbfplStaticEvents(html, source, startDate, days) {
  const blocks = html.split(/<div class=["']event["']>/i).slice(1);
  const imported = [];
  for (const block of blocks) {
    const title = stripHtml(firstMatch(block, /<h3\b[^>]*class=["']event-title["'][^>]*>([\s\S]*?)<\/h3>/i));
    const details = stripHtml(firstMatch(block, /<p\b[^>]*class=["']details["'][^>]*>([\s\S]*?)<\/p>/i));
    const summary = cleanImportedSummary(firstMatch(block, /<p(?!\b[^>]*class=["']details["'])[^>]*>([\s\S]*?)<\/p>/i));
    const text = `${title} ${details} ${summary}`;
    if (!title || isClosureOrNonEvent(title, summary) || !hasChildAudience([], text)) {
      continue;
    }
    const times = parseNbfplDateTimes(details, startDate, days);
    if (!times.length) {
      continue;
    }
    const sourceUrl = firstMatch(block, /<a\b[^>]*href=["']([^"']+)["']/i);
    const url = sourceUrl ? absoluteUrl(source.library.eventsUrl || source.library.website, sourceUrl) : source.library.eventsUrl;
    const room = firstMatch(details, /\bin\s+the\s+([^.,]+(?:Room|Library|Makerspace|Teen Room))/i) || firstMatch(details, /\bin\s+([^.,]+Teen Room)/i);
    for (const { startsAt, endsAt } of times) {
      imported.push({
        id: `nbfpl-static-${slugify(title)}-${startsAt.slice(0, 10)}-${startsAt.slice(11, 16).replace(":", "")}`,
        externalId: `${slugify(title)}-${startsAt}`,
        sourceId: "nbfpl-static-events",
        townId: source.library.townId || source.town.id,
        title,
        venue: room || source.library.name,
        venueName: source.library.name,
        category: "library",
        source: source.library.name,
        startsAt,
        endsAt,
        timezone: TIMEZONE,
        durationMinutes: durationMinutes(startsAt, endsAt),
        ages: inferAgeBandsFromText(text),
        audiences: hasChildAudience([], text) ? ["Kids", "Families"] : ["community"],
        cost: "Free",
        registration: /register|registration|required/i.test(text) ? "RSVP" : "Drop-in",
        summary: summary || title,
        url,
        sourceUrl: url,
        sourceCalendarUrl: source.library.eventsUrl,
        address: source.library.address || null,
        lat: libraryLat(source),
        lng: libraryLng(source),
        tags: ["library", "nbfpl-static"],
        status: "published",
        confidence: 0.78
      });
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importNbfplStaticEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allNbfplStaticSources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl || source.library.website);
      imported.push(...parseNbfplStaticEvents(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl || source.library.website}: ${error.message}`);
    }
  }
  return imported;
}

function allAssabetRssSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "assabet-rss")
      .map((library) => ({ town, library }))
  );
}

function parseAssabetPubDate(value) {
  const match = String(value || "").match(/\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  const month = MONTH_NAME_MAP.get(match[2].toLowerCase());
  if (!month) {
    return null;
  }
  return `${match[3]}-${month}-${String(match[1]).padStart(2, "0")}T${String(match[4]).padStart(2, "0")}:${match[5]}:00`;
}

function parseAssabetEndTime(description, startsAt) {
  const firstParagraph = stripHtml(firstMatch(description, /<p>([\s\S]*?)<\/p>/i));
  const range = firstParagraph.match(/(\d{1,2})(?::(\d{2}))?\s*(?:AM|PM)?\s*(?:—|&mdash;|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!range || !startsAt) {
    return startsAt ? addMinutes(startsAt, 60) : null;
  }
  let hour = Number(range[3]);
  const minute = range[4] || "00";
  if (range[5].toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (range[5].toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${startsAt.slice(0, 10)}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function hasAssabetFamilyCategory(categories, title, summary) {
  const labels = categories.map((category) => category.toLowerCase());
  if (labels.some((category) => /\b(?:children|child|teen|tween|family|families|all ages|infant|toddler|prek|pre-k|elementary|middle school|young adult)\b/.test(category))) {
    return true;
  }
  if (labels.some((category) => /\badult\b/.test(category))) {
    return false;
  }
  return hasChildAudience(categories, `${title} ${summary}`);
}

function parseAssabetRssEvents(xml, source, startDate, days) {
  const host = new URL(source.library.eventsUrl || source.library.website).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const items = xml.split(/<item>/i).slice(1);
  const imported = [];
  for (const item of items) {
    const title = stripHtml(firstMatch(item, /<title>([\s\S]*?)<\/title>/i));
    const link = stripHtml(firstMatch(item, /<link>([\s\S]*?)<\/link>/i) || firstMatch(item, /<guid>([\s\S]*?)<\/guid>/i));
    const description = firstMatch(item, /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || firstMatch(item, /<description>([\s\S]*?)<\/description>/i);
    const categories = [...item.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((match) => stripHtml(match[1]));
    const summary = cleanImportedSummary(description, { title, venueName: source.library.name });
    if (!title || isClosureOrNonEvent(title, summary) || !hasAssabetFamilyCategory(categories, title, summary)) {
      continue;
    }
    const startsAt = parseAssabetPubDate(firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i));
    if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    const endsAt = parseAssabetEndTime(description, startsAt);
    const image = firstMatch(item, /<media:content\b[^>]*url=["']([^"']+)["']/i);
    const venue = stripHtml(firstMatch(description, /<\/p><p>([\s\S]*?)<br\s*\/?>/i)) || source.library.name;
    imported.push({
      id: `assabet-rss-${host}-${slugFromUrl(link) || slugify(title)}-${startsAt.slice(0, 10)}`,
      externalId: slugFromUrl(link) || `${slugify(title)}-${startsAt.slice(0, 10)}`,
      sourceId: `assabet-rss-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: startsAt && endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, summary, categories.join(" ")),
      audiences: categories,
      cost: "Free",
      registration: /register online|registration/i.test(description) ? "RSVP" : "See source",
      summary: summary || title,
      url: link || source.library.eventsUrl,
      sourceUrl: link || source.library.eventsUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      image: image || null,
      tags: ["library", "assabet-rss", ...categories].filter(Boolean),
      status: "published",
      confidence: 0.84
    });
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importAssabetRssEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allAssabetRssSources(sources)) {
    try {
      const xml = await fetchText(source.library.eventsUrl);
      imported.push(...parseAssabetRssEvents(xml, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported;
}

function allEventsManagerGridSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "events-manager-grid")
      .map((library) => ({ town, library }))
  );
}

function allModernEventsCalendarLibrarySources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "modern-events-calendar-html")
      .map((library) => ({ town, library }))
  );
}

function eventsManagerGridUrl(source, page) {
  const url = new URL(source.library.eventsUrl);
  if (page > 1) {
    url.searchParams.set("pno", String(page));
  }
  return url.toString();
}

function parseEventsManagerGridTime(dateText, timeText) {
  const time = collapseWhitespace(timeText).replace(/\s+/g, "").replace(/\./g, "");
  const [startText, endText] = time.split(/\s*-\s*/);
  const startsAt = parseLocalDateTime(dateText, startText || "");
  const endsAt = endText ? parseLocalDateTime(dateText, endText) : startsAt ? addMinutes(startsAt, 60) : null;
  return { startsAt, endsAt };
}

function parseEventsManagerGridEvents(html, source, startDate, days) {
  const host = new URL(source.library.eventsUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const blocks = html.split(/<div class=["']em-event em-item["'][^>]*>/i).slice(1);
  const imported = [];
  for (const block of blocks) {
    const sourceUrl = firstMatch(block, /<h3\b[^>]*class=["']em-item-title["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["']/i) || firstMatch(block, /data-href=["']([^"']+)["']/i);
    const title = stripHtml(firstMatch(block, /<h3\b[^>]*class=["']em-item-title["'][^>]*>([\s\S]*?)<\/h3>/i));
    const dateText = stripHtml(firstMatch(block, /em-event-date[\s\S]*?<span\b[^>]*><\/span>([\s\S]*?)<\/div>/i));
    const timeText = stripHtml(firstMatch(block, /em-event-time[\s\S]*?<span\b[^>]*><\/span>([\s\S]*?)<\/div>/i));
    const categories = [...block.matchAll(/aria-label=["']([^"']+?)\s+Audience["']/gi)].map((match) => stripHtml(match[1]));
    const tagText = stripHtml(firstMatch(block, /em-event-tags[\s\S]*?<div>([\s\S]*?)<\/div>/i));
    if (!title || isClosureOrNonEvent(title, tagText) || !hasChildAudience(categories, `${title} ${tagText}`)) {
      continue;
    }
    const { startsAt, endsAt } = parseEventsManagerGridTime(dateText, timeText);
    if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    imported.push({
      id: `events-manager-grid-${host}-${slugFromUrl(sourceUrl) || slugify(title)}-${startsAt.slice(0, 10)}`,
      externalId: slugFromUrl(sourceUrl) || `${slugify(title)}-${startsAt}`,
      sourceId: `events-manager-grid-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: startsAt && endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, categories.join(" "), tagText),
      audiences: categories,
      cost: "Free",
      registration: "See source",
      summary: tagText || `${categories.join(", ")} library event.`,
      url: absoluteUrl(source.library.eventsUrl, sourceUrl || source.library.eventsUrl),
      sourceUrl: absoluteUrl(source.library.eventsUrl, sourceUrl || source.library.eventsUrl),
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      tags: ["library", "events-manager-grid", ...categories].filter(Boolean),
      status: "published",
      confidence: 0.78
    });
  }
  return imported;
}

async function importEventsManagerGridEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allEventsManagerGridSources(sources)) {
    const maxPages = Math.max(1, Number(source.library.maxPages || 12));
    for (let page = 1; page <= maxPages; page += 1) {
      try {
        const html = await fetchText(eventsManagerGridUrl(source, page));
        const pageEvents = parseEventsManagerGridEvents(html, source, startDate, days);
        imported.push(...pageEvents);
        if (!html.includes(`pno=${page + 1}`) && !html.includes(`title="${page + 1}"`)) {
          break;
        }
      } catch (error) {
        console.warn(`warning: could not import ${eventsManagerGridUrl(source, page)}: ${error.message}`);
        break;
      }
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function parseMecClockTime(dateKey, value) {
  const match = collapseWhitespace(value).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function parseMecDateKey(article, fallbackYear) {
  const monthText = stripHtml(firstMatch(article, /<div class="mec-event-date[\s\S]*?<span>([\s\S]*?)<\/span>/i));
  const dayText = stripHtml(firstMatch(article, /<div class="mec-event-date[\s\S]*?<\/span>\s*(\d{1,2})/i));
  const month = MONTH_NAME_MAP.get(monthText.toLowerCase().slice(0, 3));
  if (!month || !dayText) {
    return null;
  }
  return `${fallbackYear}-${month}-${String(Number(dayText)).padStart(2, "0")}`;
}

function parseModernEventsCalendarHtml(html, source, startDate, days) {
  const host = new URL(source.library.eventsUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const fallbackYear = firstMatch(html, /<div class="mec-month-divider"[^>]*><h5[^>]*>[A-Za-z]+\s+(\d{4})<\/h5>/i) || startDate.slice(0, 4);
  const articles = html.split(/<article class="[^"]*mec-event-article[^"]*"[^>]*>/i).slice(1);
  const imported = [];
  for (const article of articles) {
    const sourceUrl = firstMatch(article, /<h4 class="mec-event-title">[\s\S]*?<a\b[^>]*href="([^"]+)"/i);
    const eventId = firstMatch(article, /data-event-id="([^"]+)"/i) || slugFromUrl(sourceUrl);
    const rawTitle = stripHtml(firstMatch(article, /<h4 class="mec-event-title">[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i));
    const title = collapseWhitespace(rawTitle.replace(/\bSold Out\b/gi, ""));
    const labels = [...article.matchAll(/<span[^>]*class="mec-label-normal"[^>]*>([\s\S]*?)<\/span>/gi)].map((match) =>
      stripHtml(match[1])
    );
    const categories = [...article.matchAll(/<li class="mec-category">[\s\S]*?<a\b[^>]*>([\s\S]*?)(?:<span|\<\/a>)/gi)].map(
      (match) => stripHtml(match[1])
    );
    const audiences = [...new Set([...labels, ...categories].filter(Boolean))];
    if (!title || isClosureOrNonEvent(title, audiences.join(" ")) || !hasChildAudience(audiences, title)) {
      continue;
    }
    const dateKey = parseMecDateKey(article, fallbackYear);
    const startTime = stripHtml(firstMatch(article, /<span class="mec-start-time">([\s\S]*?)<\/span>/i));
    const endTime = stripHtml(firstMatch(article, /<span class="mec-end-time">([\s\S]*?)<\/span>/i));
    const startsAt = dateKey && startTime ? parseMecClockTime(dateKey, startTime) : null;
    let endsAt = dateKey && endTime ? parseMecClockTime(dateKey, endTime) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      endsAt = addMinutes(startsAt, 60);
    }
    if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    const absoluteSourceUrl = absoluteUrl(source.library.eventsUrl, sourceUrl || source.library.eventsUrl);
    imported.push({
      id: `modern-events-calendar-${host}-${eventId}-${startsAt.slice(0, 10)}`,
      externalId: eventId || `${slugify(title)}-${startsAt}`,
      sourceId: `modern-events-calendar-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt: endsAt || addMinutes(startsAt, 60),
      timezone: TIMEZONE,
      durationMinutes: durationMinutes(startsAt, endsAt || addMinutes(startsAt, 60)),
      ages: inferAgeBandsFromText(title, audiences.join(" ")),
      audiences,
      cost: "Free",
      registration: rawTitle.includes("Sold Out") ? "Sold out / see source" : "See source",
      summary: `${audiences.join(", ")} library event.`,
      url: absoluteSourceUrl,
      sourceUrl: absoluteSourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      tags: ["library", "modern-events-calendar", ...audiences].filter(Boolean),
      status: "published",
      confidence: 0.78
    });
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importModernEventsCalendarHtmlEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allModernEventsCalendarLibrarySources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      imported.push(...parseModernEventsCalendarHtml(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported;
}

function allMylibraryCarouselSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "mylibrary-featured-carousel")
      .map((library) => ({ town, library }))
  );
}

function parseMylibraryCarouselDate(value, startDate) {
  const match = collapseWhitespace(value).match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
  if (!match) {
    return null;
  }
  const month = MONTH_NAME_MAP.get(match[1].toLowerCase().slice(0, 3));
  if (!month) {
    return null;
  }
  const day = String(match[2]).padStart(2, "0");
  let year = Number(startDate.slice(0, 4));
  if (`${year}-${month}-${day}` < startDate) {
    year += 1;
  }
  return `${year}-${month}-${day}T00:00:00`;
}

function parseMylibraryCarouselEvents(html, source, startDate, days) {
  const cards = html.split('<div class="carousel-item').slice(1);
  const host = new URL(source.library.eventsUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const imported = [];
  for (const card of cards) {
    const href = firstMatch(card, /<a\b[^>]*href=["']([^"']*\/event\?id=\d+[^"']*)["']/i);
    const title = stripHtml(firstMatch(card, /data-original-title=["']([^"']+)["']/i) || firstMatch(card, /<img\b[^>]*alt=["']([^"']+)["']/i));
    const dateText = stripHtml(firstMatch(card, /<small>\s*-\s*([\s\S]*?)<\/small>/i));
    const startsAt = parseMylibraryCarouselDate(dateText, startDate);
    if (!href || !title || !startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    if (!isFamilyCompatibleMylibraryFeaturedTitle(title)) {
      continue;
    }
    const eventId = firstMatch(href, /id=(\d+)/i) || slugFromUrl(href);
    const sourceUrl = absoluteUrl(source.library.eventsUrl, href);
    imported.push({
      id: `mylibrary-carousel-${host}-${eventId}`,
      externalId: eventId,
      sourceId: `mylibrary-carousel-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt: null,
      timezone: TIMEZONE,
      durationMinutes: null,
      ages: inferAgeBandsFromText(title, "Featured"),
      audiences: ["Featured"],
      cost: null,
      registration: "See source",
      summary: `Featured library event listed for ${dateText}.`,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      tags: ["mylibrary-featured"],
      status: "published",
      confidence: 0.72
    });
  }
  return imported;
}

async function importMylibraryCarouselEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMylibraryCarouselSources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      imported.push(...parseMylibraryCarouselEvents(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function allSquarespaceLibrarySources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "squarespace-library-calendar")
      .map((library) => ({ town, library }))
  );
}

function isFamilyCompatibleSquarespaceLibraryTitle(title, summary = "") {
  const text = `${title} ${summary}`;
  if (!title || isClosureOrNonEvent(title, summary)) {
    return false;
  }
  if (/\b(?:adult|book club|chocolate tasting|lecture|documentary|delayed opening)\b/i.test(text) && !/\b(?:teen|kids|children|family|ages?\s+\d)/i.test(text)) {
    return false;
  }
  return (
    hasChildAudience([], text) ||
    /\b(?:ages?\s+\d|d&d|dungeons?|grab\s*&\s*go|pride prom|magic|summer reading|craft|storytime|story time|mummy|teen relationships)\b/i.test(text)
  );
}

function parseSquarespaceLibraryCalendar(html, source, startDate, days) {
  const imported = [];
  const articlePattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  const baseUrl = source.library.eventsUrl || source.library.website;
  const host = new URL(baseUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();

  function pushEvent({ title, href, summary, timing, image }) {
    if (!title || !href || !timing.startDate || !isFamilyCompatibleSquarespaceLibraryTitle(title, summary)) {
      return;
    }
    const startsAt = localDateTime(timing.startDate, timing.startTime);
    if (!eventStartsWithinWindow(startsAt, startDate, days)) {
      return;
    }
    const endsAt = timing.endTime ? localDateTime(timing.startDate, timing.endTime) : null;
    const sourceUrl = absoluteUrl(baseUrl, href);
    const eventId = slugFromUrl(sourceUrl) || slugify(title);
    imported.push({
      id: `squarespace-library-${host}-${eventId}-${startsAt.slice(0, 10)}`,
      externalId: `${eventId}-${startsAt}`,
      sourceId: `squarespace-library-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, summary),
      audiences: hasChildAudience([], `${title} ${summary}`) ? ["Kids", "Families"] : ["community"],
      cost: "Free",
      registration: /sign up|register|registration|forms/i.test(summary) ? "RSVP" : "See source",
      summary: summary || title,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: baseUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      image: image ? absoluteUrl(baseUrl, image) : null,
      tags: ["library", "squarespace"],
      status: "published",
      confidence: 0.82
    });
  }

  for (const match of html.matchAll(articlePattern)) {
    const attrs = match[1];
    const block = match[2];
    if (!/\beventlist-event\b/i.test(attrs) || /\beventlist-event--past\b/i.test(attrs)) {
      continue;
    }
    const title = stripHtml(firstMatch(block, /<h1\b[^>]*class=["'][^"']*\beventlist-title\b[^"']*["'][^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i));
    const href = firstMatch(block, /<h1\b[^>]*class=["'][^"']*\beventlist-title\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["']/i);
    const summary = cleanImportedSummary(firstMatch(block, /<div\b[^>]*class=["'][^"']*\beventlist-description\b[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>\s*<a\b|<\/article>)/i));
    const timing = parseSquarespaceEventListTime(block);
    const image = firstMatch(block, /<img\b[^>]*(?:data-src|data-image)=["']([^"']+)["']/i);
    pushEvent({ title, href, summary, timing, image });
  }

  const summaryItemPattern =
    /<div\b[^>]*class=["'][^"']*\bsummary-item\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bsummary-item\b|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>|<\/section>)/gi;
  for (const match of html.matchAll(summaryItemPattern)) {
    const block = match[1];
    const title =
      stripHtml(firstMatch(block, /<a\b[^>]*class=["'][^"']*\bsummary-title-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)) ||
      stripHtml(firstMatch(block, /data-title=["']([^"']+)["']/i));
    const href =
      firstMatch(block, /<a\b[^>]*class=["'][^"']*\bsummary-title-link\b[^"']*["'][^>]*href=["']([^"']+)["']/i) ||
      firstMatch(block, /<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bsummary-thumbnail-container\b/i);
    const dateText = stripHtml(firstMatch(block, /<time\b[^>]*class=["'][^"']*\bsummary-metadata-item--date\b[^"']*["'][^>]*>([\s\S]*?)<\/time>/i));
    const dateMatch = dateText.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
    const month = dateMatch ? MONTHS.get(dateMatch[1].toLowerCase()) : null;
    const timing = {
      startDate: month ? `${dateMatch[3]}-${month}-${String(dateMatch[2]).padStart(2, "0")}` : "",
      endDate: "",
      startTime: "12:00",
      endTime: null
    };
    const timeText = stripHtml(firstMatch(block, /<span\b[^>]*class=["'][^"']*\bevent-time-24hr\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const timeMatch = collapseWhitespace(timeText).match(/(\d{2}:\d{2})(?:\s*(?:-|–|—|to)\s*(\d{2}:\d{2}))?/);
    if (timeMatch) {
      timing.startTime = timeMatch[1];
      timing.endTime = timeMatch[2] || null;
    }
    const summary = cleanImportedSummary(firstMatch(block, /<div\b[^>]*class=["'][^"']*\bsummary-excerpt\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
    const image = firstMatch(block, /<img\b[^>]*(?:data-src|data-image)=["']([^"']+)["']/i);
    pushEvent({ title, href, summary, timing, image });
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importSquarespaceLibraryEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allSquarespaceLibrarySources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl || source.library.website);
      imported.push(...parseSquarespaceLibraryCalendar(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl || source.library.website}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function allLibCalSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "libcal-list")
      .map((library) => ({ town, library }))
  );
}

function libCalDateTime(event, key, dateKey) {
  const value = event[`${key}dt`] || event[key];
  if (!value) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    return localIso(String(value));
  }
  const timeMatch = String(value).match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!timeMatch || !dateKey) {
    return null;
  }
  let hour = Number(timeMatch[1]);
  if (timeMatch[3].toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  }
  if (timeMatch[3].toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${timeMatch[2]}:00`;
}

function buildLibCalListUrl(source, dateKey, page = 1) {
  const calendarUrl = new URL(source.library.eventsUrl);
  const ajaxUrl = new URL("/ajax/calendar/list", calendarUrl.origin);
  ajaxUrl.searchParams.set("c", source.library.calendarIds.join(","));
  ajaxUrl.searchParams.set("date", dateKey);
  ajaxUrl.searchParams.set("perpage", "100");
  ajaxUrl.searchParams.set("page", String(page));
  ajaxUrl.searchParams.set("audience", source.library.audienceIds.join(","));
  ajaxUrl.searchParams.set("cats", "");
  ajaxUrl.searchParams.set("camps", "");
  ajaxUrl.searchParams.set("inc", "0");
  return ajaxUrl.toString();
}

function mapLibCalEvent(source, event, calendarUrl, dateKey) {
  const audiences = normalizeLabelList(event.audiences ?? []);
  const categories = normalizeLabelList(event.categories_arr ?? event.categories ?? []);
  const summary = cleanImportedSummary(event.shortdesc || event.description || "");
  if (isClosureOrNonEvent(event.title, summary) || !hasChildAudience(audiences, event.title)) {
    return null;
  }

  const startsAt = libCalDateTime(event, "start", dateKey);
  const endsAt = libCalDateTime(event, "end", dateKey);
  const url = absoluteUrl(source.library.eventsUrl, event.url || `/event/${event.id}`);
  const knownLocation = findKnownLibraryLocation(source, { name: event.location || "" });
  const knownCoordinates = locationCoordinates(knownLocation);
  const address = cleanAddress(locationAddress(knownLocation) || source.library.address || "");
  const venueName = knownLocation?.name || source.library.name;
  return {
    id: `libcal-${source.library.siteId || calendarUrl.host}-${event.id}`,
    externalId: String(event.id),
    sourceId: `libcal-${calendarUrl.host}`,
    townId: source.library.townId || source.town.id,
    title: stripHtml(event.title),
    venue: knownLocation?.name || event.location || source.library.name,
    venueName,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: startsAt && endsAt ? durationMinutes(startsAt, endsAt) : null,
    ages: inferAgeBandsFromText(event.title, audiences.join(" "), categories.join(" "), summary),
    audiences,
    cost: event.registration_cost ?? null,
    registration: event.registration_enabled ? "RSVP" : "See source",
    summary,
    url,
    sourceUrl: url,
    sourceCalendarUrl: source.library.eventsUrl,
    address: address || null,
    lat: knownCoordinates?.lat || libraryLat(source),
    lng: knownCoordinates?.lng || libraryLng(source),
    image: event.featured_image || null,
    tags: categories,
    status: "published",
    confidence: knownLocation ? 0.9 : 0.82
  };
}

async function importLibCalEvents(sources, startDate, days) {
  const imported = [];

  for (const source of allLibCalSources(sources)) {
    const calendarUrl = new URL(source.library.eventsUrl);
    for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
      const dateKey = addDateDays(startDate, dayOffset);
      try {
        const firstPage = await fetchJson(buildLibCalListUrl(source, dateKey, 1));
        const pageCount = Math.max(1, Math.ceil(Number(firstPage.total_results || 0) / Number(firstPage.perpage || 100)));
        const pages = [firstPage];
        for (let page = 2; page <= pageCount; page += 1) {
          pages.push(await fetchJson(buildLibCalListUrl(source, dateKey, page)));
        }

        pages
          .flatMap((data) => data.results ?? [])
          .map((event) => mapLibCalEvent(source, event, calendarUrl, dateKey))
          .filter(Boolean)
          .forEach((event) => imported.push(event));
      } catch (error) {
        console.warn(`warning: could not import ${source.library.eventsUrl} for ${dateKey}: ${error.message}`);
      }
    }
  }

  return [...new Map(imported.filter((event) => event.startsAt && event.sourceUrl).map((event) => [event.id, event])).values()];
}

function allEventOrganiserSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "eventorganiser-fullcal")
      .map((library) => ({ town, library }))
  );
}

function buildEventOrganiserUrl(source, startDate, days) {
  const ajaxUrl = new URL(source.library.ajaxUrl || "/wp-admin/admin-ajax.php", source.library.website);
  ajaxUrl.searchParams.set("action", "eventorganiser-fullcal");
  ajaxUrl.searchParams.set("start", startDate);
  ajaxUrl.searchParams.set("end", addDateDays(startDate, days));
  ajaxUrl.searchParams.set("timeformat", "g:i a");
  ajaxUrl.searchParams.set("users_events", "false");
  if (source.library.categorySlugs?.length) {
    ajaxUrl.searchParams.set("category", source.library.categorySlugs.join(","));
  }
  return ajaxUrl.toString();
}

function mapEventOrganiserEvent(source, rawEvent) {
  const rawTitle = stripHtml(rawEvent.title || rawEvent.event_title || "");
  const categories = normalizeLabelList(rawEvent.category ?? rawEvent.categories ?? []);
  const summary = cleanImportedSummary(rawEvent.description || rawEvent.excerpt || "");
  const title = importedDisplayTitle(rawTitle, summary);
  if (!title || isClosureOrNonEvent(title, summary)) {
    return null;
  }
  if (!hasChildAudience(categories, title) && !hasChildAudience([], `${title} ${summary}`)) {
    return null;
  }

  const startsAt = localIso(rawEvent.start || rawEvent.startDate || rawEvent.start_date);
  const endsAt = localIso(rawEvent.end || rawEvent.endDate || rawEvent.end_date);
  const sourceUrl = absoluteUrl(source.library.website, rawEvent.url || rawEvent.link || source.library.eventsUrl);
  const host = new URL(source.library.website).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const eventSlug = slugFromUrl(sourceUrl) || slugify(`${title}-${startsAt}`);
  const allDay = rawEvent.allDay === true || rawEvent.allDay === "true";

  return {
    id: `eventorganiser-${host}-${eventSlug}-${slugify(startsAt)}`,
    externalId: String(rawEvent.event_id || rawEvent.id || eventSlug),
    sourceId: `eventorganiser-${host}`,
    townId: source.library.townId || source.town.id,
    title,
    venue: rawEvent.venue || rawEvent.venue_name || source.library.name,
    venueName: source.library.name,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: startsAt && endsAt && !allDay ? durationMinutes(startsAt, endsAt) : null,
    timeLabel: allDay ? "All day" : undefined,
    ages: inferAgeBandsFromText(title, summary, categories.join(" ")),
    audiences: categories,
    cost: null,
    registration: "See source",
    summary,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.library.eventsUrl,
    address: source.library.address || null,
    lat: libraryLat(source),
    lng: libraryLng(source),
    tags: categories,
    status: "published",
    confidence: 0.86
  };
}

async function importEventOrganiserEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allEventOrganiserSources(sources)) {
    try {
      const data = await fetchJson(buildEventOrganiserUrl(source, startDate, days));
      (Array.isArray(data) ? data : data.events ?? [])
        .map((event) => mapEventOrganiserEvent(source, event))
        .filter(Boolean)
        .forEach((event) => imported.push(event));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function allJoomlaEventBookingSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "joomla-event-booking-calendar")
      .map((library) => ({ town, library }))
  );
}

function extractJoomlaEventBookingDetailSummary(html) {
  const detailBlock = firstMatch(
    html,
    /<div\b[^>]*class=["'][^"']*\beb-description-details\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*id=["']eb-event-info/i
  );
  const summary = cleanImportedSummary(detailBlock);
  if (summary) {
    return summary;
  }
  const metaDescription =
    firstMatch(html, /<meta\b(?=[^>]*property=["']og:description["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>/i) ||
    firstMatch(html, /<meta\b(?=[^>]*name=["']description["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>/i);
  return cleanImportedSummary(metaDescription);
}

function parseJoomlaEventBookingCalendar(html, source, startDate, days) {
  const events = [];
  const host = new URL(source.library.website).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const anchors = html.matchAll(/<a\b(?=[^>]*\beb_event_link\b)[^>]*>[\s\S]*?<\/a>/gi);

  for (const anchorMatch of anchors) {
    const anchor = anchorMatch[0];
    const href = getAttr(anchor, "href");
    const tooltipText = stripHtml(getAttr(anchor, "title"));
    const visibleText = stripHtml(anchor);
    const tooltipTitle = firstMatch(tooltipText, /^Event\s+([\s\S]*?)\s+Event Date\b/i);
    const title = stripHtml(tooltipTitle || visibleText.replace(/\s*\(\d{1,2}:\d{2}\s*(?:am|pm)\)\s*$/i, ""));
    const startRaw = firstMatch(
      tooltipText,
      /Event Date\s+(\d{1,2}-\d{1,2}-\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i
    );
    const endRaw = firstMatch(
      tooltipText,
      /Event End Date\s+(\d{1,2}-\d{1,2}-\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i
    );
    const startsAt = parseUsNumericDateTime(startRaw);
    const endsAt = endRaw ? parseUsNumericDateTime(endRaw) : null;

    if (!title || !startsAt || !href || isClosureOrNonEvent(title, tooltipText)) {
      continue;
    }
    if (!isDateWithinWindow(startsAt.slice(0, 10), startDate, days)) {
      continue;
    }

    const sourceUrl = absoluteUrl(source.library.website, href);
    const price = firstMatch(tooltipText, /Individual Price\s+([^\s][\s\S]*?)$/i);
    events.push({
      id: `joomla-eventbooking-${host}-${slugFromUrl(sourceUrl)}-${startsAt.slice(0, 10)}`,
      externalId: slugFromUrl(sourceUrl),
      sourceId: `joomla-eventbooking-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, tooltipText),
      cost: /free/i.test(price) ? 0 : null,
      registration: /Registration Start Date|Cut Off Date|Available Place/i.test(tooltipText) ? "RSVP" : "See source",
      summary: "",
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      status: "published",
      confidence: 0.84
    });
  }

  return events;
}

async function enrichJoomlaEventBookingSummaries(events) {
  for (const event of events) {
    if (!event.sourceUrl) {
      continue;
    }
    try {
      const detailHtml = await fetchText(event.sourceUrl);
      const summary = extractJoomlaEventBookingDetailSummary(detailHtml);
      if (summary) {
        event.summary = summary;
        event.confidence = Math.max(Number(event.confidence || 0), 0.88);
      }
    } catch (error) {
      console.warn(`warning: could not enrich Joomla summary for ${event.sourceUrl}: ${error.message}`);
    }
  }
  return events;
}

async function importJoomlaEventBookingEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allJoomlaEventBookingSources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      imported.push(...parseJoomlaEventBookingCalendar(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return enrichJoomlaEventBookingSummaries(imported.filter((event) => event.startsAt && event.sourceUrl));
}

function allJoomlaJEventsLibrarySources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "joomla-jevents-calendar")
      .map((library) => ({ town, library }))
  );
}

function parseJEventsStartEnd(text) {
  const normalized = collapseWhitespace(text);
  const match = normalized.match(
    /([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}\s*(?:am|pm))(?:\s*-\s*(\d{1,2}:\d{2}\s*(?:am|pm)))?/i
  );
  if (!match) {
    return { startsAt: null, endsAt: null };
  }
  const startsAt = parseLocalDateTime(match[1], match[2].replace(/\s+/g, ""));
  const endsAt = match[3] ? parseLocalDateTime(match[1], match[3].replace(/\s+/g, "")) : null;
  return { startsAt, endsAt };
}

function extractAssignedJsonObject(html, variableName) {
  const marker = new RegExp(`var\\s+${variableName}\\s*=\\s*`, "i");
  const match = marker.exec(html);
  if (!match) {
    return "";
  }
  const open = html.indexOf("{", match.index + match[0].length);
  if (open === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = open; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(open, index + 1);
      }
    }
  }
  return "";
}

function parseJEventsResponsiveEvents(html, source, startDate, days) {
  const rawJson = extractAssignedJsonObject(html, "responsiveEvents");
  if (!rawJson) {
    return [];
  }

  let buckets;
  try {
    buckets = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const host = new URL(source.library.website || source.library.eventsUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();
  const events = [];
  Object.values(buckets).flat().forEach((item) => {
    const block = item.eventcontent || "";
    const title = stripHtml(firstMatch(block, /<a\b[^>]*class=["']ev_link_row["'][^>]*title=["']([^"']+)["']/i));
    const href = firstMatch(block, /<a\b[^>]*class=["']ev_link_row["'][^>]*href=["']([^"']+)["']/i);
    const category = stripHtml(firstMatch(block, /::\s*&nbsp;\s*([^<]+)<\/div>/i));
    const text = stripHtml(block);
    const { startsAt, endsAt } = parseJEventsStartEnd(text);
    if (!title || !href || !startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      return;
    }
    if (/^(?:no\s+|library closed|closed\b|cancel)/i.test(title) || isClosureOrNonEvent(title, category)) {
      return;
    }
    if (!hasChildAudience([category], title)) {
      return;
    }
    const sourceUrl = absoluteUrl(source.library.website || source.library.eventsUrl, href);
    events.push({
      id: `joomla-jevents-${host}-${item.rpid || slugFromUrl(sourceUrl)}-${startsAt.slice(0, 10)}`,
      externalId: String(item.rpid || slugFromUrl(sourceUrl)),
      sourceId: `joomla-jevents-${host}`,
      townId: source.library.townId || source.town.id,
      title,
      venue: source.library.name,
      venueName: source.library.name,
      category: "library",
      source: source.library.name,
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, category),
      audiences: category ? [category] : [],
      cost: null,
      registration: /eventbrite|register/i.test(block) ? "RSVP" : "See source",
      summary: category,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.library.eventsUrl,
      address: source.library.address || null,
      lat: libraryLat(source),
      lng: libraryLng(source),
      tags: category ? [category] : [],
      status: "published",
      confidence: 0.84
    });
  });

  return [...new Map(events.map((event) => [event.id, event])).values()];
}

async function importJoomlaJEventsLibraryEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allJoomlaJEventsLibrarySources(sources)) {
    try {
      const html = await fetchText(source.library.eventsUrl);
      imported.push(...parseJEventsResponsiveEvents(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.library.eventsUrl}: ${error.message}`);
    }
  }
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

const WEEKDAY_INDEX = new Map([
  ["sunday", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6]
]);

function recurrenceMatches(dateKey, recurrence) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (recurrence?.frequency === "weekly") {
    const weekdays = (recurrence.weekdays || [recurrence.weekday])
      .map((weekday) => WEEKDAY_INDEX.get(String(weekday || "").toLowerCase()))
      .filter((weekday) => weekday !== undefined);
    return weekdays.includes(date.getUTCDay());
  }
  if (recurrence?.frequency !== "monthly") {
    return false;
  }
  const weekday = WEEKDAY_INDEX.get(String(recurrence.weekday || "").toLowerCase());
  if (weekday === undefined || date.getUTCDay() !== weekday) {
    return false;
  }
  const dayOfMonth = Number(dateKey.slice(8, 10));
  return Math.floor((dayOfMonth - 1) / 7) + 1 === Number(recurrence.ordinal || 1);
}

function allConfiguredLibraryEventSources(sources) {
  return sources.towns.flatMap((town) =>
    (town.libraries ?? [])
      .filter((library) => library.status === "importable" && library.parser === "configured-library-events")
      .map((library) => ({ town, library }))
  );
}

function configuredEventDates(config, startDate, days) {
  const windowEndDate = addDateDays(startDate, Math.max(0, days - 1));
  const explicitDates = config.dates || (config.date ? [config.date] : []);
  const excludeDates = new Set(config.excludeDates || config.recurrence?.excludeDates || []);
  if (explicitDates.length) {
    return explicitDates.filter((dateKey) => isDateWithinWindow(dateKey, startDate, days) && !excludeDates.has(dateKey));
  }
  const recurrence = config.recurrence;
  if (!recurrence) {
    return [];
  }
  const rangeStart = recurrence.startDate && dateStamp(recurrence.startDate) > dateStamp(startDate) ? recurrence.startDate : startDate;
  const rangeEnd =
    recurrence.endDate && dateStamp(recurrence.endDate) < dateStamp(windowEndDate) ? recurrence.endDate : windowEndDate;
  return datesInRange(rangeStart, rangeEnd).filter((dateKey) => recurrenceMatches(dateKey, recurrence) && !excludeDates.has(dateKey));
}

function configuredLibraryEvent(source, config, dateKey) {
  const title = stripHtml(config.title);
  const sourceUrl = config.url || source.library.eventsUrl || source.library.website;
  const startsAt = config.startTime ? localDateTime(dateKey, config.startTime) : null;
  const endsAt = config.endTime ? localDateTime(dateKey, config.endTime) : null;
  const summary = cleanImportedSummary(config.summary || "");
  if (!title || !sourceUrl || !startsAt) {
    return null;
  }

  const event = {
    id: `configured-library-${slugify(source.library.name)}-${dateKey}-${slugify(title)}`,
    externalId: `${dateKey}-${slugify(title)}`,
    sourceId: `configured-library-${slugify(source.library.name)}`,
    townId: source.library.townId || source.town.id,
    title,
    venue: config.venue || source.library.name,
    venueName: config.venueName || config.venue || source.library.name,
    room: config.room || null,
    category: "library",
    source: source.library.name,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
    ages: config.ages || inferAgeBandsFromText(title, summary, (config.audiences || []).join(" ")),
    audiences: config.audiences || [],
    cost: config.cost ?? null,
    registration: config.registration || "See source",
    summary,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.library.eventsUrl,
    address: source.library.address || null,
    lat: libraryLat(source),
    lng: libraryLng(source),
    image: config.image || null,
    tags: config.tags || [],
    status: "published",
    confidence: 0.72
  };

  if (config.virtual || eventLooksOnline(event)) {
    markOnlineEvent(event);
  }
  return event;
}

function importConfiguredLibraryEvents(sources, startDate, days) {
  const imported = [];
  allConfiguredLibraryEventSources(sources).forEach((source) => {
    (source.library.configuredEvents || []).forEach((config) => {
      configuredEventDates(config, startDate, days).forEach((dateKey) => {
        const event = configuredLibraryEvent(source, config, dateKey);
        if (event) {
          imported.push(event);
        }
      });
    });
  });
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function configuredWorkshopEvent(source, location, workshop, dateKey) {
  const title = stripHtml(workshop.title || source.recurrence?.title || source.label);
  const sourceUrl = workshop.url || location.storeUrl || source.eventsUrl || source.website;
  const startsAt = localDateTime(dateKey, workshop.startTime || source.recurrence?.startTime || "12:00");
  const endsAt = localDateTime(dateKey, workshop.endTime || source.recurrence?.endTime || "13:00");
  const summary = cleanImportedSummary(workshop.summary || source.recurrence?.summary || source.label);

  return {
    id: `${source.id}-${location.id}-${dateKey}-${slugify(title)}`,
    externalId: `${location.id}-${dateKey}-${slugify(title)}`,
    sourceId: source.id,
    townId: location.townId || null,
    title,
    venue: location.name,
    venueName: location.name,
    category: workshop.category || source.recurrence?.category || "workshop",
    source: source.label,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: durationMinutes(startsAt, endsAt),
    ages: inferAgeBandsFromText(title, summary, "kids children family workshop craft build"),
    cost: workshop.cost ?? null,
    registration: workshop.registration || source.recurrence?.registration || "See source",
    summary,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.eventsUrl || source.website,
    address: location.address || null,
    lat: Number(location.lat || 0),
    lng: Number(location.lng || 0),
    tags: [source.type, "kids", "family"].filter(Boolean),
    status: "published",
    confidence: source.parser === "configured-recurring-workshops" ? 0.68 : 0.76
  };
}

function importConfiguredWorkshopEvents(sources, startDate, days) {
  const imported = [];
  const regionalSources = sources.regionalSources ?? [];

  regionalSources
    .filter((source) => source.status === "importable" && source.parser === "configured-dated-workshops")
    .forEach((source) => {
      (source.workshops ?? []).forEach((workshop) => {
        if (!workshop.date || !isDateWithinWindow(workshop.date, startDate, days)) {
          return;
        }
        (source.locations ?? []).forEach((location) => {
          imported.push(configuredWorkshopEvent(source, location, workshop, workshop.date));
        });
      });
    });

  regionalSources
    .filter((source) => source.status === "importable" && source.parser === "configured-recurring-workshops")
    .forEach((source) => {
      datesInRange(startDate, addDateDays(startDate, Math.max(0, days - 1)))
        .filter((dateKey) => recurrenceMatches(dateKey, source.recurrence))
        .forEach((dateKey) => {
          (source.locations ?? []).forEach((location) => {
            imported.push(configuredWorkshopEvent(source, location, source.recurrence ?? {}, dateKey));
          });
        });
    });

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function allRegionalParserSources(sources, parser) {
  return (sources.regionalSources ?? []).filter((source) => source.status === "importable" && source.parser === parser);
}

function allSharedParserSources(sources, parser) {
  return Object.values(sources.sharedSources || {}).filter(
    (source) => source && source.status === "importable" && source.parser === parser
  );
}

function plainTextLinesFromHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 0 && line.length < 180);
}

function countyEventRecord(source, event, sources) {
  const location = {
    id: event.locationId || source.id,
    name: event.locationName || source.label,
    townId: event.townId || source.townId || null,
    address: event.locationAddress || source.address || null,
    lat: Number(event.locationLat ?? source.lat ?? 0),
    lng: Number(event.locationLng ?? source.lng ?? 0),
    url: event.sourceUrl || source.eventsUrl || source.website
  };

  const title = stripHtml(event.title);
  const summary = cleanImportedSummary(event.summary || "");
  const startsAt = event.startsAt;
  if (!title || !startsAt) {
    return null;
  }
  if (!isCountyEventActionable(title, summary)) {
    return null;
  }
  if (!isDateWithinWindow(startsAt.slice(0, 10), sources.startDate, sources.days)) {
    return null;
  }

  return regionalEventRecord(source, {
    id: `${source.id}-${event.dateKey}-${slugify(title)}-${event.locationId || slugify(event.sourceUrl || "") || "event"}`,
    externalId: event.externalId || `${slugify(title)}-${event.dateKey}`,
    title,
    startsAt,
    endsAt: event.endsAt || null,
    summary,
    sourceUrl: event.sourceUrl || source.eventsUrl || source.website,
    location,
    category: event.category || "county",
    confidence: event.confidence || 0.67,
    tags: ["county", source.type],
    room: event.room || null
  });
}

function parseUnionCountyEvents(html, source, sources, startDate, days) {
  const imported = [];
  const sections = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)];
  sections.forEach((sectionMatch) => {
    const title = stripHtml(sectionMatch[1]);
    if (!title || /^calendar|park activities|visit your local/i.test(title) || /^events calendar$/i.test(title)) {
      return;
    }
    const dateLine =
      firstMatch(sectionMatch[2], /<h4\b[^>]*>([\s\S]*?)<\/h4>/i) ||
      firstMatch(sectionMatch[2], /<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    const dateParts = parseCountyDateText(dateLine, startDate.slice(0, 4), startDate, days);
    if (!dateParts.dateKey) {
      return;
    }
    const timeParts = parseCountyTimeText(dateParts.timeText || dateLine, "am");
    const sourceUrl = firstMatch(sectionMatch[2], /href=["']([^"']+)["']/i) || source.eventsUrl;
    const venue = source.label;
    const event = {
      title,
      dateKey: dateParts.dateKey,
      startsAt: `${dateParts.dateKey}T${timeParts?.startTime || "12:00"}`,
      endsAt: timeParts?.endTime ? `${dateParts.dateKey}T${timeParts.endTime}` : null,
      summary: cleanImportedSummary(sectionMatch[2]),
      sourceUrl: sourceUrl ? absoluteUrl(source.eventsUrl || source.website, sourceUrl) : source.eventsUrl,
      locationName: venue,
      category: "park",
      confidence: 0.72
    };
    const mapped = countyEventRecord(source, event, { ...sources, startDate, days });
    if (mapped) {
      imported.push(mapped);
    }
  });
  return imported;
}

function extractAnchorsByTitle(html, source) {
  const byTitle = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = stripHtml(match[2]);
    if (!title) {
      continue;
    }
    const key = title.toLowerCase();
    const href = absoluteUrl(source.eventsUrl || source.website, match[1]);
    const list = byTitle.get(key) || [];
    list.push(href);
    byTitle.set(key, list);
  }
  return byTitle;
}

function parseMiddlesexCountyEvents(html, source, sources, startDate, days) {
  const imported = [];
  const anchorsByTitle = extractAnchorsByTitle(html, source);
  const lines = plainTextLinesFromHtml(html);

  let month = "june";
  let year = startDate.slice(0, 4);
  let currentDay = null;

  lines.forEach((line) => {
    const monthMatch = line.match(/^##\s*([A-Za-z]+)\s+(\d{4})/i);
    if (monthMatch) {
      month = monthMatch[1];
      year = monthMatch[2];
      return;
    }

    const rowMatch = line.match(/^(\d{1,2})(?:\s+\d{1,2})+$/);
    if (rowMatch) {
      const rowDays = [...line.matchAll(/\d+/g)].map((match) => Number(match[0]));
      const sanitized = rowDays.filter((day) => day >= 1 && day <= 31);
      const clipped = sanitized[0] > 20 && sanitized.some((item) => item <= 7)
        ? (() => {
            const cleaned = [...sanitized];
            while (cleaned[0] > 7 && cleaned.length > 1 && cleaned.some((item) => item <= 7)) {
              cleaned.shift();
            }
            return cleaned;
          })()
        : sanitized;
      if (clipped.length) {
        currentDay = clipped[0];
      }
      return;
    }

    const dayMatch = line.match(/^(\d{1,2})$/);
    if (dayMatch) {
      const day = Number(dayMatch[1]);
      if (day >= 1 && day <= 31) {
        currentDay = day;
      }
      return;
    }

    const eventMatch = line.match(/^(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM))\s+(.+)$/);
    if (!eventMatch || !currentDay) {
      return;
    }
    const time = parseCountyTimeText(eventMatch[1], "am");
    if (!time?.startTime) {
      return;
    }
    const title = stripHtml(eventMatch[2]);
    if (!title || !isCountyEventActionable(title)) {
      return;
    }
    const dateKey = countyInferDateKey(month, currentDay, year, startDate, days);
    if (!dateKey || !isDateWithinWindow(dateKey, startDate, days)) {
      return;
    }
    const key = title.toLowerCase();
    const urls = anchorsByTitle.get(key) || [];
    const resolvedUrl = urls.shift() || source.eventsUrl;
    const sourceUrl = resolvedUrl || source.eventsUrl;
    if (urls.length === 0) {
      anchorsByTitle.delete(key);
    }
    const mapped = countyEventRecord(source, {
      title,
      dateKey,
      startsAt: `${dateKey}T${time.startTime}`,
      endsAt: time.endTime ? `${dateKey}T${time.endTime}` : null,
      summary: "",
      sourceUrl,
      category: "county",
      confidence: 0.69
    }, { ...sources, startDate, days });
    if (mapped) {
      imported.push(mapped);
    }
  });

  return imported;
}

function countyCalendarMonthUrl(source, year, month) {
  const base = new URL(source.eventsUrl || source.website);
  const monthQuery = source.calendarMonthQuery || "curm";
  const yearQuery = source.calendarYearQuery || "cury";
  base.searchParams.set(monthQuery, String(month));
  base.searchParams.set(yearQuery, String(year));
  return base.toString();
}

function parseGranicusTimeToIso(timeText, dateKey, fallbackMeridiem = "") {
  const normalized = collapseWhitespace(String(timeText || "").replace(/[–—]/g, "-"));
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return "";
  }
  let hour = Number(match[1]);
  const minute = (match[2] || "00").padStart(2, "0");
  const meridiem = (match[3] || fallbackMeridiem || "am").toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${minute}:00`;
}

function parseGranicusTimeRange(timeText, dateKey) {
  const normalized = collapseWhitespace(String(timeText || "").replace(/[–—]/g, "-"));
  const match = normalized.match(
    /^(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)?)?$/i
  );
  if (!match) {
    return { startsAt: "", endsAt: null };
  }
  const startText = match[1];
  const endText = normalized.slice(startText.length).replace(/^(?:\s*(?:-|to)\s*)/i, "");
  const startMeridiem = firstMatch(startText, /\b(am|pm)\b/i);
  const startsAt = parseGranicusTimeToIso(startText, dateKey);
  if (!startsAt) {
    return { startsAt: "", endsAt: null };
  }
  const endsAt = endText ? parseGranicusTimeToIso(endText, dateKey, startMeridiem) : null;
  return { startsAt, endsAt };
}

function buildSomersetCalendarEventLinkLookup(html, source) {
  const lookup = new Map();
  const eventPattern = /<a\b[^>]*href=["']([^"']*Home\/Components\/Calendar\/Event\/\d+\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(eventPattern)) {
    const title = stripHtml(match[2]).toLowerCase();
    if (!title) {
      continue;
    }
    const href = absoluteUrl(source.eventsUrl || source.website, match[1]);
    if (!lookup.has(title)) {
      lookup.set(title, href);
    }
  }
  return lookup;
}

function parseSomersetCountyCalendarEvents(html, source, sources, startDate, days) {
  const imported = [];
  const lines = plainTextLinesFromHtml(html).map((line) => collapseWhitespace(line).replace(/\s+/g, " "));
  const eventLinks = buildSomersetCalendarEventLinkLookup(html, source);
  let month = "june";
  let year = startDate.slice(0, 4);
  const pendingDays = [];
  let pendingTitle = "";

  function pushEvent(rawTitle, timeText) {
    if (!rawTitle || pendingDays.length === 0 || !month || !year) {
      return;
    }
    const day = pendingDays.shift();
    const dateKey = countyInferDateKey(month, String(day), year, startDate, days);
    if (!dateKey || !isDateWithinWindow(dateKey, startDate, days)) {
      return;
    }

    const { startsAt, endsAt } = parseGranicusTimeRange(timeText, dateKey);
    const title = stripHtml(rawTitle);
    const sourceUrl = eventLinks.get(title.toLowerCase()) || source.eventsUrl || source.website;
    const mapped = countyEventRecord(
      source,
      {
        title,
        dateKey,
        startsAt,
        endsAt,
        summary: "",
        sourceUrl,
        category: "county",
        confidence: 0.74
      },
      { ...sources, startDate, days }
    );
    if (mapped) {
      imported.push(mapped);
    }
  }

  lines.forEach((line) => {
    if (!line) {
      return;
    }
    const monthMatch = line.match(/^##?\s*([A-Za-z]+)\s+(\d{4})/i);
    if (monthMatch) {
      month = monthMatch[1].toLowerCase();
      year = monthMatch[2];
      pendingDays.length = 0;
      pendingTitle = "";
      return;
    }

    const rowMatch = line.match(/^(\d{1,2})(?:\s+\d{1,2})+$/);
    if (rowMatch) {
      const rowDays = [...line.matchAll(/\d+/g)].map((item) => Number(item[0]));
      const sanitized = rowDays.filter((day) => day >= 1 && day <= 31);
      const clipped =
        sanitized[0] > 20 && sanitized.some((item) => item <= 7)
          ? (() => {
              const shifted = [...sanitized];
              while (shifted[0] > 7 && shifted.length > 1 && shifted.some((item) => item <= 7)) {
                shifted.shift();
              }
              return shifted;
            })()
          : sanitized;
      if (clipped.length) {
        pendingDays.push(...clipped);
      }
      return;
    }

    const timeMatch = line.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)?)?(?:\s+(.+))?$/i);
    if (timeMatch) {
      const startTime = timeMatch[1];
      const rangeEnd = timeMatch[2] || "";
      const title = (timeMatch[3] || "").trim();
      const timeText = `${startTime}${rangeEnd ? ` - ${rangeEnd}` : ""}`;
      if (title) {
        pushEvent(title, timeText);
      } else {
        pendingTitle = timeText;
      }
      return;
    }

    if (pendingTitle && /[A-Za-z]/.test(line)) {
      pushEvent(line, pendingTitle);
      pendingTitle = "";
    }
  });

  return imported.filter((event) => event?.startsAt);
}

function countyDateFromJson(event) {
  if (!event?.startDate) {
    return "";
  }
  const normalized = String(event.startDate);
  const direct = normalized.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct;
  }
  const stamped = zonedWallIso(normalized, TIMEZONE);
  return stamped ? stamped.slice(0, 10) : "";
}

function parseCountyEventsFromSource(html, source, sources, startDate, days) {
  const jsonEvents = parseJsonLdEvents(html).map((event) => {
    const dateKey = countyDateFromJson(event);
    if (!dateKey) {
      return null;
    }
    const time = parseCountyTimeText(String(event.startDate || ""), "am");
    return countyEventRecord(source, {
      title: stripHtml(event.name || ""),
      dateKey,
      startsAt: `${dateKey}T${time?.startTime || "12:00"}`,
      endsAt: time?.endTime ? `${dateKey}T${time.endTime}` : null,
      sourceUrl: event.url || source.eventsUrl || source.website,
      summary: cleanImportedSummary(event.description || event.about || ""),
      locationName: stripHtml(event.location?.name || ""),
      category: "county",
      confidence: 0.75
    }, { ...sources, startDate, days });
  })
  .filter(Boolean);

  if (jsonEvents.length > 0) {
    return jsonEvents;
  }

  if (source.id === "union-county-government") {
    return parseUnionCountyEvents(html, source, sources, startDate, days);
  }
  if (source.id === "somerset-county-government") {
    return parseSomersetCountyCalendarEvents(html, source, sources, startDate, days);
  }
  if (source.id === "middlesex-county-events") {
    return parseMiddlesexCountyEvents(html, source, sources, startDate, days);
  }
  return [];
}

function primaryRegionalLocation(source) {
  const configuredLocation = (source.locations || [])[0] || {};
  return {
    id: configuredLocation.id || source.id,
    name: configuredLocation.name || source.label,
    townId: configuredLocation.townId || source.townId || null,
    address: configuredLocation.address || source.address || null,
    addressStatus: configuredLocation.addressStatus || source.addressStatus || null,
    reviewNotes: configuredLocation.reviewNotes || source.reviewNotes || null,
    lat: Number(configuredLocation.lat ?? source.lat ?? 0),
    lng: Number(configuredLocation.lng ?? source.lng ?? 0),
    url: configuredLocation.storeUrl || source.eventsUrl || source.website
  };
}

function regionalEventRecord(source, fields) {
  const location = fields.location || primaryRegionalLocation(source);
  const startsAt = fields.startsAt || null;
  const endsAt = fields.endsAt || null;
  const summary = cleanImportedSummary(fields.summary || fields.title || "", {
    ...fields,
    venue: location.name,
    venueName: location.name,
    address: location.address
  });
  return {
    id: fields.id,
    externalId: fields.externalId || fields.id,
    sourceId: source.id,
    townId: location.townId,
    townNameRaw: location.townNameRaw || null,
    townAssignmentStatus: location.townAssignmentStatus || (location.townId ? "assigned" : "unknown"),
    townAssignmentSource: location.townAssignmentSource || null,
    title: stripHtml(fields.title),
    venue: location.name,
    venueName: location.name,
    room: fields.room || null,
    category: fields.category || source.type || "regional",
    source: source.label,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : fields.durationMinutes ?? null,
    ages: fields.ages || inferAgeBandsFromText(fields.title, summary, "kids children family"),
    cost: fields.cost ?? null,
    registration: fields.registration || "See source",
    summary,
    url: fields.sourceUrl,
    sourceUrl: fields.sourceUrl,
    sourceCalendarUrl: source.eventsUrl || source.website,
    address: location.address,
    addressStatus: location.addressStatus || fields.addressStatus || null,
    reviewNotes: fields.reviewNotes || location.reviewNotes || null,
    lat: location.lat,
    lng: location.lng,
    image: fields.image || null,
    tags: [source.type, ...(fields.tags || []), "family"].filter(Boolean),
    status: location.townId ? "published" : "review",
    confidence: fields.confidence ?? 0.78
  };
}

function configuredRegionalLocation(source, config) {
  const baseLocation = primaryRegionalLocation(source);
  const hasConfiguredTown = Object.prototype.hasOwnProperty.call(config, "townId");
  return {
    ...baseLocation,
    id: config.locationId || baseLocation.id,
    name: config.venue || baseLocation.name,
    townId: hasConfiguredTown ? config.townId : baseLocation.townId,
    townNameRaw: config.townNameRaw || null,
    townAssignmentStatus:
      config.townAssignmentStatus || (hasConfiguredTown ? (config.townId ? "assigned" : "needs_registry_town") : baseLocation.townAssignmentStatus),
    townAssignmentSource: config.townAssignmentSource || (config.townNameRaw ? "configuredLocation" : baseLocation.townAssignmentSource),
    address: config.address || baseLocation.address,
    addressStatus: config.addressStatus || baseLocation.addressStatus || null,
    reviewNotes: config.reviewNotes || baseLocation.reviewNotes || null,
    lat: Number(config.lat ?? baseLocation.lat),
    lng: Number(config.lng ?? baseLocation.lng),
    url: config.locationUrl || baseLocation.url
  };
}

function configuredRegionalEvent(source, config, dateKey) {
  const title = stripHtml(config.title);
  const sourceUrl = config.url || source.eventsUrl || source.website;
  const startsAt = config.startTime ? localDateTime(dateKey, config.startTime) : null;
  const endsAt = config.endTime ? localDateTime(dateKey, config.endTime) : null;
  const summary = cleanImportedSummary(config.summary || "");
  if (!title || !sourceUrl || !startsAt) {
    return null;
  }

  return regionalEventRecord(source, {
    id: `${source.id}-${dateKey}-${slugify(title)}`,
    externalId: `${dateKey}-${slugify(title)}`,
    title,
    startsAt,
    endsAt,
    summary,
    sourceUrl,
    location: configuredRegionalLocation(source, config),
    room: config.room || null,
    category: config.category || source.type || "regional",
    ages: config.ages || inferAgeBandsFromText(title, summary, (config.audiences || []).join(" ")),
    audiences: config.audiences || [],
    cost: config.cost ?? null,
    registration: config.registration || "See source",
    image: config.image || null,
    tags: config.tags || [],
    confidence: config.confidence ?? 0.72
  });
}

function importConfiguredRegionalEvents(sources, startDate, days) {
  const imported = [];
  allRegionalParserSources(sources, "configured-regional-events").forEach((source) => {
    (source.configuredEvents || []).forEach((config) => {
      configuredEventDates(config, startDate, days).forEach((dateKey) => {
        const event = configuredRegionalEvent(source, config, dateKey);
        if (event) {
          imported.push(event);
        }
      });
    });
  });
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

async function importCountyCalendarEvents(sources, startDate, days) {
  const imported = [];
  const sharedSources = allSharedParserSources(sources, "county-events-calendar");
  for (const source of sharedSources) {
    try {
      if (source.id === "somerset-county-government") {
        for (const { year, month } of monthsInWindow(startDate, days)) {
          const html = await fetchText(countyCalendarMonthUrl(source, year, month));
          imported.push(...parseCountyEventsFromSource(html, source, sources, startDate, days));
        }
        continue;
      }
      const html = await fetchText(source.eventsUrl || source.website);
      imported.push(...parseCountyEventsFromSource(html, source, sources, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
    }
  }
  return imported.filter((event) => event?.startsAt && event?.sourceUrl);
}

function decodeEscapedJsonText(value) {
  return decodeEntities(value)
    .replace(/\\\//g, "/")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ");
}

function extractBalancedJsonAfter(value, marker, fromIndex = 0) {
  const index = value.indexOf(marker, fromIndex);
  if (index === -1) {
    return "";
  }
  let start = index + marker.length;
  while (/\s/.test(value[start])) {
    start += 1;
  }
  const open = value[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : "";
  if (!close) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, cursor + 1);
      }
    }
  }
  return "";
}

function parseEmbeddedJsonAfter(value, marker, fromIndex = 0) {
  const rawJson = extractBalancedJsonAfter(value, marker, fromIndex);
  try {
    return JSON.parse(rawJson);
  } catch {
    return JSON.parse(rawJson.replace(/\\(?=\s)/g, ""));
  }
}

function barnesNobleHydrationText(html) {
  return decodeEscapedJsonText(html).replace(/\\u0026/g, "&");
}

function isBarnesNobleFamilyEvent(title, summary, typeLabels) {
  const text = `${title} ${summary} ${typeLabels.join(" ")}`.toLowerCase();
  const childSignal =
    /\b(storytime|children|child|kids|kid|young reader|summer reading|scavenger|camp|cat in the hat|tiny t\.?\s*rex|investigators|craft|activities|family)\b/i.test(
      text
    );
  const adultBookClub = /\bbook club\b/i.test(typeLabels.join(" ")) && !/\byoung reader|children|child|kids|kid|teen|tween/i.test(text);
  const virtualOrAdultAuthor = /\bauthor event\b/i.test(typeLabels.join(" ")) && !/\bstorytime|children|child|kids|kid|family/i.test(text);
  return childSignal && !adultBookClub && !virtualOrAdultAuthor;
}

function parseBarnesNobleStoreEvents(html, source, startDate, days) {
  const text = barnesNobleHydrationText(html);
  const imported = [];
  const seen = new Set();
  const eventPattern =
    /\{"eventId":"([^"]+)","name":"([^"]+)","date":"(\d{4}-\d{2}-\d{2})","time":"([^"]+)"([\s\S]*?)"time24":"([^"]+)"/g;

  for (const match of text.matchAll(eventPattern)) {
    const [, eventId, rawTitle, dateKey, , block, time24] = match;
    if (seen.has(`${eventId}-${dateKey}`) || !isDateWithinWindow(dateKey, startDate, days)) {
      continue;
    }
    seen.add(`${eventId}-${dateKey}`);

    if (!/"isInstoreEvent":true/.test(block) || /"isVirtualEvent":true/.test(block)) {
      continue;
    }

    const title = stripHtml(rawTitle);
    const summary = cleanImportedSummary(firstMatch(block, /"descriptionText":"([^"]*)"/));
    const typeLabels = [...block.matchAll(/"text":"([^"]+)"/g)].map((type) => stripHtml(type[1])).filter(Boolean);
    if (!isBarnesNobleFamilyEvent(title, summary, typeLabels)) {
      continue;
    }

    const location = {
      ...primaryRegionalLocation(source),
      lat: Number(firstMatch(block, /"latitude":(-?\d+(?:\.\d+)?)/) || source.lat || 0),
      lng: Number(firstMatch(block, /"longitude":(-?\d+(?:\.\d+)?)/) || source.lng || 0)
    };
    const sourceUrl = `https://stores.barnesandnoble.com/event/${eventId}`;
    const imagePath = firstMatch(block, /"largeIcon":"([^"]+)"/);

    imported.push(
      regionalEventRecord(source, {
        id: `${source.id}-${slugify(eventId)}-${dateKey}`,
        externalId: eventId,
        location,
        title,
        category: "bookstore",
        startsAt: localDateTime(dateKey, time24),
        summary: summary || title,
        sourceUrl,
        image: imagePath ? absoluteUrl(source.website, imagePath) : null,
        registration: "See source",
        tags: ["bookstore", "storytime", ...typeLabels.map(slugify)],
        confidence: 0.86
      })
    );
  }

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

async function importBarnesNobleStoreEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allRegionalParserSources(sources, "barnes-noble-store-calendar")) {
    try {
      const html = await fetchText(source.eventsUrl || source.website);
      imported.push(...parseBarnesNobleStoreEvents(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function parseTodayAtAppleCalendar(html, source, startDate, days) {
  const text = decodeEscapedJsonText(html);
  let courses;
  let schedules;
  let topics;
  let stores;
  try {
    const schedulesIndex = text.indexOf('"schedules":');
    courses = parseEmbeddedJsonAfter(text, '"courses":');
    schedules = parseEmbeddedJsonAfter(text, '"schedules":');
    topics = parseEmbeddedJsonAfter(text, '"topics":', schedulesIndex);
    stores = parseEmbeddedJsonAfter(text, '"stores":', schedulesIndex);
  } catch {
    return [];
  }

  const topic = topics.find((item) => item.collId === (source.topicCollId || "kids-and-families"));
  const store = stores[source.storeNum] || Object.values(stores)[0] || {};
  const location = {
    ...primaryRegionalLocation(source),
    name: store.title || source.label,
    address: cleanAddress([store.address1, store.city, store.stateCode || store.state, store.zip].filter(Boolean).join(", ")) || source.address,
    lat: Number(store.lat ?? source.lat ?? 0),
    lng: Number(store.long ?? source.lng ?? 0)
  };
  const imported = [];

  (topic?.scheduleIds || []).forEach((scheduleId) => {
    const schedule = schedules[scheduleId];
    const course = courses[schedule?.courseId];
    const startsAt = localIso(schedule?.displayStartTime);
    if (!schedule || !course || !eventStartsWithinWindow(startsAt, startDate, days)) {
      return;
    }
    const endsAt = localIso(schedule.displayEndTime);
    const title = stripHtml(course.name || course.title || "");
    const summary = cleanImportedSummary(course.mediumDescription || course.shortDescription || course.longDescription || title);
    const sourceUrl = `https://www.apple.com/today/event/${course.urlTitle || slugify(title)}/${schedule.id}/`;

    imported.push(
      regionalEventRecord(source, {
        id: `${source.id}-${schedule.id}`,
        externalId: schedule.id,
        location,
        title,
        category: "store-creative-session",
        startsAt,
        endsAt,
        summary,
        sourceUrl,
        cost: 0,
        registration: schedule.status || "RSVP",
        tags: ["today-at-apple", "kids-and-families", course.collId].filter(Boolean),
        confidence: 0.9
      })
    );
  });

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

async function importTodayAtAppleEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allRegionalParserSources(sources, "today-at-apple-calendar")) {
    try {
      const html = await fetchText(source.eventsUrl || source.website);
      imported.push(...parseTodayAtAppleCalendar(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function zonedWallIso(value, timeZone = TIMEZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function parseWixEventsList(html, source, startDate, days) {
  const imported = [];
  const eventPattern = /"scheduling":\{"config":\{[\s\S]*?(?="guestListConfig")/g;

  for (const match of html.matchAll(eventPattern)) {
    const block = decodeEscapedJsonText(match[0]);
    const startUtc = firstMatch(block, /"startDate":"([^"]+)"/);
    const endUtc = firstMatch(block, /"endDate":"([^"]+)"/);
    const timeZone = firstMatch(block, /"timeZoneId":"([^"]+)"/) || TIMEZONE;
    const startsAt = zonedWallIso(startUtc, timeZone);
    if (!eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }

    const title = stripHtml(firstMatch(block, /"title":"([^"]+)"/));
    const slug = firstMatch(block, /"slug":"([^"]+)"/) || slugify(title);
    if (!title || !slug) {
      continue;
    }
    const description = cleanImportedSummary(firstMatch(block, /"description":"([^"]*)"/) || firstMatch(block, /"about":"([^"]*)"/));
    const lowPrice = firstMatch(block, /"lowestTicketPrice":\{"amount":"([^"]+)"/) || firstMatch(block, /"lowestPrice":"\$?([^"]+)"/);
    const cost = Number(String(lowPrice).replace(/[^0-9.]/g, ""));
    const image = firstMatch(block, /"mainImage":\{[\s\S]*?"url":"([^"]+)"/);
    const sourceUrl = absoluteUrl(source.eventsUrl || source.website, `/event-details/${slug}`);

    imported.push(
      regionalEventRecord(source, {
        id: `${source.id}-${slugify(slug)}-${startsAt.slice(0, 10)}`,
        externalId: slug,
        title,
        category: /camp/i.test(title) ? "camp" : "workshop",
        startsAt,
        endsAt: zonedWallIso(endUtc, timeZone),
        summary: description || title,
        sourceUrl,
        image: image || null,
        cost: Number.isFinite(cost) ? cost : null,
        registration: /ticket/i.test(block) ? "Tickets" : "See source",
        tags: ["wix-events", "craft", "camp"],
        confidence: 0.85
      })
    );
  }

  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function tribeEventsApiUrl(source, startDate, days, page) {
  const endpoint = source.eventEndpoint || `${String(source.website || "").replace(/\/$/, "")}/wp-json/tribe/events/v1/events`;
  const url = new URL(endpoint);
  url.searchParams.set("per_page", String(source.perPage || 50));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", addDateDays(startDate, days - 1));
  url.searchParams.set("page", String(page));
  return url.toString();
}

function parseTribeVenueDetails(venue) {
  if (!venue) {
    return { name: "", address: "", lat: 0, lng: 0, city: "" };
  }
  const regionPostal = [venue.state || venue.province || venue.stateprovince, venue.zip].filter(Boolean).join(" ");
  const parts = [venue.address, venue.city, regionPostal].filter(Boolean);
  return {
    name: stripHtml(venue.venue || venue.name || ""),
    address: cleanAddress(parts.join(", ")),
    lat: Number(venue.geo_lat),
    lng: Number(venue.geo_lng),
    city: stripHtml(venue.city || "")
  };
}

function parseTribeEventsCalendar(events, source, sources, startDate, days) {
  const townLookup = buildTownLookup(sources);
  const imported = [];

  events.forEach((event) => {
    if (event.status !== "publish" || event.hide_from_listings) {
      return;
    }

    const title = stripHtml(event.title);
    const description = stripHtml(event.description || event.excerpt || "");
    if (!title || !isImportableRegionalEvent(title, description)) {
      return;
    }

    const dateKey = String(event.start_date || "").slice(0, 10);
    if (!dateKey || !isDateWithinWindow(dateKey, startDate, days)) {
      return;
    }

    const venue = parseTribeVenueDetails(event.venue);
    const matchedTown = townLookup.get(normalizePlaceName(venue.city));
    const startsAt = String(event.start_date || "").replace(" ", "T");
    const endsAt = event.end_date ? String(event.end_date).replace(" ", "T") : null;
    const summary =
      !description || /^screenshot$/i.test(description)
        ? `Community event hosted by ${venue.name || source.label}.`
        : description;
    const record = regionalEventRecord(source, {
      id: `${source.id}-${event.id}-${dateKey}`,
      externalId: String(event.id),
      title,
      startsAt,
      endsAt,
      summary,
      sourceUrl: event.url,
      image: event.image?.url || null,
      cost: isNonEmptyText(event.cost) ? event.cost : null,
      registration: isNonEmptyText(event.cost) ? "Tickets" : "See source",
      location: {
        id: venue.name || source.id,
        name: venue.name || matchedTown?.name || source.label,
        townId: matchedTown?.id || null,
        townNameRaw: matchedTown ? null : venue.city || null,
        townAssignmentStatus: matchedTown ? "assigned" : venue.city ? "needs_registry_town" : "unknown",
        townAssignmentSource: venue.city ? "venueCity" : "sourceFallback",
        address: venue.address || source.address || null,
        lat: Number.isFinite(venue.lat) && venue.lat !== 0 ? venue.lat : Number(source.lat || 0),
        lng: Number.isFinite(venue.lng) && venue.lng !== 0 ? venue.lng : Number(source.lng || 0)
      },
      tags: ["tribe-events", "county-tourism"],
      confidence: matchedTown ? 0.84 : 0.72
    });
    if (!record.summary && (!description || /^screenshot$/i.test(description))) {
      record.summary = summary;
    }
    record.withinCoverage = Boolean(matchedTown);
    if (event.is_virtual || eventLooksOnline(record)) {
      markOnlineEvent(record);
    }
    imported.push(record);
  });

  return imported;
}

async function importTribeEventsCalendar(sources, startDate, days) {
  const imported = [];
  for (const source of allRegionalParserSources(sources, "tribe-events-calendar")) {
    try {
      let page = 1;
      let totalPages = 1;
      const maxPages = Number(source.maxPages || 12);
      while (page <= totalPages && page <= maxPages) {
        const payload = await fetchJson(tribeEventsApiUrl(source, startDate, days, page));
        totalPages = Number(payload.total_pages || 1);
        imported.push(...parseTribeEventsCalendar(payload.events || [], source, sources, startDate, days));
        page += 1;
        if (page <= totalPages && page <= maxPages) {
          await sleep(150);
        }
      }
    } catch (error) {
      console.warn(`warning: could not import ${source.label}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importWixEventsList(sources, startDate, days) {
  const imported = [];
  for (const source of allRegionalParserSources(sources, "wix-events-list")) {
    try {
      const html = await fetchText(source.eventsUrl || source.website);
      imported.push(...parseWixEventsList(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
    }
  }
  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

function isImportableRegionalEvent(title, summary = "") {
  const text = `${title} ${summary}`.toLowerCase();
  if (/\b(cancelled|canceled|public hours|gallery hours|office hours|closed)\b/i.test(text)) {
    return false;
  }
  return /\b(kid|kids|children|child|family|families|teen|tween|toddler|camp|craft|workshop|story|festival|garden|nature|astronomy|butterfl|moth|plant sale|seed|earth day|brite nites|art show|theater|concert|performance|movie|slime|lego|glow|music|science|dedication)\b/i.test(
    text
  );
}

function parseMeridiemTimeLabel(dateKey, timeLabel) {
  const match = collapseWhitespace(timeLabel).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  return match ? timeToLocalIso(dateKey, match[1], match[2] || "00", match[3]) : localDateTime(dateKey, "12:00");
}

function extractFarmsteadDetailSummary(html) {
  const main =
    firstMatch(html, /<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    firstMatch(html, /<div\b[^>]*id=["']main-content["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html;
  const cleaned = cleanImportedSummary(main)
    .replace(/^Event Calendar\s*/i, "")
    .replace(/^Events\s*/i, "")
    .trim();
  return cleaned.length > 360 ? `${cleaned.slice(0, 357).trim()}...` : cleaned;
}

async function enrichRegionalDetailSummaries(events, extractor) {
  const cache = new Map();
  for (const event of events) {
    if (!event.sourceUrl || cache.has(event.sourceUrl)) {
      continue;
    }
    try {
      cache.set(event.sourceUrl, extractor(await fetchText(event.sourceUrl)));
      await sleep(100);
    } catch (error) {
      console.warn(`warning: could not enrich ${event.sourceUrl}: ${error.message}`);
      cache.set(event.sourceUrl, "");
    }
  }
  return events.map((event) => ({ ...event, summary: cache.get(event.sourceUrl) || event.summary }));
}

function farmsteadCalendarMonthUrl(source, year, month) {
  const base = source.eventsUrl || source.website;
  return new URL(`calendar/${year}/${month}`, base.endsWith("/") ? base : `${base}/`).toString();
}

function parseFarmsteadCalendar(html, source, startDate, days) {
  const imported = [];
  const eventPattern =
    /<a\b[^>]*class=["'][^"']*\bcalendar-grid-event\b[^"']*["'][^>]*href=["']([^"']+)["'][\s\S]*?<span\b[^>]*class=["'][^"']*\bcalendar-grid-event__time\b[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<span\b[^>]*class=["'][^"']*\bcalendar-grid-event__title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;

  for (const match of html.matchAll(eventPattern)) {
    const [, href, timeText, rawTitle] = match;
    const dateMatch = href.match(/\/event\/(\d{4})\/(\d{2})\/(\d{2})\//);
    const dateKey = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
    const title = stripHtml(rawTitle);
    if (!dateKey || !isDateWithinWindow(dateKey, startDate, days) || !isImportableRegionalEvent(title)) {
      continue;
    }
    const sourceUrl = absoluteUrl(source.eventsUrl || source.website, href);
    imported.push(
      regionalEventRecord(source, {
        id: `${source.id}-${dateKey}-${slugify(title)}-${slugFromUrl(sourceUrl)}`,
        externalId: `${dateKey}-${slugFromUrl(sourceUrl)}`,
        title,
        category: /theater|performance/i.test(title) ? "performance" : "art",
        startsAt: parseMeridiemTimeLabel(dateKey, stripHtml(timeText)),
        summary: title,
        sourceUrl,
        registration: "See source",
        tags: ["arts", "calendar"],
        confidence: 0.8
      })
    );
  }

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

async function importFarmsteadCalendarEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allRegionalParserSources(sources, "firespring-calendar-grid")) {
    for (const { year, month } of monthsInWindow(startDate, days)) {
      try {
        const html = await fetchText(farmsteadCalendarMonthUrl(source, year, month));
        imported.push(...parseFarmsteadCalendar(html, source, startDate, days));
      } catch (error) {
        console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
      }
    }
  }
  const deduped = [...new Map(imported.map((event) => [event.id, event])).values()];
  return enrichRegionalDetailSummaries(deduped, extractFarmsteadDetailSummary);
}

function parseSquarespaceEventListTime(block) {
  const dates = [...block.matchAll(/<time\b[^>]*class=["'][^"']*\bevent-date\b[^"']*["'][^>]*datetime=["']([^"']+)["'][^>]*>/gi)].map(
    (match) => match[1]
  );
  const times = [...block.matchAll(/<time\b[^>]*class=["'][^"']*\bevent-time-24hr(?:-start|-end)?\b[^"']*["'][^>]*>([^<]+)<\/time>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((value) => /^\d{2}:\d{2}$/.test(value));
  const startDate = dates[0] || "";
  const endDate = dates[1] || startDate;
  return {
    startDate,
    endDate,
    startTime: times[0] || "12:00",
    endTime: times[1] || null
  };
}

function parseSquarespaceRegionalEventList(html, source, startDate, days) {
  const imported = [];
  const articlePattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;

  for (const match of html.matchAll(articlePattern)) {
    const [, attrs, block] = match;
    if (!/\beventlist-event\b/i.test(attrs) || /\beventlist-event--past\b/i.test(attrs)) {
      continue;
    }
    const title = stripHtml(firstMatch(block, /<h1\b[^>]*class=["'][^"']*\beventlist-title\b[^"']*["'][^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i));
    const href = firstMatch(block, /<h1\b[^>]*class=["'][^"']*\beventlist-title\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["']/i);
    const summary = cleanImportedSummary(firstMatch(block, /<div\b[^>]*class=["'][^"']*\beventlist-description\b[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>\s*<a\b|<\/article>)/i));
    if (!title || !href || !isImportableRegionalEvent(title, summary)) {
      continue;
    }

    const timing = parseSquarespaceEventListTime(block);
    if (!timing.startDate) {
      continue;
    }
    const sourceUrl = absoluteUrl(source.eventsUrl || source.website, href);
    const image = firstMatch(block, /<img\b[^>]*(?:data-src|data-image)=["']([^"']+)["']/i) || firstMatch(block, /data-asset-url=["']([^"']+)["']/i);
    const repeatsWeekly =
      dateStamp(timing.endDate) > dateStamp(timing.startDate) && /\bsaturdays?\b|\bmondays?\b|\btuesdays?\b|\bwednesdays?\b|\bthursdays?\b|\bfridays?\b|\bsundays?\b/i.test(`${title} ${summary}`);
    const dateKeys = repeatsWeekly
      ? datesInRange(timing.startDate, timing.endDate).filter((dateKey) => {
          const startWeekday = new Date(`${timing.startDate}T12:00:00Z`).getUTCDay();
          return new Date(`${dateKey}T12:00:00Z`).getUTCDay() === startWeekday;
        })
      : [timing.startDate];

    dateKeys.filter((dateKey) => isDateWithinWindow(dateKey, startDate, days)).forEach((dateKey) => {
      const startsAt = localDateTime(dateKey, timing.startTime);
      const endsAt = timing.endTime ? localDateTime(dateKey, timing.endTime) : null;
      imported.push(
        regionalEventRecord(source, {
          id: `${source.id}-${dateKey}-${slugify(title)}`,
          externalId: `${dateKey}-${slugFromUrl(sourceUrl)}`,
          title,
          category: /garden|plant|seed|earth|butter|moth|nature/i.test(`${title} ${summary}`) ? "nature" : "regional",
          startsAt,
          endsAt,
          summary: summary || title,
          sourceUrl,
          image: image ? absoluteUrl(source.eventsUrl || source.website, image) : null,
          registration: /sign up|register/i.test(summary) ? "RSVP" : "See source",
          tags: ["squarespace", "garden"],
          confidence: 0.82
        })
      );
    });
  }

  return imported.filter((event) => event.startsAt && event.sourceUrl);
}

async function importSquarespaceRegionalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allRegionalParserSources(sources, "squarespace-eventlist")) {
    try {
      const html = await fetchText(source.eventsUrl || source.website);
      imported.push(...parseSquarespaceRegionalEventList(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function parseCompactDateTime(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`;
}

function parseEventListingCards(html, source, startDate, days) {
  const imported = [];
  const itemPattern = /<div\b([^>]*)class=["'][^"']*\bevent-item\b[^"']*["']([^>]*)>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bevent-item\b|<\/div>\s*<\/div>\s*<\/div>|<\/section>)/gi;

  for (const match of html.matchAll(itemPattern)) {
    const attrs = `${match[1]} ${match[2]}`;
    const block = match[3];
    const startsAt = parseCompactDateTime(firstMatch(attrs, /data-datetime=["'](\d{12})["']/i));
    const href = firstMatch(block, /<a\b[^>]*href=["']([^"']+)["']/i);
    const title = stripHtml(firstMatch(block, /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)) || stripHtml(firstMatch(block, /aria-label=["'](?:Info about|View details for)\s*([^"']+)["']/i));
    const terms = stripHtml(firstMatch(attrs, /data-terms=["']([^"']+)["']/i));
    const image = firstMatch(block, /\bdata-src=["']([^"']+)["']/i) || firstMatch(block, /\bsrc=["']([^"']+)["']/i);
    const sourceUrl = href ? absoluteUrl(source.eventsUrl || source.website, href) : "";
    if (!startsAt || !sourceUrl || !title || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    if (!isImportableRegionalEvent(title, terms)) {
      continue;
    }
    imported.push(
      regionalEventRecord(source, {
        id: `${source.id}-${firstMatch(attrs, /data-id=["']([^"']+)["']/i) || slugify(title)}-${startsAt.slice(0, 10)}-${slugify(startsAt.slice(11, 16))}`,
        externalId: `${firstMatch(attrs, /data-id=["']([^"']+)["']/i) || slugFromUrl(sourceUrl)}-${startsAt}`,
        title,
        startsAt,
        summary: terms,
        sourceUrl,
        image: image ? absoluteUrl(source.eventsUrl || source.website, image) : null,
        tags: terms.split(/\s+/).filter(Boolean),
        confidence: 0.82
      })
    );
  }

  return imported;
}

function parseNjpacPerformances(value) {
  const decoded = decodeEntities(value).replace(/&quot;/g, '"');
  try {
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...decoded.matchAll(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/g)].map((match) => match[1]);
  }
}

function isImportableNjpacEvent(title, genre = "", highlights = "") {
  const text = `${title} ${genre} ${highlights}`;
  if (/\b(comedy|r&b|latin|concert|world music|country)\b/i.test(text) && !/\b(family|families|kids|children|teen|arts ed|community engagement|reading|stem|festival)\b/i.test(text)) {
    return false;
  }
  return /\b(family|families|kids|children|teen|arts ed|community engagement|reading|stem|festival|north to shore|poetry teen|student|youth)\b/i.test(text);
}

function parseNjpacEventCards(html, source, startDate, days) {
  const imported = [];
  const rowPattern = /<div\b[^>]*class=["'][^"']*\bcontent-row\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bcontent-row\b|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const block = rowMatch[1];
    const performancesRaw = firstMatch(block, /data-performances=["']([^"']+)["']/i);
    const performances = parseNjpacPerformances(performancesRaw);
    if (!performances.length) {
      continue;
    }
    const title = stripHtml(firstMatch(block, /<h3\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i));
    const href = firstMatch(block, /<h3\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i) || firstMatch(block, /content-listing-card__link[^>]*href=["']([^"']+)["']/i);
    const genre = stripHtml(firstMatch(block, /content-listing-card__pretitle[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i));
    const highlights = stripHtml(firstMatch(block, /<span\b[^>]*class=["'][^"']*\bevent-highlights\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const imageJson = decodeEntities(firstMatch(block, /data-lazy-image=["']([^"']+)["']/i));
    const image = firstMatch(imageJson, /"src"\s*:\s*"([^"]+)"/i)?.replace(/\\\//g, "/");
    const sourceUrl = href ? absoluteUrl(source.eventsUrl || source.website, href) : "";
    if (!title || !sourceUrl || !isImportableNjpacEvent(title, genre, highlights)) {
      continue;
    }
    performances.forEach((performance) => {
      const startsAt = localIso(performance);
      if (!eventStartsWithinWindow(startsAt, startDate, days)) {
        return;
      }
      imported.push(
        regionalEventRecord(source, {
          id: `${source.id}-${slugFromUrl(sourceUrl)}-${slugify(startsAt)}`,
          externalId: `${slugFromUrl(sourceUrl)}-${startsAt}`,
          title,
          startsAt,
          summary: [genre, highlights].filter(Boolean).join(" · "),
          sourceUrl,
          image: image || null,
          tags: [genre, ...highlights.split(/\s+/)].filter(Boolean),
          registration: "Tickets",
          confidence: 0.8
        })
      );
    });
  }

  return imported;
}

function parsePrudentialCenterCards(html, source, startDate, days) {
  const imported = [];
  const itemPattern = /<div\b[^>]*class=["'][^"']*\belement-item\b[^"']*\bfamily-shows\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\belement-item\b|<\/div>\s*<\/div>\s*<\/div>)/gi;
  const pageYear = Number(todayInNewYork().slice(0, 4));

  for (const match of html.matchAll(itemPattern)) {
    const block = match[1];
    const href = firstMatch(block, /<a\b[^>]*href=["']([^"']+)["']/i);
    const title = stripHtml(firstMatch(block, /<h3\b[^>]*>([\s\S]*?)<\/h3>/i)) || stripHtml(firstMatch(block, /alt=["']([^"']+)["']/i));
    const monthName = stripHtml(firstMatch(block, /class=["'][^"']*\beventmonth\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
    const day = stripHtml(firstMatch(block, /class=["'][^"']*\beventday\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
    const timeLabel = stripHtml(firstMatch(block, /class=["'][^"']*\beventtime\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
    const image = firstMatch(block, /<img\b[^>]*src=["']([^"']+)["'][^>]*alt=["'][^"']*["']/i);
    const month = MONTH_NAME_MAP.get(monthName.toLowerCase().slice(0, 3));
    const sourceUrl = href ? absoluteUrl(source.eventsUrl || source.website, href) : "";
    if (!title || !month || !day || !sourceUrl || !isImportableRegionalEvent(title, "family shows")) {
      continue;
    }
    const dateKey = `${pageYear}-${month}-${String(Number(day)).padStart(2, "0")}`;
    const startsAt = parseMeridiemTimeLabel(dateKey, timeLabel || "12pm");
    if (!eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    imported.push(
      regionalEventRecord(source, {
        id: `${source.id}-${slugFromUrl(sourceUrl)}-${startsAt.slice(0, 10)}`,
        externalId: `${slugFromUrl(sourceUrl)}-${startsAt}`,
        title,
        startsAt,
        summary: "Family show at Prudential Center.",
        sourceUrl,
        image: image ? absoluteUrl(source.eventsUrl || source.website, image) : null,
        tags: ["family-shows"],
        registration: "Tickets",
        confidence: 0.78
      })
    );
  }

  return imported;
}

async function importHtmlRegionalEvents(sources, startDate, days) {
  const parsers = new Map([
    ["newark-museum-events", parseEventListingCards],
    ["njpac-events-list", parseNjpacEventCards],
    ["prudential-center-events", parsePrudentialCenterCards]
  ]);
  const imported = [];
  for (const [parser, parse] of parsers) {
    for (const source of allRegionalParserSources(sources, parser)) {
      try {
        const html = await fetchText(source.eventsUrl || source.website);
        imported.push(...parse(html, source, startDate, days));
      } catch (error) {
        console.warn(`warning: could not import ${source.label}: ${error.message}`);
      }
    }
  }
  return [...new Map(imported.filter((event) => event.startsAt && event.sourceUrl).map((event) => [event.id, event])).values()];
}

function allMunicipalParserSources(sources, parser) {
  return (sources.towns ?? [])
    .filter((town) => town.municipal?.status === "importable" && town.municipal?.parser === parser)
    .map((town) => ({ town, municipal: town.municipal }));
}

function municipalSourceLabel(source) {
  return source.municipal.label || `${source.town.name} municipal calendar`;
}

function municipalSourceId(source, parser) {
  return `${parser}-${source.town.id}`;
}

function monthsInWindow(startDate, days) {
  const months = [];
  const endDate = addDateDays(startDate, Math.max(0, days - 1));
  let cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);

  while (cursor <= end) {
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

function eventStartsWithinWindow(startsAt, startDate, days) {
  return Boolean(startsAt) && isDateWithinWindow(String(startsAt).slice(0, 10), startDate, days);
}

function isImportableMunicipalEvent(title, summary = "", calendar = "") {
  const text = `${title || ""} ${summary || ""} ${calendar || ""}`;
  if (!title || MUNICIPAL_SKIP_TITLE_PATTERN.test(text)) {
    return false;
  }
  return MUNICIPAL_COMMUNITY_EVENT_PATTERN.test(text);
}

function isImportableEventEspressoMunicipalEvent(title, summary = "") {
  const text = `${title} ${summary}`;
  if (
    /\b(?:membership|permit application|early drop off|late pick(?:up|-up)|registration|application|town wide garage sale)\b/i.test(
      text
    )
  ) {
    return false;
  }
  return /\b(?:art|basketball|camp|cheerleading|children|craft|dodgeball|flag football|game|kids|lego|maker|science|slimy|sports|stage|teen|theatre|theater|workshop)\b/i.test(
    text
  );
}

function findMunicipalLocationOverride(source, venueName, address, ...textParts) {
  const direct = findSourceLocationOverride(source.municipal, venueName, address);
  if (direct) {
    return direct;
  }

  const searchText = normalizePlaceName([venueName, address, ...textParts].filter(Boolean).join(" "));
  if (!searchText) {
    return null;
  }
  return (source.municipal.locationOverrides || []).find((location) => {
    const names = [location.name, ...(location.aliases || [])].map(normalizePlaceName).filter(Boolean);
    return names.some((name) => name && searchText.includes(name));
  });
}

function municipalVenueDetails(source, { title, summary, venueName, address }) {
  const location = findMunicipalLocationOverride(source, venueName, address, title, summary);
  const coordinates = locationCoordinates(location);
  const resolvedAddress = cleanAddress(location?.address || address || source.municipal.defaultAddress || "");
  const townAddressOnly =
    resolvedAddress &&
    !/\b\d+\s+[A-Za-z]/.test(resolvedAddress) &&
    normalizePlaceName(resolvedAddress).includes(normalizePlaceName(source.town.name));
  const fallbackToTownCenter = (!resolvedAddress && !coordinates) || (!coordinates && townAddressOnly);
  const resolvedVenue =
    location?.name || venueName || source.municipal.defaultVenueName || `${source.town.name} municipal event`;

  return {
    venueName: resolvedVenue,
    address: resolvedAddress || null,
    lat: coordinates?.lat ?? (fallbackToTownCenter ? numericCoordinate(source.town.center?.lat) : undefined),
    lng: coordinates?.lng ?? (fallbackToTownCenter ? numericCoordinate(source.town.center?.lng) : undefined),
    addressStatus: location?.addressStatus || location?.addressConfidence || null,
    directionsDisabled: Boolean(location?.directionsDisabled),
    confidence: coordinates ? 0.9 : resolvedAddress ? 0.84 : 0.72
  };
}

function civicPlusCalendarIds(source) {
  const configured = source.municipal.calendarIds || [];
  if (configured.length > 0) {
    return configured.map(String);
  }
  try {
    const cid = new URL(source.municipal.eventsUrl || source.municipal.website).searchParams.get("CID");
    return cid ? cid.split(",").map((value) => value.trim()).filter(Boolean) : [null];
  } catch {
    return [null];
  }
}

function civicPlusCalendarListUrl(source, calendarId, year, month) {
  const url = new URL(source.municipal.eventsUrl || source.municipal.website);
  url.searchParams.set("view", "list");
  url.searchParams.set("month", String(month));
  url.searchParams.set("year", String(year));
  if (calendarId) {
    url.searchParams.set("CID", String(calendarId));
  }
  return url.toString();
}

function timeToLocalIso(dateKey, hourRaw, minuteRaw, meridiemRaw) {
  let hour = Number(hourRaw);
  const meridiem = String(meridiemRaw || "").toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minuteRaw || "00").padStart(2, "0")}:00`;
}

function parseCivicPlusStartFromDateText(dateText) {
  const text = collapseWhitespace(dateText);
  const match = text.match(
    /\b([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:,\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?/i
  );
  if (!match) {
    return null;
  }
  const [, monthName, day, year, hour = "12", minute = "00", meridiem = "PM"] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (!month) {
    return null;
  }
  const dateKey = `${year}-${month}-${String(day).padStart(2, "0")}`;
  if (/all day/i.test(text)) {
    return `${dateKey}T12:00:00`;
  }
  return timeToLocalIso(dateKey, hour, minute, meridiem);
}

function civicPlusEndFromDateText(dateText, startsAt, hiddenEnd) {
  const normalizedEnd = hiddenEnd ? localIso(hiddenEnd) : null;
  if (normalizedEnd && normalizedEnd !== startsAt) {
    return normalizedEnd;
  }
  if (!startsAt || /all day/i.test(dateText)) {
    return null;
  }
  const range = collapseWhitespace(dateText).match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i
  );
  if (!range) {
    return null;
  }
  const [, , , , endHour, endMinute = "00", endMeridiem] = range;
  return timeToLocalIso(startsAt.slice(0, 10), endHour, endMinute, endMeridiem);
}

function civicPlusItempropText(section, prop) {
  return stripHtml(
    firstMatch(section, new RegExp(`<[^>]+itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"))
  );
}

function civicPlusPostalAddress(block, venueName) {
  const address = addressFromPostalAddress({
    streetAddress: civicPlusItempropText(block, "streetAddress"),
    addressLocality: civicPlusItempropText(block, "addressLocality"),
    addressRegion: civicPlusItempropText(block, "addressRegion"),
    postalCode: civicPlusItempropText(block, "postalCode"),
    addressCountry: civicPlusItempropText(block, "addressCountry")
  });
  if (!address) {
    return "";
  }
  if (!civicPlusItempropText(block, "streetAddress") && venueName) {
    return cleanAddress(`${venueName}, ${address}`);
  }
  return cleanAddress(address);
}

function civicPlusMunicipalCategory(title, summary, calendar) {
  const text = `${title} ${summary} ${calendar}`.toLowerCase();
  if (/fair|festival|juneteenth|pride|street fair/.test(text)) {
    return "festival";
  }
  if (/farmers? market|free market|market/.test(text)) {
    return "market";
  }
  if (/movie|concert|musical|plays in the park|screen on the green/.test(text)) {
    return "performance";
  }
  return "community";
}

function parseCivicPlusListings(html, source, startDate, days) {
  const sections = [];
  const sectionPattern =
    /<div\b[^>]*id=["']CID(\d+)["'][^>]*class=["'][^"']*\bcalendar\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*id=["']CID\d+["'][^>]*class=["'][^"']*\bcalendar\b|<script\b|$)/gi;
  for (const match of html.matchAll(sectionPattern)) {
    sections.push({ calendarId: match[1], html: match[2] });
  }
  if (sections.length === 0) {
    sections.push({ calendarId: null, html });
  }

  const imported = [];
  for (const section of sections) {
    const calendar = stripHtml(firstMatch(section.html, /<h2\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i));
    const itemPattern = /<li\b[^>]*>([\s\S]*?<a\b[^>]*id=["']eventTitle_[^"']+["'][\s\S]*?)<\/li>/gi;
    for (const itemMatch of section.html.matchAll(itemPattern)) {
      const block = itemMatch[1];
      const eventId =
        firstMatch(block, /eventTitle_(\d+)/i) || firstMatch(block, /[?&]EID=(\d+)/i) || slugify(block).slice(0, 40);
      const title = stripHtml(firstMatch(block, /<a\b[^>]*id=["']eventTitle_[^"']+["'][^>]*>([\s\S]*?)<\/a>/i));
      const href = firstMatch(block, /<a\b[^>]*id=["']eventTitle_[^"']+["'][^>]*href=["']([^"']+)["']/i);
      const sourceUrl = href ? absoluteUrl(source.municipal.eventsUrl || source.municipal.website, href) : source.municipal.eventsUrl;
      const dateText = stripHtml(firstMatch(block, /<div\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
      let startsAt =
        localIso(civicPlusItempropText(block, "startDate")) || parseCivicPlusStartFromDateText(dateText) || null;
      if (startsAt?.endsWith("T00:00:00") && /all day/i.test(dateText)) {
        startsAt = `${startsAt.slice(0, 10)}T12:00:00`;
      }
      if (!eventStartsWithinWindow(startsAt, startDate, days)) {
        continue;
      }
      const listingSummary = cleanImportedSummary(civicPlusItempropText(block, "description"));
      if (!isImportableMunicipalEvent(title, listingSummary, calendar)) {
        continue;
      }

      const venueName = stripHtml(firstMatch(block, /<div\b[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
      const address = civicPlusPostalAddress(block, venueName);
      const venue = municipalVenueDetails(source, { title, summary: listingSummary, venueName, address });
      const endsAt = civicPlusEndFromDateText(dateText, startsAt, civicPlusItempropText(block, "endDate"));
      const category = civicPlusMunicipalCategory(title, listingSummary, calendar);

      imported.push({
        id: `civicplus-${source.town.id}-${eventId}-${startsAt.slice(0, 10)}`,
        sourceId: municipalSourceId(source, "civicplus"),
        townId: source.town.id,
        title,
        venue: venue.venueName,
        venueName: venue.venueName,
        category,
        source: municipalSourceLabel(source),
        startsAt,
        endsAt,
        timezone: TIMEZONE,
        durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
        ages: inferAgeBandsFromText(title, listingSummary, calendar, "families all ages community"),
        cost: null,
        registration: "See source",
        summary: listingSummary,
        url: sourceUrl,
        sourceUrl,
        sourceCalendarUrl: source.municipal.eventsUrl || source.municipal.website,
        address: venue.address,
        lat: venue.lat,
        lng: venue.lng,
        tags: ["municipal", source.town.id, category, "family"].filter(Boolean),
        status: "published",
        confidence: venue.confidence
      });
    }
  }

  return imported.filter((event) => event.title && event.startsAt && event.sourceUrl);
}

function extractMetaContent(html, property) {
  return decodeEntities(
    firstMatch(html, new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")) ||
      firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"))
  );
}

function extractCivicPlusDetailSummary(html) {
  const description =
    firstMatch(
      html,
      /<div\b[^>]*itemprop=["']description["'][^>]*class=["'][^"']*\bfr-view\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<ul|<div\b[^>]*class=["']row\b|<script\b|$)/i
    ) || firstMatch(html, /<[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  return cleanImportedSummary(description);
}

function extractCivicPlusDetailImage(html, sourceUrl) {
  const metaImage = extractMetaContent(html, "og:image");
  if (metaImage) {
    return absoluteUrl(sourceUrl, metaImage);
  }
  const itemImage = firstMatch(html, /<img\b[^>]*itemprop=["']image["'][^>]*src=["']([^"']+)["']/i);
  return itemImage ? absoluteUrl(sourceUrl, itemImage) : null;
}

async function enrichCivicPlusDetails(events) {
  const cache = new Map();
  for (const event of events) {
    if (!event.sourceUrl || cache.has(event.sourceUrl)) {
      continue;
    }
    try {
      const html = await fetchText(event.sourceUrl);
      cache.set(event.sourceUrl, {
        summary: extractCivicPlusDetailSummary(html),
        image: extractCivicPlusDetailImage(html, event.sourceUrl)
      });
      await sleep(100);
    } catch (error) {
      console.warn(`warning: could not enrich ${event.sourceUrl}: ${error.message}`);
      cache.set(event.sourceUrl, {});
    }
  }

  return events.map((event) => {
    const details = cache.get(event.sourceUrl) || {};
    return markSummaryStatus({
      ...event,
      summary: details.summary || event.summary,
      image: details.image || event.image
    });
  });
}

async function importCivicPlusMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "civicplus-calendar")) {
    for (const { year, month } of monthsInWindow(startDate, days)) {
      for (const calendarId of civicPlusCalendarIds(source)) {
        try {
          const html = await fetchText(civicPlusCalendarListUrl(source, calendarId, year, month));
          imported.push(...parseCivicPlusListings(html, source, startDate, days));
        } catch (error) {
          console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
        }
      }
    }
  }

  const deduped = [...new Map(imported.map((event) => [event.id, event])).values()];
  return enrichCivicPlusDetails(deduped);
}

function dpCalendarRawEventsUrl(source, startDate, days) {
  const config = source.municipal;
  const base = config.rawEventsUrl || new URL("/index.php", config.eventsUrl || config.website).toString();
  const url = new URL(base, config.eventsUrl || config.website);
  url.searchParams.set("option", "com_dpcalendar");
  url.searchParams.set("view", "events");
  url.searchParams.set("format", "raw");
  url.searchParams.set("limit", "0");
  if (config.itemId) {
    url.searchParams.set("Itemid", String(config.itemId));
  }
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", addDateDays(startDate, Math.max(0, days - 1)));
  return url.toString();
}

function dpCalendarLocalIso(value, allDay = false) {
  if (!value) {
    return null;
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T${allDay ? "12:00" : "00:00"}:00`;
  }
  return localIso(text);
}

function extractDpCalendarLabel(description) {
  return stripHtml(firstMatch(description, /dp-event-tooltip__calendar["'][^>]*>\s*\[([^\]]+)/i));
}

function extractDpCalendarSummary(description) {
  const tooltipDescription =
    firstMatch(
      description,
      /<div\b[^>]*class=["'][^"']*\bdp-event-tooltip__description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bdp-event-tooltip__actions\b/i
    ) || firstMatch(description, /<div\b[^>]*class=["'][^"']*\bdp-event-tooltip__description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  return cleanImportedSummary(tooltipDescription);
}

function extractDpCalendarDetailSummary(html) {
  const description =
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bcom-dpcalendar-event__description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*\bcom-dpcalendar-event__locations\b|<h2\b|<script\b|$)/i) ||
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bdp-event-description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    firstMatch(html, /<[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    firstMatch(html, /"description"\s*:\s*"([^"]+)"/i) ||
    extractMetaContent(html, "og:description") ||
    extractMetaContent(html, "description");
  return cleanImportedSummary(description);
}

function dpCalendarLocationDetails(location) {
  const details = Array.isArray(location) ? location[0] : location;
  if (!details) {
    return { venueName: "", address: "" };
  }
  if (typeof details === "string") {
    return { venueName: stripHtml(details), address: "" };
  }
  const venueName = stripHtml(details.title || details.name || details.label || "");
  const address = cleanAddress(details.address || addressFor(details) || "");
  return { venueName, address };
}

function mapDpCalendarMunicipalEvent(source, item, startDate, days) {
  const title = stripHtml(item.title || "");
  const startsAt = dpCalendarLocalIso(item.start, item.allDay);
  if (!eventStartsWithinWindow(startsAt, startDate, days)) {
    return null;
  }
  const calendar = extractDpCalendarLabel(item.description || "");
  const summary = extractDpCalendarSummary(item.description || "");
  if (!isImportableMunicipalEvent(title, summary, calendar)) {
    return null;
  }
  const locationDetails = dpCalendarLocationDetails(item.location);
  const venue = municipalVenueDetails(source, {
    title,
    summary,
    venueName: locationDetails.venueName,
    address: locationDetails.address
  });
  const endsAt = dpCalendarLocalIso(item.end, item.allDay);
  const sourceUrl = item.url
    ? absoluteUrl(source.municipal.eventsUrl || source.municipal.website, item.url)
    : source.municipal.eventsUrl || source.municipal.website;
  const category = civicPlusMunicipalCategory(title, summary, calendar);

  return {
    id: `dpcalendar-${source.town.id}-${item.id}-${startsAt.slice(0, 10)}`,
    sourceId: municipalSourceId(source, "dpcalendar"),
    townId: source.town.id,
    townAssignmentStatus: "assigned",
    townAssignmentSource: "municipalSource",
    title,
    venue: venue.venueName,
    venueName: venue.venueName,
    category,
    source: municipalSourceLabel(source),
    startsAt,
    endsAt: endsAt && endsAt !== startsAt ? endsAt : null,
    timezone: TIMEZONE,
    durationMinutes: endsAt && endsAt !== startsAt ? durationMinutes(startsAt, endsAt) : null,
    ages: inferAgeBandsFromText(title, summary, calendar, "families all ages community"),
    cost: null,
    registration: "See source",
    summary,
    url: sourceUrl,
    sourceUrl,
    sourceCalendarUrl: source.municipal.eventsUrl || source.municipal.website,
    address: venue.address,
    addressStatus: venue.addressStatus || undefined,
    directionsDisabled: venue.directionsDisabled || undefined,
    lat: venue.lat,
    lng: venue.lng,
    tags: ["municipal", source.town.id, category, "family"].filter(Boolean),
    status: "published",
    confidence: venue.confidence
  };
}

async function enrichDpCalendarDetails(events) {
  const cache = new Map();
  for (const event of events) {
    if (isNonEmptyText(event.summary) || !event.sourceUrl || cache.has(event.sourceUrl)) {
      continue;
    }
    try {
      const html = await fetchText(event.sourceUrl);
      cache.set(event.sourceUrl, {
        summary: extractDpCalendarDetailSummary(html)
      });
      await sleep(100);
    } catch (error) {
      console.warn(`warning: could not enrich DPCalendar summary for ${event.sourceUrl}: ${error.message}`);
      cache.set(event.sourceUrl, {});
    }
  }

  return events.map((event) => {
    const details = cache.get(event.sourceUrl) || {};
    return markSummaryStatus({
      ...event,
      summary: details.summary || event.summary
    });
  });
}

async function importDpCalendarMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "joomla-dpcalendar-raw")) {
    try {
      const data = await fetchJson(dpCalendarRawEventsUrl(source, startDate, days));
      const events = data?.data?.events || data?.events || [];
      events.forEach((item) => {
        const event = mapDpCalendarMunicipalEvent(source, item, startDate, days);
        if (event) {
          imported.push(event);
        }
      });
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  const deduped = [...new Map(imported.map((event) => [event.id, event])).values()];
  return enrichDpCalendarDetails(deduped);
}

function parseSquarespaceDateRange(dateText) {
  const text = stripHtml(dateText).replace(/\u202f/g, " ");
  const match = text.match(
    /(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (!match) {
    return { startsAt: null, endsAt: null };
  }
  const [, monthName, day, year, startHour, startMinute, startMeridiem, endHour, endMinute, endMeridiem] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (!month) {
    return { startsAt: null, endsAt: null };
  }
  const dateKey = `${year}-${month}-${String(day).padStart(2, "0")}`;
  return {
    startsAt: timeToLocalIso(dateKey, startHour, startMinute, startMeridiem),
    endsAt: timeToLocalIso(dateKey, endHour, endMinute, endMeridiem)
  };
}

function parseSquarespaceCalendarListings(html, source, startDate, days) {
  const noscript = firstMatch(html, /<noscript>([\s\S]*?)<\/noscript>/i);
  if (!noscript) {
    return [];
  }

  const imported = [];
  const itemPattern = /<li>\s*(<h1>[\s\S]*?)(?=\n\s*<li>\s*<h1>|\s*<\/ul>\s*$|$)/gi;
  for (const match of noscript.matchAll(itemPattern)) {
    const block = match[1];
    const title = stripHtml(firstMatch(block, /<h1>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/h1>/i));
    const href = firstMatch(block, /<h1>\s*<a\b[^>]*href=["']([^"']+)["']/i);
    const sourceUrl = href ? absoluteUrl(source.municipal.eventsUrl || source.municipal.website, href) : source.municipal.eventsUrl;
    const dateText = [...block.matchAll(/<div\b[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((div) => stripHtml(div[1]))
      .find((text) => /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b.+\d{4}/i.test(text));
    const { startsAt, endsAt } = parseSquarespaceDateRange(dateText || "");
    if (!eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }

    const locationItems = [...block.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
      .map((item) => stripHtml(item[1]))
      .filter((item) => item && !/maps\.google\.com/i.test(item) && !/^United States$/i.test(item));
    const venueName = locationItems[0] || `${source.town.name} municipal event`;
    const address = cleanAddress(locationItems.slice(1).join(", "));
    const image = firstMatch(block, /<img\b[^>]*(?:data-image|data-src)=["']([^"']+)["']/i);
    const summary = title;
    if (!isImportableMunicipalEvent(title, summary, "")) {
      continue;
    }

    const venue = municipalVenueDetails(source, { title, summary, venueName, address });
    const category = civicPlusMunicipalCategory(title, summary, "");

    imported.push({
      id: `squarespace-${source.town.id}-${slugFromUrl(sourceUrl)}-${startsAt.slice(0, 10)}`,
      sourceId: municipalSourceId(source, "squarespace"),
      title,
      venue: venue.venueName,
      venueName: venue.venueName,
      category,
      source: municipalSourceLabel(source),
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, summary, "families all ages community"),
      cost: null,
      registration: "See source",
      summary,
      image: image ? absoluteUrl(sourceUrl, image) : null,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.municipal.eventsUrl || source.municipal.website,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      tags: ["municipal", source.town.id, category, "family"].filter(Boolean),
      status: "published",
      confidence: venue.confidence
    });
  }

  return imported;
}

function parseJsonLdMunicipalEvents(html, source, startDate, days) {
  const imported = [];
  const events = parseJsonLdEvents(html).filter((event) => isImportableMunicipalEvent(event.name, event.description || event.about || ""));
  for (const event of events) {
    const title = stripHtml(event.name || "");
    const summary = cleanImportedSummary(event.description || event.about || "");
    if (!title) {
      continue;
    }
    const startsRaw = event.startDate || event.startDateTime || event.startDateTimeString || "";
    const endsRaw = event.endDate || event.endDateTime || "";
    const normalizedStarts = localIso(startsRaw || "");
    const startsAt = normalizedStarts && normalizedStarts.includes("T")
      ? normalizedStarts
      : `${countyDateFromJson(event)}T12:00`;
    if (!startsAt || !isDateWithinWindow(startsAt.slice(0, 10), startDate, days)) {
      continue;
    }
    const venueName = stripHtml(event.location?.name || event.location?.label || event.location?.title || "");
    const address = cleanAddress(
      addressFor(event.location || {}) ||
        event.location?.address ||
        event.address?.addressLocality ||
        source.town?.name
    );
    const venue = municipalVenueDetails(source, { title, summary, venueName, address });
    const endsAt = endsRaw ? (localIso(endsRaw).includes("T") ? localIso(endsRaw) : null) : null;
    imported.push({
      id: `jsonld-${source.town.id}-${slugify(title)}-${startsAt.slice(0, 10)}`,
      sourceId: municipalSourceId(source, "jsonld"),
      title,
      venue: venue.venueName,
      venueName: venue.venueName,
      category: civicPlusMunicipalCategory(title, summary, ""),
      source: municipalSourceLabel(source),
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt && endsAt !== startsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, summary, "families all ages community"),
      cost: null,
      registration: "See source",
      summary,
      url: event.url || source.municipal.eventsUrl || source.municipal.website,
      sourceUrl: event.url || source.municipal.eventsUrl || source.municipal.website,
      sourceCalendarUrl: source.municipal.eventsUrl || source.municipal.website,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      tags: ["municipal", source.town.id, civicPlusMunicipalCategory(title, summary, ""), "family"].filter(Boolean),
      status: "published",
      confidence: venue.confidence
    });
  }
  return imported.filter((event) => event.title && event.startsAt && event.sourceUrl);
}

function safeDecodeUriComponent(value) {
  const text = String(value || "");
  try {
    return decodeURIComponent(text.replace(/\+/g, "%20"));
  } catch {
    return text;
  }
}

function revizeDataUrl(source, html = "") {
  if (source.municipal.revizeDataUrl) {
    return source.municipal.revizeDataUrl;
  }

  const baseUrl = source.municipal.eventsUrl || source.municipal.website;
  const webspace = source.municipal.revizeWebspace || firstMatch(html, /RZ\.webspace\s*=\s*['"]([^'"]+)['"]/);
  if (!baseUrl || !webspace) {
    return "";
  }

  const relativeRevizeUrl =
    source.municipal.relativeRevizeUrl ||
    firstMatch(html, /RZ\.protocolRelativeRevizeBaseUrl\s*=\s*['"]([^'"]+)['"]/) ||
    "//cms2.revize.com";
  const protocol = new URL(baseUrl).protocol;
  const url = new URL("/_assets_/plugins/revizeCalendar/calendar_data_handler.php", baseUrl);
  url.searchParams.set("webspace", webspace);
  url.searchParams.set("relative_revize_url", relativeRevizeUrl);
  url.searchParams.set("protocol", protocol);
  return url.toString();
}

function revizeEventImage(rawImage, sourceUrl) {
  const image = safeDecodeUriComponent(rawImage);
  const src = firstMatch(image, /<img\b[^>]*src=["']([^"']+)["']/i);
  if (!src || /placeholder\.png/i.test(src)) {
    return null;
  }
  return absoluteUrl(sourceUrl, src);
}

function revizeEventUrl(rawUrl, source) {
  const value = decodeEntities(String(rawUrl || "").trim());
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(value)) {
    return `https://${value}`;
  }
  return absoluteUrl(source.municipal.eventsUrl || source.municipal.website, value);
}

function revizeSummaryFallback(title) {
  const text = String(title || "");
  if (/time capsule/i.test(text)) {
    return "Hands-on community activity where participants create a personal time capsule.";
  }
  if (/fireworks|fourth of july/i.test(text)) {
    return "Community Fourth of July celebration with fireworks.";
  }
  return "";
}

function parseRevizeMunicipalEvents(rows, source, startDate, days) {
  const imported = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const title = stripHtml(row.title || "");
    const decodedDesc = safeDecodeUriComponent(row.desc || "");
    const summary = cleanImportedSummary(decodedDesc, {
      title,
      venue: row.location,
      venueName: row.location,
      address: row.location
    }) || revizeSummaryFallback(title);
    const calendar = stripHtml(row.primary_calendar_name || "");
    if (!title || !isImportableMunicipalEvent(title, summary, calendar)) {
      continue;
    }

    let startsAt = localIso(row.start || "");
    if (!startsAt) {
      continue;
    }
    if (row.allDay && startsAt.endsWith("T00:00:00")) {
      startsAt = `${startsAt.slice(0, 10)}T12:00:00`;
    }
    if (!isDateWithinWindow(startsAt.slice(0, 10), startDate, days)) {
      continue;
    }

    const endsAt = row.end ? localIso(row.end) : row.duration && !row.allDay ? addMinutes(startsAt, Number(row.duration.split(":")[0]) * 60 + Number(row.duration.split(":")[1] || 0)) : null;
    const venue = municipalVenueDetails(source, {
      title,
      summary,
      venueName: row.location,
      address: row.location
    });
    const sourceUrl = revizeEventUrl(row.url, source) || `${source.municipal.eventsUrl || source.municipal.website}?id=${row.id || row.rid || slugify(title)}`;
    const category = civicPlusMunicipalCategory(title, summary, calendar);
    const image =
      revizeEventImage(row.image || "", source.municipal.eventsUrl || source.municipal.website) ||
      revizeEventImage(decodedDesc, source.municipal.eventsUrl || source.municipal.website);

    imported.push(markSummaryStatus({
      id: `revize-${source.town.id}-${row.id || row.rid || slugify(title)}-${startsAt.slice(0, 10)}`,
      sourceId: municipalSourceId(source, "revize-calendar"),
      externalId: row.id || row.rid || null,
      townId: source.town.id,
      title,
      venue: venue.venueName,
      venueName: venue.venueName,
      category,
      source: municipalSourceLabel(source),
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt && endsAt !== startsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, summary, calendar, "families all ages community"),
      cost: null,
      registration: "See source",
      summary,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: source.municipal.eventsUrl || source.municipal.website,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      image,
      timeLabel: row.allDay ? "All day" : null,
      timeStatus: row.allDay ? "all_day_source_time" : null,
      tags: ["municipal", source.town.id, category, "family"].filter(Boolean),
      status: "published",
      confidence: venue.confidence
    }));
  }
  return imported.filter((event) => event.title && event.startsAt && event.sourceUrl);
}

async function importRevizeMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "revize-calendar")) {
    try {
      const html = await fetchText(source.municipal.eventsUrl || source.municipal.website);
      const dataUrl = revizeDataUrl(source, html);
      if (!dataUrl) {
        throw new Error("missing Revize calendar data URL");
      }
      const rows = JSON.parse(await fetchText(dataUrl));
      imported.push(...parseRevizeMunicipalEvents(rows, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importJsonLdMunicipalEvents(sources, startDate, days, parser) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, parser)) {
    try {
      const html = await fetchText(source.municipal.eventsUrl || source.municipal.website);
      imported.push(...parseJsonLdMunicipalEvents(html, source, startDate, days).map((event) => ({
        ...event,
        id: `${parser}-${event.id}`,
        sourceId: municipalSourceId(source, parser)
      })));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function parseGovOfficeCalendarDateTime(value, startDate) {
  const normalized = collapseWhitespace(value).replace(/\s+to\s+$/i, "");
  const match = normalized.match(
    /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?/i
  );
  if (!match) {
    return null;
  }
  const month = MONTHS.get(match[1].toLowerCase());
  if (!month) {
    return null;
  }
  const dateKey = `${match[3]}-${month}-${String(match[2]).padStart(2, "0")}`;
  if (!match[4]) {
    return `${dateKey}T00:00:00`;
  }
  let hour = Number(match[4]);
  const meridiem = match[6].toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${match[5] || "00"}:00`;
}

function cleanCalendarTitle(value) {
  return stripHtml(value)
    .replace(/^\d{1,2}:\d{2}\s*(?:AM|PM)\s*/i, "")
    .replace(/^\d{1,2}\s*(?:AM|PM)\s*/i, "")
    .trim();
}

function parseGreenBrookAjaxEvents(rawText, source, sourceUrl, startDate, days) {
  let rows = [];
  try {
    rows = JSON.parse(rawText);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) {
    return [];
  }

  const imported = [];
  for (const row of rows) {
    const startsAt = row.start ? `${String(row.start).slice(0, 10)}T00:00:00` : null;
    if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    const title = cleanCalendarTitle(row.title);
    if (!isImportableMunicipalEvent(title, "", "community")) {
      continue;
    }
    const venue = {
      name: source.municipal.defaultVenueName || municipalSourceLabel(source),
      address: source.municipal.defaultAddress || null,
      lat: source.municipal.lat || null,
      lng: source.municipal.lng || null,
      confidence: 0.68
    };
    imported.push({
      id: `greenbrook-ajax-${source.town.id}-${row.ev_id || slugify(title)}-${startsAt.slice(0, 10)}`,
      externalId: row.ev_id ? String(row.ev_id) : slugify(title),
      sourceId: municipalSourceId(source, "greenbrook-ajax-calendar"),
      townId: source.town.id,
      title,
      venue: venue.name,
      venueName: venue.name,
      category: civicPlusMunicipalCategory(title, "", "community"),
      source: municipalSourceLabel(source),
      startsAt,
      endsAt: row.end ? `${String(row.end).slice(0, 10)}T23:59:00` : null,
      timezone: TIMEZONE,
      durationMinutes: null,
      ages: inferAgeBandsFromText(title),
      audiences: ["community"],
      cost: null,
      registration: "See source",
      summary: title,
      url: source.municipal.website || sourceUrl,
      sourceUrl: source.municipal.website || sourceUrl,
      sourceCalendarUrl: sourceUrl,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      tags: ["municipal", "community"],
      status: "published",
      confidence: venue.confidence
    });
  }
  return imported;
}

async function importGreenBrookAjaxMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "greenbrook-ajax-calendar")) {
    try {
      const sourceUrl = source.municipal.rawEventsUrl || source.municipal.eventsUrl || source.municipal.website;
      const rawText = await fetchText(sourceUrl);
      imported.push(...parseGreenBrookAjaxEvents(rawText, source, sourceUrl, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function unfoldICalendar(value) {
  return String(value || "").replace(/\r?\n[ \t]/g, "");
}

function parseICalProperty(block, name) {
  const match = unfoldICalendar(block).match(new RegExp(`(?:^|\\n)${name}(?:;[^:]*)?:(.*)`, "i"));
  return match ? decodeICalText(match[1].trim()) : "";
}

function decodeICalText(value) {
  return decodeEntities(String(value || ""))
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseICalDateTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4] || "00"}:${match[5] || "00"}:${match[6] || "00"}`;
}

function parseAi1ecIcalEvents(text, source, sourceUrl, startDate, days) {
  const imported = [];
  const blocks = unfoldICalendar(text).split("BEGIN:VEVENT").slice(1).map((block) => block.split("END:VEVENT")[0]);
  for (const block of blocks) {
    const rawStart = parseICalProperty(block, "DTSTART");
    const startsAt = parseICalDateTime(rawStart);
    if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    const title = cleanCalendarTitle(parseICalProperty(block, "SUMMARY"));
    const summary = cleanImportedSummary(parseICalProperty(block, "DESCRIPTION"), { title });
    if (!isImportableMunicipalEvent(title, summary, "community")) {
      continue;
    }
    const eventUrl = parseICalProperty(block, "URL") || sourceUrl;
    const venue = {
      name: source.municipal.defaultVenueName || municipalSourceLabel(source),
      address: source.municipal.defaultAddress || null,
      lat: source.municipal.lat || null,
      lng: source.municipal.lng || null,
      confidence: 0.68
    };
    imported.push({
      id: `ai1ec-${source.town.id}-${parseICalProperty(block, "UID") || slugify(`${title}-${startsAt}`)}`,
      externalId: parseICalProperty(block, "UID") || slugify(`${title}-${startsAt}`),
      sourceId: municipalSourceId(source, "ai1ec-ical-calendar"),
      townId: source.town.id,
      title,
      venue: venue.name,
      venueName: venue.name,
      category: civicPlusMunicipalCategory(title, summary, "community"),
      source: municipalSourceLabel(source),
      startsAt,
      endsAt: parseICalDateTime(parseICalProperty(block, "DTEND")),
      timezone: TIMEZONE,
      durationMinutes: null,
      ages: inferAgeBandsFromText(title, summary),
      audiences: ["community"],
      cost: null,
      registration: "See source",
      summary: summary || title,
      url: eventUrl,
      sourceUrl: eventUrl,
      sourceCalendarUrl: sourceUrl,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      tags: ["municipal", "community"],
      status: "published",
      confidence: venue.confidence
    });
  }
  return imported;
}

async function importAi1ecIcalMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "ai1ec-ical-calendar")) {
    try {
      const sourceUrl = source.municipal.rawEventsUrl || source.municipal.eventsUrl || source.municipal.website;
      const text = await fetchText(sourceUrl);
      imported.push(...parseAi1ecIcalEvents(text, source, sourceUrl, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function parseSavvyCitizenTime(dateKey, value) {
  const match = collapseWhitespace(value).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) {
    return `${dateKey}T12:00:00`;
  }
  let hour = Number(match[1]);
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${dateKey}T${String(hour).padStart(2, "0")}:${match[2] || "00"}:00`;
}

function parseSavvyCitizenPluginEvents(html, source, sourceUrl, startDate, days) {
  const imported = [];
  let currentMonth = null;
  let currentYear = null;
  const blockPattern =
    /<div class=["']agenda-month["'][^>]*>([\s\S]*?)<\/div>|<div class=["']agenda-day["']>([\s\S]*?)(?=<div class=["']agenda-day["']|<div class=["']agenda-month["']|<div id=["']more-|<script|<div class=["']powered["']|$)/gi;

  for (const match of html.matchAll(blockPattern)) {
    if (match[1]) {
      const monthMatch = stripHtml(match[1]).match(/^([A-Za-z]+)\s+(\d{4})$/);
      currentMonth = monthMatch ? MONTHS.get(monthMatch[1].toLowerCase()) : null;
      currentYear = monthMatch ? monthMatch[2] : null;
      continue;
    }
    if (!currentMonth || !currentYear || !match[2]) {
      continue;
    }
    const day = firstMatch(match[2], /<div class=["']agenda-day-date["'][^>]*>[\s\S]*?,\s*(\d{1,2})<\/div>/i);
    if (!day) {
      continue;
    }
    const dateKey = `${currentYear}-${currentMonth}-${String(day).padStart(2, "0")}`;
    const itemPattern = /<div class=["']agenda-item["']>([\s\S]*?)(?=<div class=["']agenda-item["']|<\/div>\s*<\/div>|$)/gi;
    for (const itemMatch of match[2].matchAll(itemPattern)) {
      const item = itemMatch[1];
      const eventUrl = firstMatch(item, /<a[^>]+href=["']([^"']+)["']/i) || sourceUrl;
      const externalId = firstMatch(eventUrl, /\/o\/(\d+)/i) || slugify(`${dateKey}-${stripHtml(item)}`);
      const title = cleanCalendarTitle(stripHtml(firstMatch(item, /<span[^>]*>([\s\S]*?)<\/span>/i)));
      const timeText = stripHtml(firstMatch(item, /<div class=["']agenda-item-time["'][^>]*>([\s\S]*?)<\/div>/i));
      const startsAt = parseSavvyCitizenTime(dateKey, timeText);
      if (!title || !eventStartsWithinWindow(startsAt, startDate, days)) {
        continue;
      }
      if (!isImportableMunicipalEvent(title, "", "community")) {
        continue;
      }
      const venue = {
        name: source.municipal.defaultVenueName || municipalSourceLabel(source),
        address: source.municipal.defaultAddress || null,
        lat: source.municipal.lat || numericCoordinate(source.town.center?.lat),
        lng: source.municipal.lng || numericCoordinate(source.town.center?.lng),
        confidence: source.municipal.defaultAddress ? 0.82 : 0.7
      };
      imported.push({
        id: `savvycitizen-${source.town.id}-${externalId}-${dateKey}`,
        externalId,
        sourceId: municipalSourceId(source, "savvycitizen-plugin"),
        townId: source.town.id,
        title,
        venue: venue.name,
        venueName: venue.name,
        category: civicPlusMunicipalCategory(title, "", "community"),
        source: municipalSourceLabel(source),
        startsAt,
        endsAt: addMinutes(startsAt, 60),
        timezone: TIMEZONE,
        durationMinutes: 60,
        ages: inferAgeBandsFromText(title),
        audiences: ["community"],
        cost: null,
        registration: "See source",
        summary: title,
        url: eventUrl,
        sourceUrl: eventUrl,
        sourceCalendarUrl: sourceUrl,
        address: venue.address,
        lat: venue.lat,
        lng: venue.lng,
        tags: ["municipal", "community", "savvycitizen"],
        status: "published",
        confidence: venue.confidence
      });
    }
  }
  return imported;
}

async function importSavvyCitizenMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "savvycitizen-plugin")) {
    try {
      const sourceUrl = source.municipal.rawEventsUrl || source.municipal.eventsUrl || source.municipal.website;
      const html = await fetchText(sourceUrl);
      imported.push(...parseSavvyCitizenPluginEvents(html, source, sourceUrl, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function parseEggZackDateTime(value) {
  const text = collapseWhitespace(value);
  const match = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) {
    return null;
  }
  const month = MONTHS.get(match[1].toLowerCase());
  if (!month) {
    return null;
  }
  let hour = Number(match[4]);
  const meridiem = match[6].toLowerCase();
  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return `${match[3]}-${month}-${String(match[2]).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${match[5] || "00"}:00`;
}

function parseEggZackEventArchive(html, source, sourceUrl, startDate, days) {
  const imported = [];
  const cards = html.split(/<div class="listing_a listing_article\b/i).slice(1);
  for (const card of cards) {
    const href = firstMatch(card, /<h2>\s*<a href=["']([^"']+)["']/i) || firstMatch(card, /<a href=["']([^"']+)["'][^>]*title=/i);
    const title = stripHtml(firstMatch(card, /<h2>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i));
    const desc = stripHtml(firstMatch(card, /<div class="listing_desc">([\s\S]*?)<\/div>/i));
    const timeText = stripHtml(firstMatch(card, /<span class="listing_event_time">([\s\S]*?)<\/span>/i));
    const timeParts = [...timeText.matchAll(/[A-Za-z]+\s+\d{1,2},\s+\d{4},\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi)].map(
      (match) => match[0]
    );
    const startsAt = parseEggZackDateTime(timeParts[0] || timeText);
    const endsAt = timeParts[1] ? parseEggZackDateTime(timeParts[1]) : null;
    if (!href || !title || !startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    if (!isImportableMunicipalEvent(title, desc, "community")) {
      continue;
    }
    const eventUrl = absoluteUrl(sourceUrl, href);
    const venue = {
      name: source.municipal.defaultVenueName || municipalSourceLabel(source),
      address: source.municipal.defaultAddress || null,
      lat: source.municipal.lat || null,
      lng: source.municipal.lng || null,
      confidence: 0.68
    };
    imported.push({
      id: `eggzack-${source.town.id}-${slugFromUrl(eventUrl)}-${startsAt.slice(0, 10)}`,
      externalId: firstMatch(card, /data-article=["']([^"']+)["']/i) || slugFromUrl(eventUrl),
      sourceId: municipalSourceId(source, "eggzack-event-archive"),
      townId: source.town.id,
      title,
      venue: venue.name,
      venueName: venue.name,
      category: civicPlusMunicipalCategory(title, desc, "community"),
      source: municipalSourceLabel(source),
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, desc),
      audiences: ["community"],
      cost: null,
      registration: "See source",
      summary: cleanImportedSummary(desc, { title }) || title,
      url: eventUrl,
      sourceUrl: eventUrl,
      sourceCalendarUrl: sourceUrl,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      tags: ["municipal", "community"],
      status: "published",
      confidence: venue.confidence
    });
  }
  return imported;
}

async function importEggZackMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "eggzack-event-archive")) {
    try {
      const sourceUrl = source.municipal.eventsUrl || source.municipal.website;
      const html = await fetchText(sourceUrl);
      imported.push(...parseEggZackEventArchive(html, source, sourceUrl, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function govOfficeCalendarUrl(source, year, month) {
  const base = source.municipal.eventsUrl || source.municipal.website;
  const url = new URL(base);
  if (!url.searchParams.get("Type")) {
    url.searchParams.set("Type", source.municipal.type || "B_EV");
  }
  if (source.municipal.sectionId && !url.searchParams.get("SEC")) {
    url.searchParams.set("SEC", source.municipal.sectionId);
  }
  url.searchParams.set("month", String(month));
  url.searchParams.set("year", String(year));
  return url.toString();
}

function parseGovOfficeCalendarEvents(html, source, calendarUrl, startDate, days) {
  const links = html.split('<a class="eventLink"').slice(1);
  const imported = [];
  for (const link of links) {
    const href = firstMatch(link, /href=["']([^"']+)["']/i);
    const title = stripHtml(firstMatch(link, /<span class="eventTitle">([\s\S]*?)<\/span>/i));
    const tip = stripHtml(firstMatch(link, /<div class="eventTip">([\s\S]*?)<\/div>\s*<\/div>/i));
    const dateTip = tip.replace(new RegExp(`^${escapeRegExp(title)}\\s*`, "i"), "").trim();
    const timeParts = dateTip.split(/\s+to\s+/i).map((part) => part.trim()).filter(Boolean);
    const startsAt = parseGovOfficeCalendarDateTime(timeParts[0] || "", startDate);
    const endsAt = timeParts[1] ? parseGovOfficeCalendarDateTime(timeParts[1], startDate) : null;
    if (!href || !title || !startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
      continue;
    }
    if (!isImportableMunicipalEvent(title, tip, "community")) {
      continue;
    }
    const sourceUrl = absoluteUrl(calendarUrl, decodeEntities(href));
    const venue = findMunicipalLocationOverride(source, "", source.municipal.defaultAddress, title, tip) || {
      name: source.municipal.defaultVenueName || municipalSourceLabel(source),
      address: source.municipal.defaultAddress || null,
      lat: source.municipal.lat || null,
      lng: source.municipal.lng || null,
      confidence: 0.72
    };
    imported.push({
      id: `govoffice-${source.town.id}-${slugFromUrl(sourceUrl)}-${startsAt.slice(0, 10)}`,
      externalId: firstMatch(sourceUrl, /DE=([^&]+)/i) || slugFromUrl(sourceUrl),
      sourceId: municipalSourceId(source, "govoffice-calendar"),
      townId: source.town.id,
      title,
      venue: venue.name,
      venueName: venue.name,
      category: civicPlusMunicipalCategory(title, tip, "community"),
      source: municipalSourceLabel(source),
      startsAt,
      endsAt,
      timezone: TIMEZONE,
      durationMinutes: endsAt ? durationMinutes(startsAt, endsAt) : null,
      ages: inferAgeBandsFromText(title, tip, "community"),
      audiences: ["community"],
      cost: null,
      registration: "See source",
      summary: cleanImportedSummary(tip.replace(title, "")) || title,
      url: sourceUrl,
      sourceUrl,
      sourceCalendarUrl: calendarUrl,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      tags: ["municipal", "community"],
      status: "published",
      confidence: venue.confidence
    });
  }
  return imported;
}

async function importGovOfficeMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "govoffice-calendar")) {
    for (const { year, month } of monthsInWindow(startDate, days)) {
      const url = govOfficeCalendarUrl(source, year, month);
      try {
        const html = await fetchText(url);
        imported.push(...parseGovOfficeCalendarEvents(html, source, url, startDate, days));
      } catch (error) {
        console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
      }
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

function eventEspressoApiUrl(source, resource) {
  const base = new URL(source.municipal.eventEspressoApiBase || "/wp-json/ee/v4.8.36", source.municipal.website);
  return new URL(`${base.pathname.replace(/\/$/, "")}/${resource.replace(/^\//, "")}`, base.origin);
}

function eventEspressoDatetimesUrl(source) {
  const url = eventEspressoApiUrl(source, "datetimes");
  url.searchParams.set("limit", String(source.municipal.eventEspressoLimit || 100));
  url.searchParams.set("order_by", "DTT_EVT_start");
  url.searchParams.set("sort", "ASC");
  return url.toString();
}

async function eventEspressoEventDetail(source, eventId, cache) {
  if (cache.has(eventId)) {
    return cache.get(eventId);
  }
  const url = eventEspressoApiUrl(source, `events/${eventId}`).toString();
  const detail = await fetchJson(url);
  cache.set(eventId, detail);
  return detail;
}

async function importEventEspressoMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "eventespresso-datetimes")) {
    const detailCache = new Map();
    try {
      const datetimes = await fetchJson(eventEspressoDatetimesUrl(source));
      for (const item of datetimes) {
        const startsAt = localIso(item.DTT_EVT_start);
        if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
          continue;
        }
        const eventId = String(item.EVT_ID || "");
        let detail = {};
        try {
          detail = eventId ? await eventEspressoEventDetail(source, eventId, detailCache) : {};
        } catch (error) {
          console.warn(`warning: could not fetch ${municipalSourceLabel(source)} Event Espresso event ${eventId}: ${error.message}`);
        }
        const title = normalizeImportedTitle(item.DTT_name || detail.EVT_name || "");
        const detailSummary = cleanImportedSummary(detail.EVT_desc?.rendered || detail.EVT_short_desc || item.DTT_description?.rendered || "", {
          venueName: source.municipal.defaultVenueName,
          address: source.municipal.defaultAddress
        });
        if (!title || !isImportableEventEspressoMunicipalEvent(title, detailSummary)) {
          continue;
        }
        const endsAt = localIso(item.DTT_EVT_end);
        const sourceUrl = detail.link || source.municipal.eventsUrl || source.municipal.website;
        const venue = municipalVenueDetails(source, {
          title,
          summary: detailSummary,
          venueName: source.municipal.defaultVenueName,
          address: source.municipal.defaultAddress
        });
        imported.push({
          id: `eventespresso-${source.town.id}-${eventId || item.DTT_ID}-${item.DTT_ID}-${startsAt.slice(0, 10)}`,
          externalId: `${eventId || "event"}-${item.DTT_ID}`,
          sourceId: municipalSourceId(source, "eventespresso-datetimes"),
          townId: source.town.id,
          title,
          venue: venue.venueName,
          venueName: venue.venueName,
          category: /camp/i.test(title) ? "camp" : /sports|basketball|football|dodgeball|cheer/i.test(title) ? "sports" : "workshop",
          source: municipalSourceLabel(source),
          startsAt,
          endsAt: endsAt && endsAt !== startsAt ? endsAt : null,
          timezone: TIMEZONE,
          durationMinutes: endsAt && endsAt !== startsAt ? durationMinutes(startsAt, endsAt) : null,
          ages: inferAgeBandsFromText(title, detailSummary),
          audiences: /teen/i.test(title) ? ["teens"] : ["children", "families"],
          cost: null,
          registration: "See source",
          summary: detailSummary || title,
          url: sourceUrl,
          sourceUrl,
          sourceCalendarUrl: source.municipal.eventsUrl || source.municipal.website,
          address: venue.address,
          lat: venue.lat,
          lng: venue.lng,
          tags: ["municipal", "eventespresso"],
          status: "published",
          confidence: Math.min(0.88, venue.confidence || 0.76)
        });
      }
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importSquarespaceMunicipalEvents(sources, startDate, days) {
  const imported = [];
  for (const source of allMunicipalParserSources(sources, "squarespace-calendar-list")) {
    try {
      const html = await fetchText(source.municipal.eventsUrl || source.municipal.website);
      imported.push(...parseSquarespaceCalendarListings(html, source, startDate, days));
    } catch (error) {
      console.warn(`warning: could not import ${municipalSourceLabel(source)}: ${error.message}`);
    }
  }
  return [...new Map(imported.map((event) => [event.id, event])).values()];
}

async function importNjCarnivalsEvents(sources, startDate, days) {
  const source = sources.sharedSources?.["nj-carnivals"];
  if (!source || source.status !== "importable") {
    return [];
  }

  const imported = [];
  const seenPages = new Set();
  const maxPages = Number(source.maxPages || 6);

  try {
    const firstUrl = njCarnivalsSearchUrl(source, 1);
    const firstHtml = await fetchText(firstUrl);
    seenPages.add(1);
    imported.push(...parseNjCarnivalsListings(firstHtml, source, sources, startDate, days));

    const highestPage = njCarnivalsHighestPage(firstHtml, maxPages);
    for (let page = 2; page <= highestPage; page += 1) {
      if (seenPages.has(page)) {
        continue;
      }
      const html = await fetchText(njCarnivalsSearchUrl(source, page));
      seenPages.add(page);
      imported.push(...parseNjCarnivalsListings(html, source, sources, startDate, days));
    }
  } catch (error) {
    console.warn(`warning: could not import ${source.eventsUrl || source.website}: ${error.message}`);
  }

  const enriched = await enrichNjCarnivalsDetailHours(imported.filter((event) => event.startsAt && event.sourceUrl));
  return [...new Map(enriched.map((event) => [event.id, event])).values()];
}

function eventbriteJsonLdItems(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const events = [];
  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script[1].trim());
      jsonLdDeepNodes(data)
        .filter(isJsonLdEventType)
        .forEach((item) => events.push(item));
    } catch {
      // Eventbrite can include non-event JSON-LD blocks; skip malformed or unrelated blocks.
    }
  });
  return events;
}

function eventbriteCanonicalUrl(html, fallbackUrl) {
  const canonical = firstMatch(html, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return canonical ? decodeEntities(canonical) : fallbackUrl;
}

function eventbriteDateKey(value) {
  const dateKey = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : "";
}

function eventbriteIsoDateTime(value, fallbackDateKey, fallbackTime) {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 19);
  }
  return fallbackDateKey ? localDateTime(fallbackDateKey, fallbackTime) : null;
}

function eventbriteAddress(address) {
  return cleanAddress(addressFromPostalAddress(address));
}

function eventbriteVenueName(location, address) {
  const locationName = stripHtml(location?.name || "");
  if (looksLikeStreetAddress(locationName)) {
    const addressLead = stripHtml(String(address || "").split(",")[0] || "");
    if (addressLead && !looksLikeStreetAddress(addressLead)) {
      return addressLead;
    }
  }
  return displayVenueName(locationName, address || "Eventbrite event");
}

function eventbriteTownIdForLocation(location, townLookup) {
  const locality = normalizePlaceName(location?.address?.addressLocality || "");
  if (!locality) {
    return null;
  }
  return townLookup.get(locality)?.id || null;
}

const EVENTBRITE_INCLUDE_PATTERN =
  /\b(?:kids?|children|child|family|families|youth|teen|tween|toddler|preschool|baby|babies|all ages|craft|stem|coding|robotics|science|maker|lego|art|paint|music|story|yoga|camp|workshop|market|festival|fair|carnival|play|dance|nature|farm|juneteenth|summer)\b/i;
const EVENTBRITE_EXCLUDE_PATTERN =
  /\b(?:adult only|adults only|21\+|18\+|bar crawl|cocktail|wine tasting|beer|brewery|nightclub|after dark|speed dating|singles|networking|real estate|investing|trading|crypto|career fair|job fair|conference|summit|webinar|professional development)\b/i;

function isImportableEventbriteEvent(event) {
  const text = [event.name, event.description, event.location?.name].filter(Boolean).join(" ");
  if (!EVENTBRITE_INCLUDE_PATTERN.test(text)) {
    return false;
  }
  if (EVENTBRITE_EXCLUDE_PATTERN.test(text)) {
    return false;
  }
  return !isClosureOrNonEvent(event.name, event.description);
}

function eventbriteCandidateLinksFromText(...values) {
  const urls = new Set();
  values.forEach((value) => {
    for (const match of stripHtml(value || "").matchAll(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?[^\s<>"')]*(?=\s|$|[),.])/gi)) {
      const raw = match[0].replace(/[),.]+$/g, "");
      if (!raw || !raw.includes(".")) {
        continue;
      }
      urls.add(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    }
  });
  return [...urls];
}

function eventbriteOfficialUrlCandidate(_html, event) {
  const blockedHostPattern = /(?:^|\.)eventbrite\.[a-z.]+$|(?:^|\.)eventbrite$|(?:^|\.)evbstatic(?:\.com)?$|(?:^|\.)evbuc(?:\.com)?$|(?:^|\.)google\.com$|(?:^|\.)googletagmanager\.com$|(?:^|\.)gstatic\.com$|(?:^|\.)schema\.org$|(?:^|\.)twitter\.com$|(?:^|\.)x\.com$|(?:^|\.)facebook\.com$|(?:^|\.)instagram\.com$/i;
  const titleTokens = new Set(
    String(event.name || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3)
  );
  const organizerName = normalizePlaceName(event.organizer?.name || "");
  const organizerUrl = event.organizer?.url ? [event.organizer.url] : [];
  const candidates = [...organizerUrl, ...eventbriteCandidateLinksFromText(event.description, event.organizer?.description)]
    .map((url) => {
      try {
        return new URL(url).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .filter((url) => {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return /\.[a-z]{2,}$/i.test(host) && !blockedHostPattern.test(host) && !/\.(?:jpg|jpeg|png|gif|webp|svg|css|js)$/i.test(new URL(url).pathname);
    });

  let best = "";
  let bestScore = 0;
  candidates.forEach((url) => {
    const parsed = new URL(url);
    const haystack = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
    let score = 0;
    titleTokens.forEach((token) => {
      if (haystack.includes(token)) {
        score += 2;
      }
    });
    if (organizerName && normalizePlaceName(parsed.hostname).includes(organizerName.split(" ")[0])) {
      score += 2;
    }
    if (/event|calendar|workshop|program|kids|family|camp/i.test(url)) {
      score += 1;
    }
    if (url === event.organizer?.url) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  });
  return bestScore >= 1 ? best : "";
}

async function eventbriteDetailEvent(source, event, fetchPage = fetchText) {
  if (!event.url) {
    return { event, eventbriteUrl: "", officialUrl: "" };
  }
  try {
    const html = await fetchPage(event.url);
    const detail = eventbriteJsonLdItems(html)[0] || {};
    const merged = {
      ...event,
      ...detail,
      location: detail.location || event.location,
      organizer: detail.organizer || event.organizer,
      url: detail.url || eventbriteCanonicalUrl(html, event.url) || event.url,
      image: detail.image || event.image,
      description: detail.description || event.description
    };
    return {
      event: merged,
      eventbriteUrl: event.url,
      officialUrl: eventbriteOfficialUrlCandidate(html, merged)
    };
  } catch (error) {
    console.warn(`warning: could not inspect Eventbrite detail ${event.url}: ${error.message}`);
    return { event, eventbriteUrl: event.url, officialUrl: "" };
  }
}

function eventbriteEventRecords(source, event, sources, startDate, days, evidence = {}) {
  if (!isImportableEventbriteEvent(event)) {
    return [];
  }
  const url = event.url || "";
  const title = stripHtml(event.name || "");
  const firstDate = eventbriteDateKey(event.startDate);
  const lastDate = eventbriteDateKey(event.endDate) || firstDate;
  if (!title || !url || !firstDate) {
    return [];
  }

  const allowedStates = new Set(source.allowedStates || ["NJ"]);
  const state = stripHtml(event.location?.address?.addressRegion || "");
  if (allowedStates.size && state && !allowedStates.has(state)) {
    return [];
  }

  const townLookup = buildTownLookup(sources);
  const location = event.location || {};
  const address = eventbriteAddress(location.address);
  const geo = location.geo || {};
  const venueName = eventbriteVenueName(location, address);
  const baseLocation = {
    id: slugify(`${venueName}-${address || url}`),
    name: venueName,
    townId: eventbriteTownIdForLocation(location, townLookup),
    townNameRaw: stripHtml(location.address?.addressLocality || ""),
    townAssignmentSource: "eventbrite-jsonld",
    address,
    lat: Number(geo.latitude || 0),
    lng: Number(geo.longitude || 0),
    url
  };
  if (!baseLocation.townId) {
    baseLocation.townAssignmentStatus = "needs_registry_town";
  }

  const hasStartTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(event.startDate || ""));
  const hasEndTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(event.endDate || ""));
  return datesInRange(firstDate, lastDate)
    .filter((dateKey) => isDateWithinWindow(dateKey, startDate, days))
    .map((dateKey) => {
      const startsAt = hasStartTime && dateKey === firstDate
        ? eventbriteIsoDateTime(event.startDate, dateKey, "00:00")
        : localDateTime(dateKey, "00:00");
      const endsAt = hasEndTime && dateKey === lastDate
        ? eventbriteIsoDateTime(event.endDate, dateKey, "23:59")
        : localDateTime(dateKey, "23:59");
      const record = regionalEventRecord(source, {
        id: `${source.id}-${slugFromUrl(url)}-${dateKey}`,
        externalId: `${slugFromUrl(url)}-${dateKey}`,
        title,
        startsAt,
        endsAt,
        summary: event.description || "",
        sourceUrl: evidence.officialUrl || url,
        location: baseLocation,
        category: "eventbrite",
        ages: inferAgeBandsFromText(title, event.description || ""),
        registration: "Eventbrite",
        image: Array.isArray(event.image) ? event.image[0] : event.image || null,
        tags: ["eventbrite", "ticketing"],
        confidence: evidence.officialUrl ? (baseLocation.townId ? 0.78 : 0.6) : (baseLocation.townId ? 0.58 : 0.45)
      });
      record.sourcePages = [
        evidence.officialUrl ? { url: evidence.officialUrl, source: "Official source candidate" } : null,
        { url: evidence.eventbriteUrl || url, source: "Eventbrite discovery page" }
      ].filter(Boolean);
      record.discoverySource = "Eventbrite";
      record.discoverySourceUrl = evidence.eventbriteUrl || url;
      if (!evidence.officialUrl) {
        record.sourceStatus = "eventbrite_as_source";
        record.reviewNotes = record.status === "review"
          ? "Eventbrite is used as the source; physical town or location still needs registry/coordinate review."
          : "Eventbrite is used as the source because no official non-Eventbrite event notice was found automatically.";
      }
      if (!hasStartTime) {
        record.timeLabel = "Date listed; time TBA";
        record.timeStatus = "date_only_time_unconfirmed";
      }
      if (firstDate !== lastDate) {
        record.dateExpansionStatus = "expanded_from_eventbrite_range";
      }
      return record;
    });
}

function eventbritePageUrl(template, page) {
  return String(template).replace("{page}", String(page));
}

function eventbriteTownSearchSlug(town) {
  return normalizePlaceName(String(town.name || "").replace(/^city of\s+/i, ""))
    .replace(/^city of\s+/, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function eventbriteSearchTemplates(source, sources) {
  const templates = [];
  if (source.searchMode === "covered-towns") {
    const pathTemplates = source.townSearchPathTemplates?.length
      ? source.townSearchPathTemplates
      : ["https://www.eventbrite.com/d/nj--{town}/kids/?page={page}"];
    (sources.towns || [])
      .filter((town) => town.withinCoverage !== false)
      .forEach((town) => {
        const townSlug = eventbriteTownSearchSlug(town);
        if (!townSlug) {
          return;
        }
        pathTemplates.forEach((template) => {
          templates.push(template.replace("{town}", townSlug));
        });
      });
  }
  if (source.searchUrls?.length) {
    templates.push(...source.searchUrls);
  }
  if (!templates.length && (source.eventsUrl || source.website)) {
    templates.push(source.eventsUrl || source.website);
  }
  return [...new Set(templates)];
}

async function importEventbriteEvents(sources, startDate, days) {
  const configuredSource = sources.sharedSources?.eventbrite;
  if (!configuredSource || configuredSource.status !== "importable") {
    return [];
  }
  const source = { id: "eventbrite", ...configuredSource };
  const imported = [];
  const templates = eventbriteSearchTemplates(source, sources);
  const maxPages = Math.max(1, Number(source.maxPages || 1));
  const detailCache = new Map();
  let lastRequestAt = 0;
  const requestDelayMs = Math.max(0, Number(source.requestDelayMs || 0));
  async function fetchEventbriteText(url) {
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt && elapsed < requestDelayMs) {
      await sleep(requestDelayMs - elapsed);
    }
    lastRequestAt = Date.now();
    return fetchText(url, { "user-agent": "Mozilla/5.0 Where2Go data importer" });
  }
  for (const template of templates) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = eventbritePageUrl(template, page);
      try {
        const html = await fetchEventbriteText(url);
        for (const event of eventbriteJsonLdItems(html)) {
          if (!event.url) {
            continue;
          }
          if (!detailCache.has(event.url)) {
            detailCache.set(event.url, await eventbriteDetailEvent(source, event, fetchEventbriteText));
          }
          const detail = detailCache.get(event.url);
          imported.push(...eventbriteEventRecords(source, detail.event, sources, startDate, days, detail));
        }
      } catch (error) {
        console.warn(`warning: could not import Eventbrite page ${url}: ${error.message}`);
      }
    }
  }
  return [...new Map(imported.filter((event) => event.startsAt && event.sourceUrl).map((event) => [event.id, event])).values()];
}

function patchNextData(html) {
  const match = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function patchCalendarEvents(html) {
  const data = patchNextData(html);
  const allEvents = data?.props?.pageProps?.mainContent?.allEvents || {};
  return Object.values(allEvents)
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .filter((event) => event?.type === "event" && event.id);
}

function patchEditionSlugFromTown(town) {
  return normalizePlaceName(town.name)
    .replace(/\band\b/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function patchCalendarUrl(source, editionSlug) {
  return String(source.calendarUrlTemplate || "https://patch.com/new-jersey/{editionSlug}/calendar").replace(
    "{editionSlug}",
    editionSlug
  );
}

function patchEditionUrls(source, sources) {
  const urls = [];
  const configuredTownIds = new Set();
  (source.editionOverrides || []).forEach((edition) => {
    if (!edition?.editionSlug) {
      return;
    }
    urls.push({ url: patchCalendarUrl(source, edition.editionSlug), edition });
    (edition.servesTownIds || []).forEach((townId) => configuredTownIds.add(townId));
  });

  if (source.includeGeneratedTownSlugs !== false) {
    (sources.towns || [])
      .filter((town) => town.withinCoverage !== false && !configuredTownIds.has(town.id))
      .forEach((town) => {
        const editionSlug = patchEditionSlugFromTown(town);
        if (editionSlug) {
          urls.push({ url: patchCalendarUrl(source, editionSlug), edition: { editionSlug, label: town.name, servesTownIds: [town.id] } });
        }
      });
  }
  return [...new Map(urls.map((entry) => [entry.url, entry])).values()];
}

function patchEventDateTime(event) {
  const raw = event.displayDate || (Number(event.displayDateTimestamp) ? Number(event.displayDateTimestamp) * 1000 : null);
  return raw ? zonedWallIso(raw, TIMEZONE) : null;
}

function patchEventAddress(address) {
  if (!address) {
    return "";
  }
  const structured = [
    address.streetAddress,
    address.city,
    [address.region, address.postalCode].filter(Boolean).join(" ")
  ]
    .filter(Boolean)
    .join(", ");
  return cleanAddress(structured || address.name || "");
}

function patchLocationFromEvent(event, townLookup) {
  const address = event.address || {};
  const town = townLookup.get(normalizePlaceName(address.city || ""));
  const lat = Number(address.latitude || 0);
  const lng = Number(address.longitude || 0);
  return {
    id: slugify(`${address.name || event.title}-${patchEventAddress(address) || event.id}`),
    name: stripHtml(address.name || event.patch?.name || "Patch event"),
    townId: town?.id || null,
    townNameRaw: stripHtml(address.city || event.patch?.name || ""),
    townAssignmentStatus: town?.id ? "assigned" : "needs_registry_town",
    townAssignmentSource: "patch-calendar",
    address: patchEventAddress(address),
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    url: event.canonicalUrl ? absoluteUrl("https://patch.com", event.canonicalUrl) : "https://patch.com/"
  };
}

const PATCH_INCLUDE_PATTERN =
  /\b(?:kids?|children|child|family|families|youth|teen|tween|toddler|preschool|baby|babies|all ages|craft|stem|science|maker|lego|music|concert|chorale|story|camp|market|festival|festa|fair|carnival|fireworks|parade|play|dance|nature|farm|juneteenth|summer|holiday|library|museum)\b/i;
const PATCH_EXCLUDE_PATTERN =
  /\b(?:adult only|adults only|21\+|18\+|senior|seniors|bar crawl|cocktail|wine tasting|beer|brewery|nightclub|psychic|readings?|real estate|open house|self-care|worship|worship service|religious service|unemployed|training grant|certifications?|webinar|networking|estate jewelry|jewelry event|investment|crypto|career fair|job fair|professional development)\b/i;

function isImportablePatchEvent(event) {
  const text = [event.title, event.summary, event.body, event.address?.name].filter(Boolean).join(" ");
  if (PATCH_EXCLUDE_PATTERN.test(text)) {
    return false;
  }
  return PATCH_INCLUDE_PATTERN.test(text) && !isClosureOrNonEvent(event.title, event.summary || event.body);
}

function patchEventRecord(source, event, sources, startDate, days) {
  if (!isImportablePatchEvent(event)) {
    return null;
  }
  const startsAt = patchEventDateTime(event);
  if (!startsAt || !eventStartsWithinWindow(startsAt, startDate, days)) {
    return null;
  }
  const patchUrl = event.canonicalUrl ? absoluteUrl("https://patch.com", event.canonicalUrl) : source.eventsUrl || source.website;
  const officialUrl = event.eventSiteUrl || "";
  const location = patchLocationFromEvent(event, buildTownLookup(sources));
  const record = regionalEventRecord(source, {
    id: `${source.id}-${slugify(event.id)}-${startsAt.slice(0, 10)}`,
    externalId: event.id,
    title: event.title,
    startsAt,
    endsAt: addMinutes(startsAt, Number(source.defaultDurationMinutes || 90)),
    summary: event.summary || event.body || "",
    sourceUrl: officialUrl || patchUrl,
    location,
    category: "patch",
    ages: inferAgeBandsFromText(event.title, event.summary || event.body || ""),
    registration: officialUrl ? "See source" : "Patch",
    image: event.imageThumbnail || event.ogImageUrl || event.images?.[0]?.url || null,
    tags: ["patch", "third-party-directory"],
    confidence: officialUrl ? (location.townId ? 0.74 : 0.58) : (location.townId ? 0.62 : 0.48)
  });
  record.sourcePages = [
    officialUrl ? { url: officialUrl, source: "Event source page" } : null,
    { url: patchUrl, source: "Patch discovery page" }
  ].filter(Boolean);
  record.discoverySource = "Patch";
  record.discoverySourceUrl = patchUrl;
  if (!officialUrl) {
    record.sourceStatus = "patch_as_source";
    record.reviewNotes = record.status === "review"
      ? "Patch is used as the source; physical town or location still needs registry/coordinate review."
      : "Patch is used as the source because no separate event source URL was listed.";
  }
  return record;
}

async function importPatchEvents(sources, startDate, days) {
  const configuredSource = sources.sharedSources?.patch;
  if (!configuredSource || configuredSource.status !== "importable") {
    return [];
  }
  const source = { id: "patch", ...configuredSource };
  const imported = [];
  for (const entry of patchEditionUrls(source, sources)) {
    try {
      const html = await fetchText(entry.url, { "user-agent": "Mozilla/5.0 Where2Go data importer" });
      patchCalendarEvents(html).forEach((event) => {
        const record = patchEventRecord(source, event, sources, startDate, days);
        if (record) {
          imported.push(record);
        }
      });
    } catch (error) {
      console.warn(`warning: could not import Patch page ${entry.url}: ${error.message}`);
    }
  }
  return [...new Map(imported.filter((event) => event.startsAt && event.sourceUrl).map((event) => [event.id, event])).values()];
}

function mergeEvents(existing, incoming, importedAt) {
  const byId = new Map(existing.map((event) => [event.id, event]));

  incoming.forEach((event) => {
    const previous = byId.get(event.id);
    byId.set(event.id, {
      ...(previous ?? {}),
      ...event,
      firstSeenAt: previous?.firstSeenAt || importedAt,
      lastSeenAt: importedAt
    });
  });

  return [...byId.values()]
    .filter(
      (event) =>
        eventStartsAtOrAfter(event.startsAt) &&
        !isClosureOrNonEvent(event.title, event.summary) &&
        !startsTooLateForKids(event) &&
        !isAdultNightlifeEvent(event) &&
        !hasStaleExplicitDate(event)
    )
    .sort((a, b) => {
    const dateCompare = String(a.startsAt || "").localeCompare(String(b.startsAt || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function applyTownCoverage(events, sources) {
  const removedTownIds = new Set(
    (sources.towns || [])
      .filter((town) => town.withinCoverage === false)
      .map((town) => town.id)
  );
  events.forEach((event) => {
    if (removedTownIds.has(event.townId)) {
      event.withinCoverage = false;
      event.coverageStatus = "town_removed_no_data_source";
    }
  });
}

async function main() {
  const importedAt = new Date().toISOString();
  const sources = await readJson(SOURCES_FILE, null);
  const explicitStart = process.argv.includes("--start");
  const defaultLookaheadDays = Number(sources?.eventPolicy?.defaultLookaheadDays || 60);
  const requestedDays = Math.max(1, Number(argValue("--days", String(defaultLookaheadDays))) || defaultLookaheadDays);
  const defaultLookbackDays = Math.max(0, Number(sources?.eventPolicy?.importLookbackDays || 0) || 0);
  const lookbackDays = explicitStart ? 0 : Math.max(0, Number(argValue("--past-days", String(defaultLookbackDays))) || 0);
  const today = todayInNewYork();
  const startDate = explicitStart ? argValue("--start", today) : addDateDays(today, -lookbackDays);
  const days = requestedDays + (explicitStart ? 0 : lookbackDays);
  const replace = process.argv.includes("--replace");
  const existingEvents = replace ? [] : await readJson(EVENTS_FILE, []);
  const selected = selectedImporters();

  const importers = [
    { name: "sclsnj-libnet", run: importSclsnjEvents },
    { name: "localhop-calendar", run: importLocalHopEvents },
    { name: "civicplus-calendar", run: importCivicPlusMunicipalEvents },
    { name: "joomla-dpcalendar-raw", run: importDpCalendarMunicipalEvents },
    { name: "squarespace-calendar-list", run: importSquarespaceMunicipalEvents },
    { name: "communico-libnet", run: importCommunicoLibnetLibraryEvents },
    { name: "librarycalendar-list", run: importLibraryCalendarEvents },
    { name: "engagedpatrons-list", run: importEngagedPatronsLibraryEvents },
    { name: "mylibrary-homepage-events", run: importMylibraryHomepageEvents },
    { name: "nbfpl-static-events", run: importNbfplStaticEvents },
    { name: "assabet-rss", run: importAssabetRssEvents },
    { name: "events-manager-grid", run: importEventsManagerGridEvents },
    { name: "modern-events-calendar-html", run: importModernEventsCalendarHtmlEvents },
    { name: "mylibrary-featured-carousel", run: importMylibraryCarouselEvents },
    { name: "squarespace-library-calendar", run: importSquarespaceLibraryEvents },
    { name: "libcal-list", run: importLibCalEvents },
    { name: "eventorganiser-fullcal", run: importEventOrganiserEvents },
    { name: "joomla-event-booking-calendar", run: importJoomlaEventBookingEvents },
    { name: "joomla-jevents-calendar", run: importJoomlaJEventsLibraryEvents },
    { name: "configured-library-events", run: importConfiguredLibraryEvents },
    { name: "configured-workshops", run: importConfiguredWorkshopEvents },
    { name: "configured-regional-events", run: importConfiguredRegionalEvents },
    { name: "county-events-calendar", run: importCountyCalendarEvents },
    { name: "greenbrook-ajax-calendar", run: importGreenBrookAjaxMunicipalEvents },
    { name: "ai1ec-ical-calendar", run: importAi1ecIcalMunicipalEvents },
    { name: "savvycitizen-plugin", run: importSavvyCitizenMunicipalEvents },
    { name: "eggzack-event-archive", run: importEggZackMunicipalEvents },
    { name: "govoffice-calendar", run: importGovOfficeMunicipalEvents },
    { name: "eventespresso-datetimes", run: importEventEspressoMunicipalEvents },
    { name: "revize-calendar", run: importRevizeMunicipalEvents },
    { name: "granicus-calendar", run: (currentSources, currentStartDate, currentDays) => importJsonLdMunicipalEvents(currentSources, currentStartDate, currentDays, "granicus-calendar") },
    { name: "alphadog-recreation-page", run: (currentSources, currentStartDate, currentDays) => importJsonLdMunicipalEvents(currentSources, currentStartDate, currentDays, "alphadog-recreation-page") },
    { name: "barnes-noble-store-calendar", run: importBarnesNobleStoreEvents },
    { name: "today-at-apple-calendar", run: importTodayAtAppleEvents },
    { name: "wix-events-list", run: importWixEventsList },
    { name: "firespring-calendar-grid", run: importFarmsteadCalendarEvents },
    { name: "squarespace-eventlist", run: importSquarespaceRegionalEvents },
    { name: "html-regional-events", run: importHtmlRegionalEvents },
    { name: "tribe-events-calendar", run: importTribeEventsCalendar },
    { name: "eventbrite-list", run: importEventbriteEvents },
    { name: "patch-calendar", run: importPatchEvents },
    { name: "nj-carnivals-jsonld-list", run: importNjCarnivalsEvents }
  ];

  const importedGroups = await runSelectedImporters(importers, selected, sources, startDate, days);
  const incoming = importedGroups.flat();
  const events = mergeEvents(existingEvents, incoming, importedAt);
  applyTownCoverage(events, sources);
  const repairs = repairEventQuality(events);
  const geocodeSummary = await geocodeMissingEventCoordinates(events);
  const audit = auditEventQuality(events);

  await writeFile(EVENTS_FILE, `${JSON.stringify(events, null, 2)}\n`);
  console.log(`Import window: ${startDate} through ${addDateDays(startDate, days - 1)}.`);
  console.log(`Imported or refreshed ${incoming.length} event records.`);
  printImportQualityReport({ audit, repairs, geocodeSummary });
  console.log(`Stored ${events.length} total records in ${new URL(EVENTS_FILE).pathname}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
