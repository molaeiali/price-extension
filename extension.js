import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Soup from "gi://Soup?version=3.0";
import St from "gi://St";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

// St.BoxLayout gained orientation in GNOME 48. 46 and 47 only have vertical.
const SHELL_MAJOR = Number.parseInt(Config.PACKAGE_VERSION, 10);

function newBoxLayout({
  orientation = Clutter.Orientation.HORIZONTAL,
  ...props
} = {}) {
  if (SHELL_MAJOR >= 48) {
    return new St.BoxLayout({
      orientation,
      ...props,
    });
  }

  return new St.BoxLayout({
    vertical: orientation === Clutter.Orientation.VERTICAL,
    ...props,
  });
}

const REFRESH_SECONDS = 15;
const PLACEMENTS = ["left", "center", "right"];

const FEEDS = [
  {
    role: "usdt",
    label: "USDT",
    settingsKey: "show-usdt",
    url: "https://api.bitpin.org/v5/mkt/markets/?code=USDT_IRT",
    icon: "usdt.svg",
    priceFrom(data) {
      return data.results[0].price_info.price;
    },
  },
  {
    role: "gold",
    label: "Gold",
    settingsKey: "show-gold",
    url: "https://api.talasea.ir/api/market/getGoldPrice",
    icon: "gold.svg",
    priceFrom(data) {
      return data.price;
    },
  },
  {
    role: "silver",
    label: "Silver",
    settingsKey: "show-silver",
    url: "https://api.noghresea.ir/api/market/getSilverPrice",
    icon: "silver.svg",
    priceFrom(data) {
      return String(Number(data.price) * 1000);
    },
  },
  {
    role: "copper",
    label: "Copper",
    settingsKey: "show-copper",
    url: "https://api.meschi.ir/api/market/getCopperPrice",
    icon: "copper.svg",
    priceFrom(data) {
      return data.price;
    },
  },
];

function isUsablePrice(price) {
  if (price == null) return false;
  const text = String(price).trim();
  return text !== "" && text !== "NaN" && text !== "undefined";
}

