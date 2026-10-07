import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
  FEEDS,
  PLACEMENTS,
  REFRESH_SECONDS,
  isUsablePrice,
} from "./lib/feeds.js";
import { PriceGroup } from "./lib/indicator.js";

export default class PriceExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._session = new Soup.Session({ timeout: 10 });
    // Noghresea answers the first request with a cookie, then the price.
    this._session.add_feature(new Soup.CookieJar());
    this._cancellable = new Gio.Cancellable();
    this._feeds = FEEDS.map((spec) => ({
      spec,
      refreshing: false,
      lastPrice: null,
      lastSuccess: null,
      error: false,
    }));
    this._indicator = null;
    this._lastRefresh = null;

    const rebuild = () => this._rebuildIndicators();
    this._settingIds = [
      this._settings.connect("changed::placement", rebuild),
      this._settings.connect("changed::position", rebuild),
    ];
    for (const feed of this._feeds) {
      this._settingIds.push(
        this._settings.connect(
          `changed::${feed.spec.settingsKey}`,
          (_settings, key) => this._onFeedSettingChanged(key),
        ),
      );
    }

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
    this._session?.abort();
    this._indicator?.destroy();
    this._indicator = null;

    this._feeds = null;
    this._session = null;
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

  _onFeedSettingChanged(key) {
    const feed = this._feeds?.find((item) => item.spec.settingsKey === key);
    if (!feed || !this._settings) return;

    const enabled = this._settings.get_boolean(key);
    this._indicator?.setFeedEnabled(feed.spec.role, enabled);
    if (enabled) this._fetch(feed);
  }

  _setFeedEnabled(settingsKey, enabled) {
    if (!this._settings || this._settings.get_boolean(settingsKey) === enabled)
      return;
    this._settings.set_boolean(settingsKey, enabled);
  }

  _rebuildIndicators() {
    this._indicator?.destroy();
    this._indicator = null;

    const entries = this._feeds.map((feed) => ({
      role: feed.spec.role,
      name: feed.spec.label,
      settingsKey: feed.spec.settingsKey,
      iconFile: this.dir.get_child("icons").get_child(feed.spec.icon),
      price: feed.lastPrice,
      lastSuccess: feed.lastSuccess,
      enabled: this._settings.get_boolean(feed.spec.settingsKey),
      error: feed.error,
    }));

    this._indicator = new PriceGroup(
      entries,
      this._lastRefresh,
      () => this._refresh(),
      () => this.openPreferences(),
      (settingsKey, enabled) => this._setFeedEnabled(settingsKey, enabled),
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

  _fetch(feed) {
    if (
      !this._session ||
      !this._settings?.get_boolean(feed.spec.settingsKey) ||
      feed.refreshing
    )
      return;

    feed.refreshing = true;
    const message = Soup.Message.new("GET", feed.spec.url);
    message.request_headers.append("Cache-Control", "no-cache");

    this._session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      this._cancellable,
      (session, result) => {
        feed.refreshing = false;
        if (!this._settings) return;

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
