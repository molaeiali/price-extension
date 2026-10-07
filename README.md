# Prices

A GNOME Shell extension that shows live market prices in the top bar.

On first run these feeds are added, and you can edit or remove any of them:

- **USDT (Bitpin)** — USDT/IRT
- **Gold (Talasea)**
- **Silver (Noghresea)**
- **Copper (Meschi)**

Each feed has a name, URL, HTTP method (`GET` or `POST`), color, optional request headers, an optional JSON body for `POST`, and a `priceFrom` JavaScript function body that receives the parsed JSON response as `data`. **Bring back default feeds** adds any default whose name is no longer in the list.

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

Open the extension preferences to choose which prices appear, where the indicator sits, and to edit feeds.

| Setting | What it does |
| --- | --- |
| Feeds | Add, edit, show, hide, or remove any feed, including the ones added on first run. USDT and gold start visible. Silver and copper start hidden. |
| Bring back default feeds | Add each default feed whose name is missing. Feeds you renamed or kept are left as they are. |
| Placement | Left, center, or right side of the top bar. |
| Order | Position on that side. `0` is the leftmost spot; a higher number moves the indicator to the right, past other icons. |

The same show/hide switches are also in the indicator menu.

### Feed `priceFrom`

The body is run as a function with one argument, `data` (parsed JSON). It should return the price value:

```js
return data.price;
```

Optional headers are a JSON object, for example `{"Authorization":"Bearer …"}`.

Choose `POST` to send a JSON request body. `GET` sends no body.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
