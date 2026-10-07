import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";

import * as Config from "resource:///org/gnome/shell/misc/config.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { formatPrice } from "./feeds.js";

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

export const PriceGroup = GObject.registerClass(
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
