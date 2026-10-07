# Prices

A GNOME Shell extension that shows live market prices in the top bar.

Built-in feeds:

- **USDT (Bitpin)** — USDT/IRT
- **Gold (Talasea)**
- **Silver (Noghresea)**
- **Copper (Meschi)**

You can also add custom feeds in preferences: a name, URL, color, optional request headers, and a `priceFrom` JavaScript function body that receives the parsed JSON response as `data`.

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

### Package

`gnome-extensions pack` does not compile GSettings schemas. Use `./pack.sh` so the zip includes `schemas/gschemas.compiled`. Without that file, the extension fails to enable.

```bash
./pack.sh --force
gnome-extensions install --force price-extension@en.molaei.org.shell-extension.zip
```

## Settings

Open the extension preferences to choose which prices appear, where the indicator sits, and to manage custom feeds.

| Setting | What it does |
| --- | --- |
| Built-in feeds | Show or hide each built-in price. USDT and gold are on by default. Built-in feeds cannot be removed. |
| Custom feeds | Add, edit, enable, or remove your own feeds (name, URL, color, optional headers, `priceFrom`). |
| Placement | Left, center, or right side of the top bar. |
| Order | Position on that side. `0` is the leftmost spot; a higher number moves the indicator to the right, past other icons. |

The same show/hide switches are also in the indicator menu.

### Custom feed `priceFrom`

The body is run as a function with one argument, `data` (parsed JSON). It should return the price value:

```js
return data.price;
```

Optional headers are a JSON object, for example `{"Authorization":"Bearer …"}`.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
