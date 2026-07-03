import { Plugin, TFolder, TFile, Notice, normalizePath, App } from 'obsidian';
import { PortalsView, VIEW_TYPE_PORTALS } from './view';
import { SpacesSettings, DEFAULT_SETTINGS, SpacesSettingTab } from './settings';
import { FrontmatterClinicRenderer } from './renderers/frontmatterClinic';
import { getFrontmatterTags } from './utils/tagHelpers';
import { registerAllCommands } from './utils/commands';
import { LucideIconProvider } from './icons/LucideIconProvider';
import { PhosphorIconProvider } from './icons/phosphorIconProvider';
import { IconProvider } from './icons/iconProvider';
import { setPluginInstance } from './utils/Proxies/pluginInstance';
import { getLocalItem } from './utils/Proxies/storageProxy';
import { AltSidePanelView, VIEW_TYPE_ALT_SIDE_PANEL } from './renderers/RightSideView';
import { InternalPluginsWithBookmarks } from './types';
import { getContextRenderer } from './renderers/sidePanelContent';

interface AppWithInternalPlugins extends App {
    internalPlugins: unknown;
}

export default class PortalsPlugin extends Plugin {
    settings!: SpacesSettings;
    lucideProvider = new LucideIconProvider;
    phosphorProvider = new PhosphorIconProvider;
    private bookmarksListenerRef: (() => void) | null = null;
    private refreshAltRightPanelTimeout: number | null = null;

