import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import PortalsPlugin from './main';
import { SpaceConfig, PortalStack, AppearanceRule } from './types';
import { DEFAULT_PORTALS_PALETTE } from './modals/colorModal';
import { buildSettingDefinitions } from './utils/settingsRelated/settingDefinitions';
import { journalState } from './renderers/journalView';
import { PortalsView, VIEW_TYPE_PORTALS } from './view';
import type { RenderIntent } from './pipeline/renderBus';

// Settings whose change is contained to one surface. Anything not listed falls
// back to a full rebuild, so the safe default stays safe.
// Only settings verified end to end belong here. A wrong entry leaves a surface
// stale (toggling context notes off must repaint the context-notes panel, which a
// tree-only intent does not do), so the safe default stays 'all'.
const SETTING_INTENT: Partial<Record<string, RenderIntent>> = {
    sortBy: 'tree:structure',
    sortOrder: 'tree:structure',
    showFilePreview: 'tree:structure',
    showFileInfoBar: 'tree:structure',
    showTaskProgress: 'tree:appearance',
};

export interface SpacesSettings {
    spaces: SpaceConfig[];
    openFolders: string[];
    selectedSpace: { path: string; type: 'folder' | 'tag' } | null;
    replaceFileExplorer: boolean;
    pinVaultRoot: boolean;
    filePaneColorStyle: 'gradient' | 'solid' | 'none';
    tabColorEnabled: boolean;
    /** Portals style only: let tab colours drive summaries and side-panel accents. */
    portalsTabColorsToSummaries: boolean;
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
    clinicState: { 
        filters: { property: string; value: string }[];
        clinicSortBy: 'name' | 'created' | 'modified';
        clinicSortorder: 'asc' | 'desc';
        savedViews: Record<string, { filters: { property: string, value: string }[]; groupBy: string }>;
        groupBy: string;
        controlsOpen: boolean;
        groupStates: Record<string, boolean>;
    },
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
    previousReminderProperty: string;
    reminderShowOverdue: boolean;
    reminderOrder: 'overdue-first' | 'future-first';
    reminderTabNotification: boolean;
    reminderTreeIndicator: 'off' | 'simple' | 'dynamic';
    reminderSectionStates: Record<string, boolean>;
    reminderStartupNotification: 'none' | 'notice' | 'modal';
    autoCollapseTree: boolean;
    dateDisplayFormat: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY';
    appearanceRules: AppearanceRule[];
    showTaskProgress: 'off' | 'number' | 'ring' | 'bar';
}

export const DEFAULT_SETTINGS: SpacesSettings = {
    spaces: [],
    openFolders: [],
    selectedSpace: null,
    replaceFileExplorer: false,
    pinVaultRoot: false,
    filePaneColorStyle: 'gradient',
    tabColorEnabled: true,
    portalsTabColorsToSummaries: true,
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
    clinicState: { 
        filters: [],
        clinicSortBy: 'name',
        clinicSortorder: 'asc',
        savedViews: {},
        groupBy: '',
        controlsOpen: true,
        groupStates: {}
    },
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
    previousReminderProperty: '',
    reminderShowOverdue: true,
    reminderOrder: 'overdue-first',
    reminderTabNotification: true,
    reminderTreeIndicator: 'dynamic',
    reminderSectionStates: { overdue: true, today: true, upcoming: true, later: true },
    reminderStartupNotification: 'notice',
    autoCollapseTree: false,
    dateDisplayFormat: 'YYYY-MM-DD',
    appearanceRules: [],
    showTaskProgress: 'off',
};

export class SpacesSettingTab extends PluginSettingTab {
    plugin: PortalsPlugin;
    public openSections: Set<string> = new Set();
    // The declarative settings API builds each control once; this lets a control
    // re-render itself after settings it displays have changed.
    public activeTabsRefresher?: () => void;
    public pinnedAppearanceRefresher?: () => void;
    public summaryColourToggleRefresher?: () => void;
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
                // The pinned root always sits first; without this a re-pinned root is
                // appended by the tab bar's "missing entries" pass.
                if (!this.plugin.settings.tabBarOrder.includes('folder:/')) {
                    this.plugin.settings.tabBarOrder = ['folder:/', ...this.plugin.settings.tabBarOrder];
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
                // Unpinning removes the tab, so its tab-scoped preferences go too:
                // otherwise the old icon reappears the next time the root is pinned.
                this.plugin.forgetPortalPreferences('folder:/');
                this.plugin.settings.tabBarOrder = this.plugin.settings.tabBarOrder
                    .filter(entry => entry !== 'folder:/');
            }
        }
        if (key === 'tabColorEnabled' || key === 'treeStyle') {
            // The summary-colour row is only meaningful for Portals style with tab
            // colours on; re-evaluate it in place.
            this.summaryColourToggleRefresher?.();
        }
        if (key === 'pinVaultRoot') {
            // Pin state changed: rebuild the appearance row and the portal list so
            // both reflect the new spaces array.
            this.pinnedAppearanceRefresher?.();
            this.activeTabsRefresher?.();
        }
        if (key === 'sidePanelEnabled' && value === false) {
            this.plugin.settings.secondaryPanelCollapsed = true;
        }
        if (key === 'enableContextNotes' && value === false) {
            this.plugin.settings.contextNoteFollowActive = 'off';
        }

        if (key === 'reminderProperty' && typeof value === 'string') {
            const oldVal = this.plugin.settings.reminderProperty;
            if (oldVal !== value) {
                this.plugin.settings.previousReminderProperty = oldVal
            }
        }
        
        // write the value to settings first
        (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;

        const intent = SETTING_INTENT[key] ?? 'all';

        if (key === 'pinVaultRoot') {
            await this.plugin.saveData(this.plugin.settings);
            window.setTimeout(() => {
                this.plugin.renderBus.invalidate(intent, { reason: `setting:${key}` });
            }, 100);
        } else if (typeof value === 'string') {
            await this.plugin.saveData(this.plugin.settings);
            if (this.plugin.textSettingRenderTimer) window.clearTimeout(this.plugin.textSettingRenderTimer);
            this.plugin.textSettingRenderTimer = window.setTimeout(() => {
                this.plugin.textSettingRenderTimer = null;
                this.plugin.renderBus.invalidate(intent, { reason: `setting:${key}` });
            }, 500);
        } else {
            await this.plugin.saveSettings(intent, { reason: `setting:${key}` });
        }

        if (key === 'reminderShowOverdue' || key === 'reminderOrder') {
            this.plugin.refreshSidePortal('reminders');
        }
        if (key === 'reminderProperty') {
            this.plugin.rebuildReminderDatesCache();
            this.plugin.updateReminderBadge();
            this.plugin.refreshSidePortal('reminders');
        }
        if (key === 'showCurrentPropertyValue' || key === 'hideFilteredCount') {
            this.plugin.refreshSidePortal('properties');
        }
        if (key === 'reminderTabNotification') {
            this.plugin.updateReminderBadge();
        }
        if (key === 'showTaskProgress') {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                if (leaf.view instanceof PortalsView) {
                    leaf.view.refreshFileAppearances();
                }
            })
        }
        const journalKeys = [
            'journalDateFormat',
            'journalFolderPath',
            'quoteDelimiter',
            'journalDefaultCurrentMode',
            'journalQuoteIndicator'
        ];
        if (journalKeys.includes(key)) {
            journalState.currentQuote = null;
            journalState.startTime = 0;
            this.plugin.refreshSidePortal('journal');
            this.plugin.refreshAltRightPanelContent('journal');
        }
    }
}