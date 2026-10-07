const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function parseCustomFeedsJson(raw) {
  let data;
  try {
    data = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const feeds = [];
  for (const item of data) {
    const feed = normalizeCustomFeed(item);
    if (feed) feeds.push(feed);
  }
  return feeds;
}

export function normalizeCustomFeed(item) {
  if (!item || typeof item !== "object") return null;

  const id = typeof item.id === "string" ? item.id.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const url = typeof item.url === "string" ? item.url.trim() : "";
  const color = typeof item.color === "string" ? item.color.trim() : "";
  const priceFrom =
    typeof item.priceFrom === "string" ? item.priceFrom : "";
  const enabled = item.enabled !== false;

  if (!id || !name || !url || !COLOR_RE.test(color) || !priceFrom.trim())
    return null;
  if (!isHttpUrl(url)) return null;

  let headers = {};
  if (item.headers != null) {
    const parsed = normalizeHeaders(item.headers);
    if (!parsed) return null;
    headers = parsed;
  }

  if (!compilePriceFrom(priceFrom)) return null;

  return {
    id,
    name,
    url,
    color,
    headers,
    priceFrom,
    enabled,
  };
}

export function validateCustomFeedInput({
  name,
  url,
  color,
  headersText,
  priceFrom,
}) {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) return { ok: false, error: "Name is required." };

  const trimmedUrl = String(url ?? "").trim();
  if (!isHttpUrl(trimmedUrl))
    return { ok: false, error: "URL must start with http:// or https://." };

  const trimmedColor = String(color ?? "").trim();
  if (!COLOR_RE.test(trimmedColor))
    return { ok: false, error: "Color must be a #rrggbb hex value." };

  let headers = {};
  const headersRaw = String(headersText ?? "").trim();
  if (headersRaw) {
    let parsed;
    try {
      parsed = JSON.parse(headersRaw);
    } catch {
      return { ok: false, error: "Headers must be valid JSON." };
    }
    const normalized = normalizeHeaders(parsed);
    if (!normalized)
      return {
        ok: false,
        error: "Headers must be an object of string name/value pairs.",
      };
    headers = normalized;
  }

  const body = String(priceFrom ?? "");
  if (!body.trim())
    return { ok: false, error: "priceFrom function body is required." };
  if (!compilePriceFrom(body))
    return { ok: false, error: "priceFrom function body is invalid." };

  return {
    ok: true,
    value: {
      name: trimmedName,
      url: trimmedUrl,
      color: trimmedColor,
      headers,
      priceFrom: body,
    },
  };
}

export function compilePriceFrom(body) {
  try {
    return new Function("data", body);
  } catch {
    return null;
  }
}

export function customFeedToSpec(feed) {
  const priceFrom = compilePriceFrom(feed.priceFrom);
  return {
    role: `custom-${feed.id}`,
    id: feed.id,
    label: feed.name,
    url: feed.url,
    color: feed.color,
    headers: feed.headers,
    priceFromSource: feed.priceFrom,
    priceFrom,
    enabled: feed.enabled,
    custom: true,
  };
}

export function serializeCustomFeeds(feeds) {
  return JSON.stringify(
    feeds.map((feed) => ({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      color: feed.color,
      headers: feed.headers ?? {},
      priceFrom: feed.priceFrom,
      enabled: feed.enabled !== false,
    })),
  );
}

export function newCustomFeedId() {
  return GLibUuidString();
}

function GLibUuidString() {
  // Prefer crypto-style ids without depending on GLib helpers that differ
  // across GNOME versions in prefs vs shell.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isHttpUrl(url) {
  return /^https?:\/\/\S+$/i.test(url);
}

function normalizeHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const headers = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof key !== "string" || !HEADER_NAME_RE.test(key)) return null;
    if (typeof raw !== "string") return null;
    headers[key] = raw;
  }
  return headers;
}
