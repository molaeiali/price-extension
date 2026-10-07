import {
  newCustomFeedId,
  parseCustomFeedsJson,
  serializeCustomFeeds,
} from "./custom-feeds.js";
import copper from "./feeds/copper.js";
import gold from "./feeds/gold.js";
import silver from "./feeds/silver.js";
import usdt from "./feeds/usdt.js";

const DEFAULT_FEED_META = {
  usdt: { color: "#26a17b", enabled: true, legacyKey: "show-usdt" },
  gold: { color: "#e0b83a", enabled: true, legacyKey: "show-gold" },
  silver: { color: "#c0c6ce", enabled: false, legacyKey: "show-silver" },
  copper: { color: "#b87333", enabled: false, legacyKey: "show-copper" },
};

export const REFRESH_SECONDS = 15;
export const PLACEMENTS = ["left", "center", "right"];

export const FEEDS = [usdt, gold, silver, copper].map((feed) => ({
  ...feed,
  priceFromSource: functionBody(feed.priceFrom),
}));

export function createDefaultFeeds() {
  return FEEDS.map((feed) => {
    const meta = DEFAULT_FEED_META[feed.role] ?? {
      color: "#6c8cff",
      enabled: true,
    };
    return {
      id: `default-${feed.role}`,
      name: feed.label,
      url: feed.url,
      method: "GET",
      body: "",
      color: meta.color,
      headers: {},
      priceFrom: feed.priceFromSource,
      enabled: meta.enabled,
      icon: feed.icon,
    };
  });
}

export function missingDefaultFeeds(feeds) {
  const labels = new Set(
    (feeds ?? []).map((feed) => String(feed?.name ?? "").trim()),
  );
  return createDefaultFeeds().filter((seed) => !labels.has(seed.name));
}

export function mergeMissingDefaultFeeds(feeds) {
  const ids = new Set((feeds ?? []).map((feed) => feed.id));
  const added = missingDefaultFeeds(feeds).map((seed) => {
    const feed = { ...seed, headers: { ...seed.headers } };
    if (ids.has(feed.id)) feed.id = newCustomFeedId();
    ids.add(feed.id);
    return feed;
  });
  return [...(feeds ?? []), ...added];
}

export function installDefaultFeedsIfNeeded(settings) {
  // A missing user value means this list was never saved. After that, an
  // empty list is the user removing every feed, so it stays empty.
  if (settings.get_user_value("custom-feeds") !== null) return;

  const schema = settings.settings_schema;
  const feeds = createDefaultFeeds().map((feed) => {
    const key = DEFAULT_FEED_META[feed.id.slice("default-".length)]?.legacyKey;
    if (!key || !schema.has_key(key)) return feed;
    return { ...feed, enabled: settings.get_boolean(key) };
  });
  settings.set_string("custom-feeds", serializeCustomFeeds(feeds));
}

export function isUsablePrice(price) {
  if (price == null) return false;
  const text = String(price).trim();
  return text !== "" && text !== "NaN" && text !== "undefined";
}

function functionBody(fn) {
  const source = Function.prototype.toString.call(fn);
  const start = source.indexOf("{");
  if (start < 0) return source.trim();

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start + 1, i).trim();
    }
  }

  return source.slice(start + 1).trim();
}

export function formatPrice(price) {
  const text = String(price).trim();
  const match = text.match(/^(\d+)(\.\d+)?$/);
  if (!match) return text;

  const digits = match[1];
  let grouped = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ",";
    grouped += digits[i];
  }
  return match[2] ? `${grouped}${match[2]}` : grouped;
}
