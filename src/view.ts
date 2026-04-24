import { ItemView, WorkspaceLeaf, TFile, TFolder, TAbstractFile, Menu, Notice, Platform, Component, debounce, View, Modal, App, MenuItem } from 'obsidian';
import PortalsPlugin from './main';
import Sortable, { SortableEvent } from 'sortablejs';
import { SpaceConfig } from './settings';
import { MarkdownRenderer } from 'obsidian';
import { GroupTagsModal } from './settings';
import { JournalRenderer } from './journalView';
import { IconPickerModal } from './iconPicker';
import { RenamePortalModal } from './modals';
import { SelectFolderModal } from './modals';
import { ColorPickerModal } from './modals';
import { AddPortalModal } from './settings';
import { RemovePortalModal } from './modals';
import { ChooseTabsModal } from './settings';
import { PortalStack } from './settings';
import { FrontmatterClinicRenderer } from './frontmatterClinic';

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
    'context-notes': 'note',
    bookmarks: 'bookmark',
    journal: 'calendar-heart',
    hidden: 'eye-slash',
    properties: 'list-dashes',
};
type ContextTarget = TFolder | string; // string represents a tag name

type TabBarItem = 
    | { type: 'stack-group'; stack: PortalStack; portals: SpaceConfig[] }
    | { type: 'portal'; space: SpaceConfig; stackId?: string };

export const VIEW_TYPE_PORTALS = 'portals-view';


export class PortalsView extends ItemView {
    plugin: PortalsPlugin;
    private lastRenderHash: string = '';
    private tooltipEl: HTMLElement | null = null;
    private tooltipTimeout: number | null = null;
    private tooltipShowTimeout: number | null = null;
    private floatinBtnSpecialTooltipShown = false;
    private collapseIconSpecialTooltipShown = false;
    private vaultEventRef: (() => void) | null = null;
    private renaming: boolean = false;
    private selectedItems: Set<string> = new Set();
    private isDraggingSplitter: boolean = false;
    private contextMenuFiredMap = new WeakMap<HTMLElement, boolean>();
    private currentSecondaryPanel: HTMLElement | null = null;
    private currentSplitter: HTMLElement | null = null;
    private sortableInstances: Sortable[] = [];
    private isDraggingTab: boolean = false;
    private contextNoteEventRefs: Array<unknown> | null = null;
    private bookmarksListenerRef: unknown = null;
    private renderTimer: number | null = null;
    private contextNoteCache = new Map<string, { element: HTMLElement; component: Component }>();
    private contextNoteAccessOrder: string[] = [];
    private readonly MAX_CONTEXT_NOTE_CACHE = 20;
    private contextNoteScrollPositions = new Map<string, number>();
    private fileElementMap = new Map<string, HTMLElement>();
    private journalRenderer: JournalRenderer | null = null;
    private journalFolderPath: string = '';
    private journalContainer: HTMLElement | null = null;
    private lastJournalAccentColor: string | null = null;
    public scrollToRestore: number | null = null;
    private multiSelectToolbar: HTMLElement | null = null;
    private lastJournalIndicatorValue: string;
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

