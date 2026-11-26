import { Plugin, TFolder, TFile, Notice, normalizePath, App, WorkspaceLeaf } from 'obsidian';
import { PortalsView, VIEW_TYPE_PORTALS } from './view';
import { SpacesSettings, DEFAULT_SETTINGS, SpacesSettingTab } from './settings';
import { FrontmatterClinicRenderer } from './renderers/frontmatterClinic';
import { getFrontmatterTags } from './utils/tagHelpers';
import { registerAllCommands, updatePortalCommands } from './utils/commands';
import { LucideIconProvider } from './icons/LucideIconProvider';
import { PhosphorIconProvider } from './icons/phosphorIconProvider';
import { IconProvider } from './icons/iconProvider';
import { getLocalItem } from './utils/Proxies/localFlags';
import { AltSidePanelView, VIEW_TYPE_ALT_SIDE_PANEL } from './renderers/RightSideView';
import { InternalPluginsWithBookmarks, SpaceConfig } from './types';
import { getContextRenderer, getJournalRenderer } from './renderers/sidePanelContent';
import { EmojiIconProvider } from './icons/emojiIconProvider';
import { DatePickerModal } from './modals/native/datePickerModal';
import { getDaysDifference, parseLocalDate } from './utils/dateHelpers';
import type { Frontmatter } from './types';
import { RemindersStartupModal } from './modals/native/remindersStartupModal';
import { RenderBus } from './pipeline/renderBus';
import type { InvalidateOptions, RenderIntent } from './pipeline/renderBus';

interface AppWithInternalPlugins extends App {
    internalPlugins: unknown;
}

export default class PortalsPlugin extends Plugin {
    settings!: SpacesSettings;
    lucideProvider = new LucideIconProvider;
    phosphorProvider = new PhosphorIconProvider;
    emojiProvider = new EmojiIconProvider();
    private bookmarksListenerRef: (() => void) | null = null;
    private refreshAltRightPanelTimeout: number | null = null;
    public registeredPortalCommandIds: string[] = [];
    private reminderRefreshTimer: number | null = null;
    public fileTagCache = new Map<string, string>();
    private trashRefreshTimer: number | null = null;
    public textSettingRenderTimer: number | null = null;
    private backupInProgress = false;
    public fileSectionCache = new Map<string, string>();
    public reminderDates = new Map<string, string>();
    public renderBus = new RenderBus(this);

