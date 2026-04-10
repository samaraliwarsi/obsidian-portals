import { App, PluginSettingTab, Setting, TFolder, Notice, Modal } from 'obsidian';
import PortalsPlugin from './main';
import { IconPickerModal } from './iconPicker';

export interface SpaceConfig {
    path: string;
    type: 'folder' | 'tag';
    icon: string;
    color: string;
    groupTags?: string[];
    displayName?: string;
}

export interface SpacesSettings {
    spaces: SpaceConfig[];
    openFolders: string[];
    selectedSpace: { path: string; type: 'folder' | 'tag' } | null;
    replaceFileExplorer: boolean;
    pinVaultRoot: boolean;
    filePaneColorStyle: 'gradient' | 'solid' | 'none';
    tabColorEnabled: boolean;
    sortBy: 'name' | 'created' | 'modified';
    sortOrder: 'asc' | 'desc';
    showInactiveTabNames: boolean;
    tabNameDisplay: 'none' | 'activeOnly' | 'all';
    secondaryPanelHeight: number;
    lastExpandedHeight: number;
    secondaryPanelCollapsed: boolean;
    sidePanelEnabled: boolean;
    recentFilesList: string[];
    splitViewTabs: string[];
    activeSplitTab: string;
    showFolderNotesInTree: boolean;
    enableFolderNotes: boolean;
    floatingButtonsCollapsed: boolean;
    expandedGroups: Record<string, string[]>;
    disableSidePanelOnMobile: boolean;
    enableFileExtensionNonMD: boolean;
    folderNoteHighlightStyle: 'icon' | 'underline' | 'none';
    compactTree: boolean;
    boldFolderNames: boolean;
    treeStyle: 'default' | 'minimal' | 'boxed' | 'portals' | 'shades' | 'hues';
    journalFolderPath: string;
    journalDateFormat: 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD';
    markedJournalNotes: string[];
    quoteDelimiter: string;
    customIcons: Record<string, string>;
    expandedTagHierarchy: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: SpacesSettings = {
    spaces: [],
    openFolders: [],
    selectedSpace: null,
    replaceFileExplorer: false,
    pinVaultRoot: false,
    filePaneColorStyle: 'gradient',
    tabColorEnabled: true,
    sortBy: 'name',
    showInactiveTabNames: false,
    tabNameDisplay: 'activeOnly',
    sortOrder: 'asc',
    secondaryPanelHeight: 200,
    lastExpandedHeight: 200,
    secondaryPanelCollapsed: false,
    sidePanelEnabled: true,
    recentFilesList: [],
    splitViewTabs: ['recent', 'folder-notes', 'bookmarks', 'journal'],
    activeSplitTab: 'recent',
    showFolderNotesInTree: false,
    enableFolderNotes: true,
    floatingButtonsCollapsed: false,
    expandedGroups: {},
    disableSidePanelOnMobile: false,
    enableFileExtensionNonMD: true,
    folderNoteHighlightStyle: 'icon',
    compactTree: false,
    boldFolderNames: false,
    treeStyle: 'default',
    journalFolderPath: '',
    journalDateFormat: 'DD-MM-YYYY',
    markedJournalNotes: [],
    quoteDelimiter: '==',
    customIcons: {},
    expandedTagHierarchy: {},
};

export class SpacesSettingTab extends PluginSettingTab {
    plugin: PortalsPlugin;

