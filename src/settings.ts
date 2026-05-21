import { App, PluginSettingTab, Setting, TFolder, Notice, Platform } from 'obsidian';
import PortalsPlugin from './main';
import { IconPickerModal } from './utils/iconPicker';
import { SelectFolderModal } from './utils/modals';
import { SpaceConfig, PortalStack } from './types';
import { ChooseTabsModal, AddPortalModal } from './utils/modals';
import { getGuideUrl, getReleaseNotesUrl } from './utils/urls';

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
    showContextNotesInTree:boolean;
    enableContextNotes: boolean;
    tagNotesFolderPath: string;
    previousTagNotesFolderPath: string;
    floatingButtonsCollapsed: boolean;
    expandedGroups: Record<string, string[]>;
    disableSidePanelOnMobile: boolean;
    enableFileExtensionNonMD: boolean;
    contextNoteHighlightStyle: 'icon' | 'underline' | 'none';
    compactTree: boolean;
    boldFolderNames: boolean;
    treeStyle: 'default' | 'minimal' | 'boxed' | 'portals' | 'shades' | 'hues';
    journalFolderPath: string;
    journalDateFormat: 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD';
    journalQuoteIndicator: 'quotes' | 'warnings' | 'all' | 'none';
    markedJournalNotes: string[];
    quoteDelimiter: string;
    customIcons: Record<string, string>;
    expandedTagHierarchy: Record<string, string[]>;
    customColors: Record<string, string>;
    tagColors: Record<string, string>;
    contextNoteIconClick: boolean;
    contextNoteFollowActive: 'off' | 'on-status' | 'on-noStatus';
    hiddenItems: Record<string, boolean>;
    portalStacks: PortalStack[];
    tabBarOrder: string[];
    hideStackNames: boolean;
    showStackCount: 'always' | 'collapsed' | 'never';
    stackIconAccent: boolean;
    stackAutoCollapse: boolean;
    showCurrentPropertyValue: boolean;
    hideFilteredCount: boolean;
    clinicState: { selectedProperty: string; selectedValue: string };
    compactTabs: boolean;
    quickAddIcon: 'off' | 'on' | 'desktop-only';
    customTreeOrder: Record<string, number>;
    tabIconPosition: 'left' | 'right';
    stackIconPosition: 'left' | 'right';
    showFilePreview: boolean;
    previewExcludedFiles: Record<string, boolean>;
    showFileInfoBar: boolean;
    enableSections: boolean;
    sectionCriterion: 'extension' | 'property';
    sectionPropertyName: string;
    sectionOrders: Record<string, string[]>;
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
    splitViewTabs: ['recent', 'context-notes', 'bookmarks', 'journal', 'hidden', 'properties', 'trash'],
    activeSplitTab: 'recent',
    showContextNotesInTree: false,
    enableContextNotes: true,
    tagNotesFolderPath: '_Tag Notes',
    previousTagNotesFolderPath: '_Tag Notes',
    floatingButtonsCollapsed: false,
    expandedGroups: {},
    disableSidePanelOnMobile: false,
    enableFileExtensionNonMD: true,
    contextNoteHighlightStyle: 'icon',
    compactTree: false,
    boldFolderNames: false,
    treeStyle: 'default',
    journalFolderPath: '',
    journalDateFormat: 'DD-MM-YYYY',
    journalQuoteIndicator: 'none',
    markedJournalNotes: [],
    quoteDelimiter: '==',
    customIcons: {},
    expandedTagHierarchy: {},
    customColors: {},
    tagColors: {},
    contextNoteIconClick: false,
    contextNoteFollowActive: 'off',
    hiddenItems: {},
    portalStacks: [],
    tabBarOrder: [],
    hideStackNames: false,
    showStackCount: 'never',
    stackIconAccent: false,
    stackAutoCollapse: false,
    showCurrentPropertyValue: false,
    hideFilteredCount: false,
    clinicState: { selectedProperty: '', selectedValue: '' },
    compactTabs: false,
    quickAddIcon: 'desktop-only',
    customTreeOrder: {},
    tabIconPosition: 'right',
    stackIconPosition: 'left',
    showFilePreview: false,
    previewExcludedFiles: {},
    showFileInfoBar: false,
    enableSections: false,
    sectionCriterion: 'extension',
    sectionPropertyName: '',
    sectionOrders: {},
};

export class SpacesSettingTab extends PluginSettingTab {
    plugin: PortalsPlugin;
    private openSections: Set<string> = new Set();

