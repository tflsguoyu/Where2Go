#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const TIMEZONE = "America/New_York";
const SOURCES_FILE = new URL("../data/event-sources.json", import.meta.url);
const EVENTS_FILE = new URL("../data/events.json", import.meta.url);
const DAY_MS = 24 * 60 * 60 * 1000;
const GEOCODE_DELAY_MS = 1100;
const LOCALHOP_API_URL = "https://api.getlocalhop.com/1";
const LOCALHOP_PARSE_APP_ID = "zesqKJEzK7ncFXe57x4uWc4Moow3I2wGCq7zFcqI";
const LOCALHOP_PAGE_LIMIT = 500;

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
  /\b(?:america\s*250|battle|camp|celebration|charter day|children|community event|concert|cookies with a cop|fair|famil(?:y|ies)|festival|field of honor|fireworks|flag day|flag raising|free market|fun night|farm(?:ers)? market|juneteenth|kids|kickoff|love is love|market|movie|musical|national night out|outdoor movie|parade|plays in the park|pool party|pool safety|pride|revolution|screen on the green|shrek|street fair|tree lighting|unity day|watch part(?:y|ies)|world cup|yoga)\b/i;
const MUNICIPAL_SKIP_TITLE_PATTERN =
  /\b(?:adult|adults only|authority meeting|board .*meeting|bulk collection|commission|court|curbside|deadline|garbage|id photos|meeting|membership|municipal court|offices? closed|offices? close|office hours|planning board|recycling|stormwater|township committee|wine tasting|zoning board)\b/i;
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

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
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
  return normalizeSummaryPunctuation(summary);
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
    /baby|babies|toddler|preschool|pre-school|children|child|kids|family|families|elem|tween|teen|storytime|lego/.test(
      titleText
    );
  const youthAudience =
    /baby|babies|toddler|preschool|pre-school|children|child|kids|family|families|elem|tween|teen/.test(
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
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "Where2Go data importer",
      ...extraHeaders
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,*/*",
      "user-agent": "Where2Go data importer"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
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
    if (event.withinCoverage === false || hasValidCoordinates(event)) {
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
    if (isNonEmptyText(event.summary)) {
      const cleanedSummary = cleanImportedSummary(event.summary, event);
      if (cleanedSummary !== event.summary) {
        event.summary = cleanedSummary;
        noteRepair("summary");
      }
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
    .replace(/,\s*(NJ|NY|PA),\s*(\d{5}(?:-\d{4})?)\b/gi, ", $1 $2")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
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

function isJsonLdType(item, typeName) {
  const type = item?.["@type"];
  return type === typeName || (Array.isArray(type) && type.includes(typeName));
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
          status: "published",
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
  const cards = html.split('<div class="lc-event lc-event--list"').slice(1);
  const events = [];
  const host = new URL(baseUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "").toLowerCase();

  cards.forEach((card) => {
    if (/\bnode--type-lc-closing\b|\blc-closing\b/i.test(card)) {
      return;
    }
    const selectorId = firstMatch(card, /data-drupal-selector="edit-([^"]+)"/);
    const linkMatch = card.match(/<a aria-label="([^"]+)" href="([^"]+)"/);
    if (!selectorId || !linkMatch) {
      return;
    }

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
      id: `librarycalendar-${host}-${selectorId}`,
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
  if (explicitDates.length) {
    return explicitDates.filter((dateKey) => isDateWithinWindow(dateKey, startDate, days));
  }
  const recurrence = config.recurrence;
  if (!recurrence) {
    return [];
  }
  const rangeStart = recurrence.startDate && dateStamp(recurrence.startDate) > dateStamp(startDate) ? recurrence.startDate : startDate;
  const rangeEnd =
    recurrence.endDate && dateStamp(recurrence.endDate) < dateStamp(windowEndDate) ? recurrence.endDate : windowEndDate;
  return datesInRange(rangeStart, rangeEnd).filter((dateKey) => recurrenceMatches(dateKey, recurrence));
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

function primaryRegionalLocation(source) {
  const configuredLocation = (source.locations || [])[0] || {};
  return {
    id: configuredLocation.id || source.id,
    name: configuredLocation.name || source.label,
    townId: configuredLocation.townId || source.townId || null,
    address: configuredLocation.address || source.address || null,
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
    title: stripHtml(fields.title),
    venue: location.name,
    venueName: location.name,
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
    lat: location.lat,
    lng: location.lng,
    image: fields.image || null,
    tags: [source.type, ...(fields.tags || []), "family"].filter(Boolean),
    status: "published",
    confidence: fields.confidence ?? 0.78
  };
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
  return /\b(kid|kids|children|child|family|families|teen|tween|toddler|camp|craft|workshop|story|festival|garden|nature|astronomy|butterfl|moth|plant sale|seed|earth day|brite nites|art show|theater|concert|performance|movie|slime|lego|glow|music|science)\b/i.test(
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
  if (!title || MUNICIPAL_SKIP_TITLE_PATTERN.test(title)) {
    return false;
  }
  return MUNICIPAL_COMMUNITY_EVENT_PATTERN.test(`${title} ${summary} ${calendar}`);
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
    return {
      ...event,
      summary: details.summary || event.summary,
      image: details.image || event.image
    };
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
    lat: venue.lat,
    lng: venue.lng,
    tags: ["municipal", source.town.id, category, "family"].filter(Boolean),
    status: "published",
    confidence: venue.confidence
  };
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
  return [...new Map(imported.map((event) => [event.id, event])).values()];
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

  return [...byId.values()].filter((event) => !isClosureOrNonEvent(event.title, event.summary)).sort((a, b) => {
    const dateCompare = String(a.startsAt || "").localeCompare(String(b.startsAt || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || "").localeCompare(String(b.title || ""));
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

  const importedGroups = await Promise.all([
    importSclsnjEvents(sources, startDate, days),
    importLocalHopEvents(sources, startDate, days),
    importCivicPlusMunicipalEvents(sources, startDate, days),
    importDpCalendarMunicipalEvents(sources, startDate, days),
    importSquarespaceMunicipalEvents(sources, startDate, days),
    importLibraryCalendarEvents(sources, startDate, days),
    importLibCalEvents(sources, startDate, days),
    importEventOrganiserEvents(sources, startDate, days),
    importJoomlaEventBookingEvents(sources, startDate, days),
    importConfiguredLibraryEvents(sources, startDate, days),
    importConfiguredWorkshopEvents(sources, startDate, days),
    importBarnesNobleStoreEvents(sources, startDate, days),
    importTodayAtAppleEvents(sources, startDate, days),
    importWixEventsList(sources, startDate, days),
    importFarmsteadCalendarEvents(sources, startDate, days),
    importSquarespaceRegionalEvents(sources, startDate, days),
    importNjCarnivalsEvents(sources, startDate, days)
  ]);
  const incoming = importedGroups.flat();
  const events = mergeEvents(existingEvents, incoming, importedAt);
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
