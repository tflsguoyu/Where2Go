import test from "node:test";
import assert from "node:assert/strict";
import { publishSourceLinkedReviews, hasUnconfirmedTime } from "../event-publication.mjs";

const policy = { enabled: true, fromDate: "2026-10-16", throughDate: "2026-12-31" };
const event = (extra = {}) => ({ status: "review", startsAt: "2026-10-17T00:00:00", url: "https://example.com/event", ...extra });

test("source-linked publication preserves unknown facts and disables missing-coordinate directions", () => {
  const row = event({ timeStatus: "unknown", reviewNotes: "Age not confirmed" });
  assert.equal(publishSourceLinkedReviews([row], policy), 1);
  assert.equal(row.status, "published");
  assert.equal(row.verificationStatus, "unconfirmed");
  assert.equal(row.reviewNotes, "Age not confirmed");
  assert.equal(row.directionsDisabled, true);
  assert.equal(row.timeLabel, "Time needs confirmation — see source");
  assert.equal(row.lat, undefined);
  assert.equal(hasUnconfirmedTime(row), true);
});

test("only valid HTTP source pages inside the authorized window qualify", () => {
  const rows = [event({ url: "javascript:alert(1)" }), event({ url: null }), event({ startsAt: "2026-10-15T10:00:00" }), event({ startsAt: "2027-01-01T10:00:00" })];
  assert.equal(publishSourceLinkedReviews(rows, policy), 0);
  assert.ok(rows.every(row => row.status === "review"));
});

test("valid alternative source URL works and known cancellation/capacity survive", () => {
  const row = event({ sourceUrl: "invalid", cancellationStatus: "cancelled", availabilityStatus: "fully_booked" });
  assert.equal(publishSourceLinkedReviews([row], policy), 1);
  assert.equal(row.cancellationStatus, "cancelled");
  assert.equal(row.availabilityStatus, "fully_booked");
  assert.equal(publishSourceLinkedReviews([row], policy), 0);
});

test("disabled policy never publishes reviews", () => {
  assert.equal(publishSourceLinkedReviews([event()], { ...policy, enabled: false }), 0);
});

test("a missing end time is never displayed as an invented duration", () => {
  const row = event({ startsAt: "2026-10-17T14:00:00", timeStatus: "end_time_missing" });
  publishSourceLinkedReviews([row], policy);
  assert.equal(row.timeLabel, "2:00 PM; end time not listed");
  assert.equal(row.endsAt, undefined);
});
