import { Notice, Platform, TFolder, type Setting, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import { DEFAULT_SETTINGS, type SpacesSettings, type SpacesSettingTab } from "../../settings";
import { IconPickerModal } from "../../modals/iconPicker";
import { AddPortalModal } from "../../modals/addPortalModal";
import { SpaceConfig } from "../../types";
import { SidePortalModal } from "../../modals/sidePortalModal";
import { SelectFolderModal } from "../../modals/selectFolderModal";
import { AltSidePanelView, VIEW_TYPE_ALT_SIDE_PANEL } from "../../renderers/RightSideView";
import { getGuideUrl, getReleaseNotesUrl } from "../Proxies/urls";
import { makeSyncButton } from "../syncButton";

export function buildSettingDefinitions(tab: SpacesSettingTab): SettingDefinitionItem[] {
    return [
        {
            type: 'group',
            heading: 'Configuration',
            items: [
                { type: 'page', name: 'Explorer', items: buildExplorerPage(tab) },
                { type: 'page', name: 'Portal tabs', items: buildPortalTabsPage(tab) },
                { type: 'page', name: 'Side portal', items: buildSidePortalPage(tab) },
                { type: 'page', name: 'Maintenance', items: buildMaintainPage(tab) }
            ]
        },
        {
            type: 'group',
            heading: 'Utilities',
            items: buildUtilitiesSection(tab)
        }
    ];
}

function buildExplorerPage(tab: SpacesSettingTab): SettingDefinitionItem[] {
    return [        
        {
            name: 'Replace file explorer in left sidebar',
            desc: 'Portals replaces the default file explorer on startup. The file explorer remains accessible via commands or Obsidian tabs.',
            control: { type: 'toggle', key: 'replaceFileExplorer' }
        },
        {
            name: 'Compact tree view',
            desc: 'Reduce vertical spacing and summary heights in the folder or tag tree. Does not apply to side portal.',
            control: { type: 'toggle', key: 'compactTree' }
        },
        {
            name: 'Styles',
            desc: 'Choose a visual theme for file tree and list items in side portal.',
            control: {
                type: 'dropdown',
                key: 'treeStyle',
                defaultValue: 'default',
                options: {
                    'default': 'Default',
                    'minimal': 'Minimal',
                    'boxed': 'Boxed',
                    'portals': 'Portals',
                    'shades': 'Shades',
                    'hues': 'Hues'
                }
            }
        },
        {
            name: 'Background color type',
            desc: 'Choose how to apply active tab colors to the file area.',
            control: {
                type: 'dropdown',
                key: 'filePaneColorStyle',
                defaultValue: 'gradient',
                options: {
                    'gradient': 'Gradient',
                    'solid': 'Solid',
                    'none': 'No color'
                }
            }
        },
        {
            name: 'Bold folder names',
            desc: 'Make folder names and tag group names bold in the file tree.',
            control: { type: 'toggle', key: 'boldFolderNames' }
        },
        {
            name: 'Extension badge for non-markdown files',
            desc: 'Display extension badge on non-markdown files. When turned on, non-markdown files do not show extension after file name.',
            control: { type: 'toggle', key: 'enableFileExtensionNonMD' }
        },
        {
            name: 'Show tree item tooltips',
            desc: 'Show tooltips on files, folders and tags in explorer. Shows word count and last modified for files, number of subitems for folders and tags. Additionally shows name when truncated on all.',
            control: { type: 'toggle', key: 'showTreeItemToolTips' }
        },
        {
            name: 'Quick-add icons',
            desc: 'Choose how to show quick-add icons on folder and tag rows. Hover reveal on desktop, directly on mobile.',
            control: {
                type: 'dropdown',
                key: 'quickAddIcon',
                defaultValue: 'desktop-only',
                options: {
                    'off': 'Off',
                    'on': 'On',
                    'desktop-only': 'Desktop only'
                }
            }
        },
        {
            name: 'Show file preview',
            desc: 'Show a snippet of file text under the file name in folder or tag tree.',
            control: { type: 'toggle', key: 'showFilePreview' }
        },
        {
            name: 'Show file info bar',
            desc: 'Show tags (in folder portals) or parent folder (in tag portals) below the file preview.',
            visible: () => tab.plugin.settings.showFilePreview,
            control: { type: 'toggle', key: 'showFileInfoBar' }
        },
        {
            name: 'Enable sections',
            desc: 'Show sections within each folder or tag to organise sub items into separated sections.',
            control: { type: 'toggle', key: 'enableSections' }
        }
    ]
        
}

function buildPortalTabsPage(tab: SpacesSettingTab): SettingDefinitionItem[] {
    return [
        {
            name: 'Compact tabs',
            desc: 'Reduce padding and font size for portal, side portal tabs and stack headers.',
            control: { type: 'toggle', key: 'compactTabs' }
        },
        {
            name: 'Tab name display',
            desc: 'Control how tab names are shown. Tooltips appear on hover only when names are hidden.',
            control: {
                type: 'dropdown',
                key: 'tabNameDisplay',
                defaultValue: 'activeOnly',
                options: {
                    'none': 'Icons only',
                    'activeOnly': 'Show active tab name',
                    'all': 'Show all tab names'
                }
            }
        },
        {
            name: 'Tab icon position',
            desc: 'Place the icon to the left or right of the tab name or side portal name. Disabled when tab name displayed is icon only.',
            control: {
                type: 'dropdown',
                key: 'tabIconPosition',
                defaultValue: 'right',
                options: {
                    'left': 'Left of name',
                    'right': 'Right of name'
                }
            }
        },
        {
            name: 'Show quick tab badge',
            desc: 'Shows a badge to denote asssigned tab number for quick switching using command or hotkeys.',
            control: { type: 'toggle', key: 'showQuickTabNumbersOnTabs' }
        },
        {
            name: 'Tab colors',
            desc: 'Show tab color on bottom borders of active tabs. Portal style uses the same color when enabled. The color of the pinned vault root is used in side portals.',
            control: { type: 'toggle', key: 'tabColorEnabled' }
        },
        {
            name: 'Pin vault',
            desc: 'Show vault root as pinned tab (always with a left border). Users can customize its icon and color below.',
            control: { type: 'toggle', key: 'pinnedVaultRoot' }
        },
        {
            name: 'Pinned vault appearance',
            desc: 'Customize icon and color for the vault root tab.',
            visible: () => tab.plugin.settings.pinVaultRoot,
            render: (setting) => renderPinnedVaultAppearance(setting, tab)
        },
        {
            name: 'Add new portal',
            desc: 'Add a folder or tag as a portal tab.',
            render: (setting) => renderAddPortalButton(setting, tab)
        },
        {
            name: 'Active tabs',
            desc: 'Manage your portal tabs - folders and tags.',
            render: (setting) => renderActiveTabsSection(setting, tab)
        },
        {
            name: 'Hide stack names',
            desc: 'Show only the stack icon; the name will appear in tooltip on hover.',
            control: { type: 'toggle', key: 'hideStackNames' }
        },
        {
            name: 'Stack icon position',
            desc: 'Place the icon to the left or right of the stack name. Disabled when stack name is hidden.',
            control: {
                type: 'dropdown',
                key: 'stackIconPosition',
                defaultValue: 'left',
                options: {
                    'left': 'Left of name',
                    'right': 'Right of name'
                }
            }
        },
        {
            name: 'Show stack count',
            desc: 'When to display the number of portals inside a stack.',
            control: {
                type: 'dropdown',
                key: 'showStackCount',
                defaultValue: 'never',
                options: {
                    'always': 'Always',
                    'collapsed': 'Collapsed only',
                    'never': 'Never'
                }
            }
        },
        {
            name: 'Colored stack icon',
            desc: 'Use colors on stack icon, app accent or user defined. When turned off, stack icons use default color like tab icons.',
            control: { type: 'toggle', key: 'stackIconAccent' }
        },
        {
            name: 'Auto-collapse stacks',
            desc: 'When expanding a stack, automatically collapse open stacks.',
            control: { type: 'toggle', key: 'stackAutoCollapse' }
        }
    ];
}

function buildSidePortalPage(tab: SpacesSettingTab): SettingDefinitionItem[] {
    return [
        // ─── Side portal basics ───
        {
            name: 'Side portal',
            desc: 'Show a collapsible panel at the bottom with additional tabs.',
            control: { type: 'toggle', key: 'sidePanelEnabled' }
        },
        {
            name: 'Choose side portals',
            desc: 'Select which tabs appear in the side portal.',
            render: (setting) => {
                const controlEl = setting.controlEl;
                controlEl.empty();
                const btn = controlEl.createEl('button', { text: 'Configure', cls: 'mod-cta' });
                btn.addEventListener('click', () => {
                    new SidePortalModal(tab.app, tab.plugin, (left, right) => {
                        void handleSidePortalConfigSave(tab, left, right);
                    }).open();
                });
            }
        },
        {
            name: 'Disable side portal on mobile',
            desc: 'Hide side portal on mobile devices.',
            control: { type: 'toggle', key: 'disableSidePanelOnMobile' }
        },

        // ─── Context notes ───
        {
            name: 'Context notes',
            desc: 'An expansion to the older folder notes feature. Context notes apply to folders as well as tags.',
            render: () => {
                // Section heading — no interactive control
            }
        },
        {
            name: 'Enable context notes',
            desc: 'When disabled, context notes are treated as normal files and the side portal shows a notice. Menu items, context note listeners and cache are removed.',
            control: { type: 'toggle', key: 'enableContextNotes' }
        },
        {
            name: 'Tag notes folder',
            desc: 'Tag notes storage folder. After changing folder path, use the "Migrate" button to move the files.',
            render: (setting) => renderTagNotesFolder(setting, tab)
        },
        {
            name: 'Show context notes in file tree',
            desc: 'When context notes are enabled, controls if they appear in file or tag tree. If context notes are disabled, this setting has no effect.',
            visible: () => tab.plugin.settings.enableContextNotes,
            control: { type: 'toggle', key: 'showContextNotesInTree' }
        },
        {
            name: 'Context note highlight type',
            desc: 'How to visually indicate folders and tags that have a context note.',
            control: {
                type: 'dropdown',
                key: 'contextNoteHighlightStyle',
                defaultValue: 'icon',
                options: {
                    'icon': 'Icon highlight',
                    'underline': 'Text underline',
                    'none': 'Off'
                }
            }
        },
        {
            name: 'Open context note from icon',
            desc: 'When enabled, clicking the icon of a folder or tag will open its context note in the current tab.',
            visible: () => tab.plugin.settings.enableContextNotes,
            control: { type: 'toggle', key: 'contextNoteIconClick' }
        },
        {
            name: 'Show closest context note',
            desc: "Side portal shows context note for the active file's nearest ancestor folder (folder spaces only). Falls back to portal's context note if none found.",
            visible: () => tab.plugin.settings.enableContextNotes,
            control: {
                type: 'dropdown',
                key: 'contextNoteFollowActive',
                defaultValue: 'off',
                options: {
                    'off': 'Off',
                    'on-status': 'On, show status',
                    'on-noStatus': 'On, no status'
                }
            }
        },

        // ─── Journal ───
        {
            name: 'Journal',
            desc: 'A viewing and marking tool for Daily Notes with a quote display feature.',
            render: () => {}
        },
        {
            name: 'Journal date format',
            desc: 'Choose date format used in daily note filenames. The format must match for journal to work consistently. Changes require a reload.',
            control: {
                type: 'dropdown',
                key: 'journalDateFormat',
                defaultValue: 'DD-MM-YYYY',
                options: {
                    'DD-MM-YYYY': 'DD-MM-YYYY',
                    'MM-DD-YYYY': 'MM-DD-YYYY',
                    'YYYY-MM-DD': 'YYYY-MM-DD'
                }
            }
        },
        {
            name: 'Journal folder',
            desc: 'Folder containing daily notes. Type the path or choose from the list. Leave empty to use the folder from the Daily Notes core plugin.',
            render: (setting) => renderJournalFolder(setting, tab)
        },
        {
            name: 'Quote delimiter',
            desc: 'Symbols used to mark quotes in your notes. Changes made to selected quotes or symbols will reflect after Obsidian reload.',
            control: {
                type: 'dropdown',
                key: 'quoteDelimiter',
                defaultValue: '==',
                options: {
                    '==': '== (double equals)',
                    '**': '** (double asterisk)',
                    '++': '++ (double plus)',
                    '||': '|| (double pipe)'
                }
            }
        },
        {
            name: 'Journal default quote tab',
            desc: 'Choose a journal tab for default display, requires Obsidian reload.',
            control: {
                type: 'dropdown',
                key: 'journalDefaultCurrentMode',
                defaultValue: 'random',
                options: {
                    'random': 'Random',
                    'marked': 'Marked',
                    'onThisDay': 'On this day'
                }
            }
        },
        {
            name: 'Show quote indicator on date cards',
            desc: 'Adds a small icon to journal date cards that contain at least one quote.',
            control: {
                type: 'dropdown',
                key: 'journalQuoteIndicator',
                defaultValue: 'none',
                options: {
                    'quotes': 'Quotes',
                    'warnings': 'Warnings',
                    'all': 'All',
                    'none': 'None'
                }
            }
        },

        // ─── Properties ───
        {
            name: 'Properties',
            desc: 'A viewing tool for markdown files, based on their properties.',
            render: () => {}
        },
        {
            name: 'Show current value',
            desc: 'Show current property value on list of files filtered by properties.',
            control: { type: 'toggle', key: 'showCurrentPropertyValue' }
        },
        {
            name: 'Hide filtered badge',
            desc: 'Hide the count display of files filtered in properties. The number is based on dropdown choices.',
            control: { type: 'toggle', key: 'hideFilteredCount' }
        }
    ];
}

function buildMaintainPage(tab: SpacesSettingTab): SettingDefinitionItem[] {
    return [
        // ─── Backup / restore ───
        {
            name: 'Export settings',
            desc: 'Export your current portals configuration as a JSON file.',
            render: (setting) => {
                const btn = setting.controlEl.createEl('button', { text: 'Export' });
                btn.addEventListener('click', () => { void exportSettings(tab); });
            }
        },
        {
            name: 'Import settings',
            desc: 'Load settings from a JSON file. This will replace your current configuration.',
            render: (setting) => {
                const btn = setting.controlEl.createEl('button', { text: 'Import' });
                btn.addEventListener('click', () => importSettings(tab));
            }
        },
        {
            name: 'Auto backup settings on startup',
            desc: 'Create timestamped settings backup on Obsidian start. Cloud icon saves it to local storage instead of data.json. This can help prevent sync conflicts on quick switching devices.',
            render: (setting) => renderAutoBackupRow(setting, tab)
        },
        {
            name: 'Select Auto backup folder',
            desc: 'The folder keeps 3 backups, removes older ones. Leave the folder empty to save in the vault root.',
            visible: () => tab.plugin.settings.enableAutoBackup,
            render: (setting) => renderBackupFolder(setting, tab)
        },

        // ─── Maintenance & help ───
        {
            name: 'Clean up dead portals',
            desc: 'Remove portal tabs for folders or tags that no longer exist. This cannot be undone.',
            render: (setting) => {
                const btn = setting.controlEl.createEl('button', { text: 'Clean now', cls: 'mod-warning' });
                btn.addEventListener('click', async () => {
                    const removed = await tab.plugin.cleanupDeadSpaces();
                    new Notice(removed > 0 ? `Removed ${removed} dead portal(s)` : 'No dead portals found');
                });
            }
        },
        {
            name: 'Clean up dead hidden keys',
            desc: 'Use this to clean data.json only if changes were made outside Obsidian to hidden files, folders or tags. Changes inside Obsidian are updated automatically.',
            render: (setting) => {
                const btn = setting.controlEl.createEl('button', { text: 'Clean now', cls: 'mod-warning' });
                btn.addEventListener('click', async () => {
                    const removed = await tab.plugin.cleanupDeadHiddenItems();
                    new Notice(removed > 0 ? `Removed ${removed} dead hidden key(s) in data.json` : 'No dead hidden keys found');
                });
            }
        }
    ]
}

function buildUtilitiesSection(_tab: SpacesSettingTab): SettingGroupItem[] {
    return [
        {
            name: 'Plugin icon library',
            desc: "Icon library only defines the icons for plugin's native elements.",
            control: {
                type: 'dropdown',
                key: 'iconLibrary',
                defaultValue: 'phosphor',
                options: {
                    'phosphor': 'Phosphor',
                    'lucide': 'Lucide'
                }
            }
        },
        {
            name: 'User guide',
            desc: 'Open the full documentation, the guide covers everything about the plugin.',
            render: (setting) => {
                const btn = setting.controlEl.createEl('button', { text: 'Open guide' });
                btn.addEventListener('click', () => window.open(getGuideUrl(), '_blank'));
            }
        },
        {
            name: 'Release notes',
            desc: 'See the release notes, stay up to date on the latest changes made to the plugin.',
            render: (setting) => {
                const btn = setting.controlEl.createEl('button', { text: 'Release notes' });
                btn.addEventListener('click', () => window.open(getReleaseNotesUrl(), '_blank'));
            }
        }
    ];
}

//----- CUSTOM RENDER CALLBACKS (used by "render:" entries above) FOR PORTAL TABS PAGE

function renderPinnedVaultAppearance(setting: Setting, tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    const controlEl = setting.controlEl;
    controlEl.empty();
    controlEl.addClass('portals-portal-controls');

    const rootSpace = plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
    if (!rootSpace) return;
    
    const colorRow = controlEl.createDiv({ cls: 'portals-color-row' });

    // icon button
    const rootCompositeKey = 'folder:/';
    const iconBtn = colorRow.createEl('button',{
        cls: 'clickable-icon',
        attr: { 'aria-label': 'Choose icon' }
    });
    const refreshIcon = () => {
        iconBtn.empty();
        plugin.renderCustomIcon(iconBtn, rootCompositeKey, rootSpace.icon || 'folder-simple');
    };
    refreshIcon();
    iconBtn.addEventListener('click', () => {
        new IconPickerModal(tab.app, plugin.phosphorProvider, plugin.lucideProvider, plugin, (iconKey: string) => {
            plugin.settings.customIcons[rootCompositeKey] = iconKey;
            void plugin.saveSettings().then(() => refreshIcon());
        }).open();
    });

    // color swatch + picker
    const colorWrapper = colorRow.createDiv({ cls: 'portals-color-wrapper' });
    let initialHex = '#ff0880';
    let initialOpacity = 1;
    if (rootSpace.color && rootSpace.color !== 'transparent') {
        const rgba = rootSpace.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgba && rgba[1] && rgba[2] && rgba[3]) {
            initialHex = `#${Number(rgba[1]).toString(16).padStart(2, '0')}${Number(rgba[2]).toString(16).padStart(2, '0')}${Number(rgba[3]).toString(16).padStart(2, '0')}`;
            initialOpacity = rgba[4] ? parseFloat(rgba[4]) : 1;
        } else if (rootSpace.color.startsWith('#')) {
            initialHex = rootSpace.color;
        }
    }

    const hiddenColorInput = colorWrapper.createEl('input', {
        type: 'color',
        value: initialHex,
        cls: 'portals-hidden-color-input'
    });
    const customSwatch = colorWrapper.createDiv('portals-color-swatch');
    customSwatch.setCssProps({ '--swatch-bg': initialHex });
    const opacityWrapper = colorRow.createDiv('portals-opacity-wrapper');
    const opacityInput = opacityWrapper.createEl('input', {
        type: 'number',
        value: String(initialOpacity * 100),
        cls: 'portals-opacity-input',
        attr: { min: '0', max: '100', step: '1' }
    });
    opacityWrapper.createSpan({ cls: 'portals-percent', text: '%' });

    const updateColor = () => {
        const hex = hiddenColorInput.value;
        const opacity = parseInt(opacityInput.value) / 100;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        rootSpace.color = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        customSwatch.setCssProps({ '--swatch-bg': hex });
        void plugin.saveSettings();
    };

    customSwatch.addEventListener('click', () => hiddenColorInput.click());
    hiddenColorInput.addEventListener('input', updateColor);
    opacityInput.addEventListener('input', updateColor);
}