    constructor(app: App, plugin: PortalsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        const scrollTop = containerEl.scrollTop;
        containerEl.empty();

        // -------------------- EXPLORER SETTINGS ----------------------------------
        new Setting(containerEl).setName('Explorer settings').setHeading();

        new Setting(containerEl)
            .setName('Replace file explorer in left sidebar')
            .setDesc('Portals replaces the default file explorer on startup. The file explorer remains accessible via commands or Obsidian tabs.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.replaceFileExplorer)
                .onChange(async (value) => {
                    this.plugin.settings.replaceFileExplorer = value;
                    await this.plugin.saveSettings();
                    new Notice('Changes will take effect after restarting Obsidian.');
                }));

        new Setting(containerEl)
        .setName('Compact tree view')
        .setDesc('Reduce spacing to display more items in the folder or tag tree. Does not apply to bookmarks or recents')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.compactTree)
            .onChange(async (value) => {
                this.plugin.settings.compactTree = value;
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
        .setName('Styles')
        .setDesc('Choose a visual theme for file tree, recents & bookmarks.')
        .addDropdown(dropdown => dropdown
            .addOption('default', 'Default')
            .addOption('minimal', 'Minimal')
            .addOption('boxed', 'Boxed')
            .addOption('portals', 'Portals')
            .addOption('shades', 'Shades')
            .addOption('hues', 'Hues')
            .setValue(this.plugin.settings.treeStyle)
            .onChange(async (value) => {
                this.plugin.settings.treeStyle = value as 'default' | 'minimal' | 'boxed' | 'portals' | 'shades' | 'hues';
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
            .setName('Background color type')
            .setDesc('Choose how to apply active tab colors to the file area.')
            .addDropdown(dropdown => dropdown
                .addOption('gradient', 'Gradient')
                .addOption('solid', 'Solid')
                .addOption('none', 'No color')
                .setValue(this.plugin.settings.filePaneColorStyle)
                .onChange(async (value) => {
                    this.plugin.settings.filePaneColorStyle = value as 'gradient' | 'solid' | 'none';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Tab colors')
            .setDesc('Show active tab color on bottom borders of active tabs. Portals style uses the same color when enabled.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tabColorEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.tabColorEnabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Bold folder names')
            .setDesc('Make folder names and tag group names bold in the file tree.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.boldFolderNames)
                .onChange(async (value) => {
                    this.plugin.settings.boldFolderNames = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Tab name display')
            .setDesc('Control how tab names are shown. Tooltips always appear on hover when a name is hidden.')
            .addDropdown(dropdown => dropdown
                .addOption('none', 'Icons only')
                .addOption('activeOnly', 'Show active tab name')
                .addOption('all', 'Show all tab names')
                .setValue(this.plugin.settings.tabNameDisplay)
                .onChange(async (value) => {
                    this.plugin.settings.tabNameDisplay = value as 'none' | 'activeOnly' | 'all';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Show extensions for non-markdown files')
            .setDesc('Display extensions badge on non-markdown files. Active non-markdown files now use accent over badge instead of dot.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFileExtensionNonMD)
                .onChange(async (value) => {
                    this.plugin.settings.enableFileExtensionNonMD = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        containerEl.createEl('hr');

        // -------------------- SIDE PORTAL SETTINGS ----------------------------------
        new Setting(containerEl).setName('Side portal').setHeading();

        new Setting(containerEl)
            .setName('Side portal')
            .setDesc('Show a collapsible panel at the bottom with additional tabs.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.sidePanelEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.sidePanelEnabled = value;
                    if (!value) {
                        this.plugin.settings.secondaryPanelCollapsed = true;
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Choose side portals')
            .setDesc('Select which tabs appear in the side portal.')
            .addButton(button => button
                .setButtonText('Configure')
                .onClick(() => {
                    new ChooseTabsModal(this.app, this.plugin, (tabs) => {
                        this.plugin.settings.splitViewTabs = tabs;
                        if (!tabs.includes(this.plugin.settings.activeSplitTab)) { 
                            this.plugin.settings.activeSplitTab = tabs[0] || 'recent';
                        }
                        void this.plugin.saveSettings();
                        this.display();
                    }).open();
                }));

        new Setting(containerEl)
            .setName('Disable side portal on mobile')
            .setDesc('Hide side portal on mobile devices.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.disableSidePanelOnMobile)
                .onChange(async (value) => {
                    this.plugin.settings.disableSidePanelOnMobile = value;
                    await this.plugin.saveSettings();
                    // Force all portals views to re-render
                    this.plugin.refreshAllViews();
                }));

        containerEl.createEl('hr');

        // -------------------- FOLDER NOTES SETTINGS ----------------------------------
        new Setting(containerEl).setName('Folder Notes').setHeading();

        new Setting(containerEl)
            .setName('Enable folder notes')
            .setDesc('When disabled, folder notes are treated as normal files (always in tree), the side panel tab shows a notice, and folder note context menu items, listeners and cache are removed.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFolderNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableFolderNotes = value;
                    await this.plugin.saveSettings();
                    this.display(); // refresh settings UI if needed
                }));
        
        //-- Folder Notes in Side Portal
        new Setting(containerEl)
            .setName('Show folder notes in file tree')
            .setDesc('When folder notes are enabled, controls if they appear in file tree. If folder notes are disabled, this setting has no effect.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showFolderNotesInTree)
                .setDisabled(!this.plugin.settings.enableFolderNotes)
                .onChange(async (value) => {
                    this.plugin.settings.showFolderNotesInTree = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        
        new Setting(containerEl)
        .setName('Folder note highlight type')
        .setDesc('How to visually indicate folders that have a folder note.')
        .addDropdown(dropdown => dropdown
            .addOption('icon', 'Icon highlight')
            .addOption('underline', 'Text underline')
            .addOption('none', 'Off')
            .setValue(this.plugin.settings.folderNoteHighlightStyle)
            .onChange(async (value) => {
                    this.plugin.settings.folderNoteHighlightStyle = value as 'icon' | 'underline' | 'none';
                    await this.plugin.saveSettings();
                    this.display();
            }));

        containerEl.createEl('hr');

        // -------------------- JOURNAL SETTINGS ----------------------------------
        new Setting(containerEl).setName('Journal').setHeading();

        new Setting(containerEl)
        .setName('Journal date format')
        .setDesc('Choose date formatted used in daily note filenames. The format must match for journal to work consistently. Changes require a reload.')
        .addDropdown(dropdown => dropdown
            .addOption('DD-MM-YYYY', 'DD-MM-YYYY')
            .addOption('MM-DD-YYYY', 'MM-DD-YYYY')
            .addOption('YYYY-MM-DD', 'YYYY-MM-DD')
            .setValue(this.plugin.settings.journalDateFormat)
            .onChange(async (value) => {
                this.plugin.settings.journalDateFormat = value as 'DD-MM-YYYY' | 'MM-DD-YYYY';
                await this.plugin.saveSettings();
                // Refresh journal tab if open
                this.plugin.refreshAllViews();
            }));

        new Setting(containerEl)
            .setName('Journal folder')
            .setDesc('Folder containing daily notes. Type the path or choose from the list. Leave empty to use the folder from the Daily Notes core plugin.')
            .addText(text => {
                text.setPlaceholder('e.g., Journal/Daily')
                    .setValue(this.plugin.settings.journalFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.journalFolderPath = value;
                        await this.plugin.saveSettings();
                    });
                })
                .addButton(button => button
                .setButtonText('Browse folders')
                .onClick(() => {
                    new SelectFolderModal(this.app, (path) => {
                        this.plugin.settings.journalFolderPath = path;
                        this.plugin.saveSettings();
                        this.display(); // refresh the setting UI to show the new path
                    }).open();
                }));

        new Setting(containerEl)
            .setName('Quote delimiter')
            .setDesc('Symbols used to mark quotes in your notes. Changes made to selected quotes or symbols will reflect after obsidian reload.')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('==', '== (double equals)')
                    .addOption('**', '** (double asterisk)')
                    .addOption('++', '++ (double plus)')
                    .addOption('||', '|| (double pipe)')
                setTimeout(() => {
                    dropdown.setValue(this.plugin.settings.quoteDelimiter);
                }, 0);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.quoteDelimiter = value;
                    await this.plugin.saveSettings();
                });
                return dropdown;
            });
                    
        containerEl.createEl('hr');

        // -------------------- TAB SETTINGS ----------------------------------
        new Setting(containerEl).setName('Portal tabs').setHeading();
            
        const pinSetting = new Setting(containerEl)
            .setName('Pin vault')
            .setDesc('Show the vault root as the first tab (always on the left). You can customize its icon and color below.');

        pinSetting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.pinVaultRoot)
            .onChange(async (value) => {
                this.plugin.settings.pinVaultRoot = value;
                const rootPath = '/';
                if (value) {
                    let root = this.plugin.settings.spaces.find(s => s.path === rootPath && s.type === 'folder');
                    if (!root) {
                        root = { path: rootPath, type: 'folder', icon: 'folder-simple', color: 'transparent' };
                        this.plugin.settings.spaces.unshift(root);
                    } else {
                        const index = this.plugin.settings.spaces.indexOf(root);
                        if (index > 0) {
                            this.plugin.settings.spaces.splice(index, 1);
                            this.plugin.settings.spaces.unshift(root);
                        }
                    }
                    if (!this.plugin.settings.selectedSpace)
                        this.plugin.settings.selectedSpace = { path: rootPath, type: 'folder' };
                } else {
                    this.plugin.settings.spaces = this.plugin.settings.spaces.filter(s => !(s.path === rootPath && s.type === 'folder'));
                    if (this.plugin.settings.selectedSpace?.path === rootPath && this.plugin.settings.selectedSpace?.type === 'folder')
                        this.plugin.settings.selectedSpace = this.plugin.settings.spaces[0] 
                            ? { path: this.plugin.settings.spaces[0].path, type: this.plugin.settings.spaces[0].type }
                            : null;
                }
                await this.plugin.saveSettings();
                this.display();
            }));

        // Vault root customisation (compact controls)
        if (this.plugin.settings.pinVaultRoot) {
            const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
            if (rootSpace) {
                const rootCustomSetting = new Setting(containerEl)
                .setName('Pin vault appearance')
                .setDesc('Customize icon and color for the pinned vault root tab.');

            const controlEl = rootCustomSetting.controlEl;
            controlEl.empty();
            controlEl.addClass('portals-portal-controls'); 

            // ---- Icon row (icon button only) ----
            const iconRow = controlEl.createDiv({ cls: 'portals-icon-row' });

            // Icon button
            const iconBtn = iconRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Choose icon' } });
            iconBtn.empty();
            iconBtn.createEl('i', { cls: `ph ph-${rootSpace.icon}` });
            iconBtn.addEventListener('click', () => {
                new IconPickerModal(this.app, (iconName) => {
                    rootSpace.icon = iconName;
                    void this.plugin.saveSettings().then(() => {
                        this.display();
                    });
                }).open();
            });

            // ---- Color row (color picker, number input, %, preview) ----
            const colorRow = controlEl.createDiv({ cls: 'portals-color-row' });

            // Compact color picker container
            const colorContainer = colorRow.createDiv({ cls: 'portals-color-compact' });

            // Parse initial values
            let initialHex = '#ff0000';
            let initialOpacity = 1;
            if (rootSpace.color && rootSpace.color !== 'transparent') {
                const rgba = rootSpace.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (rgba) {
                    initialHex = `#${Number(rgba[1]).toString(16).padStart(2,'0')}${Number(rgba[2]).toString(16).padStart(2,'0')}${Number(rgba[3]).toString(16).padStart(2,'0')}`;
                    initialOpacity = rgba[4] ? parseFloat(rgba[4]) : 1;
                } else if (rootSpace.color.startsWith('#')) {
                    initialHex = rootSpace.color;
                }
            }

            // Color input
            const colorInput = colorContainer.createEl('input', {
                type: 'color',
                value: initialHex,
                cls: 'portals-color-input'
            });

            // Opacity number input
            const opacityInput = colorContainer.createEl('input', {
                type: 'number',
                value: String(initialOpacity * 100),
                cls: 'portals-opacity-input',
                attr: { min: '0', max: '100', step: '1' }
            });

            // Percent sign
            colorContainer.createSpan({ cls: 'portals-percent', text: '%' });

            const updateColor = () => {
                const hex = colorInput.value;
                const opacity = parseInt(opacityInput.value) / 100;
                if (isNaN(opacity)) return;
                const r = parseInt(hex.slice(1,3), 16);
                const g = parseInt(hex.slice(3,5), 16);
                const b = parseInt(hex.slice(5,7), 16);
                const rgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                rootSpace.color = rgba;
                void this.plugin.saveSettings();
            };

            colorInput.addEventListener('input', updateColor);
            opacityInput.addEventListener('input', updateColor);
        }
    }

        // ---- ADD PORTAL BUTTON ----
        new Setting(containerEl)
            .setName('Add new portal')
            .setDesc('Add a folder or tag as a portal tab.')
            .addButton(btn => btn
                .setButtonText('Add')
                .setCta()
                .onClick(() => {
                    new AddPortalModal(this.app, this.plugin, (path: string, type: 'folder' | 'tag') => {
                        if (this.plugin.settings.spaces.some(s => s.path === path && s.type === type)) {
                            new Notice('This portal already exists.');
                            return;
                        }
                        this.plugin.settings.spaces.push({
                            path,
                            type,
                            icon: type === 'folder' ? 'folder-simple' : 'tag',
                            color: 'transparent'
                        });
                        if (this.plugin.settings.spaces.length === 1 && !this.plugin.settings.pinVaultRoot) {
                            this.plugin.settings.selectedSpace = { path, type };
                        }
                        void this.plugin.saveSettings().then(() => {
                            this.display();
                        });
                    }).open();
                }));

        containerEl.createEl('hr', { cls: 'portals-setting-hr' });

        // ---- CATEGORIZED PORTALS ----
        const getPortalDisplayName = (portal: SpaceConfig): string => {
            if (portal.type === 'folder') {
                if (portal.path === '/') return this.app.vault.getName();
                const folder = this.app.vault.getAbstractFileByPath(portal.path);
                return folder instanceof TFolder ? folder.name : portal.path;
            } else {
                return '#' + portal.path;
            }
        };

        const rootFolders: SpaceConfig[] = [];
        const subFolders: SpaceConfig[] = [];
        const tags: SpaceConfig[] = [];

        for (const portal of this.plugin.settings.spaces) {
            if (portal.path === '/' && portal.type === 'folder') {
                continue;
            }
            if (portal.type === 'tag') {
                tags.push(portal);
            } else {
                const folder = this.app.vault.getAbstractFileByPath(portal.path);
                if (folder instanceof TFolder) {
                    const isRoot = folder.parent === this.app.vault.getRoot();
                    if (isRoot) rootFolders.push(portal);
                    else subFolders.push(portal);
                } else {
                    if (portal.path.includes('/')) subFolders.push(portal);
                    else rootFolders.push(portal);
                }
            }
        }

        const sortByName = (a: SpaceConfig, b: SpaceConfig) => {
            const nameA = getPortalDisplayName(a).toLowerCase();
            const nameB = getPortalDisplayName(b).toLowerCase();
            return nameA.localeCompare(nameB);
        };
        rootFolders.sort(sortByName);
        subFolders.sort(sortByName);
        tags.sort(sortByName);

        const renderSection = (title: string, portals: SpaceConfig[]) => {
            if (portals.length === 0) return;

            const details = containerEl.createEl('details', { cls: 'portals-section-details' });
            details.setAttr('open', 'true');

            const summary = details.createEl('summary', { cls: 'portals-section-summary' });
            summary.createSpan({ text: title });

            for (const portal of portals) {
                const setting = new Setting(details);

                // Left side: name and path (with truncation)
                const infoDiv = setting.infoEl;
                infoDiv.empty();
                infoDiv.addClass('portals-portal-info');

                const nameSpan = infoDiv.createEl('span', { cls: 'portals-portal-name' });
                nameSpan.textContent = getPortalDisplayName(portal);

                const pathSpan = infoDiv.createEl('span', { cls: 'portals-portal-path' });
                pathSpan.textContent = `${portal.type} · ${portal.path}`;

                // Right side: controls
                const controlDiv = setting.controlEl;
                controlDiv.empty();
                controlDiv.addClass('portals-portal-controls');

                // Row 1: icon name badge + icon button
                const iconRow = controlDiv.createDiv({ cls: 'portals-icon-row' });

                const iconBadge = iconRow.createEl('span', { cls: 'portals-icon-badge' });
                iconBadge.textContent = portal.icon;

                const iconBtn = iconRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Choose icon' } });
                iconBtn.empty();
                iconBtn.createEl('i', { cls: `ph ph-${portal.icon}` });
                iconBtn.addEventListener('click', () => {
                    new IconPickerModal(this.app, (iconName) => {
                        portal.icon = iconName;
                        void this.plugin.saveSettings().then(() => {
                            this.display();
                        });
                    }).open();
                });

                // Row 2: color picker (compact) + trash button
                const colorRow = controlDiv.createDiv({ cls: 'portals-color-row' });

                const colorContainer = colorRow.createDiv({ cls: 'portals-color-compact' });

                let initialHex = '#ff0000';
                let initialOpacity = 1;
                if (portal.color && portal.color !== 'transparent') {
                    const rgba = portal.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                    if (rgba) {
                        initialHex = `#${Number(rgba[1]).toString(16).padStart(2,'0')}${Number(rgba[2]).toString(16).padStart(2,'0')}${Number(rgba[3]).toString(16).padStart(2,'0')}`;
                        initialOpacity = rgba[4] ? parseFloat(rgba[4]) : 1;
                    } else if (portal.color.startsWith('#')) {
                        initialHex = portal.color;
                    }
                }

                const colorInput = colorContainer.createEl('input', {
                    type: 'color',
                    value: initialHex,
                    cls: 'portals-color-input'
                });

                const opacityInput = colorContainer.createEl('input', {
                    type: 'number',
                    value: String(initialOpacity * 100),
                    cls: 'portals-opacity-input',
                    attr: { min: '0', max: '100', step: '1' }
                });
                colorContainer.createSpan({ cls: 'portals-percent', text: '%' });

                const updateColor = () => {
                    const hex = colorInput.value;
                    const opacity = parseInt(opacityInput.value) / 100;
                    const r = parseInt(hex.slice(1,3), 16);
                    const g = parseInt(hex.slice(3,5), 16);
                    const b = parseInt(hex.slice(5,7), 16);
                    const rgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                    portal.color = rgba;
                    void this.plugin.saveSettings();
                };

                colorInput.addEventListener('input', updateColor);
                opacityInput.addEventListener('input', updateColor);

                // Trash button
                const trashBtn = colorRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove portal' } });
                trashBtn.empty();
                trashBtn.createEl('i', { cls: 'ph ph-trash' });
                trashBtn.addEventListener('click', () => {
                    this.plugin.settings.spaces = this.plugin.settings.spaces.filter(s => s !== portal);
                    if (this.plugin.settings.selectedSpace?.path === portal.path && this.plugin.settings.selectedSpace?.type === portal.type) {
                        this.plugin.settings.selectedSpace = this.plugin.settings.spaces[0] 
                            ? { path: this.plugin.settings.spaces[0].path, type: this.plugin.settings.spaces[0].type }
                            : null;
                    }
                    void this.plugin.saveSettings().then(() => {
                        this.display();
                    });
                });
            }
        };
        

        new Setting(containerEl).setName('Active tabs').setHeading();

        renderSection('Root Folders', rootFolders);
        renderSection('Sub Folders', subFolders);
        renderSection('Tags', tags);

        containerEl.createEl('hr');

        // --------------------------- BACKUP / RESTORE  -----------------------------
        new Setting(containerEl).setName('Backup / restore').setHeading();

        new Setting(containerEl)
            .setName('Export settings')
            .setDesc('Export your current portals configuration as a JSON file.')
            .addButton(button => button.setButtonText('Export').onClick(() => this.exportSettings()));

        new Setting(containerEl)
            .setName('Import settings')
            .setDesc('Load settings from a JSON file. This will replace your current configuration.')
            .addButton(button => button.setButtonText('Import').onClick(() => this.importSettings()));

        containerEl.createEl('hr');

        // --------------------------- MAINTENANCE & HELP -----------------------------

        new Setting(containerEl).setName('Maintenance & help').setHeading();

        new Setting(containerEl)
            .setName('Clean up dead portals')
            .setDesc('Remove portal tabs for folders or tags that no longer exist. This cannot be undone.')
            .addButton(button => button
                .setButtonText('Clean now')
                .setWarning()
                .onClick(async () => {
                    const removed = await this.plugin.cleanupDeadSpaces();
                    new Notice(removed > 0 ? `Removed ${removed} dead portal(s)` : 'No dead portals found');
                    this.display();
                }));

        new Setting(containerEl)
        .setName('User guide')
        .setDesc('Open the full documentation online, downloadable file on github.')
        .addButton(button => button
            .setButtonText('Open guide')
            .onClick(() => {
                window.open('https://github.com/samaraliwarsi/obsidian-portals/blob/main/Portals_Guide.md', '_blank');
            }));

        setTimeout(() => {
            const maxScroll = containerEl.scrollHeight - containerEl.clientHeight;
            containerEl.scrollTop = Math.min(scrollTop, maxScroll);
        }, 0);
    }

    private exportSettings() {
        const data = JSON.stringify(this.plugin.settings, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `portals-settings-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        new Notice('Settings exported');
    }

    private importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, imported);
                await this.plugin.saveSettings();
                this.display();
                new Notice('Settings imported successfully');
            } catch {
                new Notice('Invalid settings file');
            }
        };
        input.click();
    }
}

    // ==================== CHOOSE SIDE TABS MODAL ====================
    class ChooseTabsModal extends Modal {
        private selectedTabs: Set<string>;

        constructor(
            app: App,
            private plugin: PortalsPlugin,
            private onSave: (tabs: string[]) => void
        ) {
            super(app);
            this.selectedTabs = new Set(plugin.settings.splitViewTabs);
        }

        onOpen() {
            const { contentEl } = this;
            contentEl.empty();
            new Setting(contentEl).setName('Choose side portals').setHeading();

            contentEl.createEl('p', {
                text: 'Select which tabs to show in the side panel. At least one must be selected.',
                cls: 'portals-modal-description'
            });

            // Available tabs with display names and icons
            const availableTabs = [
                { id: 'recent', name: 'Recent Files', icon: 'clock-counter-clockwise' },
                { id: 'folder-notes', name: 'Folder Notes', icon: 'note' },
                { id: 'bookmarks', name: 'Bookmarks', icon: 'bookmark' },
                { id: 'journal', name: 'Journal', icon: 'calendar-heart'}
            ];

            const checkboxContainer = contentEl.createDiv({ cls: 'portals-checkbox-container' });

            for (const tab of availableTabs) {
                const checkboxDiv = checkboxContainer.createDiv({ cls: 'portals-checkbox-item' });

                const checkbox = checkboxDiv.createEl('input', {
                    type: 'checkbox',
                    value: tab.id,
                    attr: { id: `tab-${tab.id}` }
                });
                checkbox.checked = this.selectedTabs.has(tab.id);

                checkboxDiv.createEl('label', {
                    text: ` ${tab.name}`,
                    cls: 'portals-checkbox-label',
                    attr: { for: `tab-${tab.id}` }
                });

                checkbox.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                        this.selectedTabs.add(tab.id);
                    } else {
                        this.selectedTabs.delete(tab.id);
                    }
                });
            }

            const buttonDiv = contentEl.createDiv({ cls: 'portals-modal-button-container' });

            const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
            cancelBtn.addEventListener('click', () => this.close());

            const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
            saveBtn.addEventListener('click', () => {
                const selected = Array.from(this.selectedTabs);
                if (selected.length === 0) {
                    new Notice('Please select at least one tab.');
                    return;
                }
                this.onSave(selected);
                this.close();
            });
        }

        onClose() {
            this.contentEl.empty();
        }
    }

// ==================== ADD PORTAL MODAL ====================
class AddPortalModal extends Modal {
    private selectedPath: string = '';
    private currentTab: 'root' | 'sub' | 'tag' = 'root';
    private searchInput!: HTMLInputElement;
    private resultsContainer!: HTMLElement;
    private rootFolders: TFolder[] = [];
    private subFolders: TFolder[] = [];
    private allTags: string[] = [];

    constructor(app: App, private plugin: PortalsPlugin, private onChoose: (path: string, type: 'folder' | 'tag') => void) {
        super(app);
        const root = app.vault.getRoot();
        const walk = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFolder) {
                    if (f === root) this.rootFolders.push(child);
                    else this.subFolders.push(child);
                    walk(child);
                }
            }
        };
        walk(root);
        this.rootFolders.sort((a, b) => a.name.localeCompare(b.name));
        this.subFolders.sort((a, b) => a.name.localeCompare(b.name));

        const tagsObj = (app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
        this.allTags = Object.keys(tagsObj)
            .map(t => t.slice(1))
            .filter(tag => !tag.includes('/'))
            .sort()
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        new Setting(contentEl).setName('Add a new portal').setHeading();

        const tabBar = contentEl.createDiv({ cls: 'add-portal-tab-bar' });

        const createTab = (id: 'root' | 'sub' | 'tag', label: string) => {
            const tab = tabBar.createEl('div', { cls: 'add-portal-tab', text: label });
            if (this.currentTab === id) {
                tab.addClass('is-active');
            }
            tab.addEventListener('click', () => {
                this.currentTab = id;
                this.selectedPath = '';
                this.filterResults();
                
                // Remove active class from all tabs, then add to clicked tab
                tabBar.querySelectorAll('.add-portal-tab').forEach(t => {
                    t.removeClass('is-active');
                });
                tab.addClass('is-active');
            });
        };

        createTab('root', 'Root Folders');
        createTab('sub', 'Sub Folders');
        createTab('tag', 'Tags');

        this.searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search...',
            cls: 'portals-search-input'
        });
        this.searchInput.addEventListener('input', () => this.filterResults());

        this.resultsContainer = contentEl.createDiv({ cls: 'portals-results-container' });

        this.filterResults();

        const buttonDiv = contentEl.createDiv({ cls: 'portals-modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        const addBtn = buttonDiv.createEl('button', { text: 'Add', cls: 'mod-cta' });
        addBtn.addEventListener('click', () => {
            if (!this.selectedPath) {
                new Notice('Please select a folder or tag.');
                return;
            }
            this.onChoose(this.selectedPath, this.currentTab === 'tag' ? 'tag' : 'folder');
            this.close();
        });
    }
    
    private filterResults() {
        this.resultsContainer.empty();
        const query = this.searchInput.value.toLowerCase();

        if (this.currentTab === 'tag') {
            const filtered = this.allTags.filter(t => t.toLowerCase().includes(query));
            for (const tag of filtered) {
                const isUsed = this.plugin.settings.spaces.some(s => s.type === 'tag' && s.path === tag);
                const item = this.resultsContainer.createDiv({ cls: 'add-portal-item' });
                const displayText = '#' + tag + (isUsed ? ' (in use)' : '');
                item.setText(displayText);
                if (isUsed) {
                    item.addClass('portals-already-used');
                    // Add checkmark icon
                    const checkSpan = item.createSpan({ cls: 'portals-check-icon' });
                    checkSpan.createEl('i', { cls: 'ph ph-check' });
                }
                item.addEventListener('click', () => {
                    if (isUsed) {
                        new Notice('This tag is already a portal.');
                        return;
                    }
                    this.resultsContainer.querySelectorAll('.add-portal-item').forEach(el => el.removeClass('is-selected'));
                    item.addClass('is-selected');
                    this.selectedPath = tag;
                });
            }
        } else {
            const folders = this.currentTab === 'root' ? this.rootFolders : this.subFolders;
            const filtered = folders.filter(f => f.path.toLowerCase().includes(query) || f.name.toLowerCase().includes(query));
            for (const folder of filtered) {
                const isUsed = this.plugin.settings.spaces.some(s => s.type === 'folder' && s.path === folder.path);
                const item = this.resultsContainer.createDiv({ cls: 'add-portal-item' });
                const displayText = folder.path + (isUsed ? ' (in use)' : '');
                item.setText(displayText);
                if (isUsed) {
                    item.addClass('portals-already-used');
                    // Add checkmark icon
                    const checkSpan = item.createSpan({ cls: 'portals-check-icon' });
                    checkSpan.createEl('i', { cls: 'ph ph-check' });
                }
                item.addEventListener('click', () => {
                    if (isUsed) {
                        new Notice('This folder is already a portal.');
                        return;
                    }
                    this.resultsContainer.querySelectorAll('.add-portal-item').forEach(el => el.removeClass('is-selected'));
                    item.addClass('is-selected');
                    this.selectedPath = folder.path;
                });
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ==================== GROUP TAGS MODAL ====================
export class GroupTagsModal extends Modal {
    private selectedTags: Set<string>;

    constructor(
        app: App,
        private plugin: PortalsPlugin,
        private portal: SpaceConfig,
        private onSave: (tags: string[]) => void,
        private availableTags: string[]
    ) {
        super(app);
        this.selectedTags = new Set(portal.groupTags || []);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Select group tags' });

        const container = contentEl.createDiv({ cls: 'portals-checkbox-container' });
        const filteredTags = this.availableTags.filter(tag => !tag.includes('/'));
        filteredTags.forEach(tag => {
            const div = container.createDiv({ cls: 'portals-checkbox-item' });
            const checkbox = div.createEl('input', { type: 'checkbox', value: tag });
            checkbox.checked = this.selectedTags.has(tag);
            div.createEl('span', { text: tag });
            checkbox.addEventListener('change', (e) => {
                if ((e.target as HTMLInputElement).checked) {
                    this.selectedTags.add(tag);
                } else {
                    this.selectedTags.delete(tag);
                }
            });
        });
        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
        saveBtn.onclick = () => {
            this.onSave(Array.from(this.selectedTags));
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

//===================== SELECT FOLDER MODAL=======================
class SelectFolderModal extends Modal {
    private folders: TFolder[];
    private onSelect: (path: string) => void;

    constructor(app: App, onSelect: (path: string) => void) {
        super(app);
        this.onSelect = onSelect;
        // Get all folders in the vault
        this.folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder) as TFolder[];
        this.folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Select Journal Folder' });

        const input = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search folders...',
            cls: 'portals-search-input'
        });
        const resultsContainer = contentEl.createDiv({ cls: 'portals-results-container' });

        const render = (search: string) => {
            resultsContainer.empty();
            const filtered = this.folders.filter(f => 
                f.path.toLowerCase().includes(search.toLowerCase())
            );
            for (const folder of filtered) {
                const item = resultsContainer.createDiv({ cls: 'add-portal-item' });
                item.setText(folder.path === '/' ? '/' : folder.path);
                item.addEventListener('click', () => {
                    this.onSelect(folder.path);
                    this.close();
                });
            }
        };

        input.addEventListener('input', () => render(input.value));
        render('');
    }

    onClose() {
        this.contentEl.empty();
    }
}