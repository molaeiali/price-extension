# Prices

A GNOME Shell extension that shows live market prices in the top bar:

- **USDT** — Bitpin USDT/IRT
- **Gold** — Talasea
- **Silver** — Noghresea
- **Copper** — Meschi

Prices refresh every 15 seconds. Click the indicator to see the last successful refresh, any failed feeds, toggles for each price, a manual refresh, and settings.

Supports GNOME Shell 46 through 50.

## Install

### GNOME Extensions website

Install **Prices** from [extensions.gnome.org](https://extensions.gnome.org/?search=Prices).

The site installs the extension through your browser. Install the `gnome-browser-connector` package from your distribution, and the GNOME Shell integration add-on for [Firefox](https://addons.mozilla.org/firefox/addon/gnome-shell-integration/) or [Chrome](https://chromewebstore.google.com/detail/gnome-shell-integration/gphhapmejobijbbhgpjhcjognlahblep). The website offers the add-on if it is missing.

Open **Prices** and switch it on. Log out and back in if the indicator does not appear.

### Manual

```bash
UUID=price-extension@en.molaei.org
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

mkdir -p "$DEST"
cp -a extension.js prefs.js lib metadata.json icons schemas "$DEST/"
glib-compile-schemas "$DEST/schemas/"
```

Log out and back in, then enable **Prices** in the Extensions app, or run:

```bash
gnome-extensions enable price-extension@en.molaei.org
```

## Settings

Open the extension preferences to choose which prices appear and where the indicator sits.

| Setting | What it does |
| --- | --- |
| USDT, Gold, Silver, Copper | Show or hide each price. USDT and gold are on by default. |
| Placement | Left, center, or right side of the top bar. |
| Order | Position on that side. `0` is the leftmost spot; a higher number moves the indicator to the right, past other icons. |

The same show/hide switches are also in the indicator menu.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