function renderAddPortalButton(setting: Setting, tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    const controlEl = setting.controlEl;
    controlEl.empty();

    const btn = controlEl.createEl('button', { text: 'Add', cls: 'mod-cta' });
    btn.addEventListener('click', () => {
        new AddPortalModal(tab.app, plugin, (path: string, type: 'folder' | 'tag') => {
            if (plugin.settings.spaces.some(s => s.path === path && s.type === type)) {
                new Notice('This portal already exists.');
                return;
            }
            plugin.settings.spaces.push({
                path,
                type,
                icon: type === 'folder' ? 'folder-simple' : 'tag',
                color: 'transparent'
            });
            if (plugin.settings.spaces.length === 1 && !plugin.settings.pinVaultRoot) {
                plugin.settings.selectedSpace = { path, type };
            }
            void plugin.saveSettings();
        }).open();
    });
}

function renderActiveTabsSection(setting: Setting, tab: SpacesSettingTab): void {
    setting.settingEl.addClass('portals-full-width-setting');
    const plugin = tab.plugin;
    const app = tab.app;
    const controlEl = setting.controlEl;
    controlEl.empty();
    controlEl.addClass('portals-active-tabs-controls');

    const getPortalDisplayName = (portal: SpaceConfig): string => {
        if (portal.type === 'folder') {
            if (portal.path === '/') return app.vault.getName();
            const folder = app.vault.getAbstractFileByPath(portal.path);
            return folder instanceof TFolder ? folder.name : portal.path;
        } else {
            return '#' + portal.path;
        }
    };

    const rootFolders: SpaceConfig[] = [];
    const subFolders: SpaceConfig[] = [];
    const tags: SpaceConfig[] = [];

    for (const portal of plugin.settings.spaces) {
        if (portal.path === '/' && portal.type === 'folder') continue;
        if (portal.type === 'tag') {
            tags.push(portal);
        } else {
            const folder = app.vault.getAbstractFileByPath(portal.path);
            if (folder instanceof TFolder) {
                if (folder.parent === app.vault.getRoot()) rootFolders.push(portal);
                else subFolders.push(portal);
            } else {
                if (portal.path.includes('/')) subFolders.push(portal);
                else rootFolders.push(portal);
            }
        }
    }

    const sortByName = (a: SpaceConfig, b: SpaceConfig) =>
        getPortalDisplayName(a).toLowerCase().localeCompare(getPortalDisplayName(b).toLowerCase());

    rootFolders.sort(sortByName);
    subFolders.sort(sortByName);
    tags.sort(sortByName);

    const renderGroup = (title: string, portals: SpaceConfig[]) => {
        if (portals.length === 0) return;

        const details = controlEl.createEl('details', { cls: 'portals-section-details' });
        if (tab.openSections.has(title)) details.open = true;
        details.addEventListener('toggle', () => {
            if (details.open) tab.openSections.add(title);
            else tab.openSections.delete(title);
        });

        details.createEl('summary', { cls: 'portals-section-summary', text: title });

        for (const portal of portals) {
            const row = details.createDiv({ cls: 'portals-portal-row' });
            const info = row.createDiv({ cls: 'portals-portal-info' });
            info.createSpan({ cls: 'portals-portal-name', text: getPortalDisplayName(portal) });
            info.createSpan({ cls: 'portals-portal-path', text: `${portal.type} · ${portal.path}` });

            const controls = row.createDiv({ cls: 'portals-portal-controls' });
            const colorRow = controls.createDiv({ cls: 'portals-color-row' });

            // Icon
            const compositeKey = `${portal.type}:${portal.path}`;
            const iconBtn = colorRow.createEl('button', {
                cls: 'clickable-icon',
                attr: { 'aria-label': 'Choose icon' }
            });
            plugin.renderCustomIcon(iconBtn, compositeKey, portal.icon || (portal.type === 'folder' ? 'folder-simple' : 'tag'));
            iconBtn.addEventListener('click', () => {
                new IconPickerModal(
                    app,
                    plugin.phosphorProvider,
                    plugin.lucideProvider,
                    plugin,
                    (iconKey: string) => {
                        plugin.settings.customIcons[compositeKey] = iconKey;
                        void plugin.saveSettings();
                    }
                ).open();
            });

            // Color swatch + picker
            const colorWrapper = colorRow.createDiv({ cls: 'portals-color-wrapper' });
            let initialHex = '#ff0000';
            let initialOpacity = 1;
            if (portal.color && portal.color !== 'transparent') {
                const rgba = portal.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (rgba && rgba[1] && rgba[2] && rgba[3]) {
                    initialHex = `#${Number(rgba[1]).toString(16).padStart(2, '0')}${Number(rgba[2]).toString(16).padStart(2, '0')}${Number(rgba[3]).toString(16).padStart(2, '0')}`;
                    initialOpacity = rgba[4] ? parseFloat(rgba[4]) : 1;
                } else if (portal.color.startsWith('#')) {
                    initialHex = portal.color;
                }
            }
            const hiddenColorInput = colorWrapper.createEl('input', {
                type: 'color', value: initialHex, cls: 'portals-hidden-color-input'
            });
            const customSwatch = colorWrapper.createDiv('portals-color-swatch');
            customSwatch.setCssProps({ '--swatch-bg': initialHex });

            const opacityWrapper = colorRow.createDiv({ cls: 'portals-opacity-wrapper' });
            const opacityInput = opacityWrapper.createEl('input', {
                type: 'number', value: String(initialOpacity * 100),
                cls: 'portals-opacity-input',
                attr: { min: '0', max: '100', step: '1' }
            });
            opacityWrapper.createSpan({ cls: 'portals-percent', text: '%' });

            const updateColor = () => {
                const hex = hiddenColorInput.value;
                const opacity = parseInt(opacityInput.value) / 100;
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                portal.color = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                void plugin.saveSettings();
            };
            customSwatch.addEventListener('click', () => hiddenColorInput.click());
            hiddenColorInput.addEventListener('input', updateColor);
            opacityInput.addEventListener('input', updateColor);

            // Trash
            const trashBtn = colorRow.createEl('button', {
                cls: 'clickable-icon', attr: { 'aria-label': 'Remove portal' }
            });
            plugin.renderPluginIcon(trashBtn, 'trash');
            trashBtn.addEventListener('click', () => {
                plugin.settings.spaces = plugin.settings.spaces.filter(s => s !== portal);
                if (plugin.settings.selectedSpace?.path === portal.path &&
                    plugin.settings.selectedSpace?.type === portal.type) {
                    plugin.settings.selectedSpace = plugin.settings.spaces[0]
                        ? { path: plugin.settings.spaces[0].path, type: plugin.settings.spaces[0].type }
                        : null;
                }
                void plugin.saveSettings();
            });
        }
    };

    renderGroup('Root Folders', rootFolders);
    renderGroup('Sub Folders', subFolders);
    renderGroup('Tags', tags);
}

