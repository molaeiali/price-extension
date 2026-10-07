import copper from "./feeds/copper.js";
import gold from "./feeds/gold.js";
import silver from "./feeds/silver.js";
import usdt from "./feeds/usdt.js";

export const REFRESH_SECONDS = 15;
export const PLACEMENTS = ["left", "center", "right"];

export const FEEDS = [usdt, gold, silver, copper];

export function isUsablePrice(price) {
  if (price == null) return false;
  const text = String(price).trim();
  return text !== "" && text !== "NaN" && text !== "undefined";
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
