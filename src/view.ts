import { ItemView, WorkspaceLeaf, TFile, TFolder, Menu, Notice, Platform, View } from 'obsidian';
import PortalsPlugin from './main';
import Sortable, { SortableEvent } from 'sortablejs';
import { SpaceConfig } from './settings';
import { GroupTagsModal } from './settings';
import { JournalRenderer } from './renderers/journalView';
import { RenamePortalModal } from './utils/modals';
import { AddPortalModal } from './settings';
import { RemovePortalModal } from './utils/modals';
import { ChooseTabsModal } from './settings';
import { PortalStack } from './settings';
import { FrontmatterClinicRenderer } from './renderers/frontmatterClinic';
import { TrashRenderer } from './renderers/trashRenderer';
import { ContextNotesRenderer, isContextNoteFile, hasContextNote, getContextNote } from './renderers/contextNotes';
import { RecentFilesRenderer } from './renderers/recentFiles';
import { HiddenItemsRenderer } from './renderers/hiddenItems';
import { BookmarksRenderer } from './renderers/bookmarksRenderer';
import { ContextMenuFactory } from './utils/contextMenuFactory';
import { PortalsActions } from './utils/portalsActions';
import { TreeEventHelpers } from './utils/treeEventHelpers';
import { FolderTreeRenderer } from './trees/foldertreeRenderer';

const MIN_EXPANDED_HEIGHT = 150;
const SIDE_TAB_ICONS: Record<string, string> = {
    recent: 'clock-counter-clockwise',
    'context-notes': 'note',
    bookmarks: 'bookmark',
    journal: 'calendar-heart',
    hidden: 'eye-slash',
    properties: 'list-dashes',
    trash: 'trash',
};

type TabBarItem = 
    | { type: 'stack-group'; stack: PortalStack; portals: SpaceConfig[] }
    | { type: 'portal'; space: SpaceConfig; stackId?: string };

export const VIEW_TYPE_PORTALS = 'portals-view';


export class PortalsView extends ItemView {
    plugin: PortalsPlugin;
    private lastRenderHash: string = '';
    public tooltipEl: HTMLElement | null = null;
    private tooltipTimeout: number | null = null;
    private tooltipShowTimeout: number | null = null;
    private floatinBtnSpecialTooltipShown = false;
    private collapseIconSpecialTooltipShown = false;
    private vaultEventRef: (() => void) | null = null;
    public renaming: boolean = false;
    public selectedItems: Set<string> = new Set();
    private isDraggingSplitter: boolean = false;
    private contextMenuFiredMap = new WeakMap<HTMLElement, boolean>();
    private currentSecondaryPanel: HTMLElement | null = null;
    private currentSplitter: HTMLElement | null = null;
    private contextNoteScrollCache = new Map<string, number>();
    private sortableInstances: Sortable[] = [];
    private isDraggingTab: boolean = false;
    private contextNotesRenderer: ContextNotesRenderer | null = null;
    private bookmarksListenerRef: unknown = null;
    private firstBookmarkChange = true;
    private renderTimer: number | null = null;
    public fileElementMap = new Map<string, HTMLElement>();
    private journalRenderer: JournalRenderer | null = null;
    private journalFolderPath: string = '';
    private journalContainer: HTMLElement | null = null;
    private lastJournalAccentColor: string | null = null;
    public scrollToRestore: number | null = null;
    private scrollAnchor: { selector: string; offset: number } | null = null;
    private multiSelectToolbar: HTMLElement | null = null;
    private lastJournalIndicatorValue: string;
    private trashRenderer: TrashRenderer | null = null;
    private recentRenderer: RecentFilesRenderer | null = null;
    private hiddenRenderer: HiddenItemsRenderer | null = null;
    private bookmarksRenderer: BookmarksRenderer | null = null;
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
            const currentIndicator = this.plugin.settings.journalQuoteIndicator;
            const indicatorChanged = (currentIndicator !== this.lastJournalIndicatorValue);