//----- FUNCTIONS FOR SIDE PORTAL PAGE

function renderTagNotesFolder(setting: Setting, tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    const controlEl = setting.controlEl;
    controlEl.empty();

    const textInput = controlEl.createEl('input', {
        type: 'text',
        value: plugin.settings.tagNotesFolderPath,
        placeholder: '_Tag Notes',
        cls: 'portals-settings-inline-input'
    });
    textInput.addEventListener('change', () => {
        plugin.settings.tagNotesFolderPath = textInput.value.trim() || '_Tag Notes';
        void plugin.saveSettings();
    });

    const browseBtn = controlEl.createEl('button', { text: 'Browse' });
    browseBtn.addEventListener('click', () => {
        new SelectFolderModal(tab.app, (folder) => {
            plugin.settings.tagNotesFolderPath = folder.path;
            textInput.value = folder.path;
            void plugin.saveSettings();
        }).open();
    });

    const migrateBtn = controlEl.createEl('button', { text: 'Migrate', cls: 'mod-warning' });
    migrateBtn.addEventListener('click', async () => {
        const result = await plugin.migrateTagNotes();
        if (result.moved > 0) {
            new Notice(`Moved ${result.moved} tag note(s) to "${plugin.settings.tagNotesFolderPath}".`);
        }
        if (result.skipped > 0) {
            new Notice(`Skipped ${result.skipped} note(s) — already exist in destination.`);
        }
        if (result.errors.length > 0) {
            new Notice(`Errors: ${result.errors.join('; ')}`);
        }
        if (result.moved === 0 && result.skipped === 0 && result.errors.length === 0) {
            new Notice('No tag notes found to migrate.');
        }
    });
}

