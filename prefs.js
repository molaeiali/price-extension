import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    newCustomFeedId,
    parseCustomFeedsJson,
    serializeCustomFeeds,
    validateCustomFeedInput,
} from './lib/custom-feeds.js';
import {FEEDS, PLACEMENTS} from './lib/feeds.js';

function colorFromHex(hex) {
    const value = hex.replace('#', '');
    const rgba = new Gdk.RGBA();
    rgba.red = Number.parseInt(value.slice(0, 2), 16) / 255;
    rgba.green = Number.parseInt(value.slice(2, 4), 16) / 255;
    rgba.blue = Number.parseInt(value.slice(4, 6), 16) / 255;
    rgba.alpha = 1;
    return rgba;
}

function hexFromColor(rgba) {
    const r = Math.round(rgba.red * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgba.green * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgba.blue * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

const FeedEditorDialog = GObject.registerClass({
    GTypeName: 'PriceExtensionFeedEditorDialog',
}, class FeedEditorDialog extends Adw.Dialog {
    _init({title, feed, onSave}) {
        super._init({
            title,
            content_width: 480,
        });

        this._onSave = onSave;

        const toolbar = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        toolbar.add_top_bar(header);

        const cancel = new Gtk.Button({label: 'Cancel'});
        cancel.connect('clicked', () => this.close());
        header.pack_start(cancel);

        const save = new Gtk.Button({
            label: 'Save',
            css_classes: ['suggested-action'],
        });
        save.connect('clicked', () => this._save());
        header.pack_end(save);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);

        this._nameRow = new Adw.EntryRow({
            title: 'Name',
            text: feed?.name ?? '',
        });
        group.add(this._nameRow);

        this._urlRow = new Adw.EntryRow({
            title: 'URL',
            text: feed?.url ?? '',
        });
        group.add(this._urlRow);

        this._colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({title: 'Feed color'}),
            rgba: colorFromHex(feed?.color ?? '#6c8cff'),
            valign: Gtk.Align.CENTER,
        });
        const colorRow = new Adw.ActionRow({title: 'Color'});
        colorRow.add_suffix(this._colorButton);
        group.add(colorRow);

        this._headersRow = new Adw.EntryRow({
            title: 'Headers (JSON object, optional)',
            text: feed?.headers && Object.keys(feed.headers).length > 0
                ? JSON.stringify(feed.headers)
                : '',
        });
        group.add(this._headersRow);

        const priceGroup = new Adw.PreferencesGroup({
            title: 'priceFrom',
            description: 'JavaScript function body. Called with the parsed JSON as data. Example: return data.price;',
        });
        page.add(priceGroup);

        this._priceFrom = new Gtk.TextView({
            monospace: true,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            hexpand: true,
            vexpand: true,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 8,
            right_margin: 8,
        });
        this._priceFrom.buffer.text = feed?.priceFrom ?? 'return data.price;';

        const scrolled = new Gtk.ScrolledWindow({
            min_content_height: 140,
            child: this._priceFrom,
            hexpand: true,
        });
        const priceRow = new Adw.PreferencesRow();
        priceRow.set_child(scrolled);
        priceGroup.add(priceRow);

        this._errorLabel = new Gtk.Label({
            label: '',
            wrap: true,
            xalign: 0,
            visible: false,
            css_classes: ['error'],
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });
        box.append(page);
        box.append(this._errorLabel);
        toolbar.set_content(box);
        this.set_child(toolbar);
    }

    _save() {
        const result = validateCustomFeedInput({
            name: this._nameRow.text,
            url: this._urlRow.text,
            color: hexFromColor(this._colorButton.get_rgba()),
            headersText: this._headersRow.text,
            priceFrom: this._priceFrom.buffer.text,
        });

        if (!result.ok) {
            this._errorLabel.label = result.error;
            this._errorLabel.visible = true;
            return;
        }

        this._onSave(result.value);
        this.close();
    }
});

