export function sourcePageUrl(event) {
  for (const value of [event.sourceUrl, event.url]) {
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol)) return url.href;
    } catch {}
  }
  return null;
}

export function hasUnconfirmedTime(event) {
  return ["unknown", "date_only_time_unconfirmed", "conflicting_timezone", "conflicting_official_times", "conflicting_end_times", "venue_hours_vary"].includes(event.timeStatus);
}

export function publishSourceLinkedReviews(events, policy) {
  if (!policy?.enabled) return 0;
  let count = 0;
  for (const event of events) {
    const date = String(event.startsAt || "").slice(0, 10);
    if (event.status !== "review" || !date || date < policy.fromDate || date > policy.throughDate || !sourcePageUrl(event)) continue;
    event.status = "published";
    event.verificationStatus ||= "unconfirmed";
    event.publicationReason = "source_link_user_policy";
    event.reviewNotes ||= "Details have not been independently confirmed. Check the source page before attending.";
    if (!Number(event.lat) || !Number(event.lng)) event.directionsDisabled = true;
    if (!event.endsAt && String(event.startsAt).includes("T00:00") && !event.timeStatus) event.timeStatus = "date_only_time_unconfirmed";
    if (hasUnconfirmedTime(event)) event.timeLabel = "Time needs confirmation — see source";
    else if (!event.endsAt && !event.timeLabel) {
      const match = String(event.startsAt).match(/T(\d{2}):(\d{2})/);
      if (match) {
        const hour = Number(match[1]);
        event.timeLabel = `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}; end time not listed`;
      }
    }
    count += 1;
  }
  return count;
}