function renderJournalFolder(setting: Setting, tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    const controlEl = setting.controlEl;
    controlEl.empty();

    const textInput = controlEl.createEl('input', {
        type: 'text',
        value: plugin.settings.journalFolderPath,
        placeholder: 'e.g., Journal/Daily',
        cls: 'portals-settings-inline-input'
    });
    textInput.addEventListener('change', () => {
        plugin.settings.journalFolderPath = textInput.value;
        void plugin.saveSettings();
    });

    const browseBtn = controlEl.createEl('button', { text: 'Browse folders' });
    browseBtn.addEventListener('click', () => {
        new SelectFolderModal(tab.app, (folder) => {
            plugin.settings.journalFolderPath = folder.path;
            textInput.value = folder.path;
            void plugin.saveSettings();
        }).open();
    });
}

async function handleSidePortalConfigSave(
    tab: SpacesSettingTab,
    left: string[],
    right: string[]
): Promise<void> {
    const plugin = tab.plugin;
    plugin.settings.splitViewTabs = left;
    plugin.settings.alternateSideTabs = right;

    if (!left.includes(plugin.settings.activeSplitTab)) {
        plugin.settings.activeSplitTab = left[0] || 'recent';
    }
    if (right.length && !right.includes(plugin.settings.alternateActiveTab)) {
        plugin.settings.alternateActiveTab = right[0] ?? '';
    } else if (!right.length) {
        plugin.settings.alternateActiveTab = '';
    }

    await plugin.saveSettings();

    const altLeaves = tab.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL);
    for (const leaf of altLeaves) {
        if (leaf.view instanceof AltSidePanelView) {
            leaf.view.refresh();
        }
    }
}