export default class PriceExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._settings = settings;
        this._window = window;

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Indicators',
            description: 'Choose which prices are shown and where they sit on the top bar.',
        });
        page.add(group);

        for (const feed of FEEDS) {
            const row = new Adw.SwitchRow({
                title: feed.label,
            });
            settings.bind(feed.settingsKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }

        const placementRow = new Adw.ComboRow({
            title: 'Placement',
            subtitle: 'Left, center, or right side of the top bar',
            model: new Gtk.StringList({
                strings: ['Left', 'Center', 'Right'],
            }),
        });
        const current = PLACEMENTS.indexOf(settings.get_string('placement'));
        placementRow.selected = current === -1 ? PLACEMENTS.indexOf('right') : current;
        placementRow.connect('notify::selected', () => {
            const next = PLACEMENTS[placementRow.selected];
            if (next && next !== settings.get_string('placement'))
                settings.set_string('placement', next);
        });
        group.add(placementRow);

        const positionRow = new Adw.SpinRow({
            title: 'Order',
            subtitle: '0 is the leftmost spot on the chosen side. Increase it to move the prices to the right, past other icons.',
            adjustment: new Gtk.Adjustment({
                value: settings.get_int('position'),
                lower: 0,
                upper: 20,
                step_increment: 1,
                page_increment: 1,
            }),
            digits: 0,
        });
        positionRow.connect('notify::value', () => {
            const next = positionRow.get_value();
            if (next !== settings.get_int('position'))
                settings.set_int('position', next);
        });
        group.add(positionRow);

        this._customGroup = new Adw.PreferencesGroup({
            title: 'Custom feeds',
            description: 'Add your own price endpoints. Built-in feeds cannot be removed.',
        });
        page.add(this._customGroup);

        const addButton = new Gtk.Button({
            label: 'Add',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        addButton.connect('clicked', () => this._openEditor());
        this._customGroup.set_header_suffix(addButton);

        this._customRows = [];
        this._reloadCustomRows();
        this._customFeedsChangedId = settings.connect('changed::custom-feeds', () => {
            this._reloadCustomRows();
        });
        window.connect('close-request', () => {
            if (this._customFeedsChangedId) {
                settings.disconnect(this._customFeedsChangedId);
                this._customFeedsChangedId = 0;
            }
        });

        window.add(page);
    }

    _readCustomFeeds() {
        return parseCustomFeedsJson(this._settings.get_string('custom-feeds'));
    }

    _writeCustomFeeds(feeds) {
        this._settings.set_string('custom-feeds', serializeCustomFeeds(feeds));
    }

    _reloadCustomRows() {
        for (const row of this._customRows)
            this._customGroup.remove(row);
        this._customRows = [];

        const feeds = this._readCustomFeeds();
        if (feeds.length === 0) {
            const empty = new Adw.ActionRow({
                title: 'No custom feeds yet',
                subtitle: 'Use Add to create one',
                sensitive: false,
            });
            this._customGroup.add(empty);
            this._customRows.push(empty);
            return;
        }

        for (const feed of feeds) {
            const row = new Adw.ActionRow({
                title: feed.name,
                subtitle: feed.url,
                activatable: true,
            });

            const swatch = new Gtk.Box({
                width_request: 16,
                height_request: 16,
                valign: Gtk.Align.CENTER,
                margin_end: 8,
            });
            const provider = new Gtk.CssProvider();
            provider.load_from_string(
                `box { background-color: ${feed.color}; border-radius: 8px; }`
            );
            swatch.get_style_context().add_provider(
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
            row.add_prefix(swatch);

            const enabled = new Gtk.Switch({
                active: feed.enabled !== false,
                valign: Gtk.Align.CENTER,
            });
            enabled.connect('notify::active', () => {
                const current = this._readCustomFeeds();
                const item = current.find(entry => entry.id === feed.id);
                if (!item || item.enabled === enabled.active)
                    return;
                item.enabled = enabled.active;
                this._writeCustomFeeds(current);
            });
            row.add_suffix(enabled);
            row.set_activatable_widget(null);

            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                tooltip_text: 'Remove feed',
            });
            remove.connect('clicked', () => this._confirmRemove(feed));
            row.add_suffix(remove);

            row.connect('activated', () => this._openEditor(feed));

            this._customGroup.add(row);
            this._customRows.push(row);
        }
    }

    _openEditor(feed = null) {
        const dialog = new FeedEditorDialog({
            title: feed ? 'Edit feed' : 'Add feed',
            feed,
            onSave: value => {
                const feeds = this._readCustomFeeds();
                if (feed) {
                    const index = feeds.findIndex(entry => entry.id === feed.id);
                    if (index === -1)
                        return;
                    feeds[index] = {
                        ...feeds[index],
                        ...value,
                        id: feed.id,
                        enabled: feeds[index].enabled !== false,
                    };
                } else {
                    feeds.push({
                        id: newCustomFeedId(),
                        ...value,
                        enabled: true,
                    });
                }
                this._writeCustomFeeds(feeds);
            },
        });
        dialog.present(this._window);
    }

    _confirmRemove(feed) {
        const dialog = new Adw.AlertDialog({
            heading: 'Remove feed?',
            body: `Remove “${feed.name}”? This cannot be undone.`,
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('remove', 'Remove');
        dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_dialog, response) => {
            if (response !== 'remove')
                return;
            const feeds = this._readCustomFeeds().filter(entry => entry.id !== feed.id);
            this._writeCustomFeeds(feeds);
        });
        dialog.present(this._window);
    }
}