    private rebuildTabBarOrder() {
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

    private createNewStackWithPortal(space: SpaceConfig) {
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
            this.showStackContextMenu(e, stack);
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
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle('Rename portal')
                .setIcon('pencil')
                .onClick(() => this.renamePortal(space)));
                if (space.displayName) {
                     menu.addItem(item => item
                        .setTitle('Reset name')
                        .setIcon('undo')
                        .onClick(() => this.resetPortalName(space)));
                }
            menu.addItem(item => item
                .setTitle('Change icon')
                .setIcon('image')
                .onClick(() => {
                    new IconPickerModal(this.app, (iconName) => {
                        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
                            this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
                            space.icon = iconName;
                            this.plugin.saveSettings().then(() => this.render());
                        }).open();
                    })        
                );
            const currentColor = space.color;
            const dummyEl = document.createElement('div')
            const tabColor = this.plugin.settings.tabColorEnabled;
            const panelStyle = this.plugin.settings.filePaneColorStyle;
            const colorRelavent = tabColor || panelStyle === 'gradient' || panelStyle === 'solid';
            if (colorRelavent) {
                menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => {
                    new ColorPickerModal(this.app, (color) => {
                        space.color = color;
                        this.plugin.saveSettings().then(() => this.render());
                    }, dummyEl, currentColor).open();
                }));
                if (currentColor && currentColor !== 'transparent') {
                    menu.addItem(item => item
                        .setTitle('Reset color')
                        .setIcon('undo')
                        .onClick(() => {
                            space.color = 'transparent';
                            this.plugin.saveSettings().then(() => this.render());
                        }));
                }
                
            }
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Add to new stack')
                .setIcon('stack')
                .onClick(() => this.createNewStackWithPortal(space)));

            const otherStacks = this.plugin.settings.portalStacks.filter(s => s.id !== space.stackId);
            if (otherStacks.length > 0) {
                menu.addItem(item => {
                    item.setTitle('Add to existing stack')
                        .setIcon('arrow-right');
                    
                    const subMenu = (item as unknown as { setSubmenu: () => Menu }).setSubmenu();
                    for (const stack of otherStacks) {
                        subMenu.addItem((subItem: MenuItem) => subItem
                            .setTitle(stack.name)
                            .onClick(() => {
                                space.stackId = stack.id;
                                this.rebuildTabBarOrder();
                                this.plugin.saveSettings().then(() => this.render())
                            }));
                    }
                });
            }
            // remove from stack 
            if (space.stackId) {
                menu.addItem(item => item
                    .setTitle('Remove from stack')
                    .setIcon('arrow-left')
                    .onClick(() => {
                        const compositeKey = `${space.type}:${space.path}`;
                        delete space.stackId;
                        if (!this.plugin.settings.tabBarOrder.includes(compositeKey)) {
                            this.plugin.settings.tabBarOrder.push(compositeKey);
                        }
                        this.plugin.saveSettings().then(() => this.render());
                    }));
            }
            menu.showAtPosition({ x: e.clientX, y: e.clientY });
        });

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
                        const newActiveTab = mainContainer.querySelector('.portals-tab.is-active');
                        if (newActiveTab) {
                            setTimeout(() => {
                                newActiveTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                            }, 0);
                        }
                    });
            });
    }

    private showStackContextMenu(event: MouseEvent, stack: PortalStack) {
        if (this.isDraggingTab) return;
        const menu = new Menu();
        menu.addItem(item => item
            .setTitle('Rename stack')
            .setIcon('pencil')
            .onClick(() => {
                new RenamePortalModal(this.app, stack.name, (newName) => {
                    stack.name = newName.trim() || 'Stack';
                    this.plugin.saveSettings().then(() => this.render());
                }).open();
            }));
        menu.addItem(item => item
            .setTitle('Change icon')
            .setIcon('image')
            .onClick(() => {
                new IconPickerModal(this.app, (iconName) => {
                    stack.icon = iconName;
                    this.plugin.saveSettings().then(() => this.render());
                }).open();
            }));
        menu.addItem(item => item
            .setTitle('Set color')
            .setIcon('palette')
            .onClick(() => {
                const currentColor = stack.color;
                // Create a temporary hidden element for the color picker to preview on
                const dummyEl = document.createElement('div');
                new ColorPickerModal(this.app, (color) => {
                    stack.color = color;
                    this.plugin.saveSettings().then(() => this.render());
                }, dummyEl, currentColor).open();
            }));
        if (stack.color && stack.color !== 'transparent') {
            menu.addItem(item => item
                .setTitle('Reset color')
                .setIcon('undo')
                .onClick(() => {
                    stack.color = 'transparent';
                    this.plugin.saveSettings().then(() => this.render());
                }));
        }
        menu.addSeparator();
        menu.addItem(item => item
            .setTitle('Delete stack')
            .setIcon('trash')
            .setWarning(true)
            .onClick(() => {
                const portalsInStack = this.plugin.settings.spaces.filter(s => s.stackId === stack.id);
                for (const space of portalsInStack) {
                    delete space.stackId;
                    const compositeKey = `${space.type}:${space.path}`;
                    if (!this.plugin.settings.tabBarOrder.includes(compositeKey)) {
                        this.plugin.settings.tabBarOrder.push(compositeKey);
                    }
                }
                this.plugin.settings.portalStacks = this.plugin.settings.portalStacks.filter(s => s.id !== stack.id);
                this.plugin.settings.tabBarOrder = this.plugin.settings.tabBarOrder.filter(entry => entry !== `stack:${stack.id}`);
                this.plugin.saveSettings().then(() => this.render());
            }));
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    private updateMultiSelectToolbar() {
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
            deleteBtn.addEventListener('click', () => this.deleteSelectedItems());

            const moveBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Move selected' } });
            moveBtn.createEl('i', { cls: 'ph ph-arrow-square-out' });
            moveBtn.addEventListener('click', () => this.moveSelectedItemsToFolder());

            const folderBtn = toolbar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Create folder from selected' } });
            folderBtn.createEl('i', { cls: 'ph ph-folder-plus' });
            folderBtn.addEventListener('click', () => this.createFolderFromSelected());
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

    private createFileItem(file: TFile, container: HTMLElement, openFiles: Set<string>) {
        const fileEl = container.createDiv({ cls: 'file-item' });
        const customIcon = this.getCustomIcon(file.path);
        const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        iconSpan.createEl('i', { cls: fileIconClass });
        const nameSpan = fileEl.createSpan({ text: this.getDisplayName(file) });
        nameSpan.addClass('portals-item-name');
        fileEl.dataset.path = file.path;

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

        if (!Platform.isMobile) {
            fileEl.draggable = true;
            fileEl.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', file.path);
            });
        }

        let touchStartPos: { x: number; y: number } | null = null;
        let isSwiping = false;

        // Touch swipe for mobile selection
        fileEl.addEventListener('touchstart', (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch) {
                touchStartPos = { x: touch.clientX, y: touch.clientY };
                isSwiping = false;
            }
        }, { passive: true });

        fileEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (!touchStartPos) return;
            const touch = e.touches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStartPos.x;
            const deltaY = touch.clientY - touchStartPos.y;
            if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaY) < 20) {
                isSwiping = true;
                fileEl.addClass('swipe-active');
            }
        }, { passive: true });

        fileEl.addEventListener('touchend', (e: TouchEvent) => {
            if (!touchStartPos) {
                if (isSwiping) fileEl.removeClass('swipe-active');
                touchStartPos = null;
                isSwiping = false;
                return;
            }
            const changedTouch = e.changedTouches[0];
            if (changedTouch && isSwiping) {
                const deltaX = changedTouch.clientX - touchStartPos.x;
                const deltaY = changedTouch.clientY - touchStartPos.y;
                if (deltaX > 30 && Math.abs(deltaY) < 30) {
                    this.toggleSelection(file, fileEl);
                }
            }
            if (isSwiping) fileEl.removeClass('swipe-active');
            touchStartPos = null;
            isSwiping = false;
        });

        fileEl.addEventListener('touchcancel', () => {
            if (isSwiping) fileEl.removeClass('swipe-active');
            touchStartPos = null;
            isSwiping = false;
        });

        fileEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.altKey) {
                e.preventDefault();
                if (this.selectedItems.has(file.path)) {
                    this.selectedItems.delete(file.path);
                    fileEl.removeClass('is-selected');
                } else {
                    this.selectedItems.add(file.path);
                    fileEl.addClass('is-selected');
                }
            } else {
                void this.app.workspace.getLeaf().openFile(file);
            }
            this.updateMultiSelectToolbar();
        });

        fileEl.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showFileContextMenu(e, file, fileEl);
        });
        this.fileElementMap.set(file.path, fileEl);
        return fileEl;
    }

    private toggleSelection(item: TFile | TFolder, element: HTMLElement) {
        const path = item.path;
        if (this.selectedItems.has(path)) {
            this.selectedItems.delete(path);
            element.removeClass('is-selected');
        } else {
            this.selectedItems.add(path);
            element.addClass('is-selected');
        }
        this.updateMultiSelectToolbar();
    }

    private toggleSelectionByKey(key: string, element: HTMLElement) {
        if (this.selectedItems.has(key)) {
            this.selectedItems.delete(key);
            element.removeClass('is-selected');
        } else {
            this.selectedItems.add(key);
            element.addClass('is-selected');
        }
        this.updateMultiSelectToolbar();
    }

    private getCustomIcon(path: string): string | null {
        return this.plugin.settings.customIcons[path] || null;
    }

    private async setCustomIcon(path: string, displayName: string) {
        new IconPickerModal(this.app, (iconName) => {
            // capture scroll position
            const treeContainer = this.containerEl.querySelector('.portals-tree-container');
            if (treeContainer) {
                this.scrollToRestore = treeContainer.scrollTop;
            }
            this.plugin.settings.customIcons[path] = iconName;
            this.plugin.saveSettings().then(() => {
                this.render();
                new Notice(`Icon set for ${displayName}`);
            });
        }).open();
    }

    private async removeCustomIcon(path: string) {
        // capture scroll position
        const treeContainer = this.containerEl.querySelector('.portal-tree-container');
        if (treeContainer) {
            this.scrollToRestore = treeContainer.scrollTop;
        }
        delete this.plugin.settings.customIcons[path];
        await this.plugin.saveSettings();
        this.render();
        new Notice('Custom icon removed');
    }

    private async setCustomIconForTagGroup(mainTag: string, groupTag: string, groupKey: string) {
        const displayName = `#${groupTag}`;
        new IconPickerModal(this.app, (iconName) => {
            const treeContainer = this.containerEl.querySelector('.portals-tree-container');
            if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;
            this.plugin.settings.customIcons[groupKey] = iconName;
            this.plugin.saveSettings().then(() => {
                this.render();
                new Notice(`Icon set for group ${displayName}`);
            });
        }).open();
    }

    private async removeCustomIconForTagGroup(groupKey: string) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;
        delete this.plugin.settings.customIcons[groupKey];
        await this.plugin.saveSettings();
        this.render();
        new Notice('Custom icon removed');
    }

    private setCustomColor(folder: TFolder, summaryEl: HTMLElement) {
        const currentColor = this.plugin.settings.customColors[folder.path];
        const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement;
        const savedScrollTop = treeContainer ? treeContainer.scrollTop: 0;

        new ColorPickerModal(this.app, (color) => {
            this.plugin.settings.customColors[folder.path] = color;
            this.plugin.saveSettings().then(() => {
                this.render();
                if (savedScrollTop > 0) {
                    requestAnimationFrame(() => {
                        const newContainer = this.containerEl.querySelector('.portals-tree-container');
                        if (newContainer) newContainer.scrollTop = savedScrollTop;
                    });
                }
            });
        }, summaryEl, currentColor).open();
    }

    private setCustomColorForFile(file: TFile, fileEl: HTMLElement) {
        const currentColor = this.plugin.settings.customColors[file.path];
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;
        new ColorPickerModal(this.app, (color) => {
            this.plugin.settings.customColors[file.path] = color;
            this.plugin.saveSettings().then(() => this.render());
        }, fileEl, currentColor).open();
    }

    private resetCustomColorForFile(file: TFile) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;
        delete this.plugin.settings.customColors[file.path];
        this.plugin.saveSettings().then(() => this.render());
        new Notice('File color reset');
    }

    private resetCustomColor(folder: TFolder) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement;
        const savedScrollTop = treeContainer ? treeContainer.scrollTop: 0;
        delete this.plugin.settings.customColors[folder.path];
        this.plugin.saveSettings().then(() => {
            this.render()
            if (savedScrollTop > 0) {
                requestAnimationFrame(() => {
                    const newContainer = this.containerEl.querySelector('.portals-tree-container');
                    if (newContainer) newContainer.scrollTop = savedScrollTop;   
                });
            }
        });       
    }

    private setTagColor(key: string, targetElement: HTMLElement) {
        const currentColor = this.plugin.settings.tagColors[key];
        const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement;
        const savedScrollTop = treeContainer ? treeContainer.scrollTop : 0;
        new ColorPickerModal(this.app, (color) => {
            this.plugin.settings.tagColors[key] = color;
            this.plugin.saveSettings().then(() => {
                this.render();
                if (savedScrollTop > 0) {
                    requestAnimationFrame(() => {
                        const newContainer = this.containerEl.querySelector('.portals-tree-container');
                        if (newContainer) newContainer.scrollTop = savedScrollTop;
                    });
                }
            });
        }, targetElement, currentColor).open();
    }

    private resetTagColor(key: string, _targetElement: HTMLElement) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container') as HTMLElement;
        const savedScrollTop = treeContainer ? treeContainer.scrollTop : 0;
        delete this.plugin.settings.tagColors[key];
        this.plugin.saveSettings().then(() => {
            this.render();
            if (savedScrollTop > 0) {
                requestAnimationFrame(() => {
                    const newContainer = this.containerEl.querySelector('.portals-tree-container');
                    if (newContainer) newContainer.scrollTop = savedScrollTop;
                });
            }
        });
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

    private getCurrentContextNote(): TFile | null {
        const selectedSpace = this.plugin.settings.selectedSpace;
        if (!selectedSpace) return null;
        if (selectedSpace.type === 'folder') {
            const folder = this.app.vault.getAbstractFileByPath(selectedSpace.path);
            return folder instanceof TFolder ? this.getContextNote(folder) ?? null : null;
        } else {
            return this.getContextNote(selectedSpace.path) ?? null;
        }
    }

    private async handleContextNoteCreation(target: ContextTarget) {
        const existing = this.getContextNote(target);
        if (existing) {
            await this.app.workspace.getLeaf().openFile(existing);
        } else {
            await this.createContextNote(target);
        }
    }

    private async hideItem(key: string) {
        this.plugin.settings.hiddenItems[key] = true;
        await this.plugin.saveSettings();
        this.render();
        new Notice('Item hidden');
    }

    private async unhideItem(key: string) {
        delete this.plugin.settings.hiddenItems[key];
        await this.plugin.saveSettings();
        this.render(); // refresh the view and the hidden tab
        new Notice(`Unhidden: ${key}`);
    }

    private async unhideAllItems() {
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

    private renderHiddenTab(container: HTMLElement) {        
        container.addClass('portals-hidden-tab');
        const tabColorEnabled = this.plugin.settings.tabColorEnabled;
        const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
        const rootColor = (tabColorEnabled && rootSpace && rootSpace.color !== 'transparent') ? rootSpace.color : null;
        const hidden = this.plugin.settings.hiddenItems;
        const hiddenKeys = Object.keys(hidden).filter(k => hidden[k]);

        if (hiddenKeys.length === 0) {
            container.createEl('p', { text: 'No hidden items.', cls: 'unhide-items-message' });
            return;
        }

        const buttonWrapper = container.createDiv({ cls: 'unhide-wrapper' });
        const unhideAllBtn = buttonWrapper.createEl('button', { cls: 'unhide-btn-all' });
        unhideAllBtn.createEl('i', { cls: 'ph ph-eye' });
        unhideAllBtn.createSpan({ text: 'Unhide all', cls: 'unhide-btn-text' });
        unhideAllBtn.addEventListener('click', () => this.unhideAllItems());

        if (rootColor) {
            container.style.setProperty('--hidden-accent-color', rootColor);
        } else {
            container.style.removeProperty('--hidden-accent-color');
        }

        hiddenKeys.sort();

        for (const key of hiddenKeys) {
            const fileEl = container.createDiv({ cls: 'file-item' });
            fileEl.dataset.path = key

            let displayName = key;
            let iconClass = 'ph-file';
            let typeLabel = '';

            const item = this.app.vault.getAbstractFileByPath(key);
            if (item instanceof TFile) {
                displayName = this.getDisplayName(item);
                iconClass = 'ph-file';
                typeLabel = 'File';
                const customIcon = this.getCustomIcon(key);
                if (customIcon) iconClass = `ph-${customIcon}`; 
            } else if (item instanceof TFolder) {
                displayName = item.name;
                iconClass = 'ph-folder';
                typeLabel = 'Folder';
                const customIcon = this.getCustomIcon(key);
                if (customIcon) iconClass = `ph-${customIcon}`;
            } else if (key.startsWith('tag:')) {
                const withoutPrefix = key.slice(4);
                const groupMatch = withoutPrefix.match(/^([^/]+)\/group:(.+)$/);
                const nodeMatch = withoutPrefix.match(/^([^/]+)\/node:(.+)$/);
                
                if (groupMatch && groupMatch[1] && groupMatch[2]) {
                    displayName = groupMatch[2];
                    typeLabel = 'Tag Group';
                    iconClass = 'ph-tag-simple';
                } else if (nodeMatch && nodeMatch[1] && nodeMatch[2]) {
                    const nodePath = nodeMatch[2];
                    displayName = nodePath.split('/').pop() || nodePath;
                    typeLabel = 'Subtag';
                    iconClass = 'ph-tag';
                } else {
                    displayName = withoutPrefix;
                    typeLabel = 'Tag';
                    iconClass = 'ph-tag';
                }
                const customIcon = this.getCustomIcon(key);
                if (customIcon) iconClass = `ph-${customIcon}`;
            }
            const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
            iconSpan.createEl('i', {cls: `ph ${iconClass}` });
            fileEl.createSpan({ text: displayName, cls: 'portals-item-name' });

            if (typeLabel) {
                const infoSpan = fileEl.createSpan({ cls: 'hidden-type-label' });
                infoSpan.setText(typeLabel)
            }

            const unhideBtn = fileEl.createEl('button', { cls: 'unhide-btn' });
            unhideBtn.createEl('i', { cls: 'ph ph-eye' });
            // unhideBtn.createSpan({ text: 'Unhide', cls: 'unhide-btn-text' });
            unhideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unhideItem(key)
            });
            unhideBtn.addEventListener('mouseenter', () => this.showTooltip('Unhide', unhideBtn, 300));
            unhideBtn.addEventListener('mouseleave', () => this.hideTooltip(100));
        }
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

    private invalidateContextNoteCache(file: TFile) {
        this.contextNoteCache.delete(file.path);
        const idx = this.contextNoteAccessOrder.indexOf(file.path);
        if (idx !== -1) this.contextNoteAccessOrder.splice(idx, 1);
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

    private renamePortal(space: SpaceConfig) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
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

    private resetPortalName(space: SpaceConfig) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
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

    private sanitizeTagForFilename(tag: string): string {
        // Replace invalid filesystem characters with '-'
        // Keep '/' for now, then convert to '--' separately
        let safe = tag.replace(/[\\:*?"<>|]/g, '-');
        // Replace '/' with '--' to flatten hierarchy
        safe = safe.replace(/\//g, '--');
        // Remove leading/trailing spaces or dots
        safe = safe.trim().replace(/^\.+|\.+$/g, '');
        // Ensure not empty
        return safe || 'untitled-tag';
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


        //---ContextNotes 
        const refreshContextNotes = () => {
            if (!this.plugin.settings.enableContextNotes) return;
            if (this.plugin.settings.activeSplitTab === 'context-notes') {
                const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
                if (secondaryPanel) {
                    const contentEl = secondaryPanel.querySelector('.portals-split-content');
                    if (contentEl) {
                        (contentEl as HTMLElement).empty();
                        this.renderContextNotesTab(contentEl as HTMLElement);
                    }
                }
            }
        };
        
        const contextNoteRenameRef = this.app.vault.on('rename', refreshContextNotes);
        const contextNoteDeleteRef = this.app.vault.on('delete', refreshContextNotes);
        const contextNoteCreateRef = this.app.vault.on('create', refreshContextNotes);
        // Debounced refresh for context notes tab (to avoid frequent re‑renders)
        const debouncedRefreshContextNotes = debounce(() => {
            if (this.plugin.settings.activeSplitTab === 'context-notes') {
                const secondaryPanel = this.containerEl.querySelector('.portals-secondary-panel');
                if (secondaryPanel) {
                    const contentEl = secondaryPanel.querySelector('.portals-split-content') as HTMLElement;
                    if (contentEl) {
                        contentEl.empty();
                        this.renderContextNotesTab(contentEl);
                    }
                }
            }
        }, 300);

        const contextNoteModifyRef = this.app.vault.on('modify', (file) => {
            if (!this.plugin.settings.enableContextNotes) return;
            if (!(file instanceof TFile)) return; // only handle files
            const currentNote = this.getCurrentContextNote();
            if (file.path === currentNote?.path) {
                this.invalidateContextNoteCache(file);
                debouncedRefreshContextNotes();
            }
        });
        this.contextNoteEventRefs = [contextNoteRenameRef, contextNoteDeleteRef, contextNoteCreateRef, contextNoteModifyRef];

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

       // Clean up all Sortable instances
        if (this.sortableInstances) {
            this.sortableInstances.forEach(s => s.destroy());
            this.sortableInstances = [];
        }
        
        //--clean up contextnotes listeners
        if (this.contextNoteEventRefs) {
            this.contextNoteEventRefs.forEach((ref) => {
                // @ts-expect-error - ref is an EventRef, but Typsescript doesn't know
                this.app.vault.offref(ref);
            });
            this.contextNoteEventRefs = null;
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

        // Clean up context note cache
        for (const { component } of this.contextNoteCache.values()) {
            this.removeChild(component);
        }
        this.contextNoteCache.clear();
        this.contextNoteScrollPositions.clear();
        this.contextNoteAccessOrder = [];

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

    //-- ContextNote
    private isContextNote(file: TFile, target: ContextTarget): boolean {
        if (target instanceof TFolder) {
            // Folder logic (unchanged)
            if (target.path === '/') {
                return file.extension === 'md' && 
                    file.name.toLowerCase() === (this.app.vault.getName() + '.md').toLowerCase() && 
                    file.parent?.path === '/';
            } else {
                return file.extension === 'md' && 
                    file.name.toLowerCase() === (target.name + '.md').toLowerCase() && 
                    file.parent?.path === target.path;
            }
        } else {
            // Tag note: must be in correct folder and have the tag in frontmatter
            const folderPath = this.plugin.settings.tagNotesFolderPath;
            const expectedParent = folderPath || '';
            if (file.parent?.path !== expectedParent) return false;

            // Verify frontmatter contains the target tag
            const cache = this.app.metadataCache.getFileCache(file);
            const tags = cache?.frontmatter?.tags;
            const hasTag = Array.isArray(tags) ? tags.includes(target) : tags === target;
            
            // Optionally also check filename convention for consistency
            const safeName = this.sanitizeTagForFilename(target);
            const filenameMatches = file.basename === safeName && file.extension === 'md';
            
            return hasTag && filenameMatches;
        }
    }

    //-- ContextNote Dot
    private hasContextNote(target: ContextTarget): boolean {
        if (target instanceof TFolder) {
            return target.children.some(child =>
                child instanceof TFile && this.isContextNote(child, target)
            );
        } else {
            return this.getContextNote(target) !== undefined;
        }
    }

    private isContextNoteFile(file: TFile, contextTarget?: ContextTarget): boolean {
        if (!contextTarget) return false;
        return this.isContextNote(file, contextTarget);
    }

    //--getContextNote
    private getContextNote(target: ContextTarget): TFile | undefined {
        if (target instanceof TFolder) {
            // Existing folder logic (unchanged)
            if (target.path === '/') {
                const vaultName = this.app.vault.getName();
                const rootNotePath = vaultName + '.md';
                const file = this.app.vault.getAbstractFileByPath(rootNotePath);
                return file instanceof TFile ? file : undefined;
            }
            return target.children.find((child): child is TFile => 
                child instanceof TFile && this.isContextNote(child, target)
            );
        } else {
            // New tag logic
            const folderPath = this.plugin.settings.tagNotesFolderPath;
            const safeName = this.sanitizeTagForFilename(target) + '.md';
            const fullPath = folderPath ? `${folderPath}/${safeName}` : safeName;
            const file = this.app.vault.getAbstractFileByPath(fullPath);
            return file instanceof TFile ? file : undefined;
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
            
            portalStacks: s.portalStacks.map(st =>
                `${st.id}|${st.name}|${st.icon || ''}|${st.color || ''}|${st.collapsed}|${st.order ?? 0}`).join(','),
        });
    }

    render() {
        if (this.isDraggingTab) return;
        // Save scroll position of current context note if it exists
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.activeSplitTab === 'context-notes') {
            const splitContent = this.containerEl.querySelector('.portals-split-content') as HTMLElement;
            const noteContainer = splitContent?.querySelector('.markdown-preview-view') as HTMLElement;
            if (noteContainer) {
                const currentNote = this.getCurrentContextNote();
                if (currentNote) {
                    this.contextNoteScrollPositions.set(currentNote.path, noteContainer.scrollTop);
                }
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

                // Tab container
                const tabContainer = secondaryHeader.createDiv({ cls: 'portals-split-tabs' });

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
                    this.renderSplitTabContent(secondaryPanel, tabId);
                });
            });

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
        contentEl.className = 'portals-split-content';
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
                    e.stopPropagation();
                    e.preventDefault();
                    this.showFileContextMenu(e, file, fileEl);
                });
            }

        } else if (tabId === 'context-notes') {
            if (!this.plugin.settings.enableContextNotes) {
                contentEl.createEl('p', {
                    text: 'Context notes are disabled. Enable them in settings.',
                    cls: 'portals-context-note-message'
                });
                return;
            }
            this.renderContextNotesTab(contentEl);
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
        } else if (tabId === 'hidden') {
            this.renderHiddenTab(contentEl);
        } else if (tabId === 'properties') {
            contentEl.empty();
            contentEl.addClass('portals-frontmatter-clinic');
            const renderer = new FrontmatterClinicRenderer(this.app, this.plugin, contentEl);
            await renderer.render();
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

    // Context note

    private async createContextNote(target: ContextTarget): Promise<TFile> {
        if (target instanceof TFolder) {
            // Existing context note creation logic (unchanged)
            let noteName: string;
            let notePath: string;
            let displayName: string;

            if (target.path === '/') {
                const vaultName = this.app.vault.getName();
                noteName = vaultName + '.md';
                notePath = noteName;
                displayName = vaultName;
            } else {
                noteName = target.name + '.md';
                notePath = `${target.path}/${noteName}`;
                displayName = target.name;
            }

            try {
                const file = await this.app.vault.create(notePath, `# ${displayName}\n\n`);
                await this.app.workspace.getLeaf().openFile(file);
                new Notice('Context note created.');
                return file;
            } catch (err) {
                // If creation fails because file already exists, try to open it
                const existing = this.app.vault.getAbstractFileByPath(notePath);
                if (existing instanceof TFile) {
                    new Notice('Context note already exists. Opening it.');
                    await this.app.workspace.getLeaf().openFile(existing);
                    return existing;
                } else {
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Failed to create context note: ${message}`);
                    throw err;
                }
            }
        } else {
            // New tag note creation
            const folderPath = this.plugin.settings.tagNotesFolderPath;
            
            // Ensure the tag notes folder exists
            if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
                await this.app.vault.createFolder(folderPath);
            }

            const safeName = this.sanitizeTagForFilename(target);
            const filePath = folderPath ? `${folderPath}/${safeName}.md` : `${safeName}.md`;

            try {
                const file = await this.app.vault.create(filePath, `# ${target}\n\n`);
                
                // Add the tag to frontmatter
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    if (!fm.tags) {
                        fm.tags = [target];
                    } else if (Array.isArray(fm.tags)) {
                        if (!fm.tags.includes(target)) {
                            fm.tags.push(target);
                        }
                    } else {
                        // If tags is a string, convert to array and add the new tag
                        fm.tags = [fm.tags, target];
                    }
                });

                await this.app.workspace.getLeaf().openFile(file);
                new Notice('Tag note created.');
                return file;
            } catch (err) {
                const existing = this.app.vault.getAbstractFileByPath(filePath);
                if (existing instanceof TFile) {
                    new Notice('Tag note already exists. Opening it.');
                    await this.app.workspace.getLeaf().openFile(existing);
                    return existing;
                } else {
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Failed to create tag note: ${message}`);
                    throw err;
                }
            }
        }
    }

    //--RenderContextNotesTab
    private renderContextNotesTab(contentEl: HTMLElement) {
        const targetFile = this.getCurrentContextNote();
        if (!targetFile) {
            contentEl.createEl('p', { text: 'No context note found for the current space.', cls: 'portals-context-note-message' });
            return;
        }

        // Check cache
        const filePath = targetFile.path;
        const cached = this.contextNoteCache.get(filePath);
        if (cached) {
            // update access order: move this file to end (most recent)
            const idx = this.contextNoteAccessOrder.indexOf(filePath);
            if (idx !== -1) this.contextNoteAccessOrder.splice(idx, 1);
            this.contextNoteAccessOrder.push(filePath);

            // use cached element
            contentEl.empty();
            contentEl.appendChild(cached.element);
            // Restore scroll position if stored
            const savedScroll = this.contextNoteScrollPositions.get(filePath);
            if (savedScroll !== undefined) {
                cached.element.scrollTop = savedScroll;
                this.contextNoteScrollPositions.delete(filePath);
            }
            return;
        }

        // No cache – create detached element
        const noteContainer = document.createElement('div');
        noteContainer.addClass('markdown-preview-view', 'portals-context-note-container');

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
                        // resolve link relative to current context note's path
                        const resolved = this.app.metadataCache.getFirstLinkpathDest(targetPath, targetFile.path);
                        if (resolved instanceof TFile) {
                            void this.app.workspace.getLeaf().openFile(resolved);
                        }
                    }
                });

                // Store in cache
                this.contextNoteCache.set(filePath, { element: noteContainer, component });
                this.contextNoteAccessOrder.push(filePath);
                
                // evict least reent used if cache exceeds limit
                if (this.contextNoteCache.size > this.MAX_CONTEXT_NOTE_CACHE) {
                    const oldest = this.contextNoteAccessOrder.shift();
                    if (oldest) {
                        const evicted = this.contextNoteCache.get(oldest);
                        if (evicted) {
                            this.removeChild(evicted.component);
                            evicted.element.remove();

                            this.contextNoteCache.delete(oldest);
                        }
                    }
                }

                // restore scroll position if stored
                const savedScroll = this.contextNoteScrollPositions.get(filePath)
                if (savedScroll !== undefined) {
                    noteContainer.scrollTop = savedScroll;
                    this.contextNoteScrollPositions.delete(filePath);
                }

                // Append to contentEl (if still relevant)
                if (this.plugin.settings.activeSplitTab === 'context-notes' && this.getCurrentContextNote()?.path === filePath) {
                    contentEl.empty();
                    contentEl.appendChild(noteContainer);
                }
            } catch (e) {
                console.error('Error rendering context note:', e);
                noteContainer.setText('Error rendering note.');
            }
        }).catch(e => {
            console.error('Error reading context note:', e);
            noteContainer.setText('Error reading note.');
        });

        noteContainer.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('a')) return;
            void this.app.workspace.getLeaf().openFile(targetFile);
        });
        contentEl.empty();
        contentEl.appendChild(noteContainer);
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

            // Apply context note highlight to main tag
            const mainTagPath = tagName; // e.g., "project"
            if (this.plugin.settings.enableContextNotes && this.hasContextNote(mainTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
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
                const menu = new Menu();
                // ... existing portal configuration items (rename, icon, etc.) ...
                if (this.plugin.settings.enableContextNotes) {
                    menu.addSeparator();
                    const contextNote = this.getContextNote(tagName);
                    if (contextNote) {
                        menu.addItem(item => item
                            .setTitle('Open context note')
                            .setIcon('document')
                            .onClick(() => this.app.workspace.getLeaf().openFile(contextNote)));
                        menu.addItem(item => item
                            .setTitle('Delete context note')
                            .setIcon('trash')
                            .setWarning(true)
                            .onClick(() => this.deleteFile(contextNote)));
                    } else {
                        menu.addItem(item => item
                            .setTitle('Create context note')
                            .setIcon('plus')
                            .onClick(() => this.createContextNote(tagName)));
                    }
                }
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });

            // Attach click handlers for context note actions
            mainSummary.addEventListener('click', (e) => {
                if (e.shiftKey && this.plugin.settings.enableContextNotes) {
                    e.preventDefault();
                    e.stopPropagation();
                    void this.handleContextNoteCreation(mainTagPath);
                    return;
                }
                if ((e.metaKey || e.ctrlKey) && this.plugin.settings.enableContextNotes) {
                    e.preventDefault();
                    e.stopPropagation();
                    const note = this.getContextNote(mainTagPath);
                    if (note) {
                        void this.app.workspace.getLeaf('tab').openFile(note);
                    } else {
                        new Notice('No context note for this tag');
                    }
                    return;
                }
            });

            // Icon click handler (if setting enabled)
            if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNoteIconClick) {
                mainIconSpan.style.cursor = 'pointer';
                mainIconSpan.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const note = this.getContextNote(mainTagPath);
                    if (note) {
                        await this.app.workspace.getLeaf().openFile(note);
                    } else {
                        new Notice('No context note exists for this tag. Shift+Click to create.');
                    }
                });
            }

            // If no groups, just list all files under the main tag
            if (!groupTags || groupTags.length === 0) {
                for (const file of sortFiles(taggedFiles)) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    if (this.plugin.settings.enableContextNotes && !this.plugin.settings.showContextNotesInTree && this.isContextNoteFile(file, tagName)) {
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
                    const style = this.plugin.settings.treeStyle;
                    const canSetIcon = style !== 'minimal' && style !== 'shades';
                    if (canSetIcon) {
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
                            menu.showAtPosition({ x: e.clientX, y: e.clientY });
                        }
                    }
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
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                if (this.plugin.settings.enableContextNotes && 
                    !this.plugin.settings.showContextNotesInTree && 
                    this.isContextNoteFile(file, tagName)) {
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
            
            const customIcon = this.getCustomIcon(nodeKey);
            const iconClass = customIcon ? `ph ph-${customIcon}` : `ph ph-${iconName || 'tag'}`;
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            const nameSpan = summary.createSpan({ text: node.name });
            nameSpan.addClass('portals-item-name');
            summary.dataset.tagPath = node.fullPath;

            const childrenContainer = details.createDiv({ cls: 'folder-children' });

            

            // Apply context note highlight to subtag node
            const nodeTagPath = node.fullPath; // e.g., "project/ideas"
            if (this.plugin.settings.enableContextNotes && this.hasContextNote(nodeTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    iconSpan.addClass('has-context-note-icon');
                    summary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    summary.addClass('has-context-note-underline');
                }
            }

            // Icon click handler (if setting enabled)
            if (this.plugin.settings.contextNoteIconClick) {
                iconSpan.style.cursor = 'pointer';
                iconSpan.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const note = this.getContextNote(nodeTagPath);
                    if (note) {
                        await this.app.workspace.getLeaf().openFile(note);
                    } else {
                        new Notice('No context note exists for this subtag. Shift+Click to create.');
                    }
                });
            }

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = this.getContextNote(node.fullPath);
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
                        this.isContextNoteFile(file, node.fullPath)) {
                        continue;
                    }
                    this.createFileItem(file, childrenContainer, openFiles);
                }
            }

            // Context menu for custom icon on tag node
            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const menu = new Menu();
                const groupKey = `tag:${tagName}/node:${node.fullPath}`;
                menu.addItem(item => item
                    .setTitle('Hide')
                    .setIcon('eye-off')
                    .onClick(() => this.hideItem(nodeKey)));
                const canSetIcon = style !== 'minimal' && style !== 'shades';
                if (canSetIcon) {
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
                }
                const canSetColor = style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);
                if (canSetColor) {
                    menu.addSeparator();
                    const nodeKey = `tag:${tagName}/node:${node.fullPath}`;
                    const currentColor = this.plugin.settings.tagColors[groupKey];
                    menu.addItem(item => item
                        .setTitle('Set color')
                        .setIcon('palette')
                        .onClick(() => this.setTagColor(nodeKey, details)));
                    if (currentColor) {
                        menu.addItem(item => item
                            .setTitle('Reset color')
                            .setIcon('undo')
                            .onClick(() => this.resetTagColor(nodeKey, details)));
                        }
                    }
                    if (this.plugin.settings.enableContextNotes) {
                        menu.addSeparator();
                        const contextNote = this.getContextNote(node.fullPath);
                        if (contextNote) {
                            menu.addItem(item => item
                                .setTitle('Open context note')
                                .setIcon('document')
                                .onClick(() => this.app.workspace.getLeaf().openFile(contextNote)));
                            menu.addItem(item => item
                                .setTitle('Delete context note')
                                .setIcon('trash')
                                .setWarning(true)
                                .onClick(() => this.deleteFile(contextNote)));
                        } else {
                            menu.addItem(item => item
                                .setTitle('Create context note')
                                .setIcon('plus')
                                .onClick(() => this.createContextNote(node.fullPath)));
                        }
                    }
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });

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

            summary.addEventListener('click', (e) => {
                if (e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleSelectionByKey(nodeKey, summary);
                }
                if (e.shiftKey && this.plugin.settings.enableContextNotes) {
                    e.preventDefault();
                    e.stopPropagation();
                    void this.handleContextNoteCreation(nodeTagPath);
                    return;
                }
                if ((e.metaKey || e.ctrlKey) && this.plugin.settings.enableContextNotes) {
                    e.preventDefault();
                    e.stopPropagation();
                    const note = this.getContextNote(nodeTagPath);
                    if (note) {
                        void this.app.workspace.getLeaf('tab').openFile(note);
                    } else {
                        new Notice('No context note for this subtag');
                    }
                    return;
                }
            });

            let touchStartPos: { x: number; y: number } | null = null;
            let isSwiping = false;
            // Touch swipe for mobile selection
            summary.addEventListener('touchstart', (e: TouchEvent) => {
                const touch = e.touches[0];
                if (touch) {
                    touchStartPos = { x: touch.clientX, y: touch.clientY };
                    isSwiping = false;
                }
            }, { passive: true });

            summary.addEventListener('touchmove', (e: TouchEvent) => {
                if (!touchStartPos) return;
                const touch = e.touches[0];
                if (!touch) return;
                const deltaX = touch.clientX - touchStartPos.x;
                const deltaY = touch.clientY - touchStartPos.y;
                if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaY) < 20) {
                    isSwiping = true;
                    summary.addClass('swipe-active');
                }
            }, { passive: true });

            summary.addEventListener('touchend', (e: TouchEvent) => {
                if (!touchStartPos) {
                    if (isSwiping) summary.removeClass('swipe-active');
                    touchStartPos = null;
                    isSwiping = false;
                    return;
                }
                const changedTouch = e.changedTouches[0];
                if (changedTouch && isSwiping) {
                    const deltaX = changedTouch.clientX - touchStartPos.x;
                    const deltaY = changedTouch.clientY - touchStartPos.y;
                    if (deltaX > 30 && Math.abs(deltaY) < 30) {
                        this.toggleSelectionByKey(nodeKey, summary);
                    }
                }
                if (isSwiping) summary.removeClass('swipe-active');
                touchStartPos = null;
                isSwiping = false;
            });

            summary.addEventListener('touchcancel', () => {
                if (isSwiping) summary.removeClass('swipe-active');
                touchStartPos = null;
                isSwiping = false;
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

        // Apply context note highlight to main tag
        const mainTagPath = tagName;
        if (this.plugin.settings.enableContextNotes && this.hasContextNote(mainTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
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
            const menu = new Menu();
            menu.addSeparator();
            if (this.plugin.settings.enableContextNotes) {
                const contextNote = this.getContextNote(tagName);
                if (contextNote) {
                    menu.addItem(item => item
                        .setTitle('Open context note')
                        .setIcon('document')
                        .onClick(() => this.app.workspace.getLeaf().openFile(contextNote)));
                    menu.addItem(item => item
                        .setTitle('Delete context note')
                        .setIcon('trash')
                        .setWarning(true)
                        .onClick(() => this.deleteFile(contextNote)));
                } else {
                    menu.addItem(item => item
                        .setTitle('Create context note')
                        .setIcon('plus')
                        .onClick(() => this.createContextNote(tagName)));
                }
            }
            menu.showAtPosition({ x: e.clientX, y: e.clientY });
        });

        mainSummary.addEventListener('click', (e) => {
            if (e.shiftKey && this.plugin.settings.enableContextNotes) {
                e.preventDefault();
                e.stopPropagation();
                void this.handleContextNoteCreation(mainTagPath);
                return;
            }
            if ((e.metaKey || e.ctrlKey) && this.plugin.settings.enableContextNotes) {
                e.preventDefault();
                e.stopPropagation();
                const note = this.getContextNote(mainTagPath);
                if (note) {
                    void this.app.workspace.getLeaf('tab').openFile(note);
                } else {
                    new Notice('No context note for this tag');
                }
                return;
            }
        });

        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNoteIconClick) {
            mainIconSpan.style.cursor = 'pointer';
            mainIconSpan.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const note = this.getContextNote(mainTagPath);
                if (note) {
                    await this.app.workspace.getLeaf().openFile(note);
                } else {
                    new Notice('No context note exists for this tag. Shift+Click to create.');
                }
            });
        }

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

            const customIconGroup = this.getCustomIcon(groupKey);
            const iconClass = customIconGroup ? `ph ph-${customIconGroup}` : 'ph ph-tag-simple';
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');

            // Apply context note highlight to group
            const groupTagPath = gTag; // e.g., "urgent"
            if (this.plugin.settings.enableContextNotes && this.hasContextNote(groupTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    iconSpan.addClass('has-context-note-icon');
                    summary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    summary.addClass('has-context-note-underline');
                }
            }

            // Icon click handler
            if (this.plugin.settings.contextNoteIconClick) {
                iconSpan.style.cursor = 'pointer';
                iconSpan.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const note = this.getContextNote(groupTagPath);
                    if (note) {
                        await this.app.workspace.getLeaf().openFile(note);
                    } else {
                        new Notice('No context note exists for this group tag. Shift+Click to create.');
                    }
                });
            }

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = this.getContextNote(gTag);
                if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                    const alreadyListed = files.some((f: TFile) => f.path === contextNote.path);
                    if (!alreadyListed) {
                        this.createFileItem(contextNote, groupChildren, openFiles);
                    }
                }
            }

            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const menu = new Menu();
                const canSetIcon = this.plugin.settings.treeStyle !== 'minimal' && this.plugin.settings.treeStyle !== 'shades';
                    if (canSetIcon) {
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
                    if (this.plugin.settings.enableContextNotes) {
                        menu.addSeparator();
                        const contextNote = this.getContextNote(gTag);
                        if (contextNote) {
                            menu.addItem(item => item
                                .setTitle('Open context note')
                                .setIcon('document')
                                .onClick(() => this.app.workspace.getLeaf().openFile(contextNote)));
                            menu.addItem(item => item
                                .setTitle('Delete context note')
                                .setIcon('trash')
                                .setWarning(true)
                                .onClick(() => this.deleteFile(contextNote)));
                        } else {
                            menu.addItem(item => item
                                .setTitle('Create context note')
                                .setIcon('plus')
                                .onClick(() => this.createContextNote(gTag)));
                        }
                    }
                }
                const canSetcolor = style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);
                if (canSetcolor) {
                    menu.addSeparator();
                    const currentColor = this.plugin.settings.tagColors[groupKey];
                    menu.addItem(item => item
                        .setTitle('Set color')
                        .setIcon('palette')
                        .onClick(() => this.setTagColor(groupKey, groupDetails)));
                    if (currentColor) {
                        menu.addItem(item => item
                            .setTitle('Reset color')
                            .setIcon('undo')
                            .onClick(() => this.resetTagColor(groupKey, groupDetails)));
                    }
                }
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });

            for (const file of sortFiles(files)) {
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                if (this.plugin.settings.enableContextNotes && 
                    !this.plugin.settings.showContextNotesInTree && 
                    this.isContextNoteFile(file, gTag)) {
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

            summary.addEventListener('click', (e) => {
                if (e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleSelectionByKey(groupKey, summary);
                }
                if (e.shiftKey && this.plugin.settings.enableContextNotes) {
                    e.preventDefault();
                    e.stopPropagation();
                    void this.handleContextNoteCreation(groupTagPath);
                    return;
                }
                if ((e.metaKey || e.ctrlKey) && this.plugin.settings.enableContextNotes) {
                    e.preventDefault();
                    e.stopPropagation();
                    const note = this.getContextNote(groupTagPath);
                    if (note) {
                        void this.app.workspace.getLeaf('tab').openFile(note);
                    } else {
                        new Notice('No context note for this group tag');
                    }
                    return;
                }
            });

            let touchStartPos: { x: number; y: number } | null = null;
            let isSwiping = false;
            // Touch swipe for mobile selection
            summary.addEventListener('touchstart', (e: TouchEvent) => {
                const touch = e.touches[0];
                if (touch) {
                    touchStartPos = { x: touch.clientX, y: touch.clientY };
                    isSwiping = false;
                }
            }, { passive: true });

            summary.addEventListener('touchmove', (e: TouchEvent) => {
                if (!touchStartPos) return;
                const touch = e.touches[0];
                if (!touch) return;
                const deltaX = touch.clientX - touchStartPos.x;
                const deltaY = touch.clientY - touchStartPos.y;
                if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaY) < 20) {
                    isSwiping = true;
                    summary.addClass('swipe-active');
                }
            }, { passive: true });

            summary.addEventListener('touchend', (e: TouchEvent) => {
                if (!touchStartPos) {
                    if (isSwiping) summary.removeClass('swipe-active');
                    touchStartPos = null;
                    isSwiping = false;
                    return;
                }
                const changedTouch = e.changedTouches[0];
                if (changedTouch && isSwiping) {
                    const deltaX = changedTouch.clientX - touchStartPos.x;
                    const deltaY = changedTouch.clientY - touchStartPos.y;
                    if (deltaX > 30 && Math.abs(deltaY) < 30) {
                        this.toggleSelectionByKey(groupKey, summary);
                    }
                }
                if (isSwiping) summary.removeClass('swipe-active');
                touchStartPos = null;
                isSwiping = false;
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
            if (this.plugin.settings.hiddenItems[file.path]) continue;
            if (this.plugin.settings.enableContextNotes && 
                !this.plugin.settings.showContextNotesInTree && 
                this.isContextNoteFile(file, tagName)) {
                continue;
            }
            this.createFileItem(file, mainChildren, openFiles);
        }

        // Include context note file in tree if setting enabled
        if (this.plugin.settings.showContextNotesInTree) {
            const contextNote = this.getContextNote(tagName);
            if (contextNote) {
                // Avoid duplication if it's already in the list (shouldn't be, but safe)
                const alreadyListed = ungroupedRootFiles.some(f => f.path === contextNote.path);
                if (!alreadyListed) {
                    this.createFileItem(contextNote, mainChildren, openFiles);
                }
            }
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
            .setWarning(true)
            .onClick(() => void this.deleteFile(file)));

        menu.addItem(item => item
            .setTitle('Duplicate')
            .setIcon('copy')
            .onClick(() => void this.duplicateFile(file)));

        menu.addItem(item => item
            .setTitle('Rename')
            .setIcon('pencil')
            .onClick(() => this.startRenameFile(file, fileEl)));

        menu.addItem(item => item
            .setTitle('Hide')
            .setIcon('eye-off')
            .onClick(() => this.hideItem(file.path)));
            
        const style = this.plugin.settings.treeStyle;
        const canSetIcon = style !== 'minimal' && style !== 'shades'
        if (canSetIcon) {
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
        }
        menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => this.setCustomColorForFile(file, fileEl)));
            if (this.plugin.settings.customColors[file.path]) {
                menu.addItem(item => item
                    .setTitle('Reset folder color')
                    .setIcon('undo')
                    .onClick(() => this.resetCustomColorForFile(file)));
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

        if (this.plugin.settings.enableContextNotes) {
            const contextNote = folder.children.find((child): child is TFile =>
                child instanceof TFile && this.isContextNote(child, folder));
            if (contextNote) {
                menu.addItem(item => item
                    .setTitle('Open context note')
                    .setIcon('document')
                    .onClick(() => void this.app.workspace.getLeaf().openFile(contextNote)));
                menu.addItem(item => item
                    .setTitle('Delete context note')
                    .setIcon('trash')
                    .setWarning(true)
                    .onClick(() => this.deleteFile(contextNote))
                )
            } else {
                menu.addItem(item => item
                    .setTitle('Create context note')
                    .setIcon('plus')
                    .onClick(() => void this.createContextNote(folder)));
            }
        }

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Delete')
            .setIcon('trash')
            .setWarning(true)
            .onClick(() => void this.deleteFolder(folder)));

        menu.addItem(item => item
            .setTitle('Duplicate')
            .setIcon('copy')
            .onClick(() => void this.duplicateFolder(folder)));

        menu.addItem(item => item
            .setTitle('Rename')
            .setIcon('pencil')
            .onClick(() => this.startRenameFolder(folder, summaryEl)));

        menu.addItem(item => item
            .setTitle('Hide')
            .setIcon('eye-off')
            .onClick(() => this.hideItem(folder.path)));    

        const canSetIcon = this.plugin.settings.treeStyle !== 'minimal' && this.plugin.settings.treeStyle !== 'shades';

        if (canSetIcon) {
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
        }

        menu.addSeparator();
        const style = this.plugin.settings.treeStyle;
        const canSetColor = style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);
        const detailsEl = summaryEl.parentElement;
        if (canSetColor && detailsEl && detailsEl.hasClass('folder-details')) {
            menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => this.setCustomColor(folder, detailsEl)));
            if (this.plugin.settings.customColors[folder.path]) {
                menu.addItem(item => item
                    .setTitle('Reset folder color')
                    .setIcon('undo')
                    .onClick(() => this.resetCustomColor(folder)));
            }
        }

        this.app.workspace.trigger('file-menu', menu, folder, 'file-explorer');

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    private clearSelection() {
    // Remove classes from all selected items
    this.containerEl.querySelectorAll('.file-item.is-selected, .folder-summary.is-selected').forEach(el => {
        el.removeClass('is-selected');
    });
    this.selectedItems.clear();
    this.updateMultiSelectToolbar();
}

    private async deleteSelectedItems() {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
        
        if (this.selectedItems.size === 0) return;
        const confirmMsg = `Delete ${this.selectedItems.size} item(s) permanently?`;
        if (!confirm(confirmMsg)) return;
        
        for (const path of this.selectedItems) {
            const item = this.app.vault.getAbstractFileByPath(path);
            if (!item) continue;
            try {
                await this.app.fileManager.trashFile(item);
                if (item instanceof TFile) {
                    delete this.plugin.settings.customIcons[path];
                } else if (item instanceof TFolder) {
                    // Remove custom icons for all files inside folder
                    const toDelete = Object.keys(this.plugin.settings.customIcons).filter(p => p === path || p.startsWith(path + '/'));
                    for (const iconPath of toDelete) {
                        delete this.plugin.settings.customIcons[iconPath];
                    }
                }
            } catch (err) {
                console.error(err);
                new Notice(`Failed to delete ${item.name}`);
            }
        }
        await this.plugin.saveSettings();
        this.clearSelection();
        this.renderContent();
        new Notice(`Deleted ${this.selectedItems.size} item(s)`);
    }

    private async moveSelectedItemsToFolder() {
        if (this.selectedItems.size === 0) return;
        new SelectFolderModal(this.app, async (targetFolder) => {
            let movedCount = 0;
            for (const path of this.selectedItems) {
                const item = this.app.vault.getAbstractFileByPath(path);
                if (!item) continue;
                const newPath = `${targetFolder.path}/${item.name}`;
                if (this.app.vault.getAbstractFileByPath(newPath)) {
                    new Notice(`${item.name} already exists in destination, skipped.`);
                    continue;
                }
                try {
                    await this.app.vault.rename(item, newPath);
                    movedCount++;
                    // Update custom icon mapping if exists
                    if (this.plugin.settings.customIcons[path]) {
                        this.plugin.settings.customIcons[newPath] = this.plugin.settings.customIcons[path];
                        delete this.plugin.settings.customIcons[path];
                    }
                } catch (err) {
                    console.error(err);
                    new Notice(`Failed to move ${item.name}`);
                }
            }
            await this.plugin.saveSettings();
            this.clearSelection();
            this.renderContent();
            new Notice(`Moved ${movedCount} item(s) to ${targetFolder.path}`);
        }).open();
    }

    private async createFolderFromSelected() {
        if (this.selectedItems.size === 0) return;
        
        const parentFolder = this.getCommonParentFolder();
        if (!parentFolder) {
            new Notice('Selected items are not in a common parent folder');
            return;
        }
        
        const folderName = await this.promptForFolderName();
        if (!folderName) return;
        
        const newFolderPath = `${parentFolder.path}/${folderName}`;
        if (this.app.vault.getAbstractFileByPath(newFolderPath)) {
            new Notice('Folder already exists');
            return;
        }
        
        try {
            await this.app.vault.createFolder(newFolderPath);
            let movedCount = 0;
            for (const path of this.selectedItems) {
                const item = this.app.vault.getAbstractFileByPath(path);
                if (!item) continue;
                const newPath = `${newFolderPath}/${item.name}`;
                if (this.app.vault.getAbstractFileByPath(newPath)) {
                    new Notice(`${item.name} already exists in new folder, skipped.`);
                    continue;
                }
                await this.app.vault.rename(item, newPath);
                movedCount++;
                // Update custom icon mapping if exists
                if (this.plugin.settings.customIcons[path]) {
                    this.plugin.settings.customIcons[newPath] = this.plugin.settings.customIcons[path];
                    delete this.plugin.settings.customIcons[path];
                }
            }
            await this.plugin.saveSettings();
            this.clearSelection();
            this.renderContent();
            new Notice(`Created folder "${folderName}" and moved ${movedCount} item(s)`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create folder: ${message}`);
        }
    }

    private getCommonParentFolder(): TFolder | null {
        let commonParent: TFolder | null = null;
        for (const path of this.selectedItems) {
            const item = this.app.vault.getAbstractFileByPath(path);
            if (!item) return null;
            
            // Get parent folder – for root folder, parent is null, but we treat the root itself as the parent
            let parent = item.parent;
            if (!parent && item instanceof TFolder && item.path === '/') {
                parent = item; // root folder is its own parent for this purpose
            }
            
            if (!commonParent) commonParent = parent;
            else if (commonParent !== parent) return null;
        }
        return commonParent;
    }

    private async promptForFolderName(): Promise<string | null> {
        return new Promise((resolve) => {
            class FolderNameModal extends Modal {
                constructor(app: App) {
                    super(app);
                }
                onOpen() {
                    const { contentEl } = this;
                    contentEl.createEl('h3', { text: 'Create new folder' });
                    const input = contentEl.createEl('input', { type: 'text', placeholder: 'Folder name', cls: 'portals-search-input' });
                    const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
                    const okBtn = buttonDiv.createEl('button', { text: 'Create', cls: 'mod-cta' });
                    const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
                    okBtn.addEventListener('click', () => {
                        const val = input.value.trim();
                        resolve(val || null);
                        this.close();
                    });
                    cancelBtn.addEventListener('click', () => {
                        resolve(null);
                        this.close();
                    });
                    input.focus();
                    input.select();
                }
                onClose() {
                    this.contentEl.empty();
                }
            }
            new FolderNameModal(this.app).open();
        });
    }

    private async resetColorsForSelected() {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;

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
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        if (treeContainer) this.scrollToRestore = treeContainer.scrollTop;

        for (const key of this.selectedItems) {
            delete this.plugin.settings.customIcons[key]; 
        }
        await this.plugin.saveSettings();
        this.clearSelection();
        this.render();
        new Notice('Icons reset for selected items');
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
        const hideExtension = this.plugin.settings.enableFileExtensionNonMD;
        
        let base: string;
        if (isMd) {
            base = file.basename;
        } else {
            base = hideExtension ? file.basename : file.name;
        }

        const input = this.createRenameInput(base, (newBase) => {
            (async () => {
                if (!newBase || newBase === base) return;
                let newName: string;
                if (isMd) {
                    newName = newBase + '.' + file.extension;
                } else {
                    if (hideExtension) {
                        newName = newBase + '.' + file.extension;
                    } else {
                        newName = newBase;
                    }
                }
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
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
        try {
            await this.app.fileManager.trashFile(file);
            delete this.plugin.settings.customIcons[file.path];
            await this.plugin.saveSettings();
            this.renderContent();
            new Notice(`File "${file.name}" moved to trash`, 2000);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Delete failed: ${message}`, 3000);
        }
    }

    private async deleteFolder(folder: TFolder) {
        const treeContainer = this.containerEl.querySelector('.portals-tree-container');
        this.scrollToRestore = treeContainer ? treeContainer.scrollTop : 0;
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
        const hasNote = this.hasContextNote(folder);
        if (this.plugin.settings.enableContextNotes && hasNote) {
            const style = this.plugin.settings.contextNoteHighlightStyle;
            if (style === 'icon') {
                iconSpan.addClass('has-context-note-icon')
                if (this.plugin.settings.treeStyle === 'minimal' || this.plugin.settings.treeStyle === 'shades') {
                    summary.addClass('has-context-note-icon');
                }
            } else if (style === 'underline') {
                summary.addClass('has-context-note-underline');
                const nameSpan = summary.querySelector('.portals-item-name');
                nameSpan?.addClass('has-context-note-underline');
            }
        }

        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNoteIconClick) {
            iconSpan.style.cursor = 'pointer';
            const openContextNote = async (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const contextNote = this.getContextNote(folder);
                if (contextNote) {
                    await this.app.workspace.getLeaf().openFile(contextNote);
                } else {
                    new Notice('No context note exists for this folder. Create using Shift+Click or context menu');
                }
            };
            iconSpan.addEventListener('click', openContextNote);
            iconSpan.addEventListener('touchstart', openContextNote, { passive: false });
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

        let touchStartPos: { x: number; y: number } | null = null;
        let isSwiping = false;

        summary.addEventListener('touchstart', (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch) {
                touchStartPos = { x: touch.clientX, y: touch.clientY };
                isSwiping = false;
            }
        }, { passive: true });

        summary.addEventListener('touchmove', (e: TouchEvent) => {
            if (!touchStartPos) return;
            const touch = e.touches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStartPos.x;
            const deltaY = touch.clientY - touchStartPos.y;
            if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaY) < 20) {
                isSwiping = true;
                summary.addClass('swipe-active');
            }
        }, { passive: true });

        summary.addEventListener('touchend', (e: TouchEvent) => {
            if (!touchStartPos) {
                if (isSwiping) summary.removeClass('swipe-active');
                touchStartPos = null;
                isSwiping = false;
                return;
            }
            const changedTouch = e.changedTouches[0];
            if (changedTouch && isSwiping) {
                const deltaX = changedTouch.clientX - touchStartPos.x;
                const deltaY = changedTouch.clientY - touchStartPos.y;
                if (deltaX > 30 && Math.abs(deltaY) < 30) {
                    this.toggleSelection(folder, summary);
                }
            }
            if (isSwiping) summary.removeClass('swipe-active');
            touchStartPos = null;
            isSwiping = false;
        });

        summary.addEventListener('touchcancel', () => {
            if (isSwiping) summary.removeClass('swipe-active');
            touchStartPos = null;
            isSwiping = false;
        });

        summary.addEventListener('click', (e) => {
            if (e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                const path = folder.path;
                if (this.selectedItems.has(path)) {
                    this.selectedItems.delete(path);
                    summary.removeClass('is-selected');
                } else {
                    this.selectedItems.add(path);
                    summary.addClass('is-selected');
                }
                this.updateMultiSelectToolbar();
                return;
            }
            if (e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                void this.handleContextNoteCreation(folder);
                return;
            }
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault()
                e.stopPropagation()

                const contextNote = this.getContextNote(folder);
                if (contextNote) {
                    void this.app.workspace.getLeaf('tab').openFile(contextNote);
                } else {
                    new Notice('No context note exists for this folder', 2000);
                }
            }
        });


        summary.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showFolderContextMenu(e, folder, summary);
        });
                
        const childrenContainer = details.createDiv({ cls: 'folder-children' });

        const customColor = this.plugin.settings.customColors[folder.path];
        const style = this.plugin.settings.treeStyle;
        const shouldApplyColor = customColor &&
            style !== 'shades' && 
            style !== 'hues' &&
            !(style === 'portals' && this.plugin.settings.tabColorEnabled);

        if (shouldApplyColor) {
            summary.classList.add('has-folder-color');
            details.classList.add('has-folder-color')
            childrenContainer.classList.add('has-folder-color');
            details.style.setProperty('--folder-color', customColor);
            summary.style.setProperty('--folder-color', customColor);
        } else {
            summary.classList.remove('has-folder-color');
            summary.style.removeProperty('--folder-color');
            details.classList.remove('has-folder-color');
            details.style.removeProperty('--folder-color')
            childrenContainer.classList.remove('has-folder-color');
        }
        

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
                if (this.plugin.settings.hiddenItems[child.path]) continue;
                if (child instanceof TFolder) {
                    this.buildFolderTree(child, childrenContainer, openFiles, 'folder', depth +1, childIndex, totalFirstLevelFolders);
                    childIndex++;
                } else if (child instanceof TFile) {
                    const isContextNoteFile = this.isContextNote(child, folder);
                    if (isContextNoteFile && this.plugin.settings.enableContextNotes) {
                        if (!this.plugin.settings.showContextNotesInTree) continue;
                    }
                    this.createFileItem(child, childrenContainer,openFiles);
                }
            };
        }

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