    async onload() {
        await this.loadSettings();
        updatePortalCommands(this);
        registerAllCommands(this);
        this.rebuildReminderDatesCache();

        // migrate old clinicState to new multi-filter format
        const oldClinic = this.settings.clinicState as unknown as Record<string, unknown>;
        if (oldClinic && !oldClinic.filters) {
            const oldProp = oldClinic.selectedProperty as string;
            const oldVal = oldClinic.selectedValue as string;
            this.settings.clinicState = {
                filters: oldProp ? [{ property: oldProp, value: oldVal || '' }] : [],
                clinicSortBy: (oldClinic.clinicSortBy as 'name' | 'created' | 'modified') || 'name',
                clinicSortorder: (oldClinic.clinicSortorder as 'asc' | 'desc') || 'asc',
                savedViews: {},
                groupBy: '',
                controlsOpen: true,
                groupStates: {}
            };
        }

        const internalPlugins = (this.app as AppWithInternalPlugins).internalPlugins as InternalPluginsWithBookmarks;
        const bookmarksPlugin = internalPlugins?.getPluginById('bookmarks');
        if (bookmarksPlugin?.instance && typeof bookmarksPlugin.instance?.on) {
            const onBookmarksChange = () => {
                if (this.settings.activeSplitTab === 'bookmarks') {
                    this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                        if (leaf.view instanceof PortalsView) {
                            const secondaryPanel = leaf.view.containerEl.querySelector('.portals-secondary-panel');
                            if (secondaryPanel instanceof HTMLElement) {
                                void leaf.view.renderSplitTabContent(secondaryPanel, 'bookmarks');
                            }
                        }
                    });
                }
                if (this.settings.alternateActiveTab === 'bookmarks') {
                    this.refreshAltRightPanelContent();
                }
            };
            const instance = bookmarksPlugin.instance as {
                on?: (event: string, callback: () => void) => void;
                off?: (event: string, callback: () => void) => void;
            };
            if (instance.on) {
                bookmarksPlugin.instance.on('changed', onBookmarksChange);
                this.bookmarksListenerRef = onBookmarksChange;
            }
        }

        this.app.workspace.onLayoutReady(() => {
            // The metadata cache is not ready during onload, so the reminder map
            // built there is empty and the panel shows nothing until a change.
            this.rebuildReminderDatesCache();
            // Badge is a class on the tab; the strip was built before this cache
            // existed, so nothing had set it yet.
            this.updateReminderBadge();
            // The panel was rendered from an empty cache before this point.
            this.refreshSidePortal('reminders');
            this.refreshAltRightPanelContent('reminders');
            window.setTimeout(() => { void this.setupPortalsSidebar(); }, 0);
            // auto backup
            if (this.settings.enableAutoBackup) {
                window.setTimeout(() => {
                    this.performAutoBackup().catch(err => {
                        console.error('Portals: auto backup failed silently', err);
                        new Notice('Portals: Auto backup failed - check console.');
                    });
                }, 100);
            }
            
            // Check for reminders on startup
            if (this.settings.reminderStartupNotification !== 'none') {
                window.setTimeout(() => {
                    const propName = this.settings.reminderProperty || 'remind_at';
                    let count = 0;

                    for (const file of this.app.vault.getMarkdownFiles()) {
                        const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
                        const rawDate = fm?.[propName];
                        if (rawDate) {
                            const dateObj = parseLocalDate(String(rawDate));
                            if (dateObj && getDaysDifference(dateObj) <= 0) {
                                count++;
                            }
                        }
                    }
                    if (count >0) {
                        if (this.settings.reminderStartupNotification === 'modal') {
                            new RemindersStartupModal(this.app, this).open();
                        } else {
                            new Notice(`Portals: You have ${count} reminders due today or overdue.`);
                        }
                    }
                }, 2500);
            }
        });

        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') return;
            // Preview safety net - ensures previews appear for files that were empty on creation
            if (this.settings.showFilePreview) {
                this.renderBus.invalidate('tree:appearance', { files: [file.path], reason: 'preview refresh' });
            }
            // Journal refresh
            const folderPath = this.getJournalFolderPath();
            if (folderPath && folderPath !== '/' && !file.path.startsWith(folderPath + '/')) return;
            if (this.settings.activeSplitTab === 'journal' || this.settings.alternateActiveTab === 'journal') {
                this.renderBus.invalidate('panel', { tabId: 'journal', afterMs: 2000, reason: 'journal note modified' });
            }
        }));

        // Forward frontmatter cache updates (no startup cost)
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') return;

            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) return;

            FrontmatterClinicRenderer.updateFileCache(this.app, file);

            const space = this.settings.selectedSpace;
            const currentTags = [
                ...(cache?.tags?.map(t => t.tag) || []),
                ...getFrontmatterTags(cache)
            ].sort().join(',');

            const oldTags = this.fileTagCache.get(file.path);

            const tagsChanged = oldTags !== undefined && currentTags !== oldTags;
            this.fileTagCache.set(file.path, currentTags);

            // --- Sections Logic (Preserved from your old code) ---
            let sectionChanged = false;
            const newSectionKey = this.getSectionKeyForFile(file);
            if (newSectionKey !== null) {
                const oldSectionKey = this.fileSectionCache.get(file.path);
                if (oldSectionKey !== newSectionKey) {
                    sectionChanged = true;
                }
                this.fileSectionCache.set(file.path, newSectionKey);
            }

            // --- Routing Logic ---
            let needsRebuild = sectionChanged; // Sections moving always requires rebuild

            if (space?.type === 'tag' && tagsChanged) {
                // FIX 3: Only rebuild if the file enters or leaves THIS specific tag portal
                const portalTag = space.path;
                const oldSet = (oldTags || '').split(',').filter(Boolean).map(t => t.replace(/^#/, ''));
                const newSet = currentTags.split(',').filter(Boolean).map(t => t.replace(/^#/, ''));

                const belongsBefore = oldSet.some(t => t === portalTag || t.startsWith(portalTag + '/'));
                const belongsAfter = newSet.some(t => t === portalTag || t.startsWith(portalTag + '/'));

                if (belongsBefore || belongsAfter) {
                    needsRebuild = true;
                }
            }

            if (needsRebuild) {
                this.renderBus.invalidate('tree:structure', { reason: 'metadata changed' });
            } else {
                this.renderBus.invalidate('tree:appearance', { files: [file.path], reason: 'metadata changed' });
            }

            // --- Reminders & Badge Logic (Preserved from your old code) ---
            if (this.reminderRefreshTimer) window.clearTimeout(this.reminderRefreshTimer);
            this.reminderRefreshTimer = window.setTimeout(() => {
                this.reminderRefreshTimer = null;
                
                const prop = this.settings.reminderProperty || 'remind_at';
                const cache = this.app.metadataCache.getFileCache(file);
                // During a re-index the cache is briefly absent. Deleting on a
                // missing cache wipes real reminders; only a cache that is
                // present and has no property means "no reminder".
                if (!cache) return;
                const fm: Frontmatter | undefined = cache.frontmatter;
                const raw = fm?.[prop];
                if (raw) {
                    this.reminderDates.set(file.path, String(raw));
                } else {
                    this.reminderDates.delete(file.path);
                }
                const lSidePortal = this.settings.activeSplitTab;
                const rSidePortal = this.settings.alternateActiveTab;

                // Refresh the Reminders panel if it's open on either side
                if (lSidePortal === 'reminders' || rSidePortal === 'reminders') {
                    this.renderBus.invalidate('panel', { tabId: 'reminders', afterMs: 300, reason: 'reminder changed' });
                }

                // Refresh the Recent panel if it's open on either side
                if (lSidePortal === 'recent' || rSidePortal === 'recent') {
                    this.renderBus.invalidate('panel', { tabId: 'recent', afterMs: 300, reason: 'reminder changed' });
                }
                this.updateReminderBadge();
            }, 300);
        }));

        // A folder rename fires once per descendant file. Routing each event to the
        // panels rebuilt them 13+ times for one rename; the bus coalesces per tab.
        const refreshPanelsCoalesced = () => {
            for (const tabId of ['properties', 'journal', 'context-notes', 'reminders']) {
                if (this.settings.activeSplitTab === tabId || this.settings.alternateActiveTab === tabId) {
                    this.renderBus.invalidate('panel', { tabId, afterMs: 200, reason: 'rename' });
                }
            }
        };

        const debouncedTreeRefresh = () => {
            this.renderBus.invalidate('tree:structure', { reason: 'tree refresh' });
        }
        // =================================================
        // FOCUS LISTENER
        // =================================================
        this.registerDomEvent(activeWindow, 'focus', () => {
            this.updateReminderBadge();
        });

        // =================================================
        // CREATE LISTENER
        // =================================================
        this.registerEvent(this.app.vault.on('create', (file) => {
            if (file instanceof TFolder) {
                debouncedTreeRefresh();
            }
            if (file instanceof TFile) {
                debouncedTreeRefresh();
    
                if (file.extension === 'md') {
                    window.setTimeout(() => FrontmatterClinicRenderer.updateFileCache(this.app, file), 100);
                    debouncedTreeRefresh();

                    // Journal, Context notes and reminders update
                    refreshPanelsCoalesced();
                }
            }
            void this.refreshTrashIfActive();
        }));

        // ==========================================
        // 2. DELETE LISTENER
        // ==========================================
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFolder) {
                debouncedTreeRefresh();
                refreshPanelsCoalesced();
            }
            if (file instanceof TFile) {
                debouncedTreeRefresh();
                if (file.extension === 'md') {
                    this.reminderDates.delete(file.path);
                    FrontmatterClinicRenderer.removeFileCache(file.path);
                    refreshPanelsCoalesced();

                    
                    this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                        if (leaf.view instanceof PortalsView) {
                            const journal = getJournalRenderer(leaf.view);
                            if (journal) journal.removeFile(file.path);

                            const el = leaf.view.fileElementMap.get(file.path);
                            if (el && el.isConnected) {
                                el.remove();
                                leaf.view.fileElementMap.delete(file.path);
                            }
                        }
                    });
                    if (this.settings.alternateActiveTab === 'journal') {
                        this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL).forEach(leaf => {
                            if (leaf.view instanceof AltSidePanelView) {
                                const journal = getJournalRenderer(leaf.view);
                                if (journal) journal.removeFile(file.path);
                            } 
                        });
                    }
                    debouncedTreeRefresh();
                }
                void this.refreshTrashIfActive();

                if (file instanceof TFile) {
                    void this.removeRecentFile(file.path);
                    const marks = this.settings.markedJournalNotes;
                    const index = marks.indexOf(file.path);
                    if (index !== -1) {
                        marks.splice(index, 1);
                        void this.saveData(this.settings);
                    }
                }
            }
        }));
            

        // ==========================================
        // 3. RENAME LISTENER
        // ==========================================
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFolder) {
                debouncedTreeRefresh();
                refreshPanelsCoalesced();
            }
            if (file instanceof TFile) {
                if (file.extension === 'md') {
                    const rawReminder = this.reminderDates.get(oldPath);
                    if (rawReminder !== undefined) {
                        this.reminderDates.delete(oldPath);
                        this.reminderDates.set(file.path, rawReminder);
                    }
                    FrontmatterClinicRenderer.removeFileCache(oldPath);
                    FrontmatterClinicRenderer.updateFileCache(this.app, file);
                    
                    debouncedTreeRefresh();

                    refreshPanelsCoalesced();
                }

                // 2. Recent files & journal marks logic (moved from separated block)
                void this.updateRecentFilesOnRename(oldPath, file.path);
                if (this.settings.journalFolderPath && file.path.startsWith(this.settings.journalFolderPath)) {
                    const marks = this.settings.markedJournalNotes;
                    const index = marks.indexOf(oldPath);
                    if (index !== -1) {
                        marks[index] = file.path;
                        void this.saveData(this.settings);
                    }
                }
            }

            //3. Trash logic
            void this.refreshTrashIfActive();

            // 4. Hidden items logic (file and folder)
            if (this.settings.hiddenItems[oldPath]) {
                this.settings.hiddenItems[file.path] = true;
                delete this.settings.hiddenItems[oldPath];
                void this.saveData(this.settings);
            }
        }));

        const selectedSpace = this.settings.spaces.find(s => 
            s.path === this.settings.selectedSpace?.path && 
            s.type === this.settings.selectedSpace?.type
        );
        if (selectedSpace && selectedSpace.type === 'folder') {
            if (!this.settings.openFolders.includes(selectedSpace.path)) {
                this.settings.openFolders.push(selectedSpace.path);
                await this.saveData(this.settings);
            }
        }

        this.registerView(
            VIEW_TYPE_PORTALS,
            (leaf) => new PortalsView(leaf, this)
        );

        this.registerView(
            VIEW_TYPE_ALT_SIDE_PANEL,
            (leaf) => new AltSidePanelView(leaf, this)
        );

        this.addRibbonIcon('folder-tree', 'Open portals', () => {
            void this.activateView();
        });

        this.addSettingTab(new SpacesSettingTab(this.app, this));

        /* If replaceFileExplorer is enabled, set up the left sidebar
        if (this.settings.replaceFileExplorer) {
            window.setTimeout(() => { void this.setupPortalsSidebar(); }, 50);
        }*/

        // Track recent files
        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file) {
                void this.updateRecentFiles(file.path);
                if (this.settings.activeSplitTab === 'context-notes') {
                    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
                    if (leaf?.view instanceof PortalsView) {
                        const renderer = getContextRenderer(leaf.view);
                        if (renderer) renderer.saveScroll();
                    }
                }
                this.refreshAltRightPanelContent('context-notes');
            }
        }));
    }

    // for system icons
    getActiveIconProvider(): IconProvider {
        return this.settings.iconLibrary === 'lucide' ? this.lucideProvider : this.phosphorProvider;
    }
    public renderPluginIcon(element: HTMLElement, iconName: string): void {
        this.getActiveIconProvider().renderIcon(element, iconName);
    }

    // for user icons 
    public getProviderForLibrary(library: 'phosphor' | 'lucide' | 'emoji'): IconProvider {
        if (library === 'lucide') return this.lucideProvider;
        if (library === 'emoji') return this.emojiProvider;
        return this.phosphorProvider;
    }

    public renderCustomIcon(element: HTMLElement, key: string, fallback: string): void {
        const stored = this.settings.customIcons[key];
        if (!stored) {
            this.renderPluginIcon(element, fallback);
            return;
        }
        const colonIndex = stored.indexOf(':');
        if (colonIndex > 0) {
            const library = stored.substring(0, colonIndex);
            const iconName = stored.substring(colonIndex + 1);
            if (library === 'phosphor' || library === 'lucide' || library === 'emoji') {
                const provider = this.getProviderForLibrary(library);           
                provider.renderIcon(element, iconName);
                return;
            }
        } 
        this.renderPluginIcon(element, stored);   
    }

    public renderIconString(element: HTMLElement, iconKey: string, fallback: string = 'file'): void {
        if (!iconKey) {
            this.renderPluginIcon(element, fallback);
            return;
        }
        const colonIndex = iconKey.indexOf(':');
        if (colonIndex > 0) {
            const library = iconKey.substring(0, colonIndex);
            const iconName = iconKey.substring(colonIndex + 1);
            if (library === 'phosphor' || library === 'lucide' || library === 'emoji') {
                const provider = this.getProviderForLibrary(library);
                provider.renderIcon(element, iconName);
                return;
            }
        }
        this.renderPluginIcon(element, iconKey);
    }

    public getJournalFolderPath(): string | null {
        let path = this.settings.journalFolderPath;
        
        if (!path) {
            // Type-safe access to internal plugins without using 'any'
            const appWithPlugins = this.app as unknown as {
                internalPlugins?: {
                    getPluginById(id: string): {
                        enabled: boolean;
                        instance?: { options?: { folder?: string } };
                    } | undefined;
                };
            };
            
            const dailyNotesPlugin = appWithPlugins.internalPlugins?.getPluginById('daily-notes');
            if (dailyNotesPlugin?.enabled && dailyNotesPlugin.instance?.options?.folder) {
                path = dailyNotesPlugin.instance.options.folder;
            }
        }
        
        return path || null;
    }

    onunload() { 
        FrontmatterClinicRenderer.resetCache();

        if (this.reminderRefreshTimer) {
            window.clearTimeout(this.reminderRefreshTimer);
            this.reminderRefreshTimer = null;
        }
        if (this.trashRefreshTimer) {
            window.clearTimeout(this.trashRefreshTimer);
            this.trashRefreshTimer = null;
        }
        if (this.refreshAltRightPanelTimeout) {
            window.clearTimeout(this.refreshAltRightPanelTimeout);
            this.refreshAltRightPanelTimeout = null;
        }
        if (this.textSettingRenderTimer) {
            window.clearTimeout(this.textSettingRenderTimer);
            this.textSettingRenderTimer = null;
        }
        if (this.bookmarksListenerRef) {
            const internalPlugins = (this.app as AppWithInternalPlugins).internalPlugins as InternalPluginsWithBookmarks;
            const bookmarksPlugin = internalPlugins?.getPluginById('bookmarks');
            if (bookmarksPlugin?.instance) {
                const instance = bookmarksPlugin.instance as {
                    off?: (event: string, callback: () => void) => void;
                };
                if (instance.off) {
                    instance.off('changed', this.bookmarksListenerRef);
                }
            }
            this.bookmarksListenerRef = null;
        }
    }

    async loadSettings() {
        const data = (await this.loadData()) as Record<string, unknown> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});

        // migrate side tabs - ensure no tab appears in both panels
        if (this.settings.splitViewTabs && this.settings.alternateSideTabs) {
            const leftSet = new Set(this.settings.splitViewTabs);
            const cleanedRight = this.settings.alternateSideTabs.filter(id => !leftSet.has(id));
            if (cleanedRight.length !== this.settings.alternateSideTabs.length) {
                this.settings.alternateSideTabs = cleanedRight;
                await this.saveSettings();
            }
        }

        // === Build initial tabBarOrder if missing ===
        if (!this.settings.tabBarOrder || this.settings.tabBarOrder.length === 0) {
            const order: string[] = [];
            // Stacks in current order (sorted by order field)
            const sortedStacks = [...this.settings.portalStacks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            for (const stack of sortedStacks) {
                order.push(`stack:${stack.id}`);
            }
            // Unstacked portals (any order, but stable)
            for (const space of this.settings.spaces) {
                if (!space.stackId) {
                    order.push(`${space.type}:${space.path}`);
                }
            }
            this.settings.tabBarOrder = order;
        }

        this.pruneEmptyStacks();

        // for tag notes initialization (user enabled)
        if (!this.settings.previousTagNotesFolderPath) {
            this.settings.previousTagNotesFolderPath = this.settings.tagNotesFolderPath;
        }
    }

    // A stack exists to hold portals. With none left it can never be filled again
    // (nothing adds into an empty stack), so it should not linger — otherwise an
    // empty stack sits in the bar until the next reload prunes it.
    public pruneEmptyStacks(): boolean {
        const referenced = new Set<string>();
        for (const space of this.settings.spaces) {
            if (space.stackId) referenced.add(space.stackId);
        }

        const before = this.settings.portalStacks.length;
        this.settings.portalStacks = this.settings.portalStacks.filter(stack => referenced.has(stack.id));
        if (this.settings.portalStacks.length === before) return false;

        const live = new Set(this.settings.portalStacks.map(stack => stack.id));
        this.settings.tabBarOrder = (this.settings.tabBarOrder ?? []).filter(entry =>
            !entry.startsWith('stack:') || live.has(entry.slice(6)));

        return true;
    }

    async saveSettings(intent: RenderIntent = 'all', options: InvalidateOptions = {}) {
        try {
            await this.saveData(this.settings);
        } catch (err) {
            console.error('Portals: failed to persist settings', err);
            new Notice('Portals: Failed to save settings. Changes may not persist after restart.');
        }
        updatePortalCommands(this);
        this.closeAltSidePanelsIfDisabled();
        // Settings changes stale the whole surface by default; callers that know
        // the setting only touches the tree pass a narrower intent.
        this.renderBus.invalidate(intent, { ...options, reason: 'settings saved' });
    }

    async activateView() {
        const { workspace } = this.app;

        if (workspace.leftSplit.collapsed) {
            workspace.leftSplit.expand();
        }

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
        if (!leaf) {
            const newLeaf = workspace.getLeftLeaf(false);
            if (newLeaf) {
                leaf = newLeaf;
                await leaf.setViewState({ type: VIEW_TYPE_PORTALS, active: true });
            } else {
                return;
            }
    }
        void workspace.revealLeaf(leaf);
    }

    async setupPortalsSidebar() {
        const { workspace } = this.app;

        // Load deferred leaves so getRoot() is reliable (fixes 1.15.1 race)
        const candidates = workspace.getLeavesOfType(VIEW_TYPE_PORTALS);
        for (const leaf of candidates) {
            if (leaf.isDeferred) {
                try {
                    await leaf.loadIfDeferred();
                } catch (e) {
                    console.error(`[Portals]: loadIfDeferred failed`, e);
                }
            }
        }

        // Clean up duplicates unconditionally (left or right)
        const allPortals: WorkspaceLeaf[] = workspace.getLeavesOfType(VIEW_TYPE_PORTALS);
        if (allPortals.length > 1) {
            const keep = allPortals[0];
            if (keep) {
                console.debug(`[Portals] Detaching ${allPortals.length - 1} duplicate Portal leaf(s)`);
                for (const leaf of allPortals) {
                    if (leaf !== keep) {
                        try {
                            leaf.detach();
                        } catch (e) {
                            console.error(`[Portals]: detach failed`, e);
                        }
                    }
                }
            }
        }
        const existing = workspace.getLeavesOfType(VIEW_TYPE_PORTALS);
        if (existing.length > 0) {
            const leaf = existing[0];
            if (leaf) {
                await workspace.revealLeaf(leaf);
            }
            return;
        }
        // create new (only if on left
        const leftSplit = workspace.leftSplit;
        if (!leftSplit) return;
        if (leftSplit.collapsed) leftSplit.expand();

        const newLeaf = workspace.getLeftLeaf(false);
        if (!newLeaf) {
            console.error('[Portals] getLeftLeaf returned null - sidebar not ready at setup time');
            return;
        }
        await newLeaf.setViewState({ type: VIEW_TYPE_PORTALS, active: true });
        if (newLeaf.isDeferred) await newLeaf.loadIfDeferred();
        await workspace.revealLeaf(newLeaf);
    }

    public rebuildReminderDatesCache(): void {
        this.reminderDates.clear();
        const prop = this.settings.reminderProperty || 'remind_at';
        for (const f of this.app.vault.getMarkdownFiles()) {
            const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(f)?.frontmatter;
            const raw = fm?.[prop];
            if (raw) this.reminderDates.set(f.path, String(raw));
        }
    }

    public getFileAppearance(file: TFile): {icon: string, color: string | undefined} {
        // get manual overrides if they exist
        const customIcon = this.settings.customIcons[file.path];
        const customColor = this.settings.customColors[file.path]

        // Find the matching rule if any
        let ruleIcon: string | undefined;
        let ruleColor: string | undefined;
        

        const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter; 
        if (fm && this.settings.appearanceRules) {
            for (const rule of this.settings.appearanceRules) {
                const rawVal = fm[rule.property]
                if (rawVal === undefined || rawVal === null) continue;

                let matches = false;
                if (Array.isArray(rawVal)) {
                    matches = rawVal.map(String).includes(rule.value);
                } else {
                    matches = String(rawVal) === rule.value;
                }
                if (matches) {
                    ruleIcon = rule.icon || undefined;
                    ruleColor = rule.color || undefined;
                    break;
                }
            }
        }
        // resolve icon: Custom > Rule > default
        const finalIcon = customIcon || ruleIcon || 'file';

        // resolve color: custom > rule > undefined
        const finalColor = customColor !== undefined ? customColor : ruleColor;

        return { icon: finalIcon, color: finalColor };
    }

    public async clearCustomFileOverrides(): Promise<number> {
        let count = 0;
        const isFileKey = (key: string) => {
            if (key.startsWith('tag:') || key.startsWith('stack:') || key.startsWith('folder:')) return false;

            // if it exists in vault, verify it's a file 
            const abstract = this.app.vault.getAbstractFileByPath(key);
            if (abstract instanceof TFile) return true;
            if (abstract instanceof TFolder) return false;

            // if it's orphaned key (deleted file) guess by checking for an extension 
            const basename = key.split('/').pop() || '';
            return basename.includes('.');
        };

        for (const key of Object.keys(this.settings.customIcons)) {
            if (isFileKey(key)) {
                delete this.settings.customIcons[key];
                count++
            }
        }
        for (const key of Object.keys(this.settings.customColors)) {
            if (isFileKey(key)) {
                delete this.settings.customColors[key];
                count++
            }
        }
        if (count > 0) {
            await this.saveSettings();
            this.refreshAllViews();
        }
        return count;       
    }

    private refreshAllRecentTabs() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
            if (leaf.view instanceof PortalsView) {
                leaf.view.refreshRecentTab();
            }
        });
        this.refreshAltRightPanelContent('recent');
    }

    public async refreshTrashIfActive() {
        if (this.trashRefreshTimer) window.clearTimeout(this.trashRefreshTimer);
        this.trashRefreshTimer = window.setTimeout(() => {
            this.trashRefreshTimer = null;
            const promises: Promise<void>[] = [];
            // left
            this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                if (leaf.view instanceof PortalsView && leaf.view.plugin.settings.activeSplitTab === 'trash') {
                    promises.push(leaf.view.refreshTrashTab());
                }
            });
            // right
            if (this.settings.alternateActiveTab === 'trash') {
                this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL).forEach(leaf => {
                    if (leaf.view instanceof AltSidePanelView) {
                        promises.push(leaf.view.refreshContent());
                    }
                });
            }
            void Promise.all(promises);
        }, 150);
    }

    public refreshSidePortal(tabId: string): void {
        // left bottom panel
        if (this.settings.activeSplitTab === tabId) {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                if (leaf.view instanceof PortalsView) {
                    const sp = leaf.view.containerEl.querySelector('.portals-secondary-panel');
                    if (sp instanceof HTMLElement) {
                        void leaf.view.renderSplitTabContent(sp, tabId);
                    }
                }
            });
        }
        // right side panel
        if (this.settings.alternateActiveTab === tabId) {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL).forEach(leaf => {
                if (leaf.view instanceof AltSidePanelView) {
                    void leaf.view.refreshContent();
                }
            });
        }
    }

    refreshAllViews() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
            if (leaf.view instanceof PortalsView) {
                leaf.view.render();
            }
        });
    }


    // sidePanelEnabled is a global switch: the right-hand panel is a side portal
    // too, so turning side portals off closes it rather than leaving it running.
    private closeAltSidePanelsIfDisabled(): void {
        if (this.settings.sidePanelEnabled) return;
        this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL).forEach(leaf => {
            leaf.detach();
        });
    }

    // Rebuild the right panel's strip, not just its content: tab- and icon-level
    // settings are applied when the strip is built.
    public rebuildAltSidePanels(): void {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL)) {
            if (leaf.view instanceof AltSidePanelView) leaf.view.refresh();
        }
    }

    public getPortalsViews(): PortalsView[] {
        return this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)
            .map(leaf => leaf.view)
            .filter((view): view is PortalsView => view instanceof PortalsView);
    }

    public refreshAltRightPanelContent(tabId?: string): void {
        if (this.refreshAltRightPanelTimeout) {
            window.clearTimeout(this.refreshAltRightPanelTimeout);
        }
        this.refreshAltRightPanelTimeout = window.setTimeout(() => {
            this.refreshAltRightPanelTimeout = null;
            this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL).forEach(leaf => {
                if (leaf.view instanceof AltSidePanelView) {
                    if (tabId && leaf.view.activeTabId !== tabId) return;
                    const mainView = leaf.view.mainView;
                    if (mainView) {
                        const renderer = getContextRenderer(mainView);
                        if (renderer) renderer.saveScroll();
                    }
                    void leaf.view.refreshContent();
                }
            });
        }, 50);
    }

    async updateRecentFiles(filePath: string) {
        const maxRecent = 30;
        let recent = this.settings.recentFilesList || [];
        recent = recent.filter(p => p !== filePath);
        recent.unshift(filePath);
        if (recent.length > maxRecent) recent.pop();
        this.settings.recentFilesList = recent;
        await this.saveData(this.settings);
        this.refreshAllRecentTabs();
    }

    async updateRecentFilesOnRename(oldPath: string, newPath: string) {
        const recent = this.settings.recentFilesList || [];
        const index = recent.indexOf(oldPath);
        if (index !== -1) {
            recent[index] = newPath;
            this.settings.recentFilesList = recent;
            await this.saveData(this.settings);
            this.refreshAllRecentTabs();
        }
    }

    async removeRecentFile(path: string) {
        let recent = this.settings.recentFilesList || [];
        recent = recent.filter(p => p !== path);
        this.settings.recentFilesList = recent;
        await this.saveData(this.settings);
        this.refreshAllRecentTabs();
    }

    public updateReminderBadge(): void {
        let hasDue = false;
        for (const raw of this.reminderDates.values()) {
            const dateObj = parseLocalDate(raw);
            if (dateObj && getDaysDifference(dateObj) <= 0) {
                hasDue = true;
                break;
            }
        }
        const tabBtns = activeDocument.querySelectorAll('.portals-split-tab[data-tab-id="reminders"]');
        tabBtns.forEach(btn => {
            if (hasDue && this.settings.reminderTabNotification) {
                btn.addClass('has-reminder-due');
            } else {
                btn.removeClass('has-reminder-due');
            }
        });
    }

    private getTags(): Record<string, number> {
        return (this.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
    }

    private getSectionKeyForFile(file: TFile): string | null {
        if (!this.settings.enableSections) return null;
        const space = this.settings.selectedSpace;
        if (!space) return null;

        const compositeKey = `${space.type}:${space.path}`;
        const prefs = this.settings.spaceSectionPrefs[compositeKey];
        const criterion = prefs?.criterion ?? this.settings.sectionCriterion;

        if (criterion === 'extension') return file.extension || 'none';
        if (criterion === 'property') {
            const propName = prefs?.propertyName ?? this.settings.sectionPropertyName;
            if (!propName) return null;

            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const val = fm && typeof fm === 'object' && !Array.isArray(fm) ? (fm as Record<string, unknown>)[propName] : undefined;
            if (val === undefined || val === null) return 'none';
            if (Array.isArray(val)) return val.join(', ');
            return String(val);
        }
        return null;
    }

    async migrateTagNotes(): Promise<{ moved: number; skipped: number; errors: string[] }> {
        const oldPath = this.settings.previousTagNotesFolderPath;
        const newPath = this.settings.tagNotesFolderPath;

        if (oldPath === newPath) {
            new Notice('Old and new folder paths are the same. Nothing to migrate.');
            return { moved: 0, skipped: 0, errors: [] };
        }

        // Ensure new folder exists
        if (newPath && !this.app.vault.getAbstractFileByPath(newPath)) {
            await this.app.vault.createFolder(newPath);
        }

        const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
        if (!(oldFolder instanceof TFolder)) {
            new Notice(`Old folder "${oldPath}" not found. No notes to migrate.`);
            this.settings.previousTagNotesFolderPath = newPath;
            await this.saveSettings();
            return { moved: 0, skipped: 0, errors: [] };
        }

        // Helper to check if a file is a valid tag context note
        const isValidTagNote = (file: TFile): boolean => {
            const base = file.basename;
            // Reverse sanitization: '--' back to '/'
            const possibleTag = base.replace(/--/g, '/');
            const cache = this.app.metadataCache.getFileCache(file);
            const tags = getFrontmatterTags(cache);
            return tags.includes(possibleTag);
        };

        const allFiles = oldFolder.children.filter((c): c is TFile => c instanceof TFile && c.extension === 'md');
        const filesToMove = allFiles.filter(isValidTagNote);

        let moved = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const file of filesToMove) {
            const newFilePath = newPath ? `${newPath}/${file.name}` : file.name;
            const existing = this.app.vault.getAbstractFileByPath(newFilePath);
            if (existing) {
                skipped++;
                continue;
            }
            try {
                await this.app.vault.rename(file, newFilePath);
                moved++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`${file.name}: ${msg}`);
            }
        }

        // Update previous path to current
        this.settings.previousTagNotesFolderPath = newPath;
        await this.saveSettings();

        this.refreshAllViews();

        const ignored = allFiles.length - filesToMove.length;
        if (ignored > 0) {
            new Notice(`${ignored} non‑tag‑note file(s) left in "${oldPath}".`);
        }

        return { moved, skipped, errors };
    }

    public openSideTab(tabId: string) {
        const leftTabs = this.settings.splitViewTabs;
        const rightTabs = this.settings.alternateSideTabs;

        const isOnlyRight = rightTabs.includes(tabId) && !leftTabs.includes(tabId);

        if (isOnlyRight) {
            this.settings.alternateActiveTab = tabId;
            void this.saveSettings();

            void (async () => {
                let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL)[0];
                if (!leaf) {
                    const rightSplit = this.app.workspace.rightSplit;
                    if (rightSplit?.collapsed) rightSplit.expand();

                    let newLeaf = this.app.workspace.getRightLeaf(false);
                    if (!newLeaf) newLeaf = this.app.workspace.getRightLeaf(true);
                    if (!newLeaf) return;
                    leaf = newLeaf;
                    await leaf.setViewState({ type: VIEW_TYPE_ALT_SIDE_PANEL, active: true });
                }

                await this.app.workspace.revealLeaf(leaf);

                if (leaf.view instanceof AltSidePanelView) {
                    leaf.view.refresh();
                }
            })();
        } else {
            if (this.app.workspace.leftSplit.collapsed) {
                this.app.workspace.leftSplit.expand();
            }
            const mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
            if (mainLeaf) {
                void this.app.workspace.revealLeaf(mainLeaf);
            }

            this.settings.sidePanelEnabled = true;
            this.settings.secondaryPanelCollapsed = false;
            if (!leftTabs.includes(tabId)) {
                leftTabs.push(tabId);
            }
            this.settings.activeSplitTab = tabId;
            void this.saveSettings();

            this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                if (leaf.view instanceof PortalsView) {
                    leaf.view.render();
                }
            })
        }
    }

    public async switchToPortal(space: SpaceConfig): Promise<void> {
        this.settings.previousSelectedSpace = this.settings.selectedSpace
            ? { path: this.settings.selectedSpace.path, type: this.settings.selectedSpace.type }
            : null;

        this.settings.selectedSpace = { path: space.path, type: space.type };

        if (space.type === 'folder' && !this.settings.openFolders.includes(space.path)) {
            this.settings.openFolders.push(space.path);
        }

        if (space.stackId) {
            if (this.settings.stackAutoCollapse) {
                for (const stack of this.settings.portalStacks) {
                    if (stack.id !== space.stackId) {
                        stack.collapsed = true;
                    }
                }
            }
            const targetStack = this.settings.portalStacks.find(s => s.id === space.stackId);
            if (targetStack) {
                targetStack.collapsed = false;
            }
        }

        await this.activateView();
        await this.saveSettings();
    }

    // Add this to PortalsPlugin class:
    public promptForReminder(file: TFile) {
        new DatePickerModal(this.app, this, file, () => {
            // Refresh the reminders tab if it's open
            this.refreshSidePortal('reminders');
        }).open();
    }

    // ========== MANUAL CLEANUP ==========
    async cleanupDeadSpaces(): Promise<number> {
        const allFiles = this.app.vault.getAllLoadedFiles();
        const existingFolders = allFiles.filter(f => f instanceof TFolder).map(f => f.path);

        const tags = Object.keys(this.getTags());
        const beforeCount = this.settings.spaces.length;
        let changed = false;

        this.settings.spaces = this.settings.spaces.filter(space => {
            if (space.type === 'folder') {
                return existingFolders.includes(space.path);
            } else if (space.type === 'tag') {
                return tags.includes('#' + space.path);
            }
            return false;
        });
        if (beforeCount !== this.settings.spaces.length) changed = true;
        // Removing dead portals can strand stacks that no longer hold anything.
        if (this.pruneEmptyStacks()) changed = true;

        const beforeFoldersCount = this.settings.openFolders.length;
        this.settings.openFolders = this.settings.openFolders.filter(path => existingFolders.includes(path));
        if (beforeFoldersCount !== this.settings.openFolders.length) changed = true;

        if (this.settings.selectedSpace) {
            const stillExists = this.settings.spaces.some(s => 
                s.path === this.settings.selectedSpace!.path && 
                s.type === this.settings.selectedSpace!.type
            );
            if (!stillExists) {
                this.settings.selectedSpace = this.settings.spaces[0] 
                    ? { path: this.settings.spaces[0].path, type: this.settings.spaces[0].type }
                    : null;
                changed = true;
            }
        }

        const existingTagPaths = new Set(this.settings.spaces.filter(s => s.type === 'tag').map(s => s.path));
        for (const tagPath in this.settings.expandedGroups) {
            if (!existingTagPaths.has(tagPath)) {
                delete this.settings.expandedGroups[tagPath];
                changed = true;
            }
        }

        for (const key of Object.keys(this.settings.customIcons)) {
            if (key.startsWith('tag:') && key.includes('/group:')) {
                const parts = key.split('/');
                if (parts.length < 2) continue;
                const mainTagPart = parts[0];
                if (!mainTagPart?.startsWith('tag:')) continue;
                const mainTag = mainTagPart.slice(4);
                
                if (!existingTagPaths.has(mainTag)) {
                    delete this.settings.customIcons[key];
                    changed = true;
                }
            }
        }

        if (changed) {
            await this.saveSettings();
        }
        return beforeCount - this.settings.spaces.length;
    }

    async cleanupDeadHiddenItems(): Promise<number> {
        const hidden = this.settings.hiddenItems;
        let removed = 0;
        const tagsMap = (this.app.metadataCache as unknown as { getTags(): Record< string, number> }).getTags();
        const existingTags = new Set(Object.keys(tagsMap).map(t => t.slice(1)));
        
        for (const key of Object.keys(hidden)) {
            if (key.startsWith('tag:')) {
                const afterPrefix = key.slice(4);
                if (afterPrefix.includes('/group:')) {
                    const mainTag = afterPrefix.split('/')[0];
                    if (mainTag && !existingTags.has(mainTag)) {
                        delete this.settings.hiddenItems[key];
                        removed++;
                    }
                } else if (afterPrefix.includes('/node:')) {
                    const fulltagPath = afterPrefix.split('/node:')[1];
                    if (fulltagPath && !existingTags.has(fulltagPath)) {
                        delete this.settings.hiddenItems[key];
                        removed++
                    }
                } else {
                    if (!existingTags.has(afterPrefix)) {
                        delete this.settings.hiddenItems[key];
                        removed++;
                    }
                }
            } else {
                if (!this.app.vault.getAbstractFileByPath(key)) {
                    delete this.settings.hiddenItems[key];
                    removed++
                }
            }
        }
        if (removed > 0) {
            await this.saveSettings();
            this.refreshAllViews();
            this.refreshAltRightPanelContent('hidden');
        }
        return removed;
    }

    async performAutoBackup(): Promise<void> {
        if (this.backupInProgress) return;
        this.backupInProgress = true;
        try {
            const deviceEnabled = getLocalItem('portals-backup-device-enabled');
            if (deviceEnabled === 'false') return;
            
            const srcPath = normalizePath(this.app.vault.configDir + '/plugins/portals/data.json');
            if (!(await this.app.vault.adapter.exists(srcPath))) {
                console.warn('Portals: data.json not found for backup');
                return;
            }

            const folderPath = this.settings.backupFolderPath.trim() || '/';
            const normalizedFolder = normalizePath(folderPath);

            // Ensure folder exists – skip if already there
            if (normalizedFolder !== '/') {
                const folderExists = await this.app.vault.adapter.exists(normalizedFolder);
                if (!folderExists) {
                    try {
                        await this.app.vault.createFolder(normalizedFolder);
                    } catch {
                        // Creation failed – maybe permissions, maybe race – continue anyway
                    }
                }
            }

            // 1. Create the new backup
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            const backupFileName = `portals-backup-${ts}.json`;
            const destPath = normalizePath(`${normalizedFolder}/${backupFileName}`);

            try {
                const content = await this.app.vault.adapter.read(srcPath);
                await this.app.vault.create(destPath, content);
                console.debug(`Portals: settings backed up to ${destPath}`);
            } catch (err) {
                console.error('Portals: auto backup create failed', err);
                new Notice('Portals: Auto backup failed – check console.');
                return;
            }

            // 2. Rotate – keep only the last 3
            try {
                const { files } = await this.app.vault.adapter.list(normalizedFolder);
                const backupFiles = files
                    .filter(f => f.endsWith('.json') && f.split('/').pop()?.startsWith('portals-backup-'))
                    .sort((a, b) => a.localeCompare(b));   // oldest first

                while (backupFiles.length > 3) {
                    const oldest = backupFiles.shift()!;
                    try {
                        await this.app.vault.adapter.remove(oldest);
                    } catch {
                        // File might already be gone – ignore
                    }
                }
            } catch (err) {
                console.error('Portals: backup rotation failed', err);
            }
        } finally {
            this.backupInProgress = false;
        }
    }

    async resetPreviewPreferences(): Promise<number> {
        const count = Object.keys(this.settings.previewExcludedFiles).length;
        this.settings.previewExcludedFiles = {};
        await this.saveSettings();
        return count;
    }

    async cleanupOrphanedSettingsFields(): Promise<string[]> {
        const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
        const orphaned: string[] = [];
        for (const key of Object.keys(this.settings)) {
            if (!knownKeys.has(key)) {
                orphaned.push(key);
            }
        }
        if (orphaned.length > 0) {
            for (const key of orphaned) {
                delete (this.settings as unknown as Record<string, unknown>)[key];
            }
            await this.saveSettings();
        }
        return orphaned;
    }

    async migrateReminderProperty(): Promise<number> {
        const oldProp = this.settings.previousReminderProperty;
        const newProp = this.settings.reminderProperty;

        if (!oldProp) {
            new Notice('No previous property found. Change property name first, then click Migrate.');
            return 0;
        }
        if (oldProp === newProp) {
            new Notice('Current and previous properties are the same. Nothing to migrate.');
            return 0;
        }
        let count = 0;
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const oldValue = fm?.[oldProp];
            
            if (oldValue !== undefined && oldValue !== null) {
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                    if (fm[newProp] === undefined) {
                        fm[newProp] = oldValue;
                        count++
                    }
                    delete fm[oldProp];
                });
            }
        }
        this.settings.previousReminderProperty = '';
        await this.saveSettings();
        // The map is built from frontmatter at load; migrating properties leaves
        // it stale, which is why the panel showed only part of the list.
        this.rebuildReminderDatesCache();
        this.refreshSidePortal('reminders');
        this.updateReminderBadge();
        FrontmatterClinicRenderer.resetCache();
        void FrontmatterClinicRenderer.buildCache(this.app);
        if (count === 0) {
            new Notice('No reminders found to migrate (or files already have the new property name).');
        }
        return count;
    }
}