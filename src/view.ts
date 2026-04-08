import { ItemView, WorkspaceLeaf, TFile, TFolder, TAbstractFile, Menu, Notice, Platform, Component, debounce, View } from 'obsidian';
import PortalsPlugin from './main';
import Sortable, { SortableEvent } from 'sortablejs';
import { SpaceConfig } from './settings';
import { MarkdownRenderer } from 'obsidian';
import { GroupTagsModal } from './settings';
import { JournalRenderer } from './journalView';
import { IconPickerModal } from './iconPicker';

interface BookmarkItem {
    title?: string;
    path?: string;
    url?: string;
    type?: string;
    id?: string;
    children?: BookmarkItem[];
}

const MIN_EXPANDED_HEIGHT = 150;
const SIDE_TAB_ICONS: Record<string, string> = {
    recent: 'clock-counter-clockwise',
    'folder-notes': 'note',
    bookmarks: 'bookmark',
    journal: 'calendar-heart',
};

export const VIEW_TYPE_PORTALS = 'portals-view';

export class PortalsView extends ItemView {
    plugin: PortalsPlugin;
    private lastRenderHash: string = '';
    private tooltipEl: HTMLElement | null = null;
    private tooltipTimeout: number | null = null;
    private tooltipShowTimeout: number | null = null;
    private vaultEventRef: (() => void) | null = null;
    private renaming: boolean = false;
    private selectedFiles: Set<string> = new Set();
    private isDraggingSplitter: boolean = false;
    private contextMenuFiredMap = new WeakMap<HTMLElement, boolean>();
    private currentSecondaryPanel: HTMLElement | null = null;
    private currentSplitter: HTMLElement | null = null;
    private sortableInstance: Sortable | null = null;
    private folderNoteEventRefs: Array<unknown> | null = null;
    private bookmarksListenerRef: unknown = null;
    private renderTimer: number | null = null;
    private folderNoteCache = new Map<string, { element: HTMLElement; component: Component }>();
    private folderNoteAccessOrder: string[] = [];
    private readonly MAX_FOLDER_NOTE_CACHE = 10;
    private folderNoteScrollPositions = new Map<string, number>();
    private fileElementMap = new Map<string, HTMLElement>();
    private journalRenderer: JournalRenderer | null = null;
    private journalFolderPath: string = '';
    private journalContainer: HTMLElement | null = null;
    private lastJournalAccentColor: string | null = null;
    private scrollToRestore: number | null = null;
    private getTagGroupKey(mainTag: string, groupTag: string): string {
        return `tag:${mainTag}/group:${groupTag}`;
    }
    public async refreshJournalTab() {
        const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
        if (!secondaryPanel) return;
        if (this.plugin.settings.activeSplitTab === 'journal') {
            const currentFolderPath = this.plugin.settings.journalFolderPath;
            // compute current accent color from root vault
            const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
            const tabColorEnabled = this.plugin.settings.tabColorEnabled;
            const currentColor = (tabColorEnabled && rootSpace && rootSpace.color !== 'transparent') ? rootSpace.color : null;
            // Determine if we need to refresh
            const folderChanged = (this.journalFolderPath !== currentFolderPath);
            const colorChanged = (currentColor !== this.lastJournalAccentColor);

            if (folderChanged || colorChanged) {
                // Update cache
                this.journalFolderPath = currentFolderPath;
                this.lastJournalAccentColor = currentColor;
                // Only invalidate if folder path has changed
                if (this.journalFolderPath !== currentFolderPath) {
                    if (this.journalRenderer) {
                        this.journalRenderer.destroy();
                        this.journalRenderer = null;
                    }
                    this.journalRenderer = null;
                    this.journalContainer = null;
                    this.journalFolderPath = currentFolderPath;
                    await this.renderSplitTabContent(secondaryPanel as HTMLElement, 'journal');
                } else if (this.journalRenderer) {
                    void this.journalRenderer.render();
                }
            }
        }
    }

