const SHEET_REPORTS = "reports";
const SHEET_LIKES = "likes";

function doGet(e) {
  const params = e.parameter || {};
  if (params.action === "counts") {
    return jsonpResponse(params.callback, { counts: likeCounts(params.eventIds || "") });
  }
  return jsonResponse({ ok: true });
}

function doPost(e) {
  const params = e.parameter || {};
  const action = String(params.action || "").trim();
  if (action === "report") {
    appendReport(params);
    return jsonResponse({ ok: true });
  }
  if (action === "like") {
    appendLike(params);
    return jsonResponse({ ok: true });
  }
  if (action === "unlike") {
    removeLike(params);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ ok: false, error: "unknown_action" });
}

function appendReport(params) {
  const sheet = ensureSheet(SHEET_REPORTS, [
    "createdAt",
    "appVersion",
    "clientId",
    "eventId",
    "title",
    "date",
    "time",
    "venue",
    "sourceUrl",
    "pageUrl",
    "reasons",
    "notes",
    "status"
  ]);
  sheet.appendRow([
    params.createdAt || new Date().toISOString(),
    params.appVersion || "",
    params.clientId || "",
    params.eventId || "",
    params.title || "",
    params.date || "",
    params.time || "",
    params.venue || "",
    params.sourceUrl || "",
    params.pageUrl || "",
    params.reasons || "",
    params.notes || "",
    "new"
  ]);
}

function appendLike(params) {
  const sheet = ensureSheet(SHEET_LIKES, [
    "createdAt",
    "appVersion",
    "clientId",
    "eventId",
    "title",
    "date",
    "time",
    "venue",
    "sourceUrl",
    "pageUrl"
  ]);
  const clientId = String(params.clientId || "").trim();
  const eventId = String(params.eventId || "").trim();
  if (!eventId || isExistingLike(sheet, clientId, eventId)) {
    return;
  }
  sheet.appendRow([
    params.createdAt || new Date().toISOString(),
    params.appVersion || "",
    clientId,
    eventId,
    params.title || "",
    params.date || "",
    params.time || "",
    params.venue || "",
    params.sourceUrl || "",
    params.pageUrl || ""
  ]);
}

function removeLike(params) {
  const sheet = ensureSheet(SHEET_LIKES, [
    "createdAt",
    "appVersion",
    "clientId",
    "eventId",
    "title",
    "date",
    "time",
    "venue",
    "sourceUrl",
    "pageUrl"
  ]);
  const clientId = String(params.clientId || "").trim();
  const eventId = String(params.eventId || "").trim();
  if (!clientId || !eventId || sheet.getLastRow() < 2) {
    return;
  }
  const rows = sheet.getRange(2, 3, sheet.getLastRow() - 1, 2).getValues();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const [rowClientId, rowEventId] = rows[index];
    if (String(rowClientId) === clientId && String(rowEventId) === eventId) {
      sheet.deleteRow(index + 2);
      return;
    }
  }
}

function likeCounts(eventIdsCsv) {
  const requested = String(eventIdsCsv || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const counts = {};
  requested.forEach((eventId) => {
    counts[eventId] = 0;
  });
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_LIKES);
  if (!sheet || sheet.getLastRow() < 2) {
    return counts;
  }
  const rows = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues();
  const allowed = new Set(requested);
  rows.forEach(([eventId]) => {
    const key = String(eventId || "").trim();
    if (allowed.has(key)) {
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  return counts;
}

function isExistingLike(sheet, clientId, eventId) {
  if (!clientId || sheet.getLastRow() < 2) {
    return false;
  }
  const rows = sheet.getRange(2, 3, sheet.getLastRow() - 1, 2).getValues();
  return rows.some(([rowClientId, rowEventId]) => String(rowClientId) === clientId && String(rowEventId) === eventId);
}

function ensureSheet(name, headers) {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(callback, payload) {
  const safeCallback = /^[A-Za-z_$][\w$]*$/.test(String(callback || "")) ? callback : "callback";
  return ContentService.createTextOutput(`${safeCallback}(${JSON.stringify(payload)});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
