import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const PLACEMENTS = ['left', 'center', 'right'];

export default class PriceExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Indicators',
            description: 'Choose which prices are shown and where they sit on the top bar.',
        });
        page.add(group);

        const usdtRow = new Adw.SwitchRow({
            title: 'USDT',
            subtitle: 'Bitpin USDT/IRT price',
        });
        settings.bind('show-usdt', usdtRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(usdtRow);

        const goldRow = new Adw.SwitchRow({
            title: 'Gold',
            subtitle: 'Talasea gold price',
        });
        settings.bind('show-gold', goldRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(goldRow);

        const silverRow = new Adw.SwitchRow({
            title: 'Silver',
            subtitle: 'Noghresea silver price',
        });
        settings.bind('show-silver', silverRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(silverRow);

        const copperRow = new Adw.SwitchRow({
            title: 'Copper',
            subtitle: 'Meschi copper price',
        });
        settings.bind('show-copper', copperRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(copperRow);

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

        window.add(page);
    }
}