    constructor(app: App, plugin: PortalsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        const scrollTop = containerEl.scrollTop;
        containerEl.empty();

        // -------------------- EXPLORER SETTINGS ----------------------------------
        new Setting(containerEl).setName('Explorer').setHeading();

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
        .setDesc('Reduce vertical spacing, summary heights in the folder or tag tree. Does not apply to side portal.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.compactTree)
            .onChange(async (value) => {
                this.plugin.settings.compactTree = value;
                await this.plugin.saveSettings();
                this.display();
            }));
        
        new Setting(containerEl)
        .setName('Styles')
        .setDesc('Choose a visual theme for file tree and list items in side portal.')
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
            .setName('Extension badge for non-markdown files')
            .setDesc('Display extension badge on non-markdown files. When turned on, non-markdown files do not show extension after file name.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFileExtensionNonMD)
                .onChange(async (value) => {
                    this.plugin.settings.enableFileExtensionNonMD = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Quick‑add icons')
            .setDesc('Choose how to show quick-add icons on folder & tag rows. Hover reveal on desktop, directly on mobile.')
            .addDropdown(dropdown => dropdown
                .addOption('off', 'Off')
                .addOption('on', 'On')
                .addOption('desktop-only', 'Desktop only')
                .setValue(this.plugin.settings.quickAddIcon)
                .onChange(async (value) => {
                    this.plugin.settings.quickAddIcon = value as 'off' | 'on' | 'desktop-only';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Show file preview')
            .setDesc('Show a snippet of file text under the file name in folder or tag tree')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showFilePreview)
                .onChange(async (value) => {
                    this.plugin.settings.showFilePreview = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Show file info bar')
            .setDesc('Show tags (in folder portals) or parent folder (in tag portals) below the file preview.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showFileInfoBar)
                .setDisabled(!this.plugin.settings.showFilePreview)
                .onChange(async (value) => {
                    this.plugin.settings.showFileInfoBar = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable sections')
            .setDesc('Show sections within each folder or tag to organise sub items into separated sections')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSections)
                .onChange(async (value) => {
                    this.plugin.settings.enableSections = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        containerEl.createEl('hr');

        // -------------------- TAB SETTINGS ----------------------------------
 
        new Setting(containerEl).setName('Portal tabs').setHeading();
        new Setting(containerEl)
        .setName('Compact tabs')
        .setDesc('Reduce padding and font size for portal, side portal tabs and stack headers.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.compactTabs)
            .onChange(async (value) => {
                this.plugin.settings.compactTabs = value;
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
            .setName('Tab name display')
            .setDesc('Control how tab names are shown. Tooltips appear on hover only when names are hidden.')
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
        .setName('Tab icon position')
        .setDesc('Place the icon to the left or right of the tab name or side portal name. Disabled with tab name display is icon only.')
        .addDropdown(dropdown => dropdown
            .addOption('left', 'Left of name')
            .addOption('right', 'Right of name')
            .setValue(this.plugin.settings.tabIconPosition)
            .onChange(async (value) => {
                this.plugin.settings.tabIconPosition = value as 'left' | 'right';
                await this.plugin.saveSettings();
        }));

        new Setting(containerEl)
            .setName('Tab colors')
            .setDesc('Show tab color on bottom borders of active tabs. Portals style uses the same color when enabled. The color of the pinned vault root is used in side portals.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tabColorEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.tabColorEnabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
            
        const pinSetting = new Setting(containerEl)
            .setName('Pin vault')
            .setDesc('Show vault root as a pinned tab (always with a left border). Users can customize its icon and color below.');

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
                .setName('Pinned vault appearance')
                .setDesc('Customize icon and color for the vault root tab.');

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

            // restore previous open state
            if (this.openSections.has(title)) {
                details.open = true;
            }

            details.addEventListener('toggle', () => {
                if (details.open) {
                    this.openSections.add(title);
                } else {
                    this.openSections.delete(title);
                }
            })


            const summary = details.createEl('summary', { cls: 'portals-section-summary' });
            summary.createSpan({ text: title });

            for (const portal of portals) {
                const setting = new Setting(details);

                // Left side: name and path (with truncation)
                const infoDiv = setting.infoEl;
                infoDiv.empty();
                infoDiv.addClass('portals-portal-info');

                const nameSpan = infoDiv.createSpan({ cls: 'portals-portal-name' });
                nameSpan.textContent = getPortalDisplayName(portal);

                const pathSpan = infoDiv.createSpan({ cls: 'portals-portal-path' });
                pathSpan.textContent = `${portal.type} · ${portal.path}`;

                // Right side: controls
                const controlDiv = setting.controlEl;
                controlDiv.empty();
                controlDiv.addClass('portals-portal-controls');

                // Row 1: icon name badge + icon button
                const iconRow = controlDiv.createDiv({ cls: 'portals-icon-row' });

                const iconBadge = iconRow.createSpan({ cls: 'portals-icon-badge' });
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

        // -------------------- PORTAL STACK SETTINGS ----------------------------------
        new Setting(containerEl).setName('Stacks').setHeading();

        new Setting(containerEl)
        .setName('Hide stack names')
        .setDesc('Show only the stack icon; the name will appear in a tooltip on hover.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideStackNames)
            .onChange(async (value) => {
                this.plugin.settings.hideStackNames = value;
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
        .setName('Stack icon position')
        .setDesc('Place the icon to the left or right of the stack name. Disabled with stack name is hidden.')
        .addDropdown(dropdown => dropdown
            .addOption('left', 'Left of name')
            .addOption('right', 'Right of name')
            .setValue(this.plugin.settings.stackIconPosition)
            .onChange(async (value) => {
                this.plugin.settings.stackIconPosition = value as 'left' | 'right';
                await this.plugin.saveSettings();
        }));

        new Setting(containerEl)
        .setName('Show stack count')
        .setDesc('When to display the number of portals inside a stack.')
        .addDropdown(dropdown => dropdown
            .addOption('always', 'Always')
            .addOption('collapsed', 'Collapsed only')
            .addOption('never', 'Never')
            .setValue(this.plugin.settings.showStackCount)
            .onChange(async (value) => {
                this.plugin.settings.showStackCount = value as 'always' | 'collapsed' | 'never';
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
        .setName('Colored stack icon')
        .setDesc('Use colors on stack icon, app accent or user defined. When turned off, stack icons use default color like tab icons.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.stackIconAccent)
            .onChange(async (value) => {
                this.plugin.settings.stackIconAccent = value;
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
        .setName('Auto‑collapse stacks')
        .setDesc('When expanding a stack, automatically collapse other open stacks.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.stackAutoCollapse)
            .onChange(async (value) => {
                this.plugin.settings.stackAutoCollapse = value;
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

        // -------------------- CONTEXT NOTES SETTINGS ----------------------------------
        new Setting(containerEl).setName('Context Notes').setHeading();

        new Setting(containerEl)
            .setName('Enable Context notes')
            .setDesc('When disabled, Context notes are treated as normal files and the side portal shows a notice. Menu items, context note listeners and cache are removed.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    if (!value) {
                        this.plugin.settings.contextNoteFollowActive = 'off';
                    }
                    await this.plugin.saveSettings();
                    this.display(); // refresh settings UI if needed
                }));

        new Setting(containerEl)
            .setName('Tag notes folder')
            .setDesc('Tag notes storage folder. After changing folder path, use the "Migrate" button to move the files.')
            .addText(text => text
                .setPlaceholder('_Tag Notes')
                .setValue(this.plugin.settings.tagNotesFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.tagNotesFolderPath = value.trim() || '_Tag Notes';
                    await this.plugin.saveSettings();
                }))
            .addButton(btn => btn
                .setButtonText('Browse')
                .onClick(() => {
                    new SelectFolderModal(this.app, (folder) => {
                        this.plugin.settings.tagNotesFolderPath = folder.path;
                        void this.plugin.saveSettings();
                        this.display();
                    }).open();
                }))
            .addButton(btn => btn
                .setButtonText('Migrate')
                .setWarning()
                .onClick(async () => {
                    const result = await this.plugin.migrateTagNotes();
                    if (result.moved > 0) {
                        new Notice(`Moved ${result.moved} tag note(s) to "${this.plugin.settings.tagNotesFolderPath}".`);
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
                    this.display();
                }))
        
        //-- Context Notes in Side Portal
        new Setting(containerEl)
            .setName('Show context notes in file tree')
            .setDesc('When context notes are enabled, controls if they appear in file/ tag tree. If contexts notes are disabled, this setting has no effect.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showContextNotesInTree)
                .setDisabled(!this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.showContextNotesInTree = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        
        new Setting(containerEl)
        .setName('Context note highlight type')
        .setDesc('How to visually indicate folders and tags that have a context note.')
        .addDropdown(dropdown => dropdown
            .addOption('icon', 'Icon highlight')
            .addOption('underline', 'Text underline')
            .addOption('none', 'Off')
            .setValue(this.plugin.settings.contextNoteHighlightStyle)
            .onChange(async (value) => {
                    this.plugin.settings.contextNoteHighlightStyle = value as 'icon' | 'underline' | 'none';
                    await this.plugin.saveSettings();
                    this.display();
            }));
        
        new Setting(containerEl)
        .setName('Open context note from icon')
        .setDesc('When enabled, clicking the icon of a folder or tag will open its context note in the current tab.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.contextNoteIconClick)
            .setDisabled(!this.plugin.settings.enableContextNotes)
            .onChange(async (value) => {
                this.plugin.settings.contextNoteIconClick = value;
                await this.plugin.saveSettings();
                // Refresh the view to apply cursor style
                this.plugin.refreshAllViews();
            }));

        new Setting(containerEl)
        .setName('Show closest context note')
        .setDesc('Side portal shows context note for the active file\'s nearest ancestor folder (folder spaces only). Falls back to portal\'s context note if none found.')
        .addDropdown(dropdown => dropdown
            .addOption('off', 'Off')
            .addOption('on-status', 'On, show status')
            .addOption('on-noStatus', 'On, no status')
            .setValue(this.plugin.settings.contextNoteFollowActive)
            .setDisabled(!this.plugin.settings.enableContextNotes)
            .onChange(async (value) => {
                    this.plugin.settings.contextNoteFollowActive = value as 'off' | 'on-status' | 'on-noStatus';                  
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllViews();
                }));

        containerEl.createEl('hr');

        // -------------------- JOURNAL SETTINGS ----------------------------------
        new Setting(containerEl).setName('Journal').setHeading();

        new Setting(containerEl)
        .setName('Journal date format')
        .setDesc('Choose date format used in daily note filenames. The format must match for journal to work consistently. Changes require a reload.')
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
                    new SelectFolderModal(this.app, (targetFolder) => {
                        this.plugin.settings.journalFolderPath = targetFolder.path;
                        void this.plugin.saveSettings();
                        this.display();
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
                window.setTimeout(() => {
                    dropdown.setValue(this.plugin.settings.quoteDelimiter);
                }, 0);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.quoteDelimiter = value;
                    await this.plugin.saveSettings();
                });
                return dropdown;
            });

        new Setting(containerEl)
        .setName('Show quote indicator on date cards')
        .setDesc('Adds a small icon to journal date cards that contain at least one quote.')
        .addDropdown(dropdown => dropdown
            .addOption('quotes', 'Quotes')
            .addOption('warnings', 'Warnings')
            .addOption('all', 'All')
            .addOption('none', 'None')
            .setValue(this.plugin.settings.journalQuoteIndicator)
            .onChange(async (value) => {
                this.plugin.settings.journalQuoteIndicator = value as 'quotes' | 'warnings' | 'all' | 'none';
                await this.plugin.saveSettings();
                // Refresh the journal tab if it's active
                if (this.plugin.settings.activeSplitTab === 'journal') {
                    this.plugin.refreshAllViews();
                }
            }));

        containerEl.createEl('hr');

        // -------------------- PROPERTIES SETTINGS ----------------------------------
        new Setting(containerEl).setName('Properties').setHeading();

        new Setting(containerEl)
        .setName('Show current value')
        .setDesc('Show current property value on list of files filtered by properties')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showCurrentPropertyValue)
            .onChange(async (value) => {
                this.plugin.settings.showCurrentPropertyValue = value;
                await this.plugin.saveSettings();
                this.display();
            }));

        new Setting(containerEl)
        .setName('Hide filtered count')
        .setDesc('Hide the count display of files filtered in properties. The number is based on dropdown choices.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideFilteredCount)
            .onChange(async (value) => {
                this.plugin.settings.hideFilteredCount = value;
                await this.plugin.saveSettings();
                this.display();
            }));
                    
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
        .setDesc('Open the full documentation, the guide covers everything about the plugin in a simple markdown format.')
        .addButton(button => button
            .setButtonText('Open guide')
            .onClick(() => {
                window.open(getGuideUrl(), '_blank');
            }));

        new Setting(containerEl)
        .setName('Release notes')
        .setDesc('See the release notes, stay upto date on the latest changes made to the plugin.')
        .addButton(button => button
            .setButtonText('Release notes')
            .onClick(() => {
                window.open(getReleaseNotesUrl(), '_blank');
            }));

        window.setTimeout(() => {
            const maxScroll = containerEl.scrollHeight - containerEl.clientHeight;
            containerEl.scrollTop = Math.min(scrollTop, maxScroll);
        }, 0);
    }

    private async exportSettings() {
        const data = JSON.stringify(this.plugin.settings, null, 2);
        const dateStr = new Date().toISOString().slice(0,10);
        const fileName = `portals-settings-${dateStr}.json`

        if (Platform.isDesktop) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const div = activeDocument.createElement('div');
            const a = div.createEl('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            new Notice('Settings exported');
        } else {
            try {
                const existing = this.app.vault.getAbstractFileByPath(fileName);
                if (existing) {
                    new Notice (`File "${fileName}" already exists. Please rename or delete it first.`);
                    return;
                }
                await this.app.vault.create(fileName, data);
                new Notice(`Settings exported as ${fileName} in vault root`);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                new Notice(`Export failed: ${message}`);
            }
        }
       
    }

    private importSettings() {
        const div = activeDocument.createElement('div')
        const input = div.createEl('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text) as Partial<SpacesSettings>;
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
