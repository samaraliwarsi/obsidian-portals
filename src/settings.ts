import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import PortalsPlugin from './main';
import { SpaceConfig, PortalStack } from './types';
import { DEFAULT_PORTALS_PALETTE } from './modals/colorModal';
import { buildSettingDefinitions } from './utils/settingsRelated/settingDefinitions';

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
    splitViewTabs: string[]; // left by default
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
    clinicState: { selectedProperty: string; selectedValue: string; clinicSortBy: 'name' | 'created' | 'modified'; clinicSortorder: 'asc' | 'desc' };
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
    spaceSectionPrefs: Record<string, { criterion?: 'extension' | 'property'; propertyName?: string}>;
    userPalette?: string[]
    previousSelectedSpace: { path: string; type: 'folder' | 'tag' } | null;
    showQuickTabNumbersOnTabs: boolean;
    showTreeItemToolTips: boolean;
    journalDefaultCurrentMode: 'random' | 'marked' | 'onThisDay';
    iconLibrary: 'phosphor' | 'lucide';
    iconFavorites: { name: string; library: 'phosphor' | 'lucide' | 'emoji' }[];
    enableAutoBackup: boolean;
    backupFolderPath: string;
    toggleSettingsSync: boolean;
    alternateSideTabs: string[]; // right
    alternateActiveTab: string; // active on right
    registerPortalsInCmdPalette: boolean;
    reminderProperty: string;
    reminderShowOverDue: boolean;
    reminderOrder: 'overdue-first' | 'future-first';
    reminderTabNotification: boolean;
    reminderTreeIndicator: 'off' | 'simple' | 'dynamic';
    reminderSectionStates: Record<string, boolean>;
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
    splitViewTabs: ['recent', 'context-notes', 'bookmarks', 'journal', 'hidden', 'properties', 'trash', 'reminders'], // left by default
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
    clinicState: { selectedProperty: '', selectedValue: '', clinicSortBy: 'name' as const, clinicSortorder: 'asc' as const },
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
    spaceSectionPrefs: {},
    userPalette: [...DEFAULT_PORTALS_PALETTE],
    previousSelectedSpace: null,
    showQuickTabNumbersOnTabs: false,
    showTreeItemToolTips: false,
    journalDefaultCurrentMode: 'random',
    iconLibrary: 'phosphor',
    iconFavorites: [] as {name: string; library: 'phosphor' | 'lucide' | 'emoji' }[],
    enableAutoBackup: false,
    backupFolderPath: '',
    toggleSettingsSync: true,
    alternateSideTabs: [],
    alternateActiveTab: '',
    registerPortalsInCmdPalette: true,
    reminderProperty: 'remind_at',
    reminderShowOverDue: true,
    reminderOrder: 'overdue-first',
    reminderTabNotification: true,
    reminderTreeIndicator: 'dynamic',
    reminderSectionStates: { overdue: true, today: true, upcoming: true, later: true },
};

export class SpacesSettingTab extends PluginSettingTab {
    plugin: PortalsPlugin;
    public openSections: Set<string> = new Set();
    icon = 'folder-tree';

    constructor(app: App, plugin: PortalsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // New declarative API for Obsidian 1.13+
    getSettingDefinitions(): SettingDefinitionItem[] {
        return buildSettingDefinitions(this);
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        // Special handling: pin vault root has a side effect — it adds/remove the vault root folder from settings.spaces.
        if (key === 'pinVaultRoot') {
            const rootPath = '/';
            if (value === true) {
                let root = this.plugin.settings.spaces.find(
                    s => s.path === rootPath && s.type === 'folder'
                );
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
                if (!this.plugin.settings.selectedSpace) {
                    this.plugin.settings.selectedSpace = { path: rootPath, type: 'folder' };
                }
            } else {
                this.plugin.settings.spaces = this.plugin.settings.spaces.filter(
                    s => !(s.path === rootPath && s.type === 'folder')
                );
                if (this.plugin.settings.selectedSpace?.path === rootPath &&
                    this.plugin.settings.selectedSpace?.type === 'folder') {
                    this.plugin.settings.selectedSpace = this.plugin.settings.spaces[0]
                        ? { path: this.plugin.settings.spaces[0].path, type: this.plugin.settings.spaces[0].type }
                        : null;
                }
            }
        }
        if (key === 'sidePanelEnabled' && value === false) {
            this.plugin.settings.secondaryPanelCollapsed = true;
        }
        if (key === 'enableContextNotes' && value === false) {
            this.plugin.settings.contextNoteFollowActive = 'off';
        }
        // Default path: write the value, then run the plugin's saveSettings()
        // (which re-renders all open portal views).
        (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
        await this.plugin.saveSettings();
        if (key === 'showCurrentPropertyValue' || key === 'hideFilteredCount') {
            this.plugin.refreshSidePortal('properties');
        }
        // for reminder notification icon color change
        if (key === 'reminderTabNotification') {
            this.plugin.updateReminderBadge();
        }
    }
}