// ----- FUNCTIONS FOR UTILITIES 

function renderAutoBackupRow(setting: Setting, tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    setting.addToggle(toggle => toggle
        .setValue(plugin.settings.enableAutoBackup)
        .onChange(async (value) => {
            plugin.settings.enableAutoBackup = value;
            await plugin.saveSettings();
        }));
    setting.addButton(btn => makeSyncButton(btn));
}

function renderBackupFolder(setting: Setting, tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    const controlEl = setting.controlEl;
    controlEl.empty();

    const textInput = controlEl.createEl('input', {
        type: 'text',
        value: plugin.settings.backupFolderPath,
        placeholder: '/',
        cls: 'portals-settings-inline-input'
    });
    textInput.addEventListener('change', () => {
        plugin.settings.backupFolderPath = textInput.value.trim() || '/';
        void plugin.saveSettings();
    });

    const browseBtn = controlEl.createEl('button', { text: 'Browse' });
    browseBtn.addEventListener('click', () => {
        new SelectFolderModal(tab.app, (folder) => {
            plugin.settings.backupFolderPath = folder.path;
            textInput.value = folder.path;
            void plugin.saveSettings();
        }).open();
    });
}

async function exportSettings(tab: SpacesSettingTab): Promise<void> {
    const plugin = tab.plugin;
    const data = JSON.stringify(plugin.settings, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `portals-settings-${dateStr}.json`;

    if (Platform.isDesktop) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const div = activeDocument.createEl('div');
        const a = div.createEl('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        new Notice('Settings exported');
    } else {
        try {
            const existing = tab.app.vault.getAbstractFileByPath(fileName);
            if (existing) {
                new Notice(`File "${fileName}" already exists. Please rename or delete it first.`);
                return;
            }
            await tab.app.vault.create(fileName, data);
            new Notice(`Settings exported as ${fileName} in vault root`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Export failed: ${message}`);
        }
    }
}

function importSettings(tab: SpacesSettingTab): void {
    const plugin = tab.plugin;
    const div = activeDocument.createEl('div');
    const input = div.createEl('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = JSON.parse(text) as Partial<SpacesSettings>;
            plugin.settings = Object.assign({}, DEFAULT_SETTINGS, imported);
            await plugin.saveSettings();
            new Notice('Settings imported successfully');
        } catch {
            new Notice('Invalid settings file');
        }
    };
    input.click();
}