function formatPrice(price) {
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatRefreshTime(unixSeconds) {
  const date = GLib.DateTime.new_from_unix_local(unixSeconds);
  const time = date.format("%H:%M:%S");
  if (!time) return "—";
  return `${MONTHS[date.get_month() - 1]} ${date.get_day_of_month()} ${time}`;
}

const PriceGroup = GObject.registerClass(
  class PriceGroup extends PanelMenu.Button {
    _init(entries, lastRefresh, onRefresh, onOpenSettings, onToggle) {
      super._init(0.0, "Prices", false);

      this._labels = new Map();
      this._names = new Map();
      this._pairs = new Map();
      this._switches = new Map();
      this._warnings = new Map();
      this._lastSuccess = new Map();

      const box = newBoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.CENTER,
        style: "spacing: 12px;",
      });

      this._fallbackIcon = new St.Icon({
        icon_name: "emblem-money-symbolic",
        icon_size: 16,
        y_align: Clutter.ActorAlign.CENTER,
      });
      box.add_child(this._fallbackIcon);

      for (const entry of entries) {
        const icon = new St.Icon({
          gicon: new Gio.FileIcon({ file: entry.iconFile }),
          icon_size: 16,
          y_align: Clutter.ActorAlign.CENTER,
        });
        const label = new St.Label({
          text: entry.price == null ? "…" : formatPrice(entry.price),
          y_align: Clutter.ActorAlign.CENTER,
        });
        const pair = newBoxLayout({
          orientation: Clutter.Orientation.HORIZONTAL,
          y_align: Clutter.ActorAlign.CENTER,
          style: "spacing: 6px;",
          visible: entry.enabled,
        });
        const warning = new St.Icon({
          icon_name: "dialog-warning-symbolic",
          icon_size: 16,
          y_align: Clutter.ActorAlign.CENTER,
          visible: entry.error,
        });
        pair.add_child(icon);
        pair.add_child(label);
        pair.add_child(warning);
        box.add_child(pair);

        this._labels.set(entry.role, label);
        this._names.set(entry.role, entry.name);
        this._pairs.set(entry.role, pair);
        this._warnings.set(entry.role, warning);
        this._lastSuccess.set(entry.role, entry.lastSuccess);
      }

      this.add_child(box);
      this._syncFallback();
      this._updateAccessibleName();

      this._updatedItem = new PopupMenu.PopupMenuItem("Last refresh: Never", {
        reactive: false,
        can_focus: false,
      });
      this.setLastRefresh(lastRefresh);
      this.menu.addMenuItem(this._updatedItem);
      this._errorItem = new PopupMenu.PopupImageMenuItem(
        "fetching data failed for some assets",
        "dialog-warning-symbolic",
        { reactive: false, can_focus: false },
      );
      this.menu.addMenuItem(this._errorItem);
      this._syncErrorLine();
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      for (const entry of entries) {
        const item = new PopupMenu.PopupSwitchMenuItem(
          entry.name,
          entry.enabled,
        );
        item.connect("toggled", () => onToggle(entry.settingsKey, item.state));
        this.menu.addMenuItem(item);
        this._switches.set(entry.role, item);
      }

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addAction(
        "Refresh",
        () => onRefresh(),
        "view-refresh-symbolic",
      );
      this.menu.addAction(
        "Settings",
        () => onOpenSettings(),
        "preferences-system-symbolic",
      );
    }

    setPrice(role, price) {
      const label = this._labels.get(role);
      if (!label) return;

      label.text = formatPrice(price);
      this._updateAccessibleName();
    }

    setLastRefresh(unixSeconds) {
      const when =
        unixSeconds == null ? "Never" : formatRefreshTime(unixSeconds);
      this._updatedItem.label.text = `Last refresh: ${when}`;
    }

    setFeedEnabled(role, enabled) {
      const pair = this._pairs.get(role);
      if (pair) pair.visible = enabled;

      const item = this._switches.get(role);
      if (item && item.state !== enabled) item.state = enabled;

      this._syncFallback();
      this._syncErrorLine();
      this._updateAccessibleName();
    }

    setFeedError(role, error, lastSuccess) {
      const warning = this._warnings.get(role);
      if (warning) warning.visible = error;
      if (lastSuccess !== undefined) this._lastSuccess.set(role, lastSuccess);
      this._syncErrorLine();
      this._updateAccessibleName();
    }

    _syncErrorLine() {
      const groups = new Map();
      for (const [role, pair] of this._pairs) {
        if (!pair.visible || !this._warnings.get(role)?.visible) continue;

        const lastSuccess = this._lastSuccess.get(role);
        const when =
          lastSuccess == null ? "Never" : formatRefreshTime(lastSuccess);
        const names = groups.get(when) ?? [];
        names.push(this._names.get(role));
        groups.set(when, names);
      }

      const parts = [];
      for (const [when, names] of groups)
        parts.push(`${names.join(", ")} last refresh: ${when}`);

      this._errorItem.visible = parts.length > 0;
      if (parts.length > 0) this._errorItem.label.text = parts.join(", ");
    }

    _syncFallback() {
      let anyVisible = false;
      for (const pair of this._pairs.values()) {
        if (pair.visible) {
          anyVisible = true;
          break;
        }
      }
      this._fallbackIcon.visible = !anyVisible;
    }

    _updateAccessibleName() {
      const parts = [];
      for (const [role, label] of this._labels) {
        if (!this._pairs.get(role)?.visible) continue;
        const failed = this._warnings.get(role)?.visible ? ", failed" : "";
        parts.push(`${this._names.get(role)} ${label.text}${failed}`);
      }
      this.accessible_name = parts.length > 0 ? parts.join(", ") : "Prices";
    }
  },
);

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
