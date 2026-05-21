import { Plugin, TFolder, TFile, Notice } from 'obsidian';
import { PortalsView, VIEW_TYPE_PORTALS } from './view';
import { SpacesSettings, DEFAULT_SETTINGS, SpacesSettingTab } from './settings';
import { FrontmatterClinicRenderer } from './renderers/frontmatterClinic';
import { getGuideUrl } from './utils/urls';
import { getFrontmatterTags } from './utils/tagHelpers';

export default class PortalsPlugin extends Plugin {
    settings!: SpacesSettings;

    async onload() {
        await this.loadSettings();

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
        }));
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                FrontmatterClinicRenderer.removeFileCache(file.path);
                this.refreshAllViews();
            }
        }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                FrontmatterClinicRenderer.removeFileCache(oldPath);
                FrontmatterClinicRenderer.updateFileCache(this.app, file);
                this.refreshAllViews();
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

        this.addCommand({
            id: 'open-portal-view',
            name: 'Open Explorer',
            callback: () => {
                void this.activateView();
            }
        });

        this.addCommand({
            id: 'add-portal-tab',
            name: 'Add portal tab',
            callback: () => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
                if (leaf && leaf.view instanceof PortalsView) {
                    leaf.view.showAddPortalModal();
                } else {
                    new Notice('Please open the Portals view first.');
                }
            }
        });
        this.addCommand({
            id: 'remove-portal-tab',
            name: 'Remove-portal-tab',
            callback: () => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
                if (leaf && leaf.view instanceof PortalsView) {
                    leaf.view.showRemovePortalModal();
                } else {
                    new Notice('Please open the Portal view first.');
                }
            }
        });

        this.addCommand({
            id: 'configure-side-portal',
            name: 'Configure side portal tabs',
            callback: () => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
                if (leaf && leaf.view instanceof PortalsView) {
                    leaf.view.showSidePortalConfig();
                } else {
                    new Notice('Please open the Portals view first.');
                }
            }
        });
        
        this.addCommand({
            id: 'reorder-portal-items',
            name: 'Reorder folders/tags',
            callback: () => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
                if (!leaf || !(leaf.view instanceof PortalsView)) {
                    new Notice('Please open the Portals view first.');
                    return;
                }
                const space = leaf.view.plugin.settings.selectedSpace;
                if (!space) return;

                if (space.type === 'folder') {
                    leaf.view.reorderFolderChildren(space.path);
                } else if (space.type === 'tag') {
                    leaf.view.reorderTagChildren(space.path);
                }
            }
        });

        this.addCommand({
            id: 'bulk-frontmatter',
            name: 'Bulk frontmatter edit',
            callback: () => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
                if (leaf?.view instanceof PortalsView) {
                    leaf.view.showBulkFrontmatterModal();
                } else {
                    new Notice('Please open the Portals view first.');
                }
            }
        });

        this.addCommand({
            id: 'open-guide',
            name: 'Open guide',
            callback: () => {
                window.open(getGuideUrl(), '_blank');
            },
        });

        this.addCommand({
            id: 'enable-sections',
            name: 'Enable sections in explorer',
            callback: () => {
                this.settings.enableSections = !this.settings.enableSections
                    this.saveSettings();
            },
        })

        this.registerView(
            VIEW_TYPE_PORTALS,
            (leaf) => new PortalsView(leaf, this)
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

    onunload() { 
        FrontmatterClinicRenderer.resetCache();
    }

        async loadSettings() {
        const data = (await this.loadData()) as Record<string, unknown> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});

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
                    convertedOrder.push(entry); // already composite
                }
            }
            if (needsConversion) {
                this.settings.tabBarOrder = convertedOrder;
                await this.saveSettings(); // save the upgraded order
            }
        }


        // Clean up orphaned stacks on load
        const referencedStackIds = new Set(this.settings.spaces.map(s => s.stackId).filter(id => id !== undefined));
        this.settings.portalStacks = this.settings.portalStacks.filter(stack => referencedStackIds.has(stack.id));
        


        if (!this.settings.previousTagNotesFolderPath) {
            this.settings.previousTagNotesFolderPath = this.settings.tagNotesFolderPath;
        }
        
        // Migrate old selectedSpace (string) to new object format
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
        
        // Migrate old spaces (pre-type) to have type 'folder'
        if (this.settings.spaces) {
            this.settings.spaces.forEach(space => {
                if (!space.type) {
                    space.type = 'folder';
                }
            });
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
            void workspace.revealLeaf(existingLeaf);
            return;
        }

        // Otherwise, create a new leaf in the left sidebar
        const newLeaf = workspace.getLeftLeaf(false);
        if (!newLeaf) return;
        await newLeaf.setViewState({ type: VIEW_TYPE_PORTALS, active: true });
        void workspace.revealLeaf(newLeaf);
    }

    private refreshAllRecentTabs() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
            if (leaf.view instanceof PortalsView) {
                leaf.view.refreshRecentTab();
            }
        });
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

    async updateRecentFiles(filePath: string) {
        const maxRecent = 20;
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

    // ========== MANUAL CLEANUP ==========
    async cleanupDeadSpaces(): Promise<number> {
        // Get all existing folder paths
        const allFiles = this.app.vault.getAllLoadedFiles();
        const existingFolders = allFiles.filter(f => f instanceof TFolder).map(f => f.path);

        // Get all existing tags (as strings with '#')
        const tags = Object.keys(this.getTags());
        // Filter spaces
        const beforeCount = this.settings.spaces.length;
        this.settings.spaces = this.settings.spaces.filter(space => {
            if (space.type === 'folder') {
                return existingFolders.includes(space.path);
            } else if (space.type === 'tag') {
                return tags.includes('#' + space.path);
            }
            return false;
        });

        // Clean up openFolders
        this.settings.openFolders = this.settings.openFolders.filter(path => existingFolders.includes(path));

        // Adjust selected space if it's gone
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

        // Clean up expandedGroups for deleted tag portals
        const existingTagPaths = new Set(this.settings.spaces.filter(s => s.type === 'tag').map(s => s.path));
        for (const tagPath in this.settings.expandedGroups) {
            if (!existingTagPaths.has(tagPath)) {
                delete this.settings.expandedGroups[tagPath];
            }
        }

        // cleanup customicons for remove tag groups in tag portals
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

        // Save if anything changed
        if (beforeCount !== this.settings.spaces.length) {
            await this.saveSettings();
        }
        return beforeCount - this.settings.spaces.length; // number removed
    }
}