    private createFileItem(file: TFile, container: HTMLElement, openFiles: Set<string>) {
        const fileEl = container.createDiv({ cls: 'file-item' });
        const customIcon = this.getCustomIcon(file.path);
        const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        iconSpan.createEl('i', { cls: fileIconClass });
        const nameSpan = fileEl.createSpan({ text: this.getDisplayName(file) });
        nameSpan.addClass('portals-item-name');
        fileEl.dataset.path = file.path;

        const isOpen = openFiles.has(file.path);
        let openDotSpan: HTMLSpanElement | null = null;
        if (isOpen) openDotSpan = fileEl.createSpan({ cls: 'open-dot' });

        if (this.plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md') {
            const extSpan = fileEl.createSpan({ cls: 'file-extension' });
            extSpan.setText('.' + file.extension.toUpperCase());
            if (openDotSpan) openDotSpan.style.display = 'none';
            if (isOpen) extSpan.addClass('is-open');
        }

        if (!Platform.isMobile) {
            fileEl.draggable = true;
            fileEl.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', file.path);
            });
        }

        fileEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.altKey) {
                e.preventDefault();
                if (this.selectedFiles.has(file.path)) {
                    this.selectedFiles.delete(file.path);
                    fileEl.removeClass('is-selected');
                } else {
                    this.selectedFiles.add(file.path);
                    fileEl.addClass('is-selected');
                }
            } else {
                void this.app.workspace.getLeaf().openFile(file);
            }
        });

        fileEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showFileContextMenu(e, file, fileEl);
        });
        this.fileElementMap.set(file.path, fileEl);
        return fileEl;
    }

    private getCustomIcon(path: string): string | null {
        return this.plugin.settings.customIcons[path] || null;
    }

    private async setCustomIcon(path: string, displayName: string) {
        new IconPickerModal(this.app, (iconName) => {
            this.plugin.settings.customIcons[path] = iconName;
            this.plugin.saveSettings().then(() => {
                // capture scroll position
                const treeContainer = this.containerEl.querySelector('.portals-tree-container');
                if (treeContainer) {
                    this.scrollToRestore = treeContainer.scrollTop;
                }
                this.renderContent();
                new Notice(`Icon set for ${displayName}`);
            });
        }).open();
    }

    private async removeCustomIcon(path: string) {
        delete this.plugin.settings.customIcons[path];
        await this.plugin.saveSettings();
        // capture scroll position
        const treeContainer = this.containerEl.querySelector('.portal-tree-container');
        if (treeContainer) {
            this.scrollToRestore = treeContainer.scrollTop;
        }
        this.renderContent();
        new Notice('Custom icon removed');
    }

    private async setCustomIconForTagGroup(mainTag: string, groupTag: string, groupKey: string) {
        const displayName = `#${groupTag}`;
        new IconPickerModal(this.app, (iconName) => {
            this.plugin.settings.customIcons[groupKey] = iconName;
            this.plugin.saveSettings().then(() => {
                this.renderContent();
                new Notice(`Icon set for group ${displayName}`);
            });
        }).open();
    }

    private async removeCustomIconForTagGroup(groupKey: string) {
        delete this.plugin.settings.customIcons[groupKey];
        await this.plugin.saveSettings();
        this.renderContent();
        new Notice('Custom icon removed');
    }

    private isFileInJournalFolder(file: TFile): boolean {
        const folderPath = this.plugin.settings.journalFolderPath;
        if (!folderPath) return false;
        return file.path.startsWith(folderPath);
    }

    private getCurrentFolderNote(): TFile | null {
        const selectedSpace = this.plugin.settings.selectedSpace;
        if (!selectedSpace || selectedSpace.type !== 'folder') return null;
        if (selectedSpace.path === '/') {
            const vaultName = this.app.vault.getName();
            const rootNotePath = vaultName + '.md';
            const file = this.app.vault.getAbstractFileByPath(rootNotePath);
            return file instanceof TFile ? file : null;
        } else {
            const folder = this.app.vault.getAbstractFileByPath(selectedSpace.path);
            if (!(folder instanceof TFolder)) return null;
            return folder.children.find((child): child is TFile =>
                child instanceof TFile && this.isFolderNote(child, folder)
            ) ?? null;
        }
    }

    private async handleFolderNoteCreation(folder: TFolder) {
        const existingNote = this.getFolderNote(folder);
        if (existingNote) {
            new Notice('Folder note already exists', 3000);
            return;
        }
        await this.createFolderNote(folder);
    }

    private isFileView(view: View): view is View & { file: TFile } {
        return 'file' in view && (view as { file?: unknown }).file instanceof TFile;
    }

    private getOpenFilePaths(): Set<string> {
        const openFiles = new Set<string>();
        const viewTypes = ['markdown', 'canvas', 'image', 'pdf', 'audio', 'video', 'bases', 'fountain', 'excalidraw'];
        for (const type of viewTypes) {
            for (const leaf of this.app.workspace.getLeavesOfType(type)) {
                if (this.isFileView(leaf.view)) {
                    openFiles.add(leaf.view.file.path);
                }
            }
        }
        return openFiles;
    }

    private invalidateFolderNoteCache(file: TFile) {
        this.folderNoteCache.delete(file.path);
        const idx = this.folderNoteAccessOrder.indexOf(file.path);
        if (idx !== -1) this.folderNoteAccessOrder.splice(idx, 1);
    }

    private toggleFloatingButtonsCollapse(e: MouseEvent) {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        el.blur();

        // save scroll position of file tree
        const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement;
        const scrollPos = treeContainer ? treeContainer.scrollTop: 0;

        this.plugin.settings.floatingButtonsCollapsed = !this.plugin.settings.floatingButtonsCollapsed;
        void this.plugin.saveData(this.plugin.settings).then(() => {
            this.render();
            // restore scroll after render
            if (treeContainer) {
                requestAnimationFrame(() => {
                    const newTree = this.containerEl.querySelector('.portals-tree-container') as HTMLElement;
                    if (newTree) newTree.scrollTop = scrollPos;
                });
            }
        });
    }

    private isSidePanelEnabled(): boolean {
        const globalEnabled = this.plugin.settings.sidePanelEnabled;
        const disabledOnMobile = Platform.isMobile && this.plugin.settings.disableSidePanelOnMobile;
        return globalEnabled && !disabledOnMobile;
    }

    private scheduleRender() {
        if (this.renderTimer) {
            window.clearTimeout(this.renderTimer);
        }
        this.renderTimer = window.setTimeout(() => {
            this.renderContent();
            this.renderTimer = null;
        }, 50); // 50ms delay – adjust as needed
    }

    private handleRename(file: TAbstractFile, oldPath: string) {
        // update the custom icon mapping first 
        if (this.plugin.settings.customIcons[oldPath]) {
            const icon = this.plugin.settings.customIcons[oldPath]!;
            this.plugin.settings.customIcons[file.path] = icon;
            delete this.plugin.settings.customIcons[oldPath];
            void this.plugin.saveSettings();
        }
        // Handle folder rename
        if (file instanceof TFolder) {
            const openFolders = this.plugin.settings.openFolders;
            const index = openFolders.indexOf(oldPath);
            if (index !== -1) {
                openFolders[index] = file.path;
                void this.plugin.saveSettings();
            }
            if (this.plugin.settings.selectedSpace?.type === 'folder' && 
                this.plugin.settings.selectedSpace.path === oldPath) {
                this.plugin.settings.selectedSpace.path = file.path;
                void this.plugin.saveSettings();
            }
            const treeContainer = this.containerEl.querySelector('.portals-tree-container');
            if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;
            // Force a full render to update the UI with the new name
            this.scheduleRender();
            return;
        }

        // Handle file rename (existing logic)
        if (!(file instanceof TFile)) {
            if (this.plugin.settings.customIcons[oldPath]) {
                const icon = this.plugin.settings.customIcons[oldPath]!;
                this.plugin.settings.customIcons[file.path] = icon;
                delete this.plugin.settings.customIcons[oldPath];
                void this.plugin.saveSettings();
            }
            this.scheduleRender();
            return;
        }
    
        // file rename: check if it moved to a different folder
        const oldDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newDir = file.parent?.path || '';
        if (oldDir !== newDir) {
            this.scheduleRender();
            return;
        }
        // same folder rename - try in place update to preserve scroll
        const element = this.fileElementMap.get(oldPath);
        if (!element) {
            this.scheduleRender();
            return;
        }

        // Update displayed name
        const nameSpan = element.querySelector('.portals-item-name') as HTMLElement;
        if (nameSpan) {
            nameSpan.innerText = this.getDisplayName(file);
        }

        // Update data‑path attribute
        element.dataset.path = file.path;

        // Update map key
        this.fileElementMap.delete(oldPath);
        this.fileElementMap.set(file.path, element);
    }

    private collapseAllFolders() {
        (async () => {
            const currentSpace = this.plugin.settings.selectedSpace;
            if (!currentSpace) return;

            if (currentSpace.type === 'folder') {
            this.plugin.settings.openFolders = [currentSpace.path];
            await this.plugin.saveData(this.plugin.settings);
            this.renderContent();
        } else if (currentSpace.type === 'tag') {
            const spaceContent = this.containerEl.querySelector('.portals-space-content');
            if (spaceContent) {
                const allDetails =spaceContent.querySelectorAll('details')
                for (let i = 1; i < allDetails.length; i++) {
                    (allDetails[i] as HTMLDetailsElement).open =false;
                }
            }
        }
        })().catch(err => console.error('Error collapsing folders:', err));
    }

    constructor(leaf: WorkspaceLeaf, plugin: PortalsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_PORTALS;
    }

    getDisplayText(): string {
        return 'Portals';
    }

    getIcon(): string {
        return 'folder-tree';
    }

    async onOpen() {
        this.render();

        const renameRef = this.app.vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath));
        const deleteRef = this.app.vault.on('delete', () => this.scheduleRender());
        const createRef = this.app.vault.on('create', () => this.scheduleRender());

        this.vaultEventRef = () => {
            this.app.vault.offref(renameRef);
            this.app.vault.offref(deleteRef);
            this.app.vault.offref(createRef);
        };


        this.registerEvent(this.app.workspace.on('file-open', () => {
            if (!this.renaming) {
                this.renderContent();
            }
        }));
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            if (!this.renaming){
                this.scheduleRender();
                this.refreshRecentTab();
            }
        }));

        // Set up bookmarks change listener (using internal plugin for now)
        const setupBookmarksListener = () => {
            // @ts-expect-error - accessing internal plugin API
            const bookmarksPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
            if (bookmarksPlugin?.instance && typeof bookmarksPlugin.instance.on === 'function') {
                const ref = bookmarksPlugin.instance.on('changed', () => {
                    const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
                    if (secondaryPanel) {
                        const contentEl = secondaryPanel.querySelector('.portals-split-content');
                        if (contentEl) {
                            (contentEl as HTMLElement).empty();
                            this.renderBookmarksTab(contentEl as HTMLElement);
                        }
                    }
                });
                // Store ref for cleanup
                this.bookmarksListenerRef = ref;
            }
        };
        setupBookmarksListener();


        //---FolderNotes 
        const refreshFolderNotes = () => {
            if (!this.plugin.settings.enableFolderNotes) return;
            if (this.plugin.settings.activeSplitTab === 'folder-notes') {
                const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
                if (secondaryPanel) {
                    const contentEl = secondaryPanel.querySelector('.portals-split-content');
                    if (contentEl) {
                        (contentEl as HTMLElement).empty();
                        this.renderFolderNotesTab(contentEl as HTMLElement);
                    }
                }
            }
        };
        
        const folderNoteRenameRef = this.app.vault.on('rename', refreshFolderNotes);
        const folderNoteDeleteRef = this.app.vault.on('delete', refreshFolderNotes);
        const folderNoteCreateRef = this.app.vault.on('create', refreshFolderNotes);
        // Debounced refresh for folder notes tab (to avoid frequent re‑renders)
        const debouncedRefreshFolderNotes = debounce(() => {
            if (this.plugin.settings.activeSplitTab === 'folder-notes') {
                const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
                if (secondaryPanel) {
                    const contentEl = secondaryPanel.querySelector('.portals-split-content') as HTMLElement;
                    if (contentEl) {
                        contentEl.empty();
                        this.renderFolderNotesTab(contentEl);
                    }
                }
            }
        }, 300);

        const folderNoteModifyRef = this.app.vault.on('modify', (file) => {
            if (!this.plugin.settings.enableFolderNotes) return;
            if (!(file instanceof TFile)) return; // only handle files
            const currentNote = this.getCurrentFolderNote();
            if (file.path === currentNote?.path) {
                this.invalidateFolderNoteCache(file);
                debouncedRefreshFolderNotes();
            }
        });
        this.folderNoteEventRefs = [folderNoteRenameRef, folderNoteDeleteRef, folderNoteCreateRef, folderNoteModifyRef];

        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && this.plugin.settings.activeSplitTab === 'journal') {
                // Check if the file is inside journal folder
                if (this.isFileInJournalFolder(file)) {
                    this.refreshJournalTab();
                }
            }
        }));

        // Global drag listeners
        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('touchmove', this.handleDragMove, { passive: false });
        document.addEventListener('mouseup', this.handleDragEnd);
        document.addEventListener('touchend', this.handleDragEnd);
        await Promise.resolve()
    }

    async onClose() {
        if (this.renderTimer) {
            window.clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }
        
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
        if (this.tooltipTimeout) {
            window.clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
        if (this.tooltipShowTimeout) {
            window.clearTimeout(this.tooltipShowTimeout);
            this.tooltipShowTimeout = null;
        }
        if (this.vaultEventRef) {
            this.vaultEventRef();
            this.vaultEventRef = null;
        }

        if (this.sortableInstance) {
            this.sortableInstance.destroy();
            this.sortableInstance = null;
        }
        
        //--clean up foldernotes listeners
        if (this.folderNoteEventRefs) {
            this.folderNoteEventRefs.forEach((ref) => {
                // @ts-expect-error - ref is an EventRef, but Typsescript doesn't know
                this.app.vault.offref(ref);
            });
            this.folderNoteEventRefs = null;
        }

        // Clean up bookmarks listener
        const ref = this.bookmarksListenerRef;
        if (ref) {
            // @ts-expect-error - accessing internal plugin API
            const bookmarksPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
            if (bookmarksPlugin?.instance && typeof bookmarksPlugin.instance.off === 'function') {
                bookmarksPlugin.instance.off('changed', ref);
            }
            this.bookmarksListenerRef = null;
        }

        // Clean up folder note cache
        for (const { component } of this.folderNoteCache.values()) {
            this.removeChild(component);
        }
        this.folderNoteCache.clear();
        this.folderNoteScrollPositions.clear();
        this.folderNoteAccessOrder = [];

        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('touchmove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
        document.removeEventListener('touchend', this.handleDragEnd);

        if (this.journalRenderer) {
            this.journalRenderer.destroy();
            this.journalRenderer = null;
        }
        this.journalContainer = null;
        this.journalRenderer = null;
        this.journalContainer = null;
        this.lastJournalAccentColor = null;
        this.scrollToRestore = null;

        await Promise.resolve();
    }

    private getTooltipEl(): HTMLElement {
        if (!this.tooltipEl) {
            this.tooltipEl = document.body.createDiv({ cls: 'portals-floating-tooltip' });
        }
        return this.tooltipEl;
    }

    private showTooltip(text: string, target: HTMLElement, delay: number = 0) {
        if (delay > 0) {
            if (this.tooltipShowTimeout) window.clearTimeout(this.tooltipShowTimeout);
            this.tooltipShowTimeout = window.setTimeout(() => {
                this.showTooltip(text, target, 0);
                this.tooltipShowTimeout = null;
            }, delay);
            return;
        }
        if (this.tooltipTimeout) {
            window.clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
        const tooltip = this.getTooltipEl();
        tooltip.setText(text);
        const rect = target.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 6) + 'px';
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.classList.add('is-visible');
    }

    private hideTooltip(delay = 0) {
        if (this.tooltipShowTimeout) {
            window.clearTimeout(this.tooltipShowTimeout);
            this.tooltipShowTimeout = null;
        }
        if (this.tooltipTimeout) {
            window.clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
        if (delay > 0) {
            this.tooltipTimeout = window.setTimeout(() => {
                const tooltip = this.getTooltipEl();
                tooltip.classList.remove('is-visible');
            }, delay);
        } else {
            const tooltip = this.getTooltipEl();
            tooltip.classList.remove('is-visible');
        }
    }

    //-- New Drag Handler

    private handleDragStart = (e: MouseEvent | TouchEvent) => {
        if (!this.isSidePanelEnabled()) return;
        this.isDraggingSplitter = true;
        document.body.classList.add('portals-dragging');
        e.preventDefault();
    };

    private dragMoveRaf: number | null = null;

    private handleDragMove = (e: MouseEvent | TouchEvent) => {
        if (!this.isDraggingSplitter) return;
        if (!this.isSidePanelEnabled()) return;
        e.preventDefault();

        const secondaryPanel = this.currentSecondaryPanel;
        const splitter = this.currentSplitter;
        if (!secondaryPanel || !splitter) return;

        const splitContainer = secondaryPanel.parentElement?.parentElement;
        if (!splitContainer) return;

        const rect = splitContainer.getBoundingClientRect();
        const clientY = e instanceof TouchEvent ? e.touches[0]?.clientY : e.clientY;
        if (clientY === undefined) return;

        // --- Synchronous height update (immediate feedback) ---
        const relativeY = clientY - rect.top;
        const minHeight = 50;
        const maxHeight = rect.height - 50;
        const newHeight = Math.min(maxHeight, Math.max(minHeight, rect.height - relativeY));
        secondaryPanel.style.height = newHeight + 'px';
        splitter.classList.remove('is-hidden');

        // --- Throttle the rest (settings updates) ---

        if (this.dragMoveRaf) return; // already scheduled

        this.dragMoveRaf = requestAnimationFrame(() => {
            this.dragMoveRaf = null;
            if (!secondaryPanel || !splitContainer) return;

            // Use stored data to update non‑critical settings
            const COLLAPSE_THRESHOLD = 80;
            const currentHeight = parseFloat(secondaryPanel.style.height); // read actual height
            if (!this.plugin.settings.secondaryPanelCollapsed && currentHeight > COLLAPSE_THRESHOLD) {
                this.plugin.settings.lastExpandedHeight = currentHeight;
            }
            this.plugin.settings.secondaryPanelHeight = currentHeight;
            this.plugin.settings.secondaryPanelCollapsed = false;
            secondaryPanel.classList.remove('is-collapsed');
            const collapseIcon = secondaryPanel.querySelector('.portals-collapse-icon');
            if (collapseIcon) collapseIcon.textContent = '▼';
        });
    };  

    private handleDragEnd = (_e: MouseEvent | TouchEvent) => {
        if (this.dragMoveRaf) {
            cancelAnimationFrame(this.dragMoveRaf);
            this.dragMoveRaf = null;
        }
        if (this.isDraggingSplitter) {
            this.isDraggingSplitter = false;
            document.body.classList.remove('portals-dragging');
            if (this.isSidePanelEnabled() && this.currentSecondaryPanel) {
                const height = parseFloat(this.currentSecondaryPanel.style.height);
                const minHeight = 50;
                if (height <= minHeight + 10) {
                    this.plugin.settings.secondaryPanelCollapsed = true;
                    this.currentSecondaryPanel.classList.add('is-collapsed');
                    this.currentSecondaryPanel.style.height = '42px';
                    if (this.currentSplitter) {
                        this.currentSplitter?.classList.add('is-hidden');
                    }
                    const collapseIcon = this.currentSecondaryPanel.querySelector('.portals-collapse-icon');
                    if (collapseIcon) collapseIcon.textContent = '▲';
                }
                void this.plugin.saveData(this.plugin.settings);
            }
        }
    };

    //-- ExpandPanel Helper

    private expandPanel() {
        if (!this.isSidePanelEnabled()) return;
        if (this.plugin.settings.secondaryPanelCollapsed) {
            this.plugin.settings.secondaryPanelCollapsed = false;
            const secondaryPanel = this.currentSecondaryPanel;
            if (secondaryPanel) {
                secondaryPanel.style.height = Math.max(this.plugin.settings.lastExpandedHeight, MIN_EXPANDED_HEIGHT) + 'px';
                secondaryPanel.classList.remove('is-collapsed');
                if (this.currentSplitter) {
                    this.currentSplitter.classList.remove('is-hidden');
                }
                const collapseIcon = secondaryPanel.querySelector('.portals-collapse-icon');
                if (collapseIcon) collapseIcon.textContent = '▼';
            }
            void this.plugin.saveData(this.plugin.settings);
        }
    }

    //-- FolderNote
    private isFolderNote(file: TFile, folder: TFolder): boolean {
        if (folder.path === '/') {
            return file.extension === 'md' && file.name.toLowerCase() === (this.app.vault.getName() + '.md').toLowerCase() && file.parent?.path === '/';
        } else {
        return file.extension === 'md' && file.name.toLowerCase() === (folder.name + '.md').toLowerCase() && file.parent?.path === folder.path;
        }
    }

    //-- FolderNote Dot
    private hasFolderNote(folder: TFolder): boolean {
        return folder.children.some(child => 
            child instanceof TFile && this.isFolderNote(child, folder)
        );
    }

    //--getFolderNote
    private getFolderNote(folder: TFolder): TFile | undefined {
        return folder.children.find((child): child is TFile => 
            child instanceof TFile && this.isFolderNote(child, folder)
        );
    }

    //-- Settings Hash
    private getSettingsHash(): string {
        const s = this.plugin.settings;
        return JSON.stringify({
            spaces: s.spaces.map(sp => `${sp.type}:${sp.path}|${sp.icon}|${sp.color}|${sp.groupTags?.join(',') || ''}`).join(','),
            openFolders: s.openFolders.join(','),
            selectedSpace: s.selectedSpace ? `${s.selectedSpace.type}:${s.selectedSpace.path}` : '',
            filePaneColorStyle: s.filePaneColorStyle,
            tabColorEnabled: s.tabColorEnabled,
            tabNameDisplay: s.tabNameDisplay,
            sortBy: s.sortBy,
            sortOrder: s.sortOrder,
            secondaryPanelCollapsed: s.secondaryPanelCollapsed,
            secondaryPanelHeight: s.secondaryPanelHeight,
            sidePanelEnabled: s.sidePanelEnabled,
            activeSplitTab: s.activeSplitTab,
            splitViewTabs: s.splitViewTabs?.join(',') || '',
            recentFilesList: s.recentFilesList?.join(',') || '',
            showFolderNotesInTree: s.showFolderNotesInTree,
            enableFolderNotes: s.enableFolderNotes,
            floatingButtonsCollapsed: s.floatingButtonsCollapsed,
            disableSidePanelOnMobile: s.disableSidePanelOnMobile,
            enableFileExtensionNonMD: s.enableFileExtensionNonMD,
            folderNoteHighlightStyle: s.folderNoteHighlightStyle,
            compactTree: s.compactTree,
            boldFolderNames: s.boldFolderNames,
            treeStyle: s.treeStyle,
        });
    }

    render() {
        // Save scroll position of current folder note if it exists
        if (this.plugin.settings.enableFolderNotes && this.plugin.settings.activeSplitTab === 'folder-notes') {
            const splitContent = this.containerEl.querySelector('.portals-split-content') as HTMLElement;
            const noteContainer = splitContent?.querySelector('.markdown-preview-view') as HTMLElement;
            if (noteContainer) {
                const currentNote = this.getCurrentFolderNote();
                if (currentNote) {
                    this.folderNoteScrollPositions.set(currentNote.path, noteContainer.scrollTop);
                }
            }
        }
        const newHash = this.getSettingsHash();
        if (newHash === this.lastRenderHash) return;
        this.lastRenderHash = newHash;

        try {
            const container = this.containerEl.children[1] as HTMLElement;
            if (!container) return;
            container.empty();
            container.addClass('portals-container');

            const spaces = this.plugin.settings.spaces;

            if (spaces.length === 0) {
                container.createEl('p', { text: 'No portals configured. Add some in settings.' });
                return;
            }

            if (this.sortableInstance) {
                this.sortableInstance.destroy();
                this.sortableInstance = null;
            }

            // Tab bar
            const tabBar = container.createEl('div', { cls: 'portals-tab-bar' });

            for (const space of spaces) {
                let displayName = '';
                const vaultName = this.app.vault.getName();

                if (space.type === 'folder') {
                    if (space.path === '/') {
                        displayName = vaultName; // root shows vault name
                    } else {
                        const folder = this.app.vault.getAbstractFileByPath(space.path);
                        displayName = folder instanceof TFolder ? folder.name : space.path;
                    }
                } else {
                    displayName = '#' + space.path;
                }

                const tab = tabBar.createEl('div', { cls: 'portals-tab' });
                if (space.path === '/') {
                    tab.addClass('portals-tab-pinned');
                    if (this.plugin.settings.tabColorEnabled && space.color && space.color !== 'transparent') {
                        tab.style.setProperty('--tab-pinned-color', space.color);
                    } else {
                        tab.style.removeProperty('--tab-pinned-color');
                    }
                }

                const isActive = (space.path === this.plugin.settings.selectedSpace?.path && space.type === this.plugin.settings.selectedSpace?.type);
                if (isActive) tab.addClass('is-active');

                const displayMode = this.plugin.settings.tabNameDisplay;

                let shouldShowname = false;
                if (displayMode === 'all') {
                    shouldShowname = space.path !=='/';
                } else if (displayMode === 'activeOnly') {
                    shouldShowname = isActive && space.path !== '/';
                } else {
                    shouldShowname = false;
                }

                if (shouldShowname) {
                    tab.createSpan({ text: displayName });
                } else if (!Platform.isMobile) {
                    tab.addEventListener('mouseenter', () => {
                        this.showTooltip(displayName, tab, 300);
                    });
                    tab.addEventListener('mouseleave', () => {
                        this.hideTooltip(100);
                    });
                }

                if (this.plugin.settings.tabColorEnabled && space.color && space.color !== 'transparent') {
                    if (isActive) {
                        tab.style.setProperty('--tab-active-color', space.color);
                    } else {
                        tab.style.removeProperty('--tab-active-color');
                    }
                } else {
                    tab.style.removeProperty('--tab-active-color');
                }
                
                tab.dataset.path = space.path;
                tab.dataset.type = space.type;

                if (space.icon) {
                    const iconSpan = tab.createSpan({ cls: 'portals-tab-icon' });
                    iconSpan.createEl('i', { cls: `ph ph-${space.icon}` });
                }

                tab.addEventListener('click', () => {
                    this.hideTooltip(0);
                    this.plugin.settings.selectedSpace = {
                        path: space.path,
                        type: space.type
                    };

                    if (space.type === 'folder' && !this.plugin.settings.openFolders.includes(space.path)) {
                        this.plugin.settings.openFolders.push(space.path);
                    }

                    void this.plugin.saveSettings()
                        .then(() => this.render())
                        .then(() => {
                            const newActiveTab = container.querySelector('.portals-tab.is-active');
                            if (newActiveTab) {
                                setTimeout(() => {
                                    newActiveTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                                }, 0);
                            }
                        });
                });
            }

            this.sortableInstance = new Sortable(tabBar, {
                animation: 150,
                delay: 400,
                delayOnTouchOnly: true,
                touchStartThreshold: 5,
                scrollSensitivity: 30,
                
                onEnd: async (_evt: SortableEvent) => {
                    const newOrder: SpaceConfig[] = [];
                    const tabElements = tabBar.querySelectorAll('.portals-tab');
                    tabElements.forEach(el => {
                        const path = (el as HTMLElement).dataset.path;
                        const type = (el as HTMLElement).dataset.type;
                        if (path && (type === 'folder' || type === 'tag')) {
                            const found = this.plugin.settings.spaces.find(s => s.path === path && s.type === type);
                            if (found) {
                                newOrder.push(found);
                            }
                        }
                    });

                    if (this.plugin.settings.pinVaultRoot) {
                        const rootIndex = newOrder.findIndex(s => s.path === '/' && s.type === 'folder');
                        if (rootIndex > 0) {
                            const root = newOrder.splice(rootIndex, 1)[0];
                            if (root) {
                                newOrder.unshift(root);
                            }
                        }
                    }

                    this.plugin.settings.spaces = newOrder;
                    await this.plugin.saveData(this.plugin.settings);
                    this.lastRenderHash = this.getSettingsHash();
                }
            });

            setTimeout(() => {
                const activeTab = tabBar.querySelector('.portals-tab.is-active');
                if (activeTab) {
                    activeTab.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
                }
            }, 0);

            // --- Split pane layout with tabs ---
            const splitContainer = container.createDiv({ cls: 'portals-split-container' });

            // Main panel (folder/tag tree)
            const mainPanel = splitContainer.createDiv({ cls: 'portals-main-panel' });

            // Tree content area (scrollable)
            const treeContainer = mainPanel.createDiv({ cls: 'portals-tree-container' });
            treeContainer.addClass(`portals-tree-style-${this.plugin.settings.treeStyle}`);
            if (this.plugin.settings.compactTree) {
                treeContainer.addClass('portals-compact-tree');
            }
            if (this.plugin.settings.boldFolderNames) {
                treeContainer.addClass('portals-bold-folders');
            }

            // Splitter (draggable)
            const splitter = splitContainer.createDiv({ cls: 'portals-splitter' });
            this.currentSplitter = splitter;

            // Secondary panel (tabs + content)
            const secondaryPanel = splitContainer.createDiv({ cls: 'portals-secondary-panel' });
            this.currentSecondaryPanel = secondaryPanel;

            // Header with tabs and collapse icon
            const secondaryHeader = secondaryPanel.createDiv({ cls: 'portals-secondary-header' });

            // Tab container
            const tabContainer = secondaryHeader.createDiv({ cls: 'portals-split-tabs' });

           // Get tabs from settings, ensure folder-notes is present for testing
           const tabs = this.plugin.settings.splitViewTabs || ['recent'];
           const icons = SIDE_TAB_ICONS;
           const activeTab = this.plugin.settings.activeSplitTab || 'recent';

           let rootColor: string | undefined;
           if (this.plugin.settings.pinVaultRoot && this.plugin.settings.tabColorEnabled) {
            const rootSpace = spaces.find(s => s.path === '/' && s.type === 'folder');
            if (rootSpace && rootSpace.color && rootSpace.color !== 'transparent') {
                rootColor = rootSpace.color;
            }
           }

            tabs.forEach(tabId => {
                const tabBtn = tabContainer.createEl('div', { cls: 'portals-split-tab' });
                tabBtn.dataset.tabId = tabId;

                // Add icon
                tabBtn.createEl('i', { cls: `ph ph-${icons[tabId] || 'file'}` });

                // Always create the span with class 'tab-label'
                const span = tabBtn.createEl('span', { cls: 'tab-label' });
                span.textContent = tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-', ' ');
                span.addClass('hide');

                // handle active state and label visibility
                const isActive = (tabId === activeTab);
                const displayMode = this.plugin.settings.tabNameDisplay;

                // determine whether to show the label
                let showlabel = false;
                if (displayMode === 'all') {
                    showlabel = true;
                } else if (displayMode === 'activeOnly') {
                    showlabel = isActive;
                } else {
                    showlabel = false;
                }

                if (showlabel) {
                    span.removeClass('hide');
                } else {
                    span.addClass('hide');
                }

                if (isActive) {
                    tabBtn.addClass('is-active');
                    if (rootColor) {
                        tabBtn.style.setProperty('--split-tab-active-color', rootColor);
                    }
                }

                if (!Platform.isMobile) {
                    const displayName = tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-',' ');
                    tabBtn.addEventListener('mouseenter', () => {
                        const labelSpan = tabBtn.querySelector('span.tab-label');
                        if (labelSpan && labelSpan.hasClass('hide')) {
                            this.showTooltip(displayName, tabBtn, 300);
                        }
                    });
                    tabBtn.addEventListener('mouseleave', () => {
                        this.hideTooltip(100);
                    });   
                }
            
                // Click handler
                tabBtn.addEventListener('click', () => {
                    this.expandPanel();
                    this.plugin.settings.activeSplitTab = tabId;
                    void this.plugin.saveData(this.plugin.settings);

                    const currentDisplayMode = this.plugin.settings.tabNameDisplay;

                    // Update all split tabs
                    tabContainer.querySelectorAll('.portals-split-tab').forEach(t => {
                        const currentTab = t as HTMLElement;
                        const currentId = currentTab.dataset.tabId;
                        if (!currentId) return;
                        
                        // Remove active class from all tabs
                        currentTab.removeClass('is-active');
                        currentTab.style.removeProperty('--split-tab-active-color');

                        // get span label
                        const labelSpan = currentTab.querySelector('span.tab-label');
                        if (labelSpan) {
                            const newisActive = (currentId === tabId);
                            let newShowLabel = false;
                            if (currentDisplayMode === 'all') newShowLabel = true;
                            else if (currentDisplayMode === 'activeOnly') newShowLabel = newisActive;
                            else newShowLabel = false;
                            if (newShowLabel) {
                                labelSpan.removeClass('hide');
                            } else {
                                labelSpan.addClass('hide');
                            }
                        }
                    });
                    // Add active class to clicked tab
                    tabBtn.addClass('is-active');
                    if (rootColor) {
                        tabBtn.style.setProperty('--split-tab-active-color', rootColor);
                    }
                    // Render new content
                    this.renderSplitTabContent(secondaryPanel, tabId);
                });
            });

            // Collapse icon
            const collapseIcon = secondaryHeader.createSpan({ cls: 'portals-collapse-icon' });
            collapseIcon.textContent = this.plugin.settings.secondaryPanelCollapsed ? '▲' : '▼';  

            // Content area (collapsible)
            secondaryPanel.createDiv({ cls: 'portals-split-content' });
            const splitContent = secondaryPanel.querySelector('.portals-split-content') as HTMLElement;

            if (this.plugin.settings.treeStyle === 'portals') {
                if (rootColor) {
                    splitContent.style.setProperty('--space-border-color', rootColor);
                } else {
                    splitContent.style.removeProperty('--space-border-color');
                }
            } else {
                splitContent.style.removeProperty('--space-border-color');
            }

            // Set initial state
            const sidePanelEnabled = this.isSidePanelEnabled();
            const isCollapsed = this.plugin.settings.secondaryPanelCollapsed;
            if (!sidePanelEnabled) {
                secondaryPanel.classList.add('is-disabled');
                splitter.classList.add('is-hidden');
                secondaryPanel.style.height = '42px';
                secondaryPanel.classList.add('is-collapsed');
                const collapseIcon = secondaryHeader.querySelector('.portals-collapse-icon');
                if (collapseIcon) collapseIcon.textContent = '▲';
            } else if (isCollapsed) {
                secondaryPanel.style.height = '42px';
                secondaryPanel.classList.add('is-collapsed');
                splitter.classList.add('is-hidden');
            } else {
                secondaryPanel.style.height = Math.max(this.plugin.settings.lastExpandedHeight, MIN_EXPANDED_HEIGHT) + 'px';
                secondaryPanel.classList.remove('is-collapsed');
                splitter.classList.remove('is-hidden');
            }

            // Toggle collapse on icon click
            collapseIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.isSidePanelEnabled()) return;

                const newCollapsed = !this.plugin.settings.secondaryPanelCollapsed;
                this.plugin.settings.secondaryPanelCollapsed = newCollapsed;
                if (newCollapsed) {
                    secondaryPanel.style.height = '42px';
                    secondaryPanel.classList.add('is-collapsed');
                    splitter.classList.add('is-hidden');
                    collapseIcon.textContent = '▲';
                } else {
                    secondaryPanel.style.height = Math.max(this.plugin.settings.lastExpandedHeight, MIN_EXPANDED_HEIGHT) + 'px';
                    secondaryPanel.classList.remove('is-collapsed');
                    splitter.classList.remove('is-hidden');   
                    collapseIcon.textContent = '▼';   
                }
                void this.plugin.saveData(this.plugin.settings);
            });

            // Make splitter draggable (mouse + touch)
            splitter.addEventListener('mousedown', this.handleDragStart);
            splitter.addEventListener('touchstart', this.handleDragStart, { passive: false });


            // Initial content
            void this.renderSplitTabContent(secondaryPanel, activeTab);

            // Now put the main panel content (folder tree / tag space) inside treeContainer
            const selectedSpace = spaces.find(s => 
                s.path === this.plugin.settings.selectedSpace?.path && 
                s.type === this.plugin.settings.selectedSpace?.type
            ) || spaces[0];
            if (selectedSpace) {
                const openFiles = this.getOpenFilePaths();
                if (selectedSpace.type === 'folder') {
                    const folder = this.app.vault.getAbstractFileByPath(selectedSpace.path);
                    if (folder && folder instanceof TFolder) {
                        // count direct children folders at first level
                        const totalFirstLevelFolders = folder.children.filter(c => c instanceof TFolder).length;
                        const spaceContent = treeContainer.createEl('div', { cls: 'portals-space-content' });
                        if (this.plugin.settings.tabColorEnabled && selectedSpace.color && selectedSpace.color !== 'transparent') {
                            spaceContent.style.setProperty('--space-border-color', selectedSpace.color);
                        } else {
                            spaceContent.style.removeProperty('--space-border-color');
                        }
                        this.applySpaceBackground(spaceContent, selectedSpace.color);
                        this.makeDropTarget(spaceContent, folder, true);
                        this.buildFolderTree(folder, spaceContent, openFiles, selectedSpace.icon, 0, 0, totalFirstLevelFolders);
                    } else {
                        treeContainer.createEl('p', { text: `Folder not found: ${selectedSpace.path}` });
                    }
                } else {
                    // count groups chosen
                    const groupCount = selectedSpace.groupTags?.length ?? 0;
                    const spaceContent = treeContainer.createEl('div', { cls: 'portals-space-content' });
                    if (this.plugin.settings.tabColorEnabled && selectedSpace.color && selectedSpace.color !== 'transparent') {
                            spaceContent.style.setProperty('--space-border-color', selectedSpace.color);
                        } else {
                            spaceContent.style.removeProperty('--space-border-color');
                        }
                    this.applySpaceBackground(spaceContent, selectedSpace.color);
                    this.buildTagSpace(selectedSpace.path, spaceContent, selectedSpace.icon, openFiles, selectedSpace.groupTags, 0, 0, groupCount);
                }
            }
            // restore scroll position if we stored one after icon change
            if (this.scrollToRestore !== null) {
                requestAnimationFrame(() => {
                    const treeContainer = this.containerEl.querySelector('.portals-tree-container');
                    if (treeContainer && typeof this.scrollToRestore === 'number') {
                        treeContainer.scrollTop = this.scrollToRestore;
                        this.scrollToRestore = null;
                    }
                });
            }

            // Floating buttons (attached to mainPanel)
            const createFloatingButton = (
                icon: string,
                tooltip: string,
                bottom: number,
                onClick: (e: MouseEvent) => void,
                onContextMenu?: (e: MouseEvent) => void
            ) => {
                const btn = mainPanel.createEl('button', { cls: 'portals-floating-btn' });
                btn.style.bottom = bottom + 'px';
                btn.empty();
                btn.createEl('i', { cls: `ph ph-${icon}` });
                if (!Platform.isMobile) {
                    btn.addEventListener('mouseenter', () => this.showTooltip(tooltip, btn, 300));
                    btn.addEventListener('mouseleave', () => this.hideTooltip(100));
                }
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const el = e.currentTarget as HTMLElement;
                    el.blur();
                    el.style.display = 'none';
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            el.style.display = '';
                        });
                    });
                    onClick(e);
                });

                btn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const el = e.currentTarget as HTMLElement;
                    el.blur();
                    if (this.contextMenuFiredMap.get(el)) return;
                    this.contextMenuFiredMap.set(el, true);
                    setTimeout(() => this.contextMenuFiredMap.delete(el), 300);
                    if (onContextMenu) {
                        onContextMenu(e);
                    }
                });
                return btn;
            };

            if (this.plugin.settings.floatingButtonsCollapsed) {
                createFloatingButton('stack-simple', 'Collapse/ Unfold', 10,
                    () => this.collapseAllFolders(),
                    (e: MouseEvent) => this.toggleFloatingButtonsCollapse(e)
                );
            } else {
                // Expanded mode: all four buttons
                createFloatingButton('file-plus', 'New note', 136, () => {
                    (async () => {
                        const currentSpace = this.plugin.settings.spaces.find(s => 
                            s.path === this.plugin.settings.selectedSpace?.path && 
                            s.type === this.plugin.settings.selectedSpace?.type
                        );

                        if (!currentSpace) {
                            new Notice('Please select a folder space first.');
                            return;
                        }

                        if (currentSpace.type === 'folder') {
                            const folder = this.app.vault.getAbstractFileByPath(currentSpace.path);
                            if (!(folder instanceof TFolder)) {
                                new Notice('Selected space is not a valid folder.');
                            return;
                            }
                            await this.newNoteInFolder(folder);
                        } else if (currentSpace.type === 'tag') {
                            await this.newNoteInTagSpace(currentSpace.path);
                        }

                    })().catch(err => console.error('Error creating note:', err));
                });

                // second button: folder or filter
                const currentSpace = this.plugin.settings.spaces.find(s =>
                    s.path === this.plugin.settings.selectedSpace?.path &&
                    s.type === this.plugin.settings.selectedSpace?.type
                );

                if (currentSpace && currentSpace.type === 'folder') {
                    createFloatingButton('folder-simple-plus', 'New folder', 94, () => {
                        (async () => {
                            const folder = this.app.vault.getAbstractFileByPath(currentSpace.path);
                            if (!(folder instanceof TFolder)) {
                                new Notice('Selected space is not a valid folder.');
                                return;
                            }
                            await this.newFolderInFolder(folder);
                        })().catch(err => console.error('Error creating folder:', err));
                    });
                } else if (currentSpace && currentSpace.type === 'tag') {
                    // compute tags that co-occuer with main tag
                    const mainTag = currentSpace.path;
                    const allFiles = this.app.vault.getMarkdownFiles();
                    const filesWithMainTag = allFiles.filter(file => {
                        const cache = this.app.metadataCache.getFileCache(file);

                        return cache?.tags?.some(t => t.tag === '#' + mainTag) || cache?.frontmatter?.tags?.includes(mainTag);
                    });
                    const tagSet = new Set<string>();
                    filesWithMainTag.forEach(file => {
                        const cache = this.app.metadataCache.getFileCache(file);
                        const fileTags = [
                            ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                            ...(cache?.frontmatter?.tags || [])
                        ];
                        fileTags.forEach(t => tagSet.add(t));
                    });
                    tagSet.delete(mainTag)
                    const relevantTags = Array.from(tagSet).sort();

                    createFloatingButton('funnel-simple', 'Tag groups', 94, (_e) => {
                        const oldGroups = currentSpace.groupTags || [];
                        new GroupTagsModal(this.app, this.plugin, currentSpace, (tags) => {
                            const removed = oldGroups.filter(g => !tags.includes(g));
                            for (const group of removed) {
                                const key = this.getTagGroupKey(currentSpace.path, group);
                                delete this.plugin.settings.customIcons[key];
                            }
                            currentSpace.groupTags = tags;

                            // cleanup expandedGroups for this space
                            const expanded = this.plugin.settings.expandedGroups[currentSpace.path];
                            if (expanded) {
                                const validExpanded = expanded.filter(t => currentSpace.groupTags?.includes(t));
                                if (validExpanded.length !== expanded.length) {
                                    this.plugin.settings.expandedGroups[currentSpace.path] = validExpanded;
                                }
                            }
                            this.plugin.saveSettings().then(() => this.render());
                        }, relevantTags).open();
                    });
                }

                createFloatingButton('caret-circle-up-down', 'Sort', 52, (e: MouseEvent) => {
                    const menu = new Menu();
                    const setSort = (by: 'name' | 'created' | 'modified', order: 'asc' | 'desc') => {
                        this.plugin.settings.sortBy = by;
                        this.plugin.settings.sortOrder = order;
                        void this.plugin.saveData(this.plugin.settings);
                        this.renderContent();
                    };
                    menu.addItem(item => item
                        .setTitle('Name ascending')
                        .setChecked(this.plugin.settings.sortBy === 'name' && this.plugin.settings.sortOrder === 'asc')
                        .onClick(() => setSort('name', 'asc')));
                    menu.addItem(item => item
                        .setTitle('Name descending')
                        .setChecked(this.plugin.settings.sortBy === 'name' && this.plugin.settings.sortOrder === 'desc')
                        .onClick(() => setSort('name', 'desc')));
                    menu.addSeparator();
                    menu.addItem(item => item
                        .setTitle('Created (oldest first)')
                        .setChecked(this.plugin.settings.sortBy === 'created' && this.plugin.settings.sortOrder === 'asc')
                        .onClick(() => setSort('created', 'asc')));
                    menu.addItem(item => item
                        .setTitle('Created (newest first)')
                        .setChecked(this.plugin.settings.sortBy === 'created' && this.plugin.settings.sortOrder === 'desc')
                        .onClick(() => setSort('created', 'desc')));
                    menu.addSeparator();
                    menu.addItem(item => item
                        .setTitle('Modified (oldest first)')
                        .setChecked(this.plugin.settings.sortBy === 'modified' && this.plugin.settings.sortOrder === 'asc')
                        .onClick(() => setSort('modified', 'asc')));
                    menu.addItem(item => item
                        .setTitle('Modified (newest first)')
                        .setChecked(this.plugin.settings.sortBy === 'modified' && this.plugin.settings.sortOrder === 'desc')
                        .onClick(() => setSort('modified', 'desc')));
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                });

                // Collapse button with contextmenu toggling
                createFloatingButton('stack', 'Collapse/ Fold', 10,
                    () => this.collapseAllFolders(),
                    (e: MouseEvent) => this.toggleFloatingButtonsCollapse(e)
                );
            }
        } catch (e) {
            console.error('Portals render error:', e);
        }
    }

    private async renderSplitTabContent(secondaryPanel: HTMLElement, tabId: string) {
        const contentEl = secondaryPanel.querySelector('.portals-split-content') as HTMLElement;
        if (!contentEl) return;
        contentEl.empty();
        contentEl.addClass(`portals-tree-style-${this.plugin.settings.treeStyle}`);

        if (tabId === 'recent') {
            const recentFiles = this.plugin.settings.recentFilesList || [];
            const existingRecentFiles = recentFiles
                .map(path => this.app.vault.getAbstractFileByPath(path))
                .filter((file): file is TFile => file instanceof TFile);

            const openFiles = this.getOpenFilePaths();
            for (const file of existingRecentFiles) {
                const fileEl = contentEl.createDiv({ cls: 'file-item recent-file-item' });
                const customIcon = this.getCustomIcon(file.path);
                const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
                const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
                iconSpan.createEl('i', { cls: fileIconClass });
                const nameSpan = fileEl.createSpan({ text: this.getDisplayName(file) });
                nameSpan.addClass('portals-item-name');
                fileEl.dataset.path = file.path;

                const isOpen = openFiles.has(file.path);
                let openDotspan: HTMLSpanElement | null = null;
                if (isOpen) {
                    openDotspan = fileEl.createSpan({ cls: 'open-dot' });
                }
                if (this.plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md') {
                    const extSpan = fileEl.createSpan({ cls: 'file-extension' });
                    extSpan.setText('.' + file.extension.toUpperCase());
                    if(openDotspan) {
                        openDotspan.style.display = 'none';
                    }
                    if(isOpen) {
                        extSpan.addClass('is-open');
                    }
                }

                fileEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    void this.app.workspace.getLeaf().openFile(file);
                });

                fileEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showFileContextMenu(e, file, fileEl);
                });
            }

        } else if (tabId === 'folder-notes') {
            if (!this.plugin.settings.enableFolderNotes) {
                contentEl.createEl('p', {
                    text: 'Folder notes are disabled. Enable them in settings.',
                    cls: 'portals-folder-note-message'
                });
                return;
            }
            this.renderFolderNotesTab(contentEl);
        } else if (tabId === 'bookmarks') {
            this.renderBookmarksTab(contentEl);
        } else if (tabId === 'journal') {
            const currentFolderPath = this.plugin.settings.journalFolderPath;
            if (this.journalRenderer && this.journalFolderPath === currentFolderPath && this.journalContainer) {
                //reuse existing container
                contentEl.appendChild(this.journalContainer);
            } else {
                if (this.journalRenderer) {
                    this.journalRenderer.destroy();
                    this.journalRenderer = null;
                }
                // create new renderer
                this.journalContainer = contentEl.createDiv();
                this.journalRenderer = new JournalRenderer(this.app, this.plugin, this.journalContainer);
                this.journalFolderPath = currentFolderPath;
                await this.journalRenderer.render();
            }
        }
    }

    // Bookmarks

    private renderBookmarksTab(contentEl: HTMLElement) {
        // Try public API first (future-proofing)
        // @ts-expect-error - accessing public bookmarks API
        const publicBookmarks = this.app.bookmarks;
        let items: BookmarkItem[] = [];
        let usePublic = false;

        if (publicBookmarks) {
            // Public API might have getBookmarks() or .items
            if (typeof publicBookmarks.getBookmarks === 'function') {
                items = publicBookmarks.getBookmarks() as BookmarkItem[];
                usePublic = true;
            } else if (Array.isArray(publicBookmarks.items)) {
                items = publicBookmarks.items;
                usePublic = true;
            }
        }

        // Fallback to internal plugin if public API not available or returned nothing
        if (!usePublic || items.length === 0) {
            // @ts-expect-error -- accessing internal plugin API
            const bookmarksPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
            if (!bookmarksPlugin?.enabled || !bookmarksPlugin.instance) {
                contentEl.createEl('p', { text: 'The bookmarks core plugin is not enabled. Settings → core plugins.' });
                return;
            }
            items = bookmarksPlugin.instance.items as BookmarkItem[];
            if (!items || !Array.isArray(items)) {
                contentEl.createEl('p', { text: 'No bookmarks found.' });
                return;
            }
        }

        if (items.length === 0) {
            contentEl.createEl('p', { text: 'No bookmarks found.' });
            return;
        }

        // Helper to refresh the tab after deletion
        const refresh = () => {
            const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
            if (secondaryPanel) {
                this.renderSplitTabContent(secondaryPanel as HTMLElement, 'bookmarks');
            }
        };

        // Recursive render function
        const renderItem = (item: BookmarkItem, container: HTMLElement) => {
            // Check if this is a folder/group
            const isFolder = item.children && Array.isArray(item.children) && item.children.length > 0 ||
                            item.type === 'group' || item.type === 'folder';

            if (isFolder) {
                // Folder/group
                const details = container.createEl('details', { cls: 'folder-details' });
                details.setAttr('open', 'true');
                const summary = details.createEl('summary', { cls: 'folder-summary' });
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                iconSpan.createEl('i', { cls: 'ph ph-folder' });
                const nameSpan = summary.createSpan({ text: item.title || 'Group' });
                nameSpan.addClass('portals-item-name');

                summary.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const menu = new Menu();
                    menu.addItem(menuItem => menuItem
                        .setTitle('Delete group')
                        .setIcon('trash')
                        .onClick(() => {
                            this.deleteBookmarkItem(item, usePublic, refresh);
                        })
                    );
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                });

                const childrenContainer = details.createDiv({ cls: 'folder-children' });
                // Use the correct property for children – some APIs use 'items' instead of 'children'
                const children = item.children || (item as { items?: BookmarkItem[] }).items || [];
                children.forEach((child: BookmarkItem) => renderItem(child, childrenContainer));
            } else {
                // Leaf item (file, note, url)
                const fileEl = container.createDiv({ cls: 'file-item' });
                const iconSpan = fileEl.createSpan({ cls: 'file-icon' });

                let iconClass = 'ph-file';
                if (item.type === 'url') iconClass = 'ph-link';
                else if (item.type === 'folder') iconClass = 'ph-folder';
                else if (item.type === 'file') iconClass = 'ph-file';
                else if (item.url) iconClass = 'ph-link';
                else if (item.path) {
                    const abstractFile = this.app.vault.getAbstractFileByPath(item.path);
                    if (abstractFile instanceof TFolder) iconClass = 'ph-folder';
                    else iconClass = 'ph-file';
                }

                iconSpan.createEl('i', { cls: `ph ${iconClass}` });

                const displayName = item.title || item.path || item.url || 'Untitled';
                const nameSpan = fileEl.createSpan({ text: displayName });
                nameSpan.addClass('portals-item-name');
                fileEl.dataset.path = item.path || item.url || '';

                // Left‑click to open
                fileEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.type === 'url' || item.url) {
                        const url = item.url || item.path;
                        if (url) window.open(url, '_blank');
                    } else if (item.type === 'file' || item.path) {
                        if (item.path) {
                            const file = this.app.vault.getAbstractFileByPath(item.path);
                            if (file instanceof TFile) {
                                void this.app.workspace.getLeaf().openFile(file);
                            } else if (file instanceof TFolder) {
                                void this.app.workspace.openLinkText(item.path, '/', false);
                            }
                        }
                    } else if (item.type === 'folder') {
                        if (item.path) {
                            void this.app.workspace.openLinkText(item.path, '/', false);
                        }
                    }
                });

                // Right‑click context menu for deletion
                fileEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const menu = new Menu();
                    menu.addItem(menuItem => menuItem
                        .setTitle('Delete bookmark')
                        .setIcon('trash')
                        .onClick(() => {
                            this.deleteBookmarkItem(item, usePublic, refresh);
                        })
                    );
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                });
            }
        };
        items.forEach(item => renderItem(item, contentEl));
    }

    // Helper method to delete a bookmark item (add this to your class)
    private deleteBookmarkItem(item: BookmarkItem, usePublic: boolean, refresh: () => void) {
        if (usePublic) {
            // @ts-expect-error-- accessing public bookmarks API
            const publicBookmarks = this.app.bookmarks;
            if (publicBookmarks?.remove && item.id) {
                publicBookmarks.remove(item.id);
            }
        } else {
            // @ts-expect-error - accessing internal plugin API
            const bookmarksPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
            if (!bookmarksPlugin?.instance) return;
            // Try different deletion methods
            if (typeof bookmarksPlugin.instance.removeItem === 'function') {
                bookmarksPlugin.instance.removeItem(item);
            } else if (typeof bookmarksPlugin.instance.delete === 'function') {
                bookmarksPlugin.instance.delete(item);
            } else if (item.id && typeof bookmarksPlugin.instance.deleteItem === 'function') {
                bookmarksPlugin.instance.deleteItem(item.id);
            }
        }
        refresh();
    }
    // End of bookmark

    // Folder note

    private async createFolderNote(folder: TFolder) {
        let noteName: string;
        let notePath: string;
        let displayName: string;

        if (folder.path === '/') {
            const vaultName = this.app.vault.getName();
            noteName = vaultName + '.md';
            notePath = noteName;
            displayName = vaultName;
        } else {
            noteName = folder.name + '.md';
            notePath = `${folder.path}/${noteName}`;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            displayName = folder.name;
        }

        try {
            const file = await this.app.vault.create(notePath, `# ${folder.name}\n\n`);
            await this.app.workspace.getLeaf().openFile(file);
            new Notice('Folder note created.');
        } catch (err) {
            // If creation fails because file already exists, try to open it
            const existing = this.app.vault.getAbstractFileByPath(notePath);
            if (existing instanceof TFile) {
                new Notice('Folder note already exists. Opening it.');
                await this.app.workspace.getLeaf().openFile(existing);
            } else {
                const message = err instanceof Error ? err.message : String(err);
                new Notice(`Failed to create folder note: ${message}`);
            }
        }

        // Refresh side portal if active
        if (this.plugin.settings.activeSplitTab === 'folder-notes') {
            const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
            if (secondaryPanel) {
                const contentEl = secondaryPanel.querySelector('.portals-split-content') as HTMLElement;
                if (contentEl) {
                    contentEl.empty();
                    this.renderFolderNotesTab(contentEl);
                }
            }
        }
    }

    //--RenderFolderNotesTab
    private renderFolderNotesTab(contentEl: HTMLElement) {
        const targetFile = this.getCurrentFolderNote();
        if (!targetFile) {
            contentEl.createEl('p', { text: 'No folder note found for the current space.', cls: 'portals-folder-note-message' });
            return;
        }

        // Check cache
        const filePath = targetFile.path;
        const cached = this.folderNoteCache.get(filePath);
        if (cached) {
            // update access order: move this file to end (most recent)
            const idx = this.folderNoteAccessOrder.indexOf(filePath);
            if (idx !== -1) this.folderNoteAccessOrder.splice(idx, 1);
            this.folderNoteAccessOrder.push(filePath);

            // use cached element
            contentEl.empty();
            contentEl.appendChild(cached.element);
            // Restore scroll position if stored
            const savedScroll = this.folderNoteScrollPositions.get(filePath);
            if (savedScroll !== undefined) {
                cached.element.scrollTop = savedScroll;
                this.folderNoteScrollPositions.delete(filePath);
            }
            return;
        }

        // No cache – create detached element
        const noteContainer = document.createElement('div');
        noteContainer.addClass('markdown-preview-view', 'portals-folder-note-container');

        this.app.vault.read(targetFile).then(async (content) => {
            try {
                const component = new Component();
                this.addChild(component);
                await MarkdownRenderer.render(this.app, content, noteContainer, targetFile.path, component);
                await this.processEmbeds(noteContainer, component, targetFile.path);

                // handle internal links
                noteContainer.addEventListener('click', (e) => {
                    const target = e.target as HTMLElement;
                    const link = target.closest('a');
                    if (!link) return;
                    // check if its internal link (not external http/https)
                    const href = link.getAttribute('href');
                    const dataHref = link.getAttribute('data-href');
                    const targetPath = href || dataHref;
                    if (targetPath && !targetPath.startsWith('http://') && !targetPath.startsWith('http://')) {
                        e.preventDefault();
                        // resolve link relative to current folder note's path
                        const resolved = this.app.metadataCache.getFirstLinkpathDest(targetPath, targetFile.path);
                        if (resolved instanceof TFile) {
                            void this.app.workspace.getLeaf().openFile(resolved);
                        }
                    }
                });

                // Store in cache
                this.folderNoteCache.set(filePath, { element: noteContainer, component });
                this.folderNoteAccessOrder.push(filePath);
                
                // evit least reent used if cache exceeds limit
                if (this.folderNoteCache.size > this.MAX_FOLDER_NOTE_CACHE) {
                    const oldest = this.folderNoteAccessOrder.shift();
                    if (oldest) {
                        const evicted = this.folderNoteCache.get(oldest);
                        if (evicted) {
                            this.removeChild(evicted.component);
                            evicted.element.remove();

                            this.folderNoteCache.delete(oldest);
                        }
                    }
                }

                // restore scroll position if stored
                const savedScroll = this.folderNoteScrollPositions.get(filePath)
                if (savedScroll !== undefined) {
                    noteContainer.scrollTop = savedScroll;
                    this.folderNoteScrollPositions.delete(filePath);
                }

                // Append to contentEl (if still relevant)
                if (this.plugin.settings.activeSplitTab === 'folder-notes' && this.getCurrentFolderNote()?.path === filePath) {
                    contentEl.empty();
                    contentEl.appendChild(noteContainer);
                }
            } catch (e) {
                console.error('Error rendering folder note:', e);
                noteContainer.setText('Error rendering note.');
            }
        }).catch(e => {
            console.error('Error reading folder note:', e);
            noteContainer.setText('Error reading note.');
        });

        noteContainer.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('a')) return;
            void this.app.workspace.getLeaf().openFile(targetFile);
        });
        contentEl.empty();
        contentEl.appendChild(noteContainer);
    }

    //---RenderFoldernote Helper

    private renderFolderNoteContent(file: TFile, container: HTMLElement) {
        const noteContainer = container.createDiv({ cls: 'markdown-preview-view' });

        this.app.vault.read(file).then(async (content) => {
            try {
                const component = new Component();
                this.addChild(component);
                await MarkdownRenderer.render(this.app, content, noteContainer, file.path, component);
                await this.processEmbeds(noteContainer, component, file.path);
            } catch (e) {
                console.error('Error rendering folder note:', e);
                noteContainer.setText('Error rendering note.');
            }
        }).catch(e => {
            console.error('Error reading folder note:', e);
            noteContainer.setText('Error reading note.');
        });

        noteContainer.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('a')) return;
            void this.app.workspace.getLeaf().openFile(file);
        });
    }

    //--Embed Method
    private async processEmbeds(container: HTMLElement, component: Component, sourcePath: string, depth = 0): Promise<void> {
        if (depth > 5) return;
        const embeds = container.querySelectorAll('.internal-embed:not(.processed)');
        for (const embed of Array.from(embeds)) {
            embed.classList.add('processed');
            const src = embed.getAttribute('src') || embed.getAttribute('data-src');
            if (!src) continue;

            const parts = src.split('#');
            const cleanSrc = parts[0];
            if (!cleanSrc) continue;
            const anchor = parts.length > 1 ? parts[1] : null;

            const targetFile = this.app.metadataCache.getFirstLinkpathDest(cleanSrc, sourcePath);
            if (!(targetFile instanceof TFile)) continue;

            // Recursively render Markdown files
            if (targetFile.extension === 'md') {
                const targetContainer = container.createDiv({ cls: 'markdown-preview-view' });
                targetContainer.setAttr('data-source-path', targetFile.path);
                const content = await this.app.vault.read(targetFile);
                const childComponent = new Component();
                component.addChild(childComponent);
                await MarkdownRenderer.render(this.app, content, targetContainer, targetFile.path, childComponent);
                await this.processEmbeds(targetContainer, childComponent, targetFile.path, depth + 1);
                embed.replaceWith(targetContainer);
                continue;
            }

            // For all other file types (including .base), create a styled link
            const linkContainer = container.createDiv({ cls: 'portals-embed-link' });
            const link = linkContainer.createEl('a', { href: '#' });
            link.setText(targetFile.name + (anchor ? ` → ${anchor}` : ''));
            link.addEventListener('click', (e) => {
                e.preventDefault();
                void this.app.workspace.getLeaf().openFile(targetFile);
            });
            embed.replaceWith(linkContainer);
        }
    }
    
    //--End of process embed, start of renderContent


    renderContent() {
        const openFiles = this.getOpenFilePaths();
        const container = this.containerEl.children[1] as HTMLElement;
        const treeContainer = container.querySelector('.portals-tree-container');
        if (!treeContainer) return;
        treeContainer.empty();

        this.fileElementMap.clear();

        const spaces = this.plugin.settings.spaces;
        const selectedSpace = spaces.find(s => 
            s.path === this.plugin.settings.selectedSpace?.path && 
            s.type === this.plugin.settings.selectedSpace?.type
        ) || spaces[0];
        if (!selectedSpace) return;

        if (selectedSpace.type === 'folder') {
            const folder = this.app.vault.getAbstractFileByPath(selectedSpace.path);
            if (folder && folder instanceof TFolder) {
                const totalFirstLevelFolders = folder.children.filter(c => c instanceof TFolder).length;
                const spaceContent = treeContainer.createEl('div', { cls: 'portals-space-content' });
                if (this.plugin.settings.tabColorEnabled && selectedSpace.color && selectedSpace.color !== 'transparent') {
                            spaceContent.style.setProperty('--space-border-color', selectedSpace.color);
                        } else {
                            spaceContent.style.removeProperty('--space-border-color');
                        }
                this.applySpaceBackground(spaceContent, selectedSpace.color);
                this.makeDropTarget(spaceContent, folder, true);
                this.buildFolderTree(folder, spaceContent, openFiles, selectedSpace.icon, 0, 0, totalFirstLevelFolders);
            } else {
                treeContainer.createEl('p', { text: `Folder not found: ${selectedSpace.path}` });
            }
        } else {
            const groupCount = selectedSpace.groupTags?.length ?? 0;
            const spaceContent = treeContainer.createEl('div', { cls: 'portals-space-content' });
            if (this.plugin.settings.tabColorEnabled && selectedSpace.color && selectedSpace.color !== 'transparent') {
                            spaceContent.style.setProperty('--space-border-color', selectedSpace.color);
                        } else {
                            spaceContent.style.removeProperty('--space-border-color');
                        }
            this.applySpaceBackground(spaceContent, selectedSpace.color);
            this.buildTagSpace(selectedSpace.path, spaceContent, selectedSpace.icon, openFiles, selectedSpace.groupTags, 0, 0, groupCount);
        }
    }

    public refreshRecentTab() {
        const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
        if (!secondaryPanel) return;
        const activeTab = this.plugin.settings.activeSplitTab;
        if (activeTab === 'recent') {
            this.renderSplitTabContent(secondaryPanel as HTMLElement, 'recent');
        }
    }

    private applySpaceBackground(el: HTMLElement, color: string | undefined) {
        const bgColor = color || 'transparent';
        const style = this.plugin.settings.filePaneColorStyle;

        // Remove any previous background classes
        el.removeClass('solid-bg', 'gradient-bg');

        if (style === 'none' || bgColor === 'transparent') {
            el.style.removeProperty('--space-bg-color');
            return;
        }

        el.style.setProperty('--space-bg-color', bgColor);
        if (style === 'solid') {
            el.addClass('solid-bg');
        } else if (style === 'gradient') {
            el.addClass('gradient-bg');
        }
    }

    private getDisplayName(file: TFile): string {
        if (file.extension === 'md') {
            return file.basename;
        }
        return file.name;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private buildTagSpace(tagName: string, container: HTMLElement, iconName: string, openFiles: Set<string>, groupTags?: string[], depth: number = 0, index: number = 0, totalGroups: number = 0) {
        const mainTag = '#' + tagName;
        const allFiles = this.app.vault.getMarkdownFiles();

        // collect all files that have the main tag or any subtag (tagname/anything)
        const relevantFiles = allFiles.filter(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const fileTags = [
            ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
            ...(cache?.frontmatter?.tags || [])
        ];
            return fileTags.some(t => t === tagName || t.startsWith(tagName + '/'));
        });

        if (relevantFiles.length === 0) {
            container.createEl('p', { text: 'No files with this tag or its subtags.' });
            return;
        }

        // build a map : full tag path > array of files that have that tag
        const tagToFiles = new Map<string, TFile[]>();
        const allTags = new Set<string>();

        for (const file of relevantFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fileTags = [
                ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                ...(cache?.frontmatter?.tags || [])
            ];
            for (const tag of fileTags) {
                if (tag === tagName || tag.startsWith(tagName + '/')) {
                    allTags.add(tag);
                    if (!tagToFiles.has(tag)) tagToFiles.set(tag, []);
                    tagToFiles.get(tag)!.push(file);
                }
            }
        }

        // Determine if there are any subtags (i.e., tags longer than the main tag)
        const hasSubtags = Array.from(allTags).some(t => t !== tagName && t.startsWith(tagName + '/'));

        // If no subtags, use the original logic (group tags or flat list)
        if (!hasSubtags) {
            // Original flat/group logic (unchanged from your current method)
            const taggedFiles = allFiles.filter(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                return cache?.tags?.some(t => t.tag === mainTag) || cache?.frontmatter?.tags?.includes(tagName);
            });
            if (taggedFiles.length === 0) {
                container.createEl('p', { text: 'No files with this tag.' });
                return;
            }

            // Sort helper 
            const sortFiles = (files: TFile[]) => files.sort((a, b) => {
                const sortBy = this.plugin.settings.sortBy;
                const sortOrder = this.plugin.settings.sortOrder;
                let aVal: string | number, bVal: string | number;
                switch (sortBy) {
                    case 'name': aVal = a.name; bVal = b.name; break;
                    case 'created': aVal = a.stat.ctime; bVal = b.stat.ctime; break;
                    case 'modified': aVal = a.stat.mtime; bVal = b.stat.mtime; break;
                    default: aVal = a.name; bVal = b.name;
                }
                if (sortOrder === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                else return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            });
        

            // Create main details element for the tag
            const mainDetails = container.createEl('details', { cls: 'folder-details' });
            mainDetails.setAttr('open', 'true');
            const mainSummary = mainDetails.createEl('summary', { cls: 'folder-summary' });
            const mainIconSpan = mainSummary.createSpan({ cls: 'folder-icon' });
            mainIconSpan.createEl('i', { cls: `ph ph-${iconName || 'tag'}` });
            mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
            const childrenContainer = mainDetails.createDiv({ cls: 'folder-children' });

            // If no groups, just list all files under the main tag
            if (!groupTags || groupTags.length === 0) {
                for (const file of sortFiles(taggedFiles)) {
                    this.createFileItem(file, childrenContainer, openFiles);
                }
                return;
            }

            // Build groups map
            const groups = new Map<string, TFile[]>();
            groupTags.forEach(t => groups.set(t, []));
            const ungrouped: TFile[] = [];

            for (const file of taggedFiles) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fileTags = new Set([
                    ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                    ...(cache?.frontmatter?.tags || [])
                ]);

                let hasGroup = false;
                for (const gTag of groupTags) {
                    if (fileTags.has(gTag)) {
                        groups.get(gTag)!.push(file);
                        hasGroup = true;
                    }
                }
                if (!hasGroup) ungrouped.push(file);
            }

            // Render each group as a nested details element (always open)
            let groupIndex = 0;
            for (const [gTag, files] of groups.entries()) {
                if (files.length === 0) continue;
                const groupDetails = childrenContainer.createEl('details', { cls: 'folder-details' });
                const groupKey = this.getTagGroupKey(tagName, gTag);
                groupDetails.dataset.groupKey = groupKey; // for potential future use

                // open state based on expanded groups
                const saveExpanded = this.plugin.settings.expandedGroups[tagName] || [];
                if (saveExpanded.includes(gTag)) {
                    groupDetails.open = true;
                } else {
                    groupDetails.open = false; // default closed
                }
                const summary = groupDetails.createEl('summary', { cls: 'folder-summary' });
                const groupChildren = groupDetails.createDiv({ cls: 'folder-children' });

                // Shades Style
                if (depth === 0 && this.plugin.settings.treeStyle === 'shades') {
                    const minOpacity = 0.1;
                    const maxOpacity = 0.4;
                    let shadeOpacity;
                    const total = totalGroups > 0 ? totalGroups : 1;
                    if (total <= 1) {
                        shadeOpacity = minOpacity
                    } else {
                        const progress = groupIndex / (total -1);
                        shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                    }
                    shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));

                    summary.classList.add('shaded-folder-summary');
                    summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                    groupChildren.classList.add('shaded-folder-children');
                    groupChildren.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                }

                // Hue Style
                if (depth === 0 && this.plugin.settings.treeStyle === 'hues') {
                    const total = totalGroups > 0 ? totalGroups : 1;
                    let progress = groupIndex / (total - 1);
                    if (total <= 1) progress = 0.5;
                    const hue = progress * 360;
                    const minOpacity = 0.1;
                    const maxOpacity = 0.3;
                    let opacity;
                    if (total <= 1) {
                        opacity = minOpacity;
                    } else {
                        opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                        opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
                    }
                    summary.classList.add('hued-folder-summary');
                    summary.style.setProperty('--hue-start', String(hue));
                    summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                    summary.style.setProperty('--hue-opacity', String(opacity));
                    groupChildren.classList.add('hued-folder-children');
                    groupChildren.style.setProperty('--hue-start', String(hue));
                    groupChildren.style.setProperty('--hue-end', String((hue + 30) % 360));
                    groupChildren.style.setProperty('--hue-opacity', String(opacity * 0.6));
                }

                // icon with custom support
                const customIcon = this.getCustomIcon(groupKey);
                const iconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-tag-simple';
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                iconSpan.createEl('i', { cls: iconClass });
                summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');

                // contex menu for group
                summary.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const menu = new Menu();
                    menu.addItem(item => item
                        .setTitle('Set custom icon')
                        .setIcon('image')
                        .onClick(() => this.setCustomIconForTagGroup(tagName, gTag, groupKey)));
                    if (this.getCustomIcon(groupKey)) {
                        menu.addItem(item => item
                            .setTitle('Remove custom icon')
                            .setIcon('trash')
                            .onClick(() => this.removeCustomIconForTagGroup(groupKey)));
                    }
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                });
                
                for (const file of sortFiles(files)) {
                    this.createFileItem(file, groupChildren, openFiles);
                }

                groupDetails.addEventListener('toggle', () => {
                    const isOpen = groupDetails.open;
                    let expanded = this.plugin.settings.expandedGroups[tagName] || [];
                    if (isOpen) {
                        if (!expanded.includes(gTag)) {
                            expanded = [...expanded, gTag];
                        }
                    } else {
                        expanded = expanded.filter(t => t !== gTag);
                    }
                    this.plugin.settings.expandedGroups[tagName] = expanded;
                    this.plugin.saveData(this.plugin.settings).catch(console.error);
                });
                groupIndex++;
            }

            // Render ungrouped files directly under main tag
            for (const file of sortFiles(ungrouped)) {
                this.createFileItem(file, childrenContainer, openFiles);
            }
            return;
        }

        // ----- HIERARCHICAL TAGS (subtags exist) -----
        // Build a tree structure
        interface TagNode {
            fullPath: string;
            name: string;
            children: Map<string, TagNode>;
            files: TFile[];
        }

        const root: TagNode = { fullPath: tagName, name: tagName, children: new Map(), files: tagToFiles.get(tagName) || [] };

        // Insert each tag into the tree
        for (const tag of allTags) {
            if (tag === tagName) continue;
            const parts = tag.split('/');
            let current = root;
            let currentPath = tagName;
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (!part) continue;
                currentPath = currentPath + '/' + part;
                if (!current.children.has(part)) {
                    current.children.set(part, {
                        fullPath: currentPath,
                        name: part,
                        children: new Map(),
                        files: tagToFiles.get(currentPath) || []
                    });
                }
                current = current.children.get(part)!;
            }
        }

        const sortFiles = (files: TFile[]) => files.sort((a, b) => {
            const sortBy = this.plugin.settings.sortBy;
            const sortOrder = this.plugin.settings.sortOrder;
            let aVal: string | number, bVal: string | number;
            switch (sortBy) {
                case 'name': aVal = a.name; bVal = b.name; break;
                case 'created': aVal = a.stat.ctime; bVal = b.stat.ctime; break;
                case 'modified': aVal = a.stat.mtime; bVal = b.stat.mtime; break;
                default: aVal = a.name; bVal = b.name;
            }
            if (sortOrder === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            else return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        });

        const renderNode = (node: TagNode, parentEl: HTMLElement, level: number, index: number = 0, total: number = 1) => {
            const details = parentEl.createEl('details', { cls: 'folder-details' });
            const expandedSet = this.plugin.settings.expandedTagHierarchy[tagName] || [];
            if (expandedSet.includes(node.fullPath)) {
                details.open = true;
            }

            const summary = details.createEl('summary', { cls: 'folder-summary' });
            const nodeKey = `tag:${tagName}/node:${node.fullPath}`;
            const customIcon = this.getCustomIcon(nodeKey);
            const iconClass = customIcon ? `ph ph-${customIcon}` : `ph ph-${iconName || 'tag'}`;
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            const nameSpan = summary.createSpan({ text: node.name });
            nameSpan.addClass('portals-item-name');
            summary.dataset.tagPath = node.fullPath;

            // Context menu for custom icon on tag node
            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const menu = new Menu();
                const groupKey = `tag:${tagName}/node:${node.fullPath}`;
                menu.addItem(item => item
                    .setTitle('Set custom icon')
                    .setIcon('image')
                    .onClick(() => this.setCustomIconForTagGroup(tagName, node.fullPath, groupKey)));
                if (this.getCustomIcon(groupKey)) {
                    menu.addItem(item => item
                        .setTitle('Remove custom icon')
                        .setIcon('trash')
                        .onClick(() => this.removeCustomIconForTagGroup(groupKey)));
                }
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });

            const childrenContainer = details.createDiv({ cls: 'folder-children' });

            // Apply shades/hues styling only at level 1
            if (level === 1 && this.plugin.settings.treeStyle === 'shades') {
                const minOpacity = 0.1, maxOpacity = 0.4;
                let shadeOpacity;
                if (total > 1) {
                    const progress = index / (total - 1);
                    shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    shadeOpacity = minOpacity;
                }
                shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));
                summary.classList.add('shaded-folder-summary');
                summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                childrenContainer.classList.add('shaded-folder-children');
                childrenContainer.style.setProperty('--folder-shade-opacity', String(shadeOpacity * 0.6));
            } else if (level === 1 && this.plugin.settings.treeStyle === 'hues') {
                const minOpacity = 0.1, maxOpacity = 0.3;
                let hue, opacity;
                if (total > 1) {
                    const progress = index / (total - 1);
                    hue = progress * 360;
                    opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    hue = 0;
                    opacity = minOpacity;
                }
                opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
                summary.classList.add('hued-folder-summary');
                summary.style.setProperty('--hue-start', String(hue));
                summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                summary.style.setProperty('--hue-opacity', String(opacity));
                childrenContainer.classList.add('hued-folder-children');
                childrenContainer.style.setProperty('--hue-start', String(hue));
                childrenContainer.style.setProperty('--hue-end', String((hue + 30) % 360));
                childrenContainer.style.setProperty('--hue-opacity', String(opacity * 0.6));
            }

            // Render child tags
            const sortedChildren = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
            for (const child of sortedChildren) {
                renderNode(child, childrenContainer, level + 1);
            }

            // Render files belonging to this node, possibly grouped
            if (node.files.length > 0) {
                for (const file of sortFiles(node.files)) {
                    this.createFileItem(file, childrenContainer, openFiles);
                }
            }

            // Save expand/collapse state
            details.addEventListener('toggle', () => {
                let expanded = this.plugin.settings.expandedTagHierarchy[tagName] || [];
                if (details.open) {
                    if (!expanded.includes(node.fullPath)) {
                        expanded = [...expanded, node.fullPath];
                    }
                } else {
                    expanded = expanded.filter(p => p !== node.fullPath);
                }
                this.plugin.settings.expandedTagHierarchy[tagName] = expanded;
                this.plugin.saveData(this.plugin.settings).catch(console.error);
            });
        };

        // Main wrapper details for the portal
        const mainDetails = container.createEl('details', { cls: 'folder-details' });
        mainDetails.open = true;
        const mainSummary = mainDetails.createEl('summary', { cls: 'folder-summary' });
        const mainIconSpan = mainSummary.createSpan({ cls: 'folder-icon' });
        mainIconSpan.createEl('i', { cls: `ph ph-${iconName || 'tag'}` });
        mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
        const mainChildren = mainDetails.createDiv({ cls: 'folder-children' });

        // Build unified list of top-level items (subtags + groups from root files)
        interface TopLevelItem {
            type: 'subtag' | 'group';
            name: string;
            data: TagNode | { tag: string; files: TFile[] };
        }

        const topLevelItems: TopLevelItem[] = [];

        // Add subtag nodes
        const topChildren = Array.from(root.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const child of topChildren) {
            topLevelItems.push({ type: 'subtag', name: child.name, data: child });
        }

        // Add groups from root files (if any groupTags)
        if (groupTags && groupTags.length > 0) {
            // Build groups map from root.files (files directly under main tag, not under subtags)
            const groupsMap = new Map<string, TFile[]>();
            groupTags.forEach(t => groupsMap.set(t, []));
            for (const file of root.files) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fileTags = new Set([
                    ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                    ...(cache?.frontmatter?.tags || [])
                ]);
                for (const gTag of groupTags) {
                    if (fileTags.has(gTag)) {
                        groupsMap.get(gTag)!.push(file);
                    }
                }
            }
            for (const [gTag, files] of groupsMap.entries()) {
                if (files.length) {
                    topLevelItems.push({ type: 'group', name: gTag, data: { tag: gTag, files } });
                }
            }
        }

        // Sort alphabetically
        topLevelItems.sort((a, b) => a.name.localeCompare(b.name));

        // Helper to render a single group (extracted from groupAndRenderFiles)
        const renderSingleGroup = (gTag: string, files: TFile[], parentEl: HTMLElement, level: number, idx: number, total: number) => {
            if (files.length === 0) return;
            const groupDetails = parentEl.createEl('details', { cls: 'folder-details' });
            const groupKey = this.getTagGroupKey(tagName, gTag);
            groupDetails.dataset.groupKey = groupKey;
            const savedExpanded = this.plugin.settings.expandedGroups[tagName] || [];
            groupDetails.open = savedExpanded.includes(gTag);
            const summary = groupDetails.createEl('summary', { cls: 'folder-summary' });
            const groupChildren = groupDetails.createDiv({ cls: 'folder-children' });

            // Apply styling for level 1
            if (level === 1 && this.plugin.settings.treeStyle === 'shades') {
                const minOpacity = 0.1, maxOpacity = 0.4;
                let shadeOpacity;
                if (total > 1) {
                    const progress = idx / (total - 1);
                    shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    shadeOpacity = minOpacity;
                }
                shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));
                summary.classList.add('shaded-folder-summary');
                summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                groupChildren.classList.add('shaded-folder-children');
                groupChildren.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
            } else if (level === 1 && this.plugin.settings.treeStyle === 'hues') {
                const minOpacity = 0.1, maxOpacity = 0.3;
                let hue, opacity;
                if (total > 1) {
                    const progress = idx / (total - 1);
                    hue = progress * 360;
                    opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    hue = 0;
                    opacity = minOpacity;
                }
                opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
                summary.classList.add('hued-folder-summary');
                summary.style.setProperty('--hue-start', String(hue));
                summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                summary.style.setProperty('--hue-opacity', String(opacity));
                groupChildren.classList.add('hued-folder-children');
                groupChildren.style.setProperty('--hue-start', String(hue));
                groupChildren.style.setProperty('--hue-end', String((hue + 30) % 360));
                groupChildren.style.setProperty('--hue-opacity', String(opacity * 0.6));
            }

            const customIconGroup = this.getCustomIcon(groupKey);
            const iconClass = customIconGroup ? `ph ph-${customIconGroup}` : 'ph ph-tag-simple';
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');

            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem(item => item
                    .setTitle('Set custom icon')
                    .setIcon('image')
                    .onClick(() => this.setCustomIconForTagGroup(tagName, gTag, groupKey)));
                if (this.getCustomIcon(groupKey)) {
                    menu.addItem(item => item
                        .setTitle('Remove custom icon')
                        .setIcon('trash')
                        .onClick(() => this.removeCustomIconForTagGroup(groupKey)));
                }
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });

            for (const file of sortFiles(files)) {
                this.createFileItem(file, groupChildren, openFiles);
            }

            groupDetails.addEventListener('toggle', () => {
                let expanded = this.plugin.settings.expandedGroups[tagName] || [];
                if (groupDetails.open) {
                    if (!expanded.includes(gTag)) expanded = [...expanded, gTag];
                } else {
                    expanded = expanded.filter(t => t !== gTag);
                }
                this.plugin.settings.expandedGroups[tagName] = expanded;
                this.plugin.saveData(this.plugin.settings).catch(console.error);
            });
        };

        // Render all top-level items with global index
        const totalTop = topLevelItems.length;
        topLevelItems.forEach((item, idx) => {
            if (item.type === 'subtag') {
                renderNode(item.data as TagNode, mainChildren, 1, idx, totalTop);
            } else {
                const groupData = item.data as { tag: string; files: TFile[] };
                renderSingleGroup(groupData.tag, groupData.files, mainChildren, 1, idx, totalTop);
            }
        });

        // Render ungrouped root files (files directly under main tag that are not in any group)
        const ungroupedRootFiles: TFile[] = [];
        if (groupTags && groupTags.length > 0) {
            const groupedFiles = new Set<TFile>();
            for (const item of topLevelItems) {
                if (item.type === 'group') {
                    for (const f of (item.data as { files: TFile[] }).files) groupedFiles.add(f);
                }
            }
            for (const file of root.files) {
                if (!groupedFiles.has(file)) ungroupedRootFiles.push(file);
            }
        } else {
            ungroupedRootFiles.push(...root.files);
        }
        for (const file of sortFiles(ungroupedRootFiles)) {
            this.createFileItem(file, mainChildren, openFiles);
        }
    }

    private showFileContextMenu(event: MouseEvent, file: TFile, fileEl: HTMLElement) {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle('Open in new tab')
            .setIcon('document')
            .onClick(() => void this.app.workspace.getLeaf('tab').openFile(file)));

        menu.addItem(item => item
            .setTitle('Open to the right')
            .setIcon('file-symlink')
            .onClick(() => void this.app.workspace.getLeaf('split', 'vertical').openFile(file)));

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Delete')
            .setIcon('trash')
            .onClick(() => void this.deleteFile(file)));

        menu.addItem(item => item
            .setTitle('Duplicate')
            .setIcon('copy')
            .onClick(() => void this.duplicateFile(file)));

        menu.addItem(item => item
            .setTitle('Rename')
            .setIcon('pencil')
            .onClick(() => this.startRenameFile(file, fileEl)));
        
        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Set custom icon')
            .setIcon('image')
            .onClick(() => this.setCustomIcon(file.path, file.name)));

        if (this.getCustomIcon(file.path)) {
            menu.addItem(item => item
                .setTitle('Remove custom icon')
                .setIcon('trash')
                .onClick(() => this.removeCustomIcon(file.path)));
        }

        menu.addSeparator();

        this.app.workspace.trigger('file-menu', menu, file, 'file-explorer');

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    private showFolderContextMenu(event: MouseEvent, folder: TFolder, summaryEl: HTMLElement) {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle('New note')
            .setIcon('document')
            .onClick(() => void this.newNoteInFolder(folder)));

        menu.addItem(item => item
            .setTitle('New folder')
            .setIcon('folder')
            .onClick(() => void this.newFolderInFolder(folder)));

        menu.addItem(item => item
            .setTitle('New canvas')
            .setIcon('layout-dashboard')
            .onClick(() => void this.newCanvasInFolder(folder)));

        if (this.plugin.settings.enableFolderNotes) {
            const folderNote = folder.children.find((child): child is TFile =>
                child instanceof TFile && this.isFolderNote(child, folder));
            if (folderNote) {
                menu.addItem(item => item
                    .setTitle('Open folder note')
                    .setIcon('document')
                    .onClick(() => void this.app.workspace.getLeaf().openFile(folderNote)));
            } else {
                menu.addItem(item => item
                    .setTitle('Create folder note')
                    .setIcon('plus')
                    .onClick(() => void this.createFolderNote(folder)));
            }
        }

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Delete')
            .setIcon('trash')
            .onClick(() => void this.deleteFolder(folder)));

        menu.addItem(item => item
            .setTitle('Duplicate')
            .setIcon('copy')
            .onClick(() => void this.duplicateFolder(folder)));

        menu.addItem(item => item
            .setTitle('Rename')
            .setIcon('pencil')
            .onClick(() => this.startRenameFolder(folder, summaryEl)));

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Set custom icon')
            .setIcon('image')
            .onClick(() => this.setCustomIcon(folder.path, folder.name)));

        if (this.getCustomIcon(folder.path)) {
            menu.addItem(item => item
                .setTitle('Remove custom icon')
                .setIcon('trash')
                .onClick(() => this.removeCustomIcon(folder.path)));
        }

        menu.addSeparator();

        this.app.workspace.trigger('file-menu', menu, folder, 'file-explorer');

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    private executeCommand(commandId: string) {
        try {
            // @ts-expect-error - accessing commands API which is not typed
            this.app.commands.executeCommandById(commandId);
        } catch (err) {
            const message = err instanceof Error ? err.message: String(err);
            console.error(`Command failed: ${commandId}`, err);
            new Notice(`Command failed: ${message}`);
        }
    }

    private createRenameInput(initialValue: string, onSave: (val: string) => void, onCancel: () => void): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = initialValue;
        input.addClass('portals-rename-input');

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onSave(input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        });
        return input;
    }

    private startRenameFile(file: TFile, fileEl: HTMLElement) {
        const nameSpan = fileEl.querySelector('.portals-item-name') as HTMLElement;
        if (!nameSpan) return;

        const isMd = file.extension === 'md';
        const base = isMd ? file.basename : file.name;

        const input = this.createRenameInput(base, (newBase) => {
            (async () => {
                if (!newBase || newBase === base) return;
                const newName = isMd ? newBase + '.' + file.extension : newBase;
                const newPath = file.parent ? `${file.parent.path}/${newName}` : newName;
                try {
                    await this.app.vault.rename(file, newPath);
                    new Notice('File renamed');
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Rename failed: ${message}`);
                } finally {
                    this.renaming = false;
                    document.removeEventListener('mousedown', outsideClickListener);
                    this.renderContent();
                }
            })().catch(err => console.error('Rename error:', err));
        }, () => {
            this.renaming = false;
            document.removeEventListener('mousedown', outsideClickListener);
            this.renderContent();
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        this.renaming = true;

        const outsideClickListener = (e: MouseEvent) => {
            if (!input.contains(e.target as Node)) {
                document.removeEventListener('mousedown', outsideClickListener);
                this.renaming = false;
                this.renderContent();
            }
        };
        document.addEventListener('mousedown', outsideClickListener);
    }

    private startRenameFolder(folder: TFolder, summaryEl: HTMLElement) {
        const nameSpan = summaryEl.querySelector('.portals-item-name') as HTMLElement;
        if (!nameSpan) return;

        const input = this.createRenameInput(folder.name, (newName) => {
            (async () => {
                if (!newName || newName === folder.name) return;
                const parent = folder.parent?.path || '';
                const newPath = parent ? `${parent}/${newName}` : newName;
                try {
                    await this.app.vault.rename(folder, newPath);
                    new Notice('Folder renamed');
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Rename failed: ${message}`);
                } finally {
                    this.renaming = false;
                    document.removeEventListener('mousedown', outsideClickListener);
                    this.renderContent();
                }
            })().catch(err => console.error('Rename error:', err));
        }, () => {
            this.renaming = false;
            document.removeEventListener('mousedown', outsideClickListener);
            this.renderContent();
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        this.renaming = true;

        const outsideClickListener = (e: MouseEvent) => {
            if (!input.contains(e.target as Node)) {
                document.removeEventListener('mousedown', outsideClickListener);
                this.renaming = false;
                this.renderContent();
            }
        };
        document.addEventListener('mousedown', outsideClickListener);
    }

    private scrollToAndHighlight(path: string) {
        setTimeout(() => {
            const item = this.containerEl.querySelector(`[data-path="${path}"]`);
            if (item) {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                item.addClass('portals-item-highlight');
                setTimeout(() => item.removeClass('portals-item-highlight'), 2000);
            }
        }, 100);
    }

    private triggerRenameOnPath(path: string) {
        this.scrollToAndHighlight(path);
        setTimeout(() => {
            const item = this.containerEl.querySelector(`[data-path="${path}"]`);
            if (!item) return;
            const abstractFile = this.app.vault.getAbstractFileByPath(path);
            if (abstractFile instanceof TFile) {
                this.startRenameFile(abstractFile, item as HTMLElement);
            } else if (abstractFile instanceof TFolder) {
                this.startRenameFolder(abstractFile, item as HTMLElement);
            }
        }, 200);
    }

    private getActiveFilePath(): string | null {
        const activeFile = this.app.workspace.getActiveFile();
        return activeFile ? activeFile.path : null;
    }

    private async duplicateFolder(folder: TFolder) {
        const parent = folder.parent;
        const parentPath = parent ? parent.path : '';
        let newName = `${folder.name} copy`;
        let newPath = parentPath ? `${parentPath}/${newName}` : newName;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            newName = `${folder.name} copy ${counter}`;
            newPath = parentPath ? `${parentPath}/${newName}` : newName;
        }

        try {
            await this.app.vault.createFolder(newPath);
            await this.copyFolderContents(folder, newPath);
            new Notice(`Folder duplicated to ${newName}`);
            this.renderContent();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Duplicate failed: ${message}`);
        }
    }

    private async copyFolderContents(source: TFolder, destPath: string) {
        for (const child of source.children) {
            const childDestPath = `${destPath}/${child.name}`;
            if (child instanceof TFolder) {
                await this.app.vault.createFolder(childDestPath);
                await this.copyFolderContents(child, childDestPath);
            } else if (child instanceof TFile) {
                await this.app.vault.copy(child, childDestPath);
            }
        }
    }

    private async duplicateFile(file: TFile) {
        const dir = file.parent?.path || '';
        const ext = file.extension;
        const baseName = file.basename;
        let newName = `${baseName} copy.${ext}`;
        let newPath = dir ? `${dir}/${newName}` : newName;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            newName = `${baseName} copy ${counter}.${ext}`;
            newPath = dir ? `${dir}/${newName}` : newName;
        }
        try {
            await this.app.vault.copy(file, newPath);
            new Notice(`Duplicated to ${newName}`);
            this.renderContent();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Duplicate failed: ${message}`);
        }
    }

    private async deleteFile(file: TFile) {
        try {
            await this.app.fileManager.trashFile(file);
            delete this.plugin.settings.customIcons[file.path];
            await this.plugin.saveSettings();
            new Notice(`File "${file.name}" moved to trash`, 2000); // auto-hide after 2s
            this.renderContent();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Delete failed: ${message}`, 3000);
        }
    }

    private async deleteFolder(folder: TFolder) {
        try {
            await this.app.fileManager.trashFile(folder);
            const toDelete = Object.keys(this.plugin.settings.customIcons).filter(path => path === folder.path || path.startsWith(folder.path + '/'));
            for (const path of toDelete) {
                delete this.plugin.settings.customIcons[path];
            }
            await this.plugin.saveSettings();
            new Notice(`Folder "${folder.name}" moved to trash`, 2000);
            this.renderContent();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Delete failed: ${message}`, 3000);
        }
    }


    // New Note creation in Folder space
    private async newNoteInFolder(folder: TFolder) {
        const defaultName = 'Untitled.md';
        const basePath = folder.path === '/' ? '' : folder.path;
        let candidate = basePath ? `${basePath}/${defaultName}` : defaultName;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = basePath ? `${basePath}/Untitled ${counter}.md` : `Untitled ${counter}.md`;
            counter++;
        }
        try {
            const newFile = await this.app.vault.create(candidate, '');
            await this.app.workspace.getLeaf().openFile(newFile);

            if (!this.plugin.settings.openFolders.includes(folder.path)) {
                this.plugin.settings.openFolders.push(folder.path);
                await this.plugin.saveData(this.plugin.settings);
            }

            this.renderContent();
            this.triggerRenameOnPath(newFile.path);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create note: ${message}`);
        }
    }

    // New Folder Creation in Folder space
    private async newFolderInFolder(parent: TFolder) {
        const defaultName = 'New Folder';
        const basePath = parent.path === '/' ? '' : parent.path;
        let candidate = basePath ? `${basePath}/${defaultName}` : defaultName;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = basePath ? `${basePath}/New Folder ${counter}` : `New Folder ${counter}`;
            counter++;
        }
        try {
            await this.app.vault.createFolder(candidate);

            if (!this.plugin.settings.openFolders.includes(parent.path)) {
                this.plugin.settings.openFolders.push(parent.path);
                await this.plugin.saveData(this.plugin.settings);
            }

            this.renderContent();
            this.triggerRenameOnPath(candidate);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create folder: ${message}`);
        }
    }

    // New Canvas creation in Folder Space
    private async newCanvasInFolder(folder: TFolder) {
        const defaultName = 'Untitled.canvas';
        let candidate = `${folder.path}/${defaultName}`;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = `${folder.path}/Untitled ${counter}.canvas`;
            counter++;
        }
        try {
            await this.app.vault.create(candidate, '{"nodes":[],"edges":[]}');
            new Notice('Canvas created');
            this.renderContent();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create canvas: ${message}`);
        }
    }

    // New Note Creation in Tag Space
    private async newNoteInTagSpace(tagName: string) {
        const defaultName = 'Untitled.md'
        let candidate = defaultName;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = `Untitled ${counter}.md`;
            counter++;
        }
        try {
            const newFile = await this.app.vault.create(candidate, '');
            // add the tag to frontmatter
            await this.app.fileManager.processFrontMatter(newFile, (frontmatter) => {
                if (!frontmatter.tags) {
                    frontmatter.tags = [tagName];
                } else if (Array.isArray(frontmatter.tags)) {
                    if (!frontmatter.tags.includes(tagName)) {
                        frontmatter.tags.push(tagName);
                    }
                } else {
                    // if tags is a string, convert to array
                    const existing = frontmatter.tags
                    frontmatter.tags = [existing, tagName];
                }
            });
            await this.app.workspace.getLeaf().openFile(newFile);
            this.renderContent();
            this.triggerRenameOnPath(newFile.path);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create note: ${message}`);
        }
    }

    private makeDropTarget(el: HTMLElement, folder: TFolder, allowFolders: boolean = false) {
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.addClass('drag-over');
        });
        el.addEventListener('dragleave', () => {
            el.removeClass('drag-over');
        });
        el.addEventListener('drop', (e) => {
            (async () => {
                e.preventDefault();
                e.stopPropagation();
                el.removeClass('drag-over');
                const filePath = e.dataTransfer?.getData('text/plain');
                if (!filePath) return;
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!file) return;

                const targetPath = `${folder.path}/${file.name}`;
                if (targetPath === file.path) return;

                try {
                    if (file instanceof TFile) {
                        await this.app.vault.rename(file, targetPath);
                        new Notice(`Moved to ${folder.name}`);
                    } else if (allowFolders && file instanceof TFolder) {
                        if (targetPath.startsWith(file.path + '/') || targetPath === file.path) {
                            new Notice('Cannot move folder into itself');
                            return;
                        }
                        await this.app.vault.rename(file, targetPath);
                        new Notice(`Moved folder to ${folder.name}`);
                    } else {
                        new Notice('Cannot move this item');
                        return;
                    }
                    this.renderContent();
                } catch (err) {
                    console.error('Drop error:', err);
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Failed to move: ${message}`);
                }
            })().catch(err => console.error(err));
        });
    }

    buildFolderTree(folder: TFolder, container: HTMLElement, openFiles: Set<string>, iconName: string = 'folder', depth: number = 0, index: number = 0, totalFirstLevelFolders: number = 0) {
        const details = container.createEl('details');
        details.addClass('folder-details');

        if (this.plugin.settings.openFolders.includes(folder.path)) {
            details.setAttr('open', 'true');
        }

        const summary = details.createEl('summary');
        summary.addClass('folder-summary');

        const customIcon = this.getCustomIcon(folder.path);
        const folderIcon = customIcon || iconName;
        const iconSpan = summary.createSpan({ cls: 'folder-icon' });
        iconSpan.createEl('i', { cls: `ph ph-${folderIcon}` });
        const hasNote = this.hasFolderNote(folder);
        if (this.plugin.settings.enableFolderNotes && hasNote) {
            const style = this.plugin.settings.folderNoteHighlightStyle;
            if (style === 'icon') {
                iconSpan.addClass('has-folder-note-icon')
                if (this.plugin.settings.treeStyle === 'minimal' || this.plugin.settings.treeStyle === 'shades') {
                    summary.addClass('has-folder-note-icon');
                }
            } else if (style === 'underline') {
                summary.addClass('has-folder-note-underline');
                const nameSpan = summary.querySelector('.portals-item-name');
                nameSpan?.addClass('has-folder-note-underline');
            }
        }

        const displayName = folder.path === '/' ? this.app.vault.getName() : folder.name;
        const nameSpan = summary.createSpan({ text: displayName });
        nameSpan.addClass('portals-item-name');
        summary.dataset.path = folder.path;

        const activePath = this.getActiveFilePath();
        if (activePath) {
            const isAncestor = folder.path === '/' ? true : activePath.startsWith(folder.path + '/');
            if (isAncestor) {
                summary.createSpan({ cls: 'open-dot' });
            }
        }

        if (!Platform.isMobile) {
            summary.draggable = true;
            summary.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', folder.path);
            });
        }

        this.makeDropTarget(summary, folder, true);

        summary.addEventListener('click', (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                void this.handleFolderNoteCreation(folder);
                return;
            }
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault()
                e.stopPropagation()

                const folderNote = this.getFolderNote(folder);
                if (folderNote) {
                    void this.app.workspace.getLeaf('tab').openFile(folderNote);
                } else {
                    new Notice('No folder note exists for this folder', 2000);
                }
            }
        });


        summary.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showFolderContextMenu(e, folder, summary);
        });
                
        const childrenContainer = details.createDiv({ cls: 'folder-children' });

        // For first-level folders (depth === 1) when using shades style
        if (depth === 1 && this.plugin.settings.treeStyle === 'shades') {
            const minOpacity = 0.1;
            const maxOpacity = 0.3;
            let shadeOpacity;

            const total = totalFirstLevelFolders > 0 ? totalFirstLevelFolders : 1;

            if (total <= 1) {
                shadeOpacity = minOpacity
            } else {
                const progress = index / (total - 1);
                shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));
            }
            // clamp to safe range
            shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));

            summary.classList.add('shaded-folder-summary');
            summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
            childrenContainer.classList.add('shaded-folder-children');
            childrenContainer.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
        }

        // For first-level folders (depth === 1) when using hues style
        if (depth === 1 && this.plugin.settings.treeStyle === 'hues') {
            const total = totalFirstLevelFolders > 0 ? totalFirstLevelFolders : 1;
            let progress = index / (total - 1);
            if (total <= 1) progress = 0.5; // middle

            // Compute hue (0 to 360)
            const hue = progress * 360;
            // Compute opacity (same as shades logic)
            const minOpacity = 0.1;
            const maxOpacity = 0.3;
            let opacity;
            if (total <= 1) {
                opacity = minOpacity;
            } else {
                opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
            }

            summary.classList.add('hued-folder-summary');
            summary.style.setProperty('--hue-start', String(hue));
            summary.style.setProperty('--hue-end', String((hue + 30) % 360)); // offset 60°
            summary.style.setProperty('--hue-opacity', String(opacity));

            childrenContainer.classList.add('hued-folder-children');
            childrenContainer.style.setProperty('--hue-start', String(hue));
            childrenContainer.style.setProperty('--hue-end', String((hue + 30) % 360));
            childrenContainer.style.setProperty('--hue-opacity', String(opacity * 0.6)); // children lighter
        }


        const loadChildren = () => {
            if (childrenContainer.children.length > 0) return;

            const sorted = this.sortFolderChildren(Array.from(folder.children));

            let childIndex = 0;

            for (const child of sorted) {
                if (child instanceof TFolder) {
                    this.buildFolderTree(child, childrenContainer, openFiles, 'folder', depth +1, childIndex, totalFirstLevelFolders);
                    childIndex++;
                }   else if (child instanceof TFile) {
                    const isFolderNoteFile = this.isFolderNote(child, folder);
                    if (isFolderNoteFile && this.plugin.settings.enableFolderNotes) {
                        if (!this.plugin.settings.showFolderNotesInTree) continue;
                    }
                    const fileEl = childrenContainer.createDiv({ cls: 'file-item' });
                    const customIcon = this.getCustomIcon(child.path);
                    const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
                    const fileIcon = fileEl.createSpan({ cls: 'file-icon' });
                    fileIcon.createEl('i', { cls: fileIconClass });
                    const nameSpan = fileEl.createSpan({ text: this.getDisplayName(child) });
                    nameSpan.addClass('portals-item-name');
                    fileEl.dataset.path = child.path;

                    const isOpen = openFiles.has(child.path);
                    let openDotSpan: HTMLSpanElement | null = null;
                    if (isOpen) {
                        openDotSpan = fileEl.createSpan({ cls: 'open-dot' });
                    }

                    if (this.plugin.settings.enableFileExtensionNonMD && child.extension && child.extension !== 'md') {
                        const extSpan = fileEl.createSpan({ cls: 'file-extension' });
                        extSpan.setText('.' + child.extension.toUpperCase());
                        if (openDotSpan) {
                            openDotSpan.style.display = 'none'
                        }
                        if (isOpen) {
                            extSpan.addClass('is-open');
                        }
                    }

                    if (!Platform.isMobile) {
                        fileEl.draggable = true;
                        fileEl.addEventListener('dragstart', (e) => {
                            e.dataTransfer?.setData('text/plain', child.path);
                        });
                    }

                    fileEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (e.altKey) {
                            e.preventDefault();
                            if (this.selectedFiles.has(child.path)) {
                                this.selectedFiles.delete(child.path);
                                fileEl.removeClass('is-selected');
                            } else {
                                this.selectedFiles.add(child.path);
                                fileEl.addClass('is-selected');
                            }
                        } else {
                            void this.app.workspace.getLeaf().openFile(child);
                        }
                    });

                    fileEl.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.showFileContextMenu(e, child, fileEl);
                    });
                    this.fileElementMap.set(child.path, fileEl);
                }
            }
        };

        if (details.open) {
            loadChildren();
        }

        details.addEventListener('toggle', () => {
            if (details.open) {
                loadChildren();
            }
            const path = folder.path;
            let openFolders = this.plugin.settings.openFolders;
            if (details.open) {
                if (!openFolders.includes(path)) {
                    openFolders.push(path);
                }
            } else {
                openFolders = openFolders.filter(p => p !== path);
            }
            this.plugin.settings.openFolders = openFolders;
            void this.plugin.saveData(this.plugin.settings);
        });
    }

    private sortFolderChildren(children: TAbstractFile[]): TAbstractFile[] {
        const folders = children.filter((c): c is TFolder => c instanceof TFolder);
        const files = children.filter((c): c is TFile => c instanceof TFile);

        folders.sort((a, b) => a.name.localeCompare(b.name));

        const fileSortFunc = (a: TFile, b: TFile) => {
            let aVal: string | number, bVal: string | number;
            switch (this.plugin.settings.sortBy) {
                case 'name':
                    aVal = a.name;
                    bVal = b.name;
                    break;
                case 'created':
                    aVal = a.stat.ctime;
                    bVal = b.stat.ctime;
                    break;
                case 'modified':
                    aVal = a.stat.mtime;
                    bVal = b.stat.mtime;
                    break;
                default:
                    aVal = a.name;
                    bVal = b.name;
            }
            if (this.plugin.settings.sortOrder === 'asc') {
                if (aVal < bVal) return -1;
                if (aVal > bVal) return 1;
                return 0;
            } else {
                if (aVal > bVal) return -1;
                if (aVal < bVal) return 1;
                return 0;
            }
        };
        files.sort(fileSortFunc);

        return [...folders, ...files];
    }
}