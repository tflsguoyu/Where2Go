const crypto = require("crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATE_RANGE = "28daysAgo";
const ROW_LIMIT = 20;

let tokenCache = {
  accessToken: "",
  expiresAt: 0
};

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function serviceAccountConfig() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key
      };
    } catch {
      return {};
    }
  }
  return {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  };
}

function analyticsPropertyId() {
  return process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID || "";
}

function isConfigured() {
  const serviceAccount = serviceAccountConfig();
  return Boolean(analyticsPropertyId() && serviceAccount.clientEmail && serviceAccount.privateKey);
}

function signedJwt() {
  const { clientEmail, privateKey } = serviceAccountConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: GA_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  return `${unsigned}.${base64url(signature)}`;
}

async function accessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signedJwt()
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status})`);
  }
  const payload = await response.json();
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: now + Math.max(0, Number(payload.expires_in || 0) - 60) * 1000
  };
  return tokenCache.accessToken;
}

function statsRequestBody() {
  return {
    dateRanges: [{ startDate: DATE_RANGE, endDate: "today" }],
    dimensions: [{ name: "customEvent:area_state" }, { name: "customEvent:area_zip" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: ["search_area", "located_area"] }
      }
    },
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: String(ROW_LIMIT)
  };
}

function normalizedRows(rows = []) {
  const normalizeFiveDigitZip = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 4) {
      return `0${digits}`;
    }
    if (digits.length === 5) {
      return digits;
    }
    if (digits.length === 9) {
      return digits.slice(0, 5);
    }
    return "";
  };

  return rows
    .map((row) => {
      const state = String(row.dimensionValues?.[0]?.value || "").trim().toUpperCase();
      const zip = normalizeFiveDigitZip(row.dimensionValues?.[1]?.value || "") || "ZIP TBD";
      const visits = Number(row.metricValues?.[0]?.value || 0);
      return { state, zip, visits };
    })
    .filter((row) => row.state && Number.isFinite(row.visits) && row.visits > 0);
}

async function fetchStats() {
  const propertyId = analyticsPropertyId();
  const token = await accessToken();
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(statsRequestBody())
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stats request failed (${response.status}): ${errorText.slice(0, 200)}`);
  }
  const payload = await response.json();
  return normalizedRows(payload.rows);
}

function setResponseHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload, cacheSeconds = 0) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cacheSeconds > 0) {
    res.setHeader("Cache-Control", `s-maxage=${cacheSeconds}, stale-while-revalidate=3600`);
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  setResponseHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!isConfigured()) {
    sendJson(res, 200, {
      updatedAt: new Date().toISOString(),
      range: DATE_RANGE,
      areas: [],
      message: "Stats not configured."
    });
    return;
  }

  try {
    const areas = await fetchStats();
    sendJson(
      res,
      200,
      {
        updatedAt: new Date().toISOString(),
        range: DATE_RANGE,
        areas
      },
      300
    );
  } catch (error) {
    console.error(error);
    sendJson(res, 200, {
      updatedAt: new Date().toISOString(),
      range: DATE_RANGE,
      areas: [],
      message: "Stats unavailable."
    });
  }
};
