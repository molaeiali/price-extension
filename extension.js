import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
  customFeedToSpec,
  parseCustomFeedsJson,
  serializeCustomFeeds,
} from "./lib/custom-feeds.js";
import {
  PLACEMENTS,
  REFRESH_SECONDS,
  installDefaultFeedsIfNeeded,
  isUsablePrice,
} from "./lib/feeds.js";
import { PriceGroup } from "./lib/indicator.js";

export default class PriceExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._session = new Soup.Session({ timeout: 10 });
    // Noghresea answers the first request with a cookie, then the price.
    // CookieJar also overwrites any manual Cookie header on send, so feed
    // Cookie headers are injected into the jar in _applyRequestHeaders.
    this._cookieJar = new Soup.CookieJar();
    this._session.add_feature(this._cookieJar);
    this._cancellable = new Gio.Cancellable();
    this._feeds = [];
    this._indicator = null;
    this._lastRefresh = null;

    installDefaultFeedsIfNeeded(this._settings);

    const rebuild = () => this._rebuildIndicators();
    this._settingIds = [
      this._settings.connect("changed::placement", rebuild),
      this._settings.connect("changed::position", rebuild),
      this._settings.connect("changed::custom-feeds", () =>
        this._onCustomFeedsChanged(),
      ),
    ];

    this._loadFeeds();
    this._rebuildIndicators();

    this._onTick = () => {
      this._refresh();
      return GLib.SOURCE_CONTINUE;
    };
    this._refresh();
    this._timeoutId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      REFRESH_SECONDS,
      this._onTick,
    );
  }

  disable() {
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = 0;
    }

    if (this._settings && this._settingIds) {
      for (const id of this._settingIds) this._settings.disconnect(id);
      this._settingIds = null;
    }

    this._cancellable?.cancel();
    const indicator = this._indicator;
    this._indicator = null;
    this._session?.abort();
    indicator?.destroy();

    this._feeds = null;
    this._session = null;
    this._cookieJar = null;
    this._cancellable = null;
    this._settings = null;
    this._lastRefresh = null;
    this._onTick = null;
  }

  _placement() {
    const placement = this._settings.get_string("placement");
    return PLACEMENTS.includes(placement) ? placement : "right";
  }

  _position() {
    const position = this._settings.get_int("position");
    return position >= 0 ? position : 0;
  }

  _isFeedEnabled(spec) {
    return spec.enabled !== false;
  }

  _loadFeeds() {
    const previous = new Map(
      (this._feeds ?? []).map((feed) => [feed.spec.role, feed]),
    );
    const next = [];

    const custom = parseCustomFeedsJson(
      this._settings.get_string("custom-feeds"),
    );
    for (const stored of custom) {
      const spec = customFeedToSpec(stored);
      if (!spec.priceFrom) continue;

      const prior = previous.get(spec.role);
      const definitionChanged =
        prior &&
        (prior.spec.url !== spec.url ||
          prior.spec.priceFromSource !== spec.priceFromSource ||
          (prior.spec.method ?? "GET") !== (spec.method ?? "GET") ||
          (prior.spec.body ?? "") !== (spec.body ?? "") ||
          JSON.stringify(prior.spec.headers ?? {}) !==
            JSON.stringify(spec.headers ?? {}));

      next.push({
        spec,
        refreshing: prior?.refreshing ?? false,
        lastPrice: definitionChanged ? null : (prior?.lastPrice ?? null),
        lastSuccess: definitionChanged ? null : (prior?.lastSuccess ?? null),
        error: definitionChanged ? false : (prior?.error ?? false),
        refetch: Boolean(definitionChanged),
      });
    }

    this._feeds = next;
  }

  _onCustomFeedsChanged() {
    if (!this._settings) return;

    const previousEnabled = new Map(
      (this._feeds ?? []).map((feed) => [
        feed.spec.role,
        this._isFeedEnabled(feed.spec),
      ]),
    );

    this._loadFeeds();
    this._rebuildIndicators();

    for (const feed of this._feeds) {
      const enabled = this._isFeedEnabled(feed.spec);
      const wasEnabled = previousEnabled.get(feed.spec.role);
      if (enabled && (feed.refetch || wasEnabled === false || wasEnabled == null))
        this._fetch(feed);
      feed.refetch = false;
    }
  }

  _setFeedEnabled(role, enabled) {
    const feed = this._feeds?.find((item) => item.spec.role === role);
    if (!feed || !this._settings) return;

    const custom = parseCustomFeedsJson(
      this._settings.get_string("custom-feeds"),
    );
    const item = custom.find((entry) => entry.id === feed.spec.id);
    if (!item || item.enabled === enabled) return;
    item.enabled = enabled;
    this._settings.set_string("custom-feeds", serializeCustomFeeds(custom));
  }

  _rebuildIndicators() {
    this._indicator?.destroy();
    this._indicator = null;

    const entries = this._feeds.map((feed) => ({
      role: feed.spec.role,
      name: feed.spec.label,
      iconFile: feed.spec.icon
        ? this.dir.get_child("icons").get_child(feed.spec.icon)
        : null,
      color: feed.spec.color ?? null,
      price: feed.lastPrice,
      lastSuccess: feed.lastSuccess,
      enabled: this._isFeedEnabled(feed.spec),
      error: feed.error,
    }));

    this._indicator = new PriceGroup(
      entries,
      this._lastRefresh,
      () => this._refresh(),
      () => this.openPreferences(),
      (role, enabled) => this._setFeedEnabled(role, enabled),
    );
    Main.panel.addToStatusArea(
      `${this.uuid}-prices`,
      this._indicator,
      this._position(),
      this._placement(),
    );
  }

  _refresh() {
    for (const feed of this._feeds ?? []) this._fetch(feed);
  }

  _setJsonBody(message, body) {
    const encoded = new TextEncoder().encode(String(body ?? ""));
    message.set_request_body_from_bytes(
      "application/json",
      new GLib.Bytes(encoded),
    );
  }

  _applyRequestHeaders(message, headers) {
    const merged = { "Cache-Control": "no-cache", ...(headers ?? {}) };
    for (const [name, value] of Object.entries(merged)) {
      if (name.toLowerCase() === "cookie") {
        this._injectCookies(message, value);
        continue;
      }
      message.request_headers.replace(name, value);
    }
  }

  // CookieJar replaces/removes the Cookie header when the request starts, so a
  // manual Cookie header never reaches the server. Put feed cookies in the jar.
  _injectCookies(message, cookieHeader) {
    const uri = message.get_uri();
    if (!this._cookieJar || !uri) {
      message.request_headers.replace("Cookie", cookieHeader);
      return;
    }

    for (const part of String(cookieHeader).split(";")) {
      const trimmed = part.trim();
      if (!trimmed || !trimmed.includes("=")) continue;
      this._cookieJar.set_cookie(uri, `${trimmed}; Path=/`);
    }
  }

  _fetch(feed) {
    if (!this._session || !this._settings || !this._isFeedEnabled(feed.spec))
      return;
    if (feed.refreshing) return;

    const role = feed.spec.role;
    feed.refreshing = true;
    const method = feed.spec.method === "POST" ? "POST" : "GET";
    const message = Soup.Message.new(method, feed.spec.url);
    if (!message) {
      feed.refreshing = false;
      feed.error = true;
      this._indicator?.setFeedError(feed.spec.role, true, feed.lastSuccess);
      console.error(`${feed.spec.label} price: invalid URL`);
      return;
    }
    if (method === "POST") this._setJsonBody(message, feed.spec.body);
    this._applyRequestHeaders(message, feed.spec.headers);

    this._session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      this._cancellable,
      (session, result) => {
        feed.refreshing = false;
        if (!this._settings) return;
        if (!this._feeds?.some((item) => item.spec.role === role)) return;

        try {
          const bytes = session.send_and_read_finish(result);
          if (message.get_status() !== Soup.Status.OK)
            throw new Error(`HTTP ${message.get_status()}`);

          const body = new TextDecoder().decode(bytes.get_data());
          const price = feed.spec.priceFrom(JSON.parse(body));
          if (!isUsablePrice(price)) throw new Error("missing price");

          feed.error = false;
          feed.lastPrice = price;
          feed.lastSuccess = GLib.DateTime.new_now_local().to_unix();
          this._lastRefresh = feed.lastSuccess;
          this._indicator?.setPrice(feed.spec.role, feed.lastPrice);
          this._indicator?.setFeedError(feed.spec.role, false, feed.lastSuccess);
          this._indicator?.setLastRefresh(this._lastRefresh);
        } catch (error) {
          if (
            error instanceof GLib.Error &&
            error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)
          )
            return;
          feed.error = true;
          this._indicator?.setFeedError(feed.spec.role, true, feed.lastSuccess);
          console.error(`${feed.spec.label} price: ${error}`);
        }
      },
    );
  }
}
