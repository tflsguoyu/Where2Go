#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const EVENTS_PATH = new URL("../data/events.json", import.meta.url);
const MAX_SUMMARY_LENGTH = 900;

function collapseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&hellip;/g, "...");
}

function stripHtml(value) {
  return decodeEntities(
    String(value ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, ". ")
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, ". ")
      .replace(/<[^>]+>/g, " ")
  );
}

function normalizeSummary(value) {
  let summary = collapseWhitespace(stripHtml(value))
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/(?:^|\s)(?:Date|Time|Location|Address|Url|Print|Google|Outlook)\s*:?\s+/gi, " ")
    .replace(/\b(?:Print|Google|Outlook \(.ics\))\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (summary.length > MAX_SUMMARY_LENGTH) {
    const clipped = summary.slice(0, MAX_SUMMARY_LENGTH);
    summary = clipped.slice(0, Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? ")));
  }
  return summary.trim();
}

function firstMatch(value, pattern) {
  return String(value ?? "").match(pattern)?.[1] || "";
}

function metaContent(html, name) {
  return decodeEntities(
    firstMatch(html, new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")) ||
      firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, "i"))
  );
}

function extractSummary(html) {
  const candidates = [
    firstMatch(html, /<div\b[^>]*itemprop=["']description["'][^>]*class=["'][^"']*\bfr-view\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<ul|<div\b[^>]*class=["']row\b|<script\b|$)/i),
    firstMatch(html, /<[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/[^>]+>/i),
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bcom-dpcalendar-event__description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*\bcom-dpcalendar-event__locations\b|<h2\b|<script\b|$)/i),
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bdp-event-description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    firstMatch(html, /<div\b[^>]*class=["'][^"']*\bevent-description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    firstMatch(html, /<section\b[^>]*class=["'][^"']*\bevent-details\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i),
    firstMatch(html, /"description"\s*:\s*"((?:\\"|[^"])*)"/i).replace(/\\"/g, '"'),
    metaContent(html, "og:description"),
    metaContent(html, "description")
  ];
  for (const candidate of candidates) {
    const summary = normalizeSummary(candidate);
    if (summary && summary.length >= 25 && !/^(calendar|event details|description)$/i.test(summary)) {
      return summary;
    }
  }
  return "";
}

function curl(args, maxBuffer = 8 * 1024 * 1024) {
  return execFileSync("curl", args, { encoding: "utf8", maxBuffer });
}

const resolvedHosts = new Map();

function resolveHost(hostname) {
  if (resolvedHosts.has(hostname)) {
    return resolvedHosts.get(hostname);
  }
  const endpoints = [
    ["https://8.8.8.8/resolve", ["--insecure", "-H", "Host: dns.google"]],
    ["https://1.1.1.1/dns-query", ["--insecure", "-H", "accept: application/dns-json"]]
  ];
  for (const [endpoint, extraArgs] of endpoints) {
    try {
      const body = curl([
        "-sS",
        "--connect-timeout",
        "8",
        "--max-time",
        "20",
        ...extraArgs,
        `${endpoint}?name=${hostname}&type=A`
      ]);
      const data = JSON.parse(body);
      const address = (data.Answer || []).find((answer) => answer.type === 1)?.data;
      if (address) {
        resolvedHosts.set(hostname, address);
        return address;
      }
    } catch {
      // Try the next resolver.
    }
  }
  resolvedHosts.set(hostname, "");
  return "";
}

function fetchText(url) {
  try {
    return curl(["-sS", "-L", "--connect-timeout", "12", "--max-time", "30", url]);
  } catch (error) {
    if (!/Could not resolve host/i.test(String(error.message))) {
      throw error;
    }
  }
  const parsed = new URL(url);
  const address = resolveHost(parsed.hostname);
  if (!address) {
    throw new Error(`Could not resolve host: ${parsed.hostname}`);
  }
  const port = parsed.protocol === "http:" ? 80 : 443;
  return curl([
    "-sS",
    "-L",
    "--connect-timeout",
    "12",
    "--max-time",
    "30",
    "--resolve",
    `${parsed.hostname}:${port}:${address}`,
    url
  ]);
}

const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf8"));
const targets = events.filter((event) => event.summaryStatus === "source_detail_unavailable" && (event.sourceUrl || event.url));
const cache = new Map();
let filled = 0;
let failed = 0;

for (const event of targets) {
  const url = event.sourceUrl || event.url;
  if (!cache.has(url)) {
    try {
      cache.set(url, extractSummary(fetchText(url)));
    } catch (error) {
      console.warn(`could not fetch ${url}: ${error.message}`);
      cache.set(url, "");
    }
  }
  const summary = cache.get(url);
  if (summary) {
    event.summary = summary;
    delete event.summaryStatus;
    filled += 1;
  } else {
    event.summary = "";
    event.summaryStatus = "source_detail_unavailable";
    failed += 1;
  }
}

fs.writeFileSync(EVENTS_PATH, `${JSON.stringify(events, null, 2)}\n`);
console.log(`checked ${targets.length}; filled ${filled}; still marked ${failed}`);