            if (folderChanged || colorChanged || indicatorChanged) {
                // Update cache
                this.journalFolderPath = currentFolderPath;
                this.lastJournalAccentColor = currentColor;
                this.lastJournalIndicatorValue = currentIndicator;
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

    public saveTreeScroll(): void {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement | null;
        this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
    }
    public restoreTreeScroll(): void {
        // anchor based
        if (this.scrollAnchor) {
            const { selector, offset } = this.scrollAnchor;
            this.scrollAnchor = null;
            requestAnimationFrame(() => {
                const tree = this.containerEl.querySelector('.portals-tree-container') as HTMLElement | null;
                const el = tree?.querySelector(selector) as HTMLElement | null;
                if (tree && el) {
                    void tree.offsetHeight;
                    const containerRect = tree.getBoundingClientRect();
                    const elRect = el.getBoundingClientRect();
                    const newOffset = elRect.top - containerRect.top;
                    tree.scrollTop = tree.scrollTop + newOffset - offset;
                    void tree.offsetHeight;
                    this.scrollToRestore = tree.scrollTop;
                }
            });
            return;
        }
        // fallback numeric restore
        if (this.scrollToRestore === null) return;
        requestAnimationFrame(() => {
            const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement | null;
            if (treeContainer && typeof this.scrollToRestore === 'number') {
                const maxScroll = treeContainer.scrollHeight - treeContainer.clientHeight;
                const clamped = Math.min(this.scrollToRestore!, Math.max(0, maxScroll));
                treeContainer.scrollTop = clamped;
                this.scrollToRestore = null;
            }
        });
    }
    public saveScrollWithAnchor(anchorEl: HTMLElement) {
        const tree = this.containerEl.querySelector('.portals-tree-container') as HTMLElement | null;
        if (!tree) return;
        const containerRect = tree.getBoundingClientRect();
        const elRect = anchorEl.getBoundingClientRect();
        const offset = elRect.top - containerRect.top;
        const path = anchorEl.dataset.path;
        const tagPath = anchorEl.dataset.tagPath;
        if (path) {
            this.scrollAnchor = { selector: `[data-path="${path}"]`, offset };
        } else if (tagPath) {
            this.scrollAnchor = { selector: `[data-tag-path="${tagPath}"]`, offset };
        } else {
            this.scrollToRestore = tree.scrollTop;
        }
    }

    public quickFileIcon(summary: HTMLElement, onClick: (e:MouseEvent) => void) {
        const mode = this.plugin.settings.quickAddIcon;
        if (mode === 'off') return;
        if (mode === 'desktop-only' && Platform.isMobile) return;

        const filePlus = summary.createSpan({ cls: 'portals-action-icons' });
        filePlus.createEl('i', { cls: 'ph ph-file-plus' });
        if (this.plugin.settings.compactTree) {
            filePlus.addClass('portals-action-icons-compact');
        } else {
            filePlus.removeClass('portals-action-icons-compact');
        }
        filePlus.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick(e);
        });
    }
    public quickFolderIcon(summary: HTMLElement, onClick: (e:MouseEvent) => void) {
        const mode = this.plugin.settings.quickAddIcon;
        if (mode === 'off') return;
        if (mode === 'desktop-only' && Platform.isMobile) return;

        const folderPlus = summary.createSpan({ cls: 'portals-action-icons' });
        folderPlus.createEl('i', { cls: 'ph ph-folder-plus' });
        if (this.plugin.settings.compactTree) {
            folderPlus.addClass('portals-action-icons-compact');
        } else {
            folderPlus.removeClass('portals-action-icons-compact');
        }
        folderPlus.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick(e);
        });
    }

    public rebuildTabBarOrder() {
        const order: string[] = [];
        const sortedStacks = [...this.plugin.settings.portalStacks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const stack of sortedStacks) {
            order.push(`stack:${stack.id}`);
        }
        for (const space of this.plugin.settings.spaces) {
            if (!space.stackId) {
                order.push(`${space.type}:${space.path}`);
            }
        }
        this.plugin.settings.tabBarOrder = order;
    }

    public createNewStackWithPortal(space: SpaceConfig) {
        // Generate a unique ID (simple timestamp + random string)
        const stackId = `stack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const stackName = space.displayName || (space.type === 'folder' 
            ? space.path.split('/').pop() || space.path 
            : space.path);
        const newStack: PortalStack = {
            id: stackId,
            name: stackName,
            collapsed: false,
            order: this.plugin.settings.portalStacks.length,
            color: 'transparent',
        };
        
        this.plugin.settings.portalStacks.push(newStack);
        space.stackId = stackId;
        this.rebuildTabBarOrder();
        this.plugin.saveSettings().then(() => this.render());
    }

    private renderStackHeader(parent: HTMLElement, stack: PortalStack) {
        const header = parent.createDiv({ cls: 'portals-tab portals-stack-header-tab' });
        if (!stack.collapsed){
            header.classList.add('is-expanded');
        } else {
            header.classList.remove('is-expanded');
        }
        if (stack.color && stack.color !== 'transparent') {
            header.style.setProperty('--stack-accent-color', stack.color);
        }
        header.dataset.stackId = stack.id;

        const iconSpan = header.createSpan({ cls: 'portals-tab-icon' });
        iconSpan.createEl('i', { cls: `ph ph-${stack.icon || 'stack'}` });
        if (this.plugin.settings.stackIconAccent) {
            iconSpan.classList.add('has-accent');
        } else {
            iconSpan.classList.remove('has-accent');
        }

        if (!this.plugin.settings.hideStackNames) {
            header.createSpan({ cls: 'portals-stack-name', text: stack.name });
        }

        const showCount = this.plugin.settings.showStackCount;
        if (showCount === 'always' || (showCount === 'collapsed' && stack.collapsed)) {
            const portalCount = this.plugin.settings.spaces.filter(s => s.stackId === stack.id).length;
            header.createSpan({ cls: 'portals-stack-count', text: `${portalCount}` });
        }

        // Click to toggle collapse (re-render)
        header.addEventListener('click', (e) => {
            e.stopPropagation();

            // if accordion mode is on... 
            if (this.plugin.settings.stackAutoCollapse && stack.collapsed) {
                for (const otherStack of this.plugin.settings.portalStacks ) {
                    if (otherStack.id !== stack.id) {
                        otherStack.collapsed = true
                    }
                }
            }
            stack.collapsed = !stack.collapsed;
            this.plugin.saveSettings().then(() => this.render());
        });

        // Context menu for stack management
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            ContextMenuFactory.showStackHeaderMenu(this, stack, e);
        });

        // Tooltip on hover if name is long (optional)
        if (!Platform.isMobile) {
            if (this.plugin.settings.hideStackNames) {
            header.addEventListener('mouseenter', () => this.showTooltip(stack.name, header, 300));
            header.addEventListener('mouseleave', () => this.hideTooltip(100));
            }
        }
    }

     private async updateTabBarOrderFromDOM(tabBar: HTMLElement) {
        const newOrder: string[] = [];
        const children = Array.from(tabBar.children);
        for (const child of children) {
            const el = child as HTMLElement;
            if (el.classList.contains('portals-tab')) {
                const type = el.dataset.type as 'folder' | 'tag';
                const path = el.dataset.path;
                if (type && path) {
                    newOrder.push(`${type}:${path}`);
                }
            } else if (el.classList.contains('portals-stack-group')) {
                const stackId = el.dataset.stackId;
                if (stackId) newOrder.push(`stack:${stackId}`);
            }
        }
        if (JSON.stringify(newOrder) !== JSON.stringify(this.plugin.settings.tabBarOrder)) {
            this.plugin.settings.tabBarOrder = newOrder;
            await this.plugin.saveSettings();
            this.lastRenderHash = this.getSettingsHash(); // prevent immediate re-render
        }
    }


    private renderPortalTab(parent: HTMLElement, space: SpaceConfig, mainContainer: HTMLElement) {
        let displayName = space.displayName;
        if (!displayName) {
            const vaultName = this.app.vault.getName();
            if (space.type === 'folder') {
                if (space.path === '/') {
                    displayName = vaultName;
                } else {
                    const folder = this.app.vault.getAbstractFileByPath(space.path);
                    displayName = folder instanceof TFolder ? folder.name : space.path;
                }
            } else {
                displayName = '#' + space.path;
            }
        }

        const tab = parent.createEl('div', { cls: 'portals-tab' });
        if (space.path === '/') {
            tab.addClass('portals-tab-pinned');
            if (this.plugin.settings.tabColorEnabled && space.color && space.color !== 'transparent') {
                tab.style.setProperty('--tab-pinned-color', space.color);
            } else {
                tab.style.removeProperty('--tab-pinned-color');
            }
        }

        if (space.stackId) {
            tab.dataset.stackId = space.stackId;
            tab.addClass('portals-tab-stacked');
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

        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.isDraggingTab) return;
            ContextMenuFactory.showPortalTabMenu(this, space, e);
        });

            tab.addEventListener('click', () => {
                this.hideTooltip(0);
                if (this.contextNotesRenderer) {
                    const currentPath = this.contextNotesRenderer.getCurrentNotePath();
                    if (currentPath) {
                        this.contextNotesRenderer.saveScroll(currentPath)
                    }                    
                }
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
                        const newActiveTab = mainContainer.querySelector('.portals-tab.is-active');
                        if (newActiveTab) {
                            setTimeout(() => {
                                newActiveTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                            }, 0);
                        }
                    });
            });
    }

    public updateMultiSelectToolbar() {
        const splitContainer = this.containerEl.querySelector('.portals-split-container');
        if (!splitContainer) return;

        // Remove existing toolbar
        if (this.multiSelectToolbar) {
            this.multiSelectToolbar.remove();
            this.multiSelectToolbar = null;
        }

        if (this.selectedItems.size === 0) return;
        const hasTagKeys = Array.from(this.selectedItems).some(key => key.startsWith('tag:'));

        // Create toolbar
        const toolbar = splitContainer.createDiv({ cls: 'portals-multiselect-toolbar' });
        this.multiSelectToolbar = toolbar;

        if (!hasTagKeys) {
            // Add buttons (same as before)
            const deleteBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Delete selected' } });
            deleteBtn.createEl('i', { cls: 'ph ph-trash' });
            deleteBtn.addClass('portals-delete-btn-warn');
            deleteBtn.addEventListener('click', () => PortalsActions.deleteSelectedItems(this.app, this.plugin, this));

            const moveBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Move selected' } });
            moveBtn.createEl('i', { cls: 'ph ph-arrow-square-out' });
            moveBtn.addEventListener('click', () => PortalsActions.moveSelectedItemsToFolder(this.app, this.plugin, this));

            const folderBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Create folder from selected' } });
            folderBtn.createEl('i', { cls: 'ph ph-folder-plus' });
            folderBtn.addEventListener('click', () => PortalsActions.createFolderFromSelected(this.app, this.plugin, this));
        }

        // Reset colors button
        const resetColorBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Reset colors' } });
        resetColorBtn.createEl('i', { cls: 'ph ph-palette' });
        resetColorBtn.addEventListener('click', () => this.resetColorsForSelected());

        // Reset icons button
        const resetIconBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Reset icons' } });
        resetIconBtn.createEl('i', { cls: 'ph ph-image' });
        resetIconBtn.addEventListener('click', () => this.resetIconsForSelected());

        // Hide button
        const hideBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Hide selected' } });
        hideBtn.createEl('i', { cls: 'ph ph-eye-slash' });
        hideBtn.addEventListener('click', () => this.hideSelectedItems());

        const clearBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Clear selection' } });
        clearBtn.createEl('i', { cls: 'ph ph-x' });
        clearBtn.addEventListener('click', () => this.clearSelection());

        toolbar.createSpan({ cls: 'portals-selection-count', text: `${this.selectedItems.size}` });

        // Insert the toolbar before the splitter
        const splitter = splitContainer.querySelector('.portals-splitter');
        if (splitter) {
            splitContainer.insertBefore(toolbar, splitter);
        } else {
            splitContainer.appendChild(toolbar);
        }
    }

    public addHoverPreview(el: HTMLElement, filePath: string) {
        // only enable if page preview makes sense (ignore URLs.. etc)
        if (!filePath || filePath.startsWith('http')) return;

        el.addEventListener('mouseover', (e) => {
            if (!Platform.isMobile && (e.ctrlKey || e.metaKey)) {
                this.app.workspace.trigger('hover-link', {
                    event: e,
                    source: 'portals-view',
                    hoverParent: this,
                    targetEl: el,
                    linktext: filePath,
                    sourcePath: filePath
                });
            }
        });

        el.addEventListener('mouseleave', () => {
            this.app.workspace.trigger('hover-link', {
                event: new MouseEvent('mouseleave'),
                source: 'portals-view',
                hoverParent: this,
                targetEl: el,
                linktext: filePath,
                sourcePath: filePath
            });
        });
    }

    public createFileItem(file: TFile, container: HTMLElement, openFiles: Set<string>) {
        const fileEl = container.createDiv({ cls: 'file-item' });
    
        const customIcon = PortalsActions.getCustomIcon(this.plugin, file.path);
        const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        iconSpan.createEl('i', { cls: fileIconClass });
        const nameSpan = fileEl.createSpan({ text: this.getDisplayName(file) });
        nameSpan.addClass('portals-item-name');
        fileEl.dataset.path = file.path

        const savedColor = this.plugin.settings.customColors[file.path];
        
        const icon = fileEl.querySelector('.file-icon i') as HTMLElement | null;
        if (savedColor) {
            fileEl.classList.add('has-file-color');
            fileEl.style.setProperty('--file-color', savedColor);
            if (icon) icon.addClass('has-file-color');
        } else {
            fileEl.classList.remove('has-file-color');
            fileEl.style.removeProperty('--file-color');
        }

        const isOpen = openFiles.has(file.path);
        let openDotSpan: HTMLSpanElement | null = null;
        if (isOpen) openDotSpan = fileEl.createSpan({ cls: 'open-dot' });

        if (this.plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md') {
            const extSpan = fileEl.createSpan({ cls: 'file-extension' });
            extSpan.setText('.' + file.extension.toUpperCase());
            if (openDotSpan) openDotSpan.style.display = 'none';
            if (isOpen) extSpan.addClass('is-open');
        }

        TreeEventHelpers.attachFileItemListeners(fileEl, file, this);

        // Enable native page preview on Ctrl/Cmd‑hover
        this.addHoverPreview(fileEl, file.path)

        fileEl.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            ContextMenuFactory.showFileMenu(this, file, fileEl, e);
        });
        this.fileElementMap.set(file.path, fileEl);
        return fileEl;
    }

    public showAddPortalModal() {
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
            this.plugin.saveSettings().then(() => {
                this.render();
            });
        }).open();
    }

    public showRemovePortalModal() {
        const spaces = this.plugin.settings.spaces;
        if (spaces.length === 0) {
            new Notice('No portals to remove.');
            return;
        }
        new RemovePortalModal(this.app, this.plugin, (space: SpaceConfig) => {
            this.plugin.settings.spaces = this.plugin.settings.spaces.filter(s => s !== space);    
       
            if (this.plugin.settings.selectedSpace?.path === space.path && this.plugin.settings.selectedSpace?.type === space.type) {
                this.plugin.settings.selectedSpace = this.plugin.settings.spaces[0] 
                    ? { path: this.plugin.settings.spaces[0].path, type: this.plugin.settings.spaces[0].type }
                    : null;
            }
            const compositeKey = `${space.type}:${space.path}`;
            if(!space.stackId) {
                this.plugin.settings.tabBarOrder = this.plugin.settings.tabBarOrder.filter(entry => entry !== compositeKey);
            }
                
            this.plugin.saveSettings().then(() => this.render());
            new Notice(`Removed portal: ${space.path}`);
        }).open();
    }
    

    public showSidePortalConfig() {
        new ChooseTabsModal(this.app, this.plugin, (tabs) => {
            if (!tabs.includes('context-notes') && this.contextNotesRenderer) {
                this.contextNotesRenderer.destroy();
                this.contextNotesRenderer = null;
            }
            this.plugin.settings.splitViewTabs = tabs;
            if (!tabs.includes(this.plugin.settings.activeSplitTab)) {
                this.plugin.settings.activeSplitTab = tabs[0] || 'recent';
            }
            this.plugin.saveSettings().then(() => this.render());
        }).open();
    }

    private isFileInJournalFolder(file: TFile): boolean {
        const folderPath = this.plugin.settings.journalFolderPath;
        if (!folderPath) return false;
        return file.path.startsWith(folderPath);
    }

    public async hideItem(key: string) {
        this.plugin.settings.hiddenItems[key] = true;
        await this.plugin.saveSettings();
        this.render();
        new Notice('Item hidden');
    }

    public async unhideItem(key: string) {
        delete this.plugin.settings.hiddenItems[key];
        await this.plugin.saveSettings();
        this.render(); // refresh the view and the hidden tab
        new Notice(`Unhidden: ${key}`);
    }

    public async unhideAllItems() {
        this.plugin.settings.hiddenItems = {};
        await this.plugin.saveSettings();
        this.render();
        new Notice('All items unhidden');
    }

    private async hideSelectedItems() {
        for (const key of this.selectedItems) {
            await this.hideItem(key);
        }
        this.clearSelection();
        new Notice(`Hidden ${this.selectedItems.size} item(s)`);
    }

    private isFileView(view: View): view is View & { file: TFile } {
        return 'file' in view && (view as { file?: unknown }).file instanceof TFile;
    }

    public getOpenFilePaths(): Set<string> {
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

    public scheduleRender() {
        if (this.renderTimer) {
            window.clearTimeout(this.renderTimer);
        }
        if (this.scrollToRestore === null) {
            this.saveTreeScroll();
        }
        this.renderTimer = window.setTimeout(() => {
            this.renderContent();
            this.renderTimer = null;
        }, 50);
    }

    public renamePortal(space: SpaceConfig) {
        this.saveTreeScroll();
        const currentDisplay = space.displayName || this.getDefaultSpaceName(space);
        new RenamePortalModal(this.app, currentDisplay, (newName) => {
            if (newName && newName.trim()) {
                space.displayName = newName.trim();
            } else {
                delete space.displayName;
            }
            this.plugin.saveSettings().then(() => this.render());
        }).open();
    }

    public resetPortalName(space: SpaceConfig) {
        this.saveTreeScroll();
        delete space.displayName;
        this.plugin.saveSettings().then(() => this.render());
    }

    private getDefaultSpaceName(space: SpaceConfig): string {
        const vaultName = this.app.vault.getName();
        if (space.type === 'folder') {
            if (space.path === '/') return vaultName;
            const folder = this.app.vault.getAbstractFileByPath(space.path);
            return folder instanceof TFolder ? folder.name : space.path;
        } else {
            return '#' + space.path;
        }
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
        this.lastJournalIndicatorValue = plugin.settings.journalQuoteIndicator;
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

        const renameRef = this.app.vault.on('rename', (file, oldPath) => PortalsActions.handleRename(this.app, this.plugin, this, file, oldPath));
        const deleteRef = this.app.vault.on('delete', () => this.scheduleRender());
        const createRef = this.app.vault.on('create', () => this.scheduleRender());

        this.vaultEventRef = () => {
            this.app.vault.offref(renameRef);
            this.app.vault.offref(deleteRef);
            this.app.vault.offref(createRef);
        };


        this.registerEvent(this.app.workspace.on('file-open', () => {
            if (!this.renaming) {
                if (this.scrollToRestore === null && this.scrollAnchor === null) {
                    const tree = this.containerEl.querySelector('.portals-tree-container') as HTMLElement | null;
                    if (tree) {
                        this.scrollToRestore = tree.scrollTop;
                    }
                }
                this.renderContent();
            }
            if (this.plugin.settings.enableContextNotes && this.plugin.settings.activeSplitTab === 'context-notes') {
                if (this.contextNotesRenderer) {
                    this.contextNotesRenderer.saveScroll(this.contextNotesRenderer.getCurrentNotePath() ?? undefined);
                }
                const sp = this.containerEl.querySelector('.portals-secondary-panel') as HTMLElement;
                if (sp) {
                    void this.renderSplitTabContent(sp, 'context-notes');
                }
            }
        }));
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            if (!this.renaming){
                this.scheduleRender();
                this.refreshRecentTab();
            }
        }));

        const setupBookmarksListener = () => {
            console.time('bookrmarks render');
            // @ts-expect-error - accessing internal plugin API
            const bookmarksPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
            if (bookmarksPlugin?.instance && typeof bookmarksPlugin.instance.on === 'function') {
                const ref = bookmarksPlugin.instance.on('changed', () => {
                    if (this.plugin.settings.activeSplitTab !== 'bookmarks') return;
                    const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel') as HTMLElement | null;
                    if (secondaryPanel) {
                        const contentEl = secondaryPanel.querySelector('.portals-split-content') as HTMLElement | null;
                        if (contentEl) {
                            if (this.bookmarksRenderer) {
                                this.bookmarksRenderer.setContainer(contentEl as HTMLElement);
                                this.bookmarksRenderer.render();
                            } else {
                                // fallback
                                void this.renderSplitTabContent(secondaryPanel, 'bookmarks');
                            }
                        }
                    }
                });
                this.bookmarksListenerRef = ref;
            }
        };
        setupBookmarksListener();


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

        if (this.contextNotesRenderer) {
            this.contextNotesRenderer.destroy();
            this.contextNotesRenderer = null;
        }

        if (this.hiddenRenderer) {
            this.hiddenRenderer = null;
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

        this.recentRenderer = null;
        this.bookmarksRenderer = null;

       // Clean up all Sortable instances
        if (this.sortableInstances) {
            this.sortableInstances.forEach(s => s.destroy());
            this.sortableInstances = [];
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

    public showTooltip(text: string, target: HTMLElement, delay: number = 0) {
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

    public hideTooltip(delay = 0) {
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

    //-- Settings Hash
    private getSettingsHash(): string {
        const s = this.plugin.settings;
        return JSON.stringify({
            spaces: s.spaces.map(sp => `${sp.type}:${sp.path}|${sp.icon}|${sp.color}|${sp.displayName || ''}|${sp.groupTags?.join(',') || ''}|${sp.stackId || ''}`).join(','),
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
            showContextNotesInTree: s.showContextNotesInTree,
            enableContextNotes: s.enableContextNotes,
            floatingButtonsCollapsed: s.floatingButtonsCollapsed,
            disableSidePanelOnMobile: s.disableSidePanelOnMobile,
            enableFileExtensionNonMD: s.enableFileExtensionNonMD,
            contextNoteHighlightStyle: s.contextNoteHighlightStyle,
            compactTree: s.compactTree,
            boldFolderNames: s.boldFolderNames,
            treeStyle: s.treeStyle,
            tabBarOrder: s.tabBarOrder.join(','),
            customColor: JSON.stringify(s.customColors),
            tagColors: JSON.stringify(s.tagColors),
            customIcons: JSON.stringify(s.customIcons),
            hiddenItems: JSON.stringify(s.hiddenItems),
            hideStackNames: s.hideStackNames,
            showStackCount: s.showStackCount,
            stackIconAccent: s.stackIconAccent,
            stackAutoCollapse: s.stackAutoCollapse,
            showCurrentPropertyValue: s.showCurrentPropertyValue,
            hideFilteredCount: s.hideFilteredCount,
            journalQuoteIndicator: s.journalQuoteIndicator,
            compactTabs: s.compactTabs,
            quickAddIcon: s.quickAddIcon,
            contextNoteFollowActive: s.contextNoteFollowActive,
            
            portalStacks: s.portalStacks.map(st =>
                `${st.id}|${st.name}|${st.icon || ''}|${st.color || ''}|${st.collapsed}|${st.order ?? 0}`).join(','),
        });
    }

    render() {
        if (this.isDraggingTab) return;

        if (!this.plugin.settings.enableContextNotes && this.contextNotesRenderer) {
            this.contextNotesRenderer.destroy();
            this.contextNotesRenderer = null;
        }

        if (this.plugin.settings.enableContextNotes &&
            this.plugin.settings.activeSplitTab === 'context-notes' &&
            this.contextNotesRenderer) {
            const currentPath = this.contextNotesRenderer.getCurrentNotePath();
            if (currentPath) {
                this.contextNotesRenderer.saveScroll(currentPath);
            }
        }

        if (!this.plugin.settings.tabBarOrder || this.plugin.settings.tabBarOrder.length === 0) {
            this.rebuildTabBarOrder();
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

            if (this.sortableInstances.length > 0) {
                this.sortableInstances.forEach(s => s.destroy());
                this.sortableInstances = [];
            }

            // Tab bar
            const tabBar = container.createEl('div', { cls: 'portals-tab-bar' });
            tabBar.toggleClass('portals-compact-tabs', this.plugin.settings.compactTabs);

            const tabBarItems: TabBarItem[] = [];
            const seenCompositeKeys = new Set<string>();
            const seenStackIds = new Set<string>();

            for (const entry of this.plugin.settings.tabBarOrder) {
                if (entry.startsWith('stack:')) {
                    const stackId = entry.slice(6);
                    const stack = this.plugin.settings.portalStacks.find(s => s.id === stackId);
                    const portals = this.plugin.settings.spaces.filter(s => s.stackId === stackId);
                    if (stack) {
                        tabBarItems.push({ type: 'stack-group', stack, portals });
                        seenStackIds.add(stackId);
                    }
                } else {
                    const colonIndex = entry.indexOf(':');
                    if (colonIndex === -1) continue;
                    const type = entry.slice(0, colonIndex) as 'folder' | 'tag';
                    const path = entry.slice(colonIndex + 1);
                    const compositeKey = `${type}:${path}`;
                    if (seenCompositeKeys.has(compositeKey)) continue;

                    const space = this.plugin.settings.spaces.find(s => s.type === type && s.path === path && !s.stackId);
                    if (space) {
                        tabBarItems.push({ type: 'portal', space });
                        seenCompositeKeys.add(compositeKey);
                    }
                }
            }
            
            for (const stack of this.plugin.settings.portalStacks) {
                if (!seenStackIds.has(stack.id)) {
                    const portals = this.plugin.settings.spaces.filter(s => s.stackId === stack.id);
                    tabBarItems.push({ type: 'stack-group', stack, portals });
                }
                
            }
            for (const space of this.plugin.settings.spaces) {
                if (space.stackId) continue;
                const compositeKey = `${space.type}:${space.path}`;
                if (!seenCompositeKeys.has(compositeKey)) {
                    tabBarItems.push({ type: 'portal', space });
                    seenCompositeKeys.add(compositeKey);
                }
            }

            // render all items 
            for (const item of tabBarItems) {
                if (item.type === 'stack-group') {
                    const groupDiv = tabBar.createDiv({ cls: 'portals-stack-group' });
                    groupDiv.dataset.stackId = item.stack.id;
                    if (item.stack.color && item.stack.color !== 'transparent') {
                        groupDiv.style.setProperty('--stack-accent-color', item.stack.color)
                    }
                    if (!item.stack.collapsed) {
                        groupDiv.classList.add('is-expanded');
                    } else {
                        groupDiv.classList.remove('is-expanded');
                    }

                    this.renderStackHeader(groupDiv, item.stack);

                    if (!item.stack.collapsed) {
                        for (const space of item.portals) {
                            this.renderPortalTab(groupDiv, space, container);
                        }
                    }

                    const stackSortable = new Sortable(groupDiv, {
                        animation: 150,
                        delay: 400,
                        delayOnTouchOnly: true,
                        touchStartThreshold: 5,
                        scrollSensitivity: 30,
                        draggable: '.portals-tab-stacked',
                        //forceFallback: true,
                        fallbackClass: 'portals-sortable-fallback',
                        onStart: () => {
                            this.isDraggingTab = true;
                        },
                        onEnd: async (_evt: SortableEvent) => {
                            setTimeout(async () => {
                                requestAnimationFrame(async () => {
                                    const newPortalOrder: SpaceConfig[] = [];
                                    for (const child of Array.from(groupDiv.children)) {
                                        const el = child as HTMLElement;
                                        if (el.classList.contains('portals-tab') && !el.classList.contains('portals-stack-header-tab')) {
                                            const path = el.dataset.path;
                                            const type = el.dataset.type as 'folder' | 'tag';
                                            const space = this.plugin.settings.spaces.find(s => s.path === path && s.type === type);
                                            if (space) {
                                                space.stackId = item.stack.id;
                                                newPortalOrder.push(space);
                                            }
                                        }
                                    }
                                    const otherSpaces = this.plugin.settings.spaces.filter(s => s.stackId !== item.stack.id);
                                    const currentOrder = this.plugin.settings.spaces.filter(s => s.stackId === item.stack.id);
                                    if (JSON.stringify(newPortalOrder) !== JSON.stringify(currentOrder)) {
                                        this.plugin.settings.spaces = [...otherSpaces, ...newPortalOrder];
                                        await this.plugin.saveData(this.plugin.settings);
                                        this.lastRenderHash = this.getSettingsHash();
                                    }
                                    this.isDraggingTab = false;
                                });
                            }, 180);
                        }
                    });
                    this.sortableInstances.push(stackSortable);
                } else {
                    this.renderPortalTab(tabBar, item.space, container);
                }
            }

            const unifiedSortable = new Sortable(tabBar, {
                group: 'portals-tab-bar',
                draggable: '.portals-tab:not(.portals-stack-group .portals-tab), .portals-stack-group',
                animation: 150,
                delay: 0,
                delayOnTouchOnly: true,
                touchStartThreshold: 5,
                scrollSensitivity: 30,
                direction: 'horizontal',
                swapThreshold: 0.5,
                invertSwap: true,
                //forceFallback: true,
                fallbackClass: 'portals-sortable-fallback',
                onStart: () => {
                    this.isDraggingTab = true;
                },
                onEnd: async (_evt: SortableEvent) => {
                    setTimeout(async () => {
                        await this.updateTabBarOrderFromDOM(tabBar);
                        this.isDraggingTab = false;
                    }, 180);
                }
            });
            this.sortableInstances.push(unifiedSortable);
                        

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
                secondaryHeader.toggleClass('portals-compact-tabs', this.plugin.settings.compactTabs);

                // Tab container
                const tabContainer = secondaryHeader.createDiv({ cls: 'portals-split-tabs' });
                tabContainer.toggleClass('portals-compact-tabs', this.plugin.settings.compactTabs);

                // Get tabs from settings, ensure context-notes is present for testing
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
                    if (this.contextNotesRenderer) {
                        this.contextNotesRenderer.saveScroll();
                    }
                    this.renderSplitTabContent(secondaryPanel, tabId);
                });
            });

            // 🔽 Scroll active side‑portal tab into view
            const activeSplitTab = tabContainer.querySelector('.portals-split-tab.is-active') as HTMLElement | null;
            if (activeSplitTab) {
                setTimeout(() => {
                    activeSplitTab.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
                }, 0);
            }

            // Collapse icon
            const collapseIcon = secondaryHeader.createSpan({ cls: 'portals-collapse-icon' });
            collapseIcon.textContent = this.plugin.settings.secondaryPanelCollapsed ? '▲' : '▼';  

            if (!Platform.isMobile) {
                collapseIcon.addEventListener('mouseenter', () => {
                    if (!this.collapseIconSpecialTooltipShown) {
                        this.showTooltip('Click to expand · Right-click to configure', collapseIcon, 300);
                        this.collapseIconSpecialTooltipShown = true;
                    }
                });
                collapseIcon.addEventListener('mouseleave', () => this.hideTooltip(100));
            }

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

            // right click to side portal modal
            collapseIcon.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showSidePortalConfig();
            });


            // Initial content
            if (this.isSidePanelEnabled()){
                void this.renderSplitTabContent(secondaryPanel, activeTab);
            }
            
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
                        new FolderTreeRenderer(this.app, this.plugin, this).render(folder, container, openFiles, selectedSpace.icon, 0, 0, totalFirstLevelFolders);
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
            this.restoreTreeScroll();

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
                    btn.addEventListener('mouseenter', () => {
                        let actualTooltip = tooltip;
                        if ((icon === 'stack' || icon === 'stack-simple') && !this.floatinBtnSpecialTooltipShown) {
                            actualTooltip = 'Collapse/ Right-click: fold/unfold';
                            this.floatinBtnSpecialTooltipShown = true;
                        }
                        this.showTooltip(actualTooltip, btn, 300);
                    });
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
                            await PortalsActions.newNoteInFolder(this.app, this.plugin, this, folder);
                        } else if (currentSpace.type === 'tag') {
                            await PortalsActions.newNoteInTagSpace(this.app, this.plugin, this, currentSpace.path);
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
                            await PortalsActions.newFolderInFolder(this.app, this.plugin, this, folder);
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
        contentEl.className = 'portals-split-content';
        
        if (tabId !== 'context-notes' && tabId !== 'journal') {
            contentEl.addClass(`portals-tree-style-${this.plugin.settings.treeStyle}`);
        }
        if (tabId === 'recent') {
            if (!this.recentRenderer) {
                this.recentRenderer = new RecentFilesRenderer(this.app, this.plugin, this);
                }
                this.recentRenderer.setContainer(contentEl);
                this.recentRenderer.render();           
        } else if (tabId === 'context-notes') {
            if (!this.plugin.settings.enableContextNotes) {
                if (this.contextNotesRenderer) {
                    this.contextNotesRenderer.destroy();
                    this.contextNotesRenderer = null;
                }
                contentEl.createEl('p', {
                    text: 'Context notes are disabled. Enable them in settings.',
                    cls: 'portals-context-note-message'
                });
                return;
            }
            if (!this.contextNotesRenderer) {
                this.contextNotesRenderer = new ContextNotesRenderer(
                    this.app, this.plugin, this, contentEl, this.contextNoteScrollCache
                );
            } else {
                this.contextNotesRenderer.setContainer(contentEl);
            }
            contentEl.empty();
            contentEl.addClass('portals-context-notes-tab-container')
            await this.contextNotesRenderer.render();
        } else if (tabId === 'bookmarks') {
            if (!this.bookmarksRenderer) {
                this.bookmarksRenderer = new BookmarksRenderer(this.app, this.plugin, this,
                    () => {
                        const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
                        if (secondaryPanel) {
                            this.renderSplitTabContent(secondaryPanel as HTMLElement, 'bookmarks');
                        }
                    }
                );
            }
            this.bookmarksRenderer.setContainer(contentEl);
            this.bookmarksRenderer.render();
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
        } else if (tabId === 'hidden') {
            if (!this.hiddenRenderer) {
                this.hiddenRenderer = new HiddenItemsRenderer(this.app, this.plugin, this);
            }
            this.hiddenRenderer.setContainer(contentEl);
            this.hiddenRenderer.render();
        } else if (tabId === 'properties') {
            contentEl.empty();
            contentEl.addClass('portals-frontmatter-clinic');
            const renderer = new FrontmatterClinicRenderer(this.app, this.plugin, contentEl, this);
            await renderer.render();
        } else if (tabId === 'trash') {
            if (this.trashRenderer) {
                this.trashRenderer.destroy();
                this.trashRenderer = null;
            }
            contentEl.empty();
            contentEl.addClass('portals-trash-tab');
            this.trashRenderer = new TrashRenderer(this.app, contentEl)
            await this.trashRenderer.render();
        }
    }
    
    renderContent() {
        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }
        if (this.isDraggingTab) return;
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
                new FolderTreeRenderer(this.app, this.plugin, this).render(folder, spaceContent, openFiles, selectedSpace.icon, 0, 0, totalFirstLevelFolders);
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
        this.restoreTreeScroll();
    }

    public refreshRecentTab() {
        const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
        if (!secondaryPanel) return;
        if (this.plugin.settings.activeSplitTab === 'recent') {
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

    public getDisplayName(file: TFile): string {
        if (file.extension === 'md') return file.basename;
        return this.plugin.settings.enableFileExtensionNonMD ? file.basename : file.name;
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
            mainSummary.dataset.tagPath = tagName;

            // Apply context note highlight to main tag
            const mainTagPath = tagName; // e.g., "project"
            if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, mainTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    mainIconSpan.addClass('has-context-note-icon');
                    mainSummary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    mainSummary.addClass('has-context-note-underline');
                }
            }

            // Quick‑create note for tag lists (tagName)
            this.quickFileIcon(mainSummary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this, tagName))
            
            mainSummary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                ContextMenuFactory.showTagContextMenu(this, tagName, iconName || 'tag', mainSummary, e);
            });

            TreeEventHelpers.attachMainTagListeners(mainSummary, tagName, this);
            TreeEventHelpers.attachIconContextNoteOpener(mainIconSpan, tagName, this);

            // If no groups, just list all files under the main tag
            if (!groupTags || groupTags.length === 0) {
                for (const file of sortFiles(taggedFiles)) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    if (this.plugin.settings.enableContextNotes && !this.plugin.settings.showContextNotesInTree && isContextNoteFile(this.app, this.plugin, file, tagName)) {
                        continue;
                    }
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

                const savedColor = this.plugin.settings.tagColors[groupKey];
                const style = this.plugin.settings.treeStyle;
                const canApplyColor = savedColor && style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);

                if (canApplyColor) {
                    groupDetails.classList.add('has-folder-color');
                    summary.classList.add('has-folder-color');
                    groupChildren.classList.add('has-folder-color');
                    groupDetails.style.setProperty('--folder-color', savedColor);
                } else {
                    groupDetails.classList.remove('has-folder-color');
                    groupDetails.style.removeProperty('--folder-color');
                    summary.classList.remove('has-folder-color');
                    groupChildren.classList.remove('has-folder-color');
                }

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
                const customIcon = PortalsActions.getCustomIcon(this.plugin, groupKey);
                const iconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-tag-simple';
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                iconSpan.createEl('i', { cls: iconClass });
                summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
                summary.dataset.tagPath = gTag;

                // Quick‑create note for tag groups flat list (mainT + gTag)
                this.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this, tagName, [gTag]));

                // Apply context note highlight to group tag
                const groupTagPath = gTag;
                if (
                    this.plugin.settings.enableContextNotes &&
                    hasContextNote(this.app, this.plugin, groupTagPath) &&
                    this.plugin.settings.contextNoteHighlightStyle !== 'none'
                ) {
                    const highlightStyle = this.plugin.settings.contextNoteHighlightStyle;
                    if (highlightStyle === 'icon') {
                        iconSpan.addClass('has-context-note-icon');
                        summary.addClass('has-context-note-icon');
                    } else if (highlightStyle === 'underline') {
                        summary.addClass('has-context-note-underline');
                    }
                }

                // contex menu for group
                summary.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const groupKey = this.getTagGroupKey(tagName, gTag);
                    ContextMenuFactory.showGroupTagContextMenu(this, tagName, groupKey, gTag, groupDetails, summary, e);
                });

                TreeEventHelpers.attachTagNodeListeners(summary, groupKey, gTag, this);
                TreeEventHelpers.attachIconContextNoteOpener(iconSpan, gTag, this);

                // Show context note file if setting enabled (same as subtag groups)
                if (!this.plugin.settings.enableContextNotes || (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree)) {
                    const contextNote = getContextNote(this.app, this.plugin, gTag);
                    if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                        // Avoid duplication if the note is already in the file list
                        const alreadyListed = files.some(f => f.path === contextNote.path);
                        if (!alreadyListed) {
                            this.createFileItem(contextNote, groupChildren, openFiles);
                        }
                    }
                }
                
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
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                if (this.plugin.settings.enableContextNotes && 
                    !this.plugin.settings.showContextNotesInTree && 
                    isContextNoteFile(this.app, this.plugin, file, tagName)) {
                    continue;
                }
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
            const nodeKey = `tag:${tagName}/node:${node.fullPath}`;
            if (this.plugin.settings.hiddenItems[nodeKey]) return;
            const details = parentEl.createEl('details', { cls: 'folder-details' });
            const expandedSet = this.plugin.settings.expandedTagHierarchy[tagName] || [];
            if (expandedSet.includes(node.fullPath)) {
                details.open = true;
            }

            const summary = details.createEl('summary', { cls: 'folder-summary' });
            
            const customIcon = PortalsActions.getCustomIcon(this.plugin, nodeKey);
            const iconClass = customIcon ? `ph ph-${customIcon}` : `ph ph-${iconName || 'tag'}`;
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            const nameSpan = summary.createSpan({ text: node.name });
            nameSpan.addClass('portals-item-name');
            summary.dataset.tagPath = node.fullPath;

            const childrenContainer = details.createDiv({ cls: 'folder-children' });

            // Quick‑create note for sub tag tree sub item (node.fullpath)
            this.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this, node.fullPath));
            
            // Apply context note highlight to subtag node
            const nodeTagPath = node.fullPath; // e.g., "project/ideas"
            if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, nodeTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    iconSpan.addClass('has-context-note-icon');
                    summary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    summary.addClass('has-context-note-underline');
                }
            }

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = getContextNote(this.app, this.plugin, node.fullPath);
                if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                    const alreadyListed = node.files.some((f: TFile) => f.path === contextNote.path);
                    if (!alreadyListed) {
                        this.createFileItem(contextNote, childrenContainer, openFiles);
                    }
                }
            }

            const savedColor = this.plugin.settings.tagColors[nodeKey];
            const style = this.plugin.settings.treeStyle;
            const canApplyColor = savedColor && style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);
            if (canApplyColor) {
                details.classList.add('has-folder-color');
                summary.classList.add('has-folder-color');
                details.style.setProperty('--folder-color', savedColor);
                childrenContainer.classList.add('has-folder-color');
            } else {
                summary.classList.remove('has-folder-color');
                details.classList.remove('has-folder-color');
                details.style.removeProperty('--folder-color');
                childrenContainer.classList.remove('has-folder-color');
            }

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
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    if (this.plugin.settings.enableContextNotes && 
                        !this.plugin.settings.showContextNotesInTree && 
                        isContextNoteFile(this.app, this.plugin, file, node.fullPath)) {
                        continue;
                    }
                    this.createFileItem(file, childrenContainer, openFiles);
                }
            }

            // Context menu for custom icon on tag node
            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                ContextMenuFactory.showSubtagNodeContextMenu(this, tagName, node.fullPath, iconName || 'tag', details, summary, e);
            });

            TreeEventHelpers.attachTagNodeListeners(summary, nodeKey, node.fullPath, this);
            TreeEventHelpers.attachIconContextNoteOpener(iconSpan, node.fullPath, this);

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
        mainSummary.dataset.tagPath = tagName;

        // Quick‑create note for sub tag tree head item (tagName)
        this.quickFileIcon(mainSummary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this, tagName));

        // Apply context note highlight to main tag
        const mainTagPath = tagName;
        if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, mainTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
            const style = this.plugin.settings.contextNoteHighlightStyle;
            if (style === 'icon') {
                mainIconSpan.addClass('has-context-note-icon');
                mainSummary.addClass('has-context-note-icon');
            } else if (style === 'underline') {
                mainSummary.addClass('has-context-note-underline');
            }
        }

        mainSummary.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            ContextMenuFactory.showTagContextMenu(this, tagName, iconName || 'tag', mainSummary, e);
        });

        TreeEventHelpers.attachMainTagListeners(mainSummary, tagName, this);
        TreeEventHelpers.attachIconContextNoteOpener(mainIconSpan, tagName, this);

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

            const savedColor = this.plugin.settings.tagColors[groupKey];
            const style = this.plugin.settings.treeStyle;
            const canApplyColor = savedColor && style !== 'shades' && style !== 'hues' && !(style == 'portals' && this.plugin.settings.tabColorEnabled);
            if (canApplyColor) {
                groupDetails.classList.add('has-folder-color');
                summary.classList.add('has-folder-color');
                groupChildren.classList.add('has-folder-color');
                groupDetails.style.setProperty('--folder-color', savedColor);
            } else {
                groupDetails.classList.remove('has-folder-color');
                groupDetails.style.removeProperty('--folder-color');
                summary.classList.remove('has-folder-color');
                groupChildren.classList.remove('has-folder-color');
            }

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

            const customIconGroup = PortalsActions.getCustomIcon(this.plugin, groupKey);
            const iconClass = customIconGroup ? `ph ph-${customIconGroup}` : 'ph ph-tag-simple';
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
            summary.dataset.tagPath = gTag;

            // Quick‑create note for tag groups subtagtree (mainT + gTag)
            this.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this, tagName, [gTag]));

            // Apply context note highlight to group
            const groupTagPath = gTag; // e.g., "urgent"
            if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, groupTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    iconSpan.addClass('has-context-note-icon');
                    summary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    summary.addClass('has-context-note-underline');
                }
            }

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = getContextNote(this.app, this.plugin, gTag);
                if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                    const alreadyListed = files.some((f: TFile) => f.path === contextNote.path);
                    if (!alreadyListed) {
                        this.createFileItem(contextNote, groupChildren, openFiles);
                    }
                }
            }

            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const groupKey = this.getTagGroupKey(tagName, gTag);
                ContextMenuFactory.showGroupTagContextMenu(this, tagName, groupKey, gTag, groupDetails, summary, e);
            });

            for (const file of sortFiles(files)) {
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                if (this.plugin.settings.enableContextNotes && 
                    !this.plugin.settings.showContextNotesInTree && 
                    isContextNoteFile(this.app, this.plugin, file, gTag)) {
                    continue;
                }
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

            TreeEventHelpers.attachTagNodeListeners(summary, groupKey, gTag, this);
            TreeEventHelpers.attachIconContextNoteOpener(iconSpan, gTag, this);


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
            if (this.plugin.settings.hiddenItems[file.path]) continue;
            if (this.plugin.settings.enableContextNotes && 
                !this.plugin.settings.showContextNotesInTree && 
                isContextNoteFile(this.app, this.plugin, file, tagName)) {
                continue;
            }
            this.createFileItem(file, mainChildren, openFiles);
        }

        // Include context note file in tree if setting enabled
        if (this.plugin.settings.showContextNotesInTree) {
            const contextNote = getContextNote(this.app, this.plugin, tagName);
            if (contextNote) {
                // Avoid duplication if it's already in the list (shouldn't be, but safe)
                const alreadyListed = ungroupedRootFiles.some(f => f.path === contextNote.path);
                if (!alreadyListed) {
                    this.createFileItem(contextNote, mainChildren, openFiles);
                }
            }
        }
    }

    public clearSelection() {
        // Remove classes from all selected items
        this.containerEl.querySelectorAll('.file-item.is-selected, .folder-summary.is-selected').forEach(el => {
            el.removeClass('is-selected');
        });
        this.selectedItems.clear();
        this.updateMultiSelectToolbar();
    }

    private async resetColorsForSelected() {
        this.saveTreeScroll();
        for (const key of this.selectedItems) {
            if (key.startsWith('tag:')) {
                delete this.plugin.settings.tagColors[key];
            } else {
                delete this.plugin.settings.customColors[key];
            }
            // Files have no color settings; tag groups are not in multi‑select.
        }
        await this.plugin.saveSettings();
        this.clearSelection();
        this.render();
        new Notice('Colors reset for selected items');
    }

    private async resetIconsForSelected() {
        this.saveTreeScroll();
        for (const key of this.selectedItems) {
            delete this.plugin.settings.customIcons[key]; 
        }
        await this.plugin.saveSettings();
        this.clearSelection();
        this.render();
        new Notice('Icons reset for selected items');
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

    public triggerRenameOnPath(path: string) {
        this.scrollToAndHighlight(path);
        setTimeout(() => {
            const item = this.containerEl.querySelector(`[data-path="${path}"]`);
            if (!item) return;
            const abstractFile = this.app.vault.getAbstractFileByPath(path);
            if (abstractFile instanceof TFile) {
                PortalsActions.startRenameFile(this.app, this.plugin, this, abstractFile, item as HTMLElement);
            } else if (abstractFile instanceof TFolder) {
                PortalsActions.startRenameFolder(this.app, this.plugin, this, abstractFile, item as HTMLElement);
            }
        }, 200);
    }

    public getActiveFilePath(): string | null {
        const activeFile = this.app.workspace.getActiveFile();
        return activeFile ? activeFile.path : null;
    }

    public makeDropTarget(el: HTMLElement, folder: TFolder, allowFolders: boolean = false) {
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
                    // Save scroll position before the move
                    this.saveTreeScroll();
                    const savedScroll = this.scrollToRestore;

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
                    this.scrollToRestore = savedScroll;
                } catch (err) {
                    console.error('Drop error:', err);
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Failed to move: ${message}`);
                } finally {
                    if (this.renderTimer) {
                        clearTimeout(this.renderTimer);
                        this.renderTimer = null;   
                    }
                    this.renderContent();
                }
            })().catch(err => console.error(err));
        });
    }
}