    async onload() {
        setPluginInstance(this);
        await this.loadSettings();
        registerAllCommands(this);

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
            if (this.settings.enableAutoBackup) {
                window.setTimeout(() => {
                    this.performAutoBackup().catch(err => {
                        console.error('Portals: auto backup failed silently', err);
                        new Notice('Portals: Auto backup failed - check console.');
                    });
                }, 100);
            }
        });

        // Forward frontmatter cache updates (no startup cost)
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                FrontmatterClinicRenderer.updateFileCache(this.app, file);
                this.refreshAllTreeContent();
            }
        }));
        this.registerEvent(this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                window.setTimeout(() => FrontmatterClinicRenderer.updateFileCache(this.app, file), 100);
                this.refreshAllViews();
            }
            void this.refreshTrashIfActive();
        }));
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                FrontmatterClinicRenderer.removeFileCache(file.path);
                this.refreshAllViews();
            }
            void this.refreshTrashIfActive();
        }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                FrontmatterClinicRenderer.removeFileCache(oldPath);
                FrontmatterClinicRenderer.updateFileCache(this.app, file);
                this.refreshAllViews();
            }
            void this.refreshTrashIfActive();

            if (this.settings.hiddenItems[oldPath]) {
                this.settings.hiddenItems[file.path] = true;
                delete this.settings.hiddenItems[oldPath];
                void this.saveSettings();
            }

            if (file instanceof TFolder && this.settings.hiddenItems[oldPath]) {
                this.settings.hiddenItems[file.path] = true;
                delete this.settings.hiddenItems[oldPath];
                void this.saveSettings();
            }
        }));

        // Ensure the selected space (if it's a folder) is in openFolders
        const selectedSpace = this.settings.spaces.find(s => 
            s.path === this.settings.selectedSpace?.path && 
            s.type === this.settings.selectedSpace?.type
        );
        if (selectedSpace && selectedSpace.type === 'folder') {
            if (!this.settings.openFolders.includes(selectedSpace.path)) {
                this.settings.openFolders.push(selectedSpace.path);
                await this.saveSettings();
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

        // If replaceFileExplorer is enabled, set up the left sidebar
        if (this.settings.replaceFileExplorer) {
            this.app.workspace.onLayoutReady(() => {
                void this.setupLeftSidebar();
            });
        }

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

        // Track file rename
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile) {
                void this.updateRecentFilesOnRename(oldPath, file.path);
                if (this.settings.journalFolderPath && file.path.startsWith(this.settings.journalFolderPath)) {
                    const marks = this.settings.markedJournalNotes;
                    const index = marks.indexOf(oldPath);
                    if (index !== -1) {
                        marks[index] = file.path;
                        void this.saveSettings();
                    }
                }
                if (this.settings.hiddenItems[oldPath]) {
                    this.settings.hiddenItems[file.path] = true;
                    delete this.settings.hiddenItems[oldPath];
                    void this.saveSettings();
                }
            }
        }));

        // Track file delete
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFile) {
                void this.removeRecentFile(file.path);
                const marks = this.settings.markedJournalNotes;
                const index = marks.indexOf(file.path);
                if (index !== -1) {
                    marks.splice(index, 1);
                    void this.saveSettings();
                }
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
    public getProviderForLibrary(library: 'phosphor' | 'lucide'): IconProvider {
        return library === 'lucide' ? this.lucideProvider : this.phosphorProvider;
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
            if (library === 'phosphor' || library === 'lucide') {
                const provider = this.getProviderForLibrary(library);           
                provider.renderIcon(element, iconName);
                return;
            }
        } 
        this.renderPluginIcon(element, stored);   
    }

    onunload() { 
        setPluginInstance(null);
        FrontmatterClinicRenderer.resetCache();
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

        // === NEW: Migrate existing plain paths to composite keys ===
        if (this.settings.tabBarOrder && this.settings.tabBarOrder.length > 0) {
            const convertedOrder: string[] = [];
            let needsConversion = false;
            for (const entry of this.settings.tabBarOrder) {
                if (entry.startsWith('stack:')) {
                    convertedOrder.push(entry);
                } else if (!entry.includes(':')) {
                    // Plain path – find matching portal (first unstacked)
                    const space = this.settings.spaces.find(s => s.path === entry && !s.stackId);
                    if (space) {
                        convertedOrder.push(`${space.type}:${space.path}`);
                        needsConversion = true;
                    }
                    // If no space found, skip (portal was deleted)
                } else {
                    convertedOrder.push(entry);
                }
            }
            if (needsConversion) {
                this.settings.tabBarOrder = convertedOrder;
                await this.saveSettings();
            }
        }

        // Migrate icons to new managemenet using compositeKey for spaces and clean up of old 
        const FOLDER_DEFAULT = 'folder-simple';
        const TAG_DEFAULT = 'tag';
        const STACK_DEFAULT = 'stack';
        let needsSave = false;

        // migrate space icons
        for (const space of this.settings.spaces) {
            const compositeKey = `${space.type}:${space.path}`;
            const defaulIcon = space.type === 'folder' ? FOLDER_DEFAULT : TAG_DEFAULT;
            if (space.icon && space.icon !== defaulIcon) {
                if (!this.settings.customIcons[compositeKey]) {
                    this.settings.customIcons[compositeKey] = space.icon;
                }
                space.icon = defaulIcon;
                needsSave = true;
            }
            // clean olf plain-paths like ('/') 
            const oldKey = space.path;
            if (this.settings.customIcons[oldKey]) {
                if (!this.settings.customIcons[compositeKey]) {
                    this.settings.customIcons[compositeKey] = this.settings.customIcons[oldKey];
                }
                //delete this.settings.customIcons[oldKey];
                needsSave = true;
            }
        }
        // migrate stack icons
        for (const stack of this.settings.portalStacks) {
            const stackKey = `stack:${stack.id}`;
            if (stack.icon && stack.icon !== STACK_DEFAULT) {
                if (!this.settings.customIcons[stackKey]) {
                    this.settings.customIcons[stackKey] = stack.icon;
                }
                stack.icon = STACK_DEFAULT;
                needsSave = true;
            }
        }
        // remove any other bare-path customicons
        /*for (const key of Object.keys(this.settings.customIcons)) {
            if (!key.includes(':')) {
                const matchingSpace = this.settings.spaces.find(s => s.path === key);
                if (matchingSpace) {
                    delete this.settings.customIcons[key];
                }
            }
        }*/
        if (needsSave) {
            await this.saveSettings();
        }

        // for custom user icons
        if (!this.settings.customIconPhosphorMigrationDone) {
            const fixed: Record<string, string> = {};
            for (const [key, value] of Object.entries(this.settings.customIcons)) {
                if (!value.includes(':')) {
                    fixed[key] = `phosphor:${value}`;
                } else {
                    fixed[key] = value;
                }
            }
            this.settings.customIcons = fixed;
            this.settings.customIconPhosphorMigrationDone = true;
            await this.saveSettings();
        }
        

        // Clean up orphaned stacks on load
        const referencedStackIds = new Set(this.settings.spaces.map(s => s.stackId).filter(id => id !== undefined));
        this.settings.portalStacks = this.settings.portalStacks.filter(stack => referencedStackIds.has(stack.id));

        // for tag notes migration (user enabled)
        if (!this.settings.previousTagNotesFolderPath) {
            this.settings.previousTagNotesFolderPath = this.settings.tagNotesFolderPath;
        }
        
        // Migrate old selectedSpace (string) to new object format (edge case if a very old user opens portals to newer versions)
        if (typeof this.settings.selectedSpace === 'string') {
            const oldPath = this.settings.selectedSpace;
            const matchingSpace = this.settings.spaces.find(s => s.path === oldPath);
            if (matchingSpace) {
                this.settings.selectedSpace = {
                    path: matchingSpace.path,
                    type: matchingSpace.type
                };
            } else {
                this.settings.selectedSpace = null;
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
            if (leaf.view instanceof PortalsView) {
                const treeContainer = leaf.view.containerEl.querySelector('.portals-tree-container');
                if (treeContainer) {
                    leaf.view.scrollToRestore = treeContainer.scrollTop;
                }
                leaf.view.render();
                if (leaf.view.plugin.settings.activeSplitTab === 'journal') {
                    void leaf.view.refreshJournalTab();
                }
            }
        });
        this.refreshAltRightPanelContent('context-notes');
    }

    async activateView() {
        const { workspace } = this.app;
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

    async setupLeftSidebar() {
        const { workspace } = this.app;

        // First, try to find an existing Portals leaf in the left sidebar
        const leftSidebar = workspace.leftSplit;
        const existingLeaf = workspace.getLeavesOfType(VIEW_TYPE_PORTALS).find(leaf =>
            leaf.getRoot() === leftSidebar
        );
        if (existingLeaf) {
            // If one exists, just reveal it
            //void workspace.revealLeaf(existingLeaf);
            return;
        }
        // Otherwise, create a new leaf in the left sidebar
        const newLeaf = workspace.getLeftLeaf(false);
        if (!newLeaf) return;
        await newLeaf.setViewState({ type: VIEW_TYPE_PORTALS, active: true });
        //void workspace.revealLeaf(newLeaf);
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
        await Promise.all(promises);
    }

    refreshAllViews() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
            if (leaf.view instanceof PortalsView) {
                leaf.view.render();
            }
        });
    }

    private refreshAllTreeContent() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
            if (leaf.view instanceof PortalsView) {
                leaf.view.renderContent();
            }
        });
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

    private getTags(): Record<string, number> {
        return (this.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
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
            const rightSplit = this.app.workspace.rightSplit;
            if (rightSplit?.collapsed) rightSplit.expand();

            let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL)[0];
            if (!leaf) {
                const candidate = this.app.workspace.getRightLeaf(false);
                if (candidate) {
                    leaf = candidate;
                } else {
                    const fallback = this.app.workspace.getRightLeaf(true);
                    if (fallback) leaf = fallback;
                }
                if (leaf) {
                    void leaf.setViewState({ type: VIEW_TYPE_ALT_SIDE_PANEL, active: true });
                } else {
                    return;
                }
            }
            this.settings.alternateActiveTab = tabId;
            void this.saveSettings();
            if (leaf?.view instanceof AltSidePanelView) {
                leaf.view.refresh();
            }
        } else {
            this.settings.sidePanelEnabled = true;
            this.settings.secondaryPanelCollapsed = false;
            if (!leftTabs.includes(tabId)) {
                leftTabs.push(tabId);
            }
            this.settings.activeSplitTab = tabId;
            this.saveSettings();

            this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                if (leaf.view instanceof PortalsView) {
                    leaf.view.render();
                }
            })
        }
    }

    // ========== MANUAL CLEANUP ==========
    async cleanupDeadSpaces(): Promise<number> {
        const allFiles = this.app.vault.getAllLoadedFiles();
        const existingFolders = allFiles.filter(f => f instanceof TFolder).map(f => f.path);

        const tags = Object.keys(this.getTags());
        const beforeCount = this.settings.spaces.length;
        this.settings.spaces = this.settings.spaces.filter(space => {
            if (space.type === 'folder') {
                return existingFolders.includes(space.path);
            } else if (space.type === 'tag') {
                return tags.includes('#' + space.path);
            }
            return false;
        });

        this.settings.openFolders = this.settings.openFolders.filter(path => existingFolders.includes(path));

        if (this.settings.selectedSpace) {
            const stillExists = this.settings.spaces.some(s => 
                s.path === this.settings.selectedSpace!.path && 
                s.type === this.settings.selectedSpace!.type
            );
            if (!stillExists) {
                this.settings.selectedSpace = this.settings.spaces[0] 
                    ? { path: this.settings.spaces[0].path, type: this.settings.spaces[0].type }
                    : null;
            }
        }

        const existingTagPaths = new Set(this.settings.spaces.filter(s => s.type === 'tag').map(s => s.path));
        for (const tagPath in this.settings.expandedGroups) {
            if (!existingTagPaths.has(tagPath)) {
                delete this.settings.expandedGroups[tagPath];
            }
        }

        for (const key of Object.keys(this.settings.customIcons)) {
            if (key.startsWith('tag:') && key.includes('/groups:')) {
                const parts = key.split('/')
                if (parts.length < 2) continue;
                const mainTagPart = parts[0];
                if (!mainTagPart?.startsWith('tag:')) continue;
                const mainTag = mainTagPart.slice(4);
                if (!existingTagPaths.has(mainTag)) {
                    delete this.settings.customIcons[key];
                }
            }
        }

        if (beforeCount !== this.settings.spaces.length) {
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
    }
}