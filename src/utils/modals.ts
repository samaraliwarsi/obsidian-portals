import { App, Modal, TFolder, Notice, Setting, TFile, Menu } from 'obsidian';
import PortalsPlugin from '../main';
import { SpaceConfig } from '../types';
import Sortable from 'sortablejs';
import { PortalsView } from '../view';
import { SearchPopover } from './searchPopover';

//================================= RENAME PORTAL MODAL=======================================

export class RenamePortalModal extends Modal {
    constructor(
        app: App,
        private currentName: string,
        private onSave: (newName: string) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        this.containerEl.addClass('portals-modal');
        this.contentEl.addClass('portals-rename-modal');
        contentEl.createEl('h3', { text: 'Rename portal' });

        const renameInput = contentEl.createDiv({ cls: 'portals-rename-container' });
        const input = renameInput.createEl('input', {
            type: 'text',
            value: this.currentName,
            cls: 'portals-rename-input',
            placeholder: 'Leave empty to use default name'
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.onSave(input.value);
                this.close();
            }
        });
        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = () => {
            this.onSave(input.value);
            this.close();
        };
        input.focus();
        input.select();
    }

    onClose() {
        this.contentEl.empty();
    }
}

//================================= SELECT FOLDER MODAL=======================================
export class SelectFolderModal extends Modal {
    private folders: TFolder[];
    private onSelect: (folder: TFolder) => void;  // ← must be TFolder

    constructor(app: App, onSelect: (folder: TFolder) => void) {
        super(app);
        this.onSelect = onSelect;
        this.folders = app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
        this.folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    onOpen() {
        const { contentEl } = this;
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('portals-folder-pick-modal');
        contentEl.createEl('h3', { text: 'Select folder' });
        const input = contentEl.createEl('input', { type: 'text', placeholder: 'Search...', cls: 'portals-search-input' });
        const results = contentEl.createDiv({ cls: 'portals-results-container' });
        const render = (search: string) => {
            results.empty();
            const filtered = this.folders.filter(f => f.path.toLowerCase().includes(search.toLowerCase()));
            for (const folder of filtered) {
                const item = results.createDiv({ cls: 'add-portal-item', text: folder.path });
                item.addEventListener('click', () => {
                    this.onSelect(folder);  // folder is TFolder
                    this.close();
                });
            }
        };
        input.addEventListener('input', () => render(input.value));
        render('');
    }

    onClose() { this.contentEl.empty(); }
}

//================================= COLOR PICKER MODAL=======================================

export class ColorPickerModal extends Modal {
    private color: string;
    private opacity: number;
    private onSave: (color: string) => void;
    private targetElement: HTMLElement;
    private summaryElement: HTMLElement | null;
    private childrenContainer: HTMLElement | null;
    private originalDetailsClass: boolean;
    private originalChildrenClass: boolean;
    private originalSummaryClass: boolean;
    private originalColor: string;
    private originalFileTextColor: string = '';
    private originalFileIconColor: string = '';
    

    constructor(app: App, onSave: (color: string) => void, targetElement: HTMLElement, currentColor?: string) {
        super(app);
        this.onSave = onSave;
        this.targetElement = targetElement;
        if (targetElement.classList.contains('file-item')) {
            const icon = targetElement.querySelector('.file-icon i') as HTMLElement | null;
            this.originalFileTextColor = targetElement.style.color;
            this.originalFileIconColor = icon ? icon.style.color : '';
            
        }
        this.summaryElement = targetElement.querySelector('.folder-summary');
        this.childrenContainer = targetElement.querySelector('.folder-children');
        this.originalDetailsClass = targetElement.classList.contains('has-folder-color');
        this.originalSummaryClass = this.summaryElement ? this.summaryElement.classList.contains('has-folder-color') : false;
        this.originalChildrenClass = this.childrenContainer ? this.childrenContainer.classList.contains('has-folder-color') : false;
        this.originalColor = targetElement.style.getPropertyValue('--folder-color') || '';

        if (currentColor) {
            const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match && match[1] && match[2] && match[3]) {
                const r = parseInt(match[1], 10);
                const g = parseInt(match[2], 10);
                const b = parseInt(match[3], 10);
                this.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                this.opacity = match[4] ? parseFloat(match[4]) : 1;
            } else {
                this.color = '#328cec';
                this.opacity = 1;
            }
        } else {
            this.color = '#328cec';
            this.opacity = 1;
        }
    }

    onOpen() {
        const { contentEl } = this;
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('portals-color-modal');
        contentEl.createEl('h3', { text: 'Pick folder color' });

        const inputContainer = contentEl.createDiv({ cls: 'portals-input-container' });
        const colorInput = inputContainer.createEl('input', { type: 'color', value: this.color });
        
        const opacityInput = inputContainer.createEl('input', {
            type: 'range',
            attr: { min: '0', max: '1', step: '0.05', value: String(this.opacity) }
        });
        opacityInput.style.width = '100%';

        const previewContainer = contentEl.createDiv({ cls: 'portals-preview-container' });
        const preview = previewContainer.createDiv();
        preview.style.height = '30px';
        preview.style.marginTop = '10px';
        preview.style.backgroundColor = `rgba(255, 0, 0, ${this.opacity})`;

        const updatePreview = () => {
            const rgb = this.hexToRgb(colorInput.value);
            const newOpacity = parseFloat(opacityInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${newOpacity})`;
            preview.style.backgroundColor = newColor;
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = newColor
                const icon = this.targetElement.querySelector('.file-icon i') as HTMLElement | null;
                if (icon) icon.style.color = newColor;
            } else {
                // Add class to all elements that need it
                this.targetElement.classList.add('has-folder-color');
                this.targetElement.style.setProperty('--folder-color', newColor);
                if (this.summaryElement) {
                    this.summaryElement.classList.add('has-folder-color');
                    this.summaryElement.style.setProperty('--folder-color', newColor);
                    void this.summaryElement.offsetHeight;
                }
                if (this.childrenContainer) {
                    this.childrenContainer.classList.add('has-folder-color');
                    
                    void this.childrenContainer.offsetHeight;
                }
                // Force reflow
                void this.targetElement.offsetHeight;
            };
        }

        colorInput.addEventListener('input', updatePreview);
        opacityInput.addEventListener('input', updatePreview);

        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => {
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = this.originalFileTextColor;
                const icon = this.targetElement.querySelector('.file-icon i') as HTMLElement | null;
                if (icon) icon.style.color = this.originalFileIconColor;
            } else {
                // Restore original class states
                if (!this.originalDetailsClass) this.targetElement.classList.remove('has-folder-color');
                else this.targetElement.classList.add('has-folder-color');
                if (this.summaryElement) {
                    if (!this.originalSummaryClass) this.summaryElement.classList.remove('has-folder-color');
                    else this.summaryElement.classList.add('has-folder-color');
                    // Remove any inline variable set during preview
                    this.summaryElement.style.removeProperty('--folder-color');
                }
                if (this.childrenContainer) {
                    if (!this.originalChildrenClass) this.childrenContainer.classList.remove('has-folder-color');
                    else this.childrenContainer.classList.add('has-folder-color');
                    this.childrenContainer.style.removeProperty('--folder-color');
                }
                // Restore the original variable on the details
                this.targetElement.style.setProperty('--folder-color', this.originalColor);
            }
            this.close();
        };
        const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
        saveBtn.onclick = () => {
            const rgb = this.hexToRgb(colorInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityInput.value})`;
            this.onSave(newColor);
            this.close();
        };
        updatePreview();
    }

    private hexToRgb(hex: string): [number, number, number] {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
    }

    onClose() { 
        if (this.targetElement.classList.contains('file-item')) {
            this.targetElement.style.color = this.originalFileTextColor;
            const icon = this.targetElement.querySelector('.file-icon i') as HTMLElement | null;
            if (icon) icon.style.color = this.originalFileIconColor;
        } else {
            if (!this.originalDetailsClass) this.targetElement.classList.remove('has-folder-color');
            else this.targetElement.classList.add('has-folder-color');
            if (this.summaryElement) {
                if (!this.originalSummaryClass) this.summaryElement.classList.remove('has-folder-color');
                else this.summaryElement.classList.add('has-folder-color');
                this.summaryElement.style.removeProperty('--folder-color');
                }
            if (this.childrenContainer) {
                if (!this.originalChildrenClass) this.childrenContainer.classList.remove('has-folder-color');
                else this.childrenContainer.classList.add('has-folder-color');
                this.childrenContainer.style.removeProperty('--folder-color');
            }
            this.targetElement.style.setProperty('--folder-color', this.originalColor);
        }
        this.contentEl.empty();
    }
}

// -----------------------------REMOVE PORTAL MODAL -----------------------------------
export class RemovePortalModal extends Modal {
    private plugin: PortalsPlugin;
    private onRemove: (space: SpaceConfig) => void;

    constructor(app: App, plugin: PortalsPlugin, onRemove: (space: SpaceConfig) => void) {
        super(app);
        this.plugin = plugin;
        this.onRemove = onRemove;
    }

    onOpen() {
        this.renderRemovalList();
    }

    private renderRemovalList() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('remove-portal-modal');
        contentEl.createEl('h3', { text: 'Remove portal tab' });
        const spaces = this.plugin.settings.spaces;
        if (spaces.length === 0) {
            contentEl.createEl('p', { text: 'No portals to remove.' });
            return;
        }
        for (const space of spaces) {
            let displayName: string;
            if (space.type === 'folder') {
                if (space.path === '/') displayName = this.app.vault.getName();
                else displayName = space.path;
            } else {
                displayName = '#' + space.path;
            }
            const row = contentEl.createDiv({ cls: 'remove-portal-row' });
            row.createSpan({ text: displayName, cls: 'remove-portal-name' });
            const removeBtn = row.createEl('button', { text: 'Remove', cls: 'mod-warning' });
            removeBtn.addEventListener('click', () => {
                this.onRemove(space);
                this.renderRemovalList();
            });
        }
    }
    onClose() {
        this.contentEl.empty();
    }
}

// ==================== CHOOSE SIDE TABS MODAL ====================
    export class ChooseTabsModal extends Modal {
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
            this.containerEl.addClass('portals-modal');
            this.contentEl.addClass('side-portal-modal');
            new Setting(contentEl).setName('Choose side portals').setHeading();

            contentEl.createEl('p', {
                text: 'At least one must be selected to enable side portal.',
                cls: 'portals-modal-description'
            });

            // Available tabs with display names and icons
            const availableTabs = [
                { id: 'recent', name: 'Recent Files', icon: 'clock-counter-clockwise' },
                { id: 'context-notes', name: 'Context Notes', icon: 'note' },
                { id: 'bookmarks', name: 'Bookmarks', icon: 'bookmark' },
                { id: 'journal', name: 'Journal', icon: 'calendar-heart'},
                { id: 'hidden', name: 'Hidden', icon: 'eye-slash'},
                { id: 'properties', name: 'Properties', icon: 'list-checks'},
                { id: 'trash', name: 'Trash', icon: 'trash'}
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
export class AddPortalModal extends Modal {
    private selectedPaths: Set<string> = new Set;
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
        contentEl.addClass('portals-modal');
        contentEl.addClass('portals-add-portal-modal');
        new Setting(contentEl).setName('Add a new portal').setHeading();

        const tabBar = contentEl.createDiv({ cls: 'add-portal-tab-bar' });

        const createTab = (id: 'root' | 'sub' | 'tag', label: string) => {
            const tab = tabBar.createEl('div', { cls: 'add-portal-tab', text: label });
            if (this.currentTab === id) {
                tab.addClass('is-active');
            }
            tab.addEventListener('click', () => {
                this.currentTab = id;
                this.selectedPaths.clear();
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

        contentEl.createSpan({ text: 'Alt-click to select multiple', cls: 'portals-modal-subtext' });

        const buttonDiv = contentEl.createDiv({ cls: 'portals-modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        const addBtn = buttonDiv.createEl('button', { text: 'Add', cls: 'mod-cta' });
        addBtn.addEventListener('click', () => {
            if (this.selectedPaths.size === 0) {
                new Notice('Please select atleast one folder or tag.');
                return;
            }
            const type = this.currentTab === 'tag' ? 'tag' : 'folder';
            for (const path of this.selectedPaths) {
                this.onChoose(path, type);
            }
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
                if (this.selectedPaths.has(tag)) item.addClass('is-selected');
                if (isUsed) {
                    item.addClass('portals-already-used');
                    // Add checkmark icon
                    const checkSpan = item.createSpan({ cls: 'portals-check-icon' });
                    checkSpan.createEl('i', { cls: 'ph ph-check' });
                }
                item.addEventListener('click', (e: MouseEvent) => {
                    if (isUsed) {
                        new Notice('This tag is already a portal.');
                        return;
                    }
                    if (e.altKey) {
                        if (this.selectedPaths.has(tag)) {
                            this.selectedPaths.delete(tag);
                        } else {
                            this.selectedPaths.add(tag);
                        }
                    } else {
                        this.selectedPaths.clear();
                        this.selectedPaths.add(tag);
                    }
                    this.filterResults();
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
                if (this.selectedPaths.has(folder.path)) item.addClass('is-selected');
                if (isUsed) {
                    item.addClass('portals-already-used');
                    // Add checkmark icon
                    const checkSpan = item.createSpan({ cls: 'portals-check-icon' });
                    checkSpan.createEl('i', { cls: 'ph ph-check' });
                }
                item.addEventListener('click', (e: MouseEvent) => {
                    if (isUsed) {
                        new Notice('This folder is already a portal.');
                        return;
                    }
                    if (e.altKey) {
                        if (this.selectedPaths.has(folder.path)) {
                            this.selectedPaths.delete(folder.path);
                        } else {
                            this.selectedPaths.add(folder.path);
                        }
                    } else {
                        this.selectedPaths.clear();
                        this.selectedPaths.add(folder.path);
                    }
                    this.filterResults();
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
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('portals-group-tags-modal');
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

// ==================== REORDER MODAL ====================
export class ReorderItemsModal extends Modal {
    private sourceEl: HTMLElement | null;
    private detailsEl: HTMLElement |null;
    private detailsHighlightClass: string = '';
    constructor(
        app: App,
        private plugin: PortalsPlugin,
        private view: PortalsView,
        private items: { path: string; displayName: string }[],
        sourceEl?: HTMLElement,
    ) {
        super(app);
        this.sourceEl = sourceEl ?? null;
        this.detailsEl = sourceEl?.closest('.folder-details') as HTMLElement ?? null;
        if (this.detailsEl instanceof HTMLDetailsElement) {
            this.detailsHighlightClass = this.detailsEl.open
                ? 'portals-reordering-details-open-active'
                : 'portals-reordering-details-closed-active';
        } else {
            this.detailsHighlightClass = 'portals-reordering-details-active';
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.containerEl.addClass('portals-reorder-modal-container');
        contentEl.addClass('portals-modal');
        contentEl.addClass('portals-reorder-modal');
        contentEl.createEl('h3', { text: 'Reorder items' });

        const list = contentEl.createEl('div', { cls: 'portals-sortable-list' });

        for (const item of this.items) {
            const row = list.createEl('div', { cls: 'portals-sortable-item' });
            row.createSpan({ text: item.displayName });
            row.dataset.path = item.path;
            row.createSpan({ cls: 'portals-reorder-handle'})
                .createEl('i', { cls: 'ph ph-dots-six-vertical' });
        }
        if (this.sourceEl) {
            this.sourceEl.addClass('portals-reordering-source-active');
        }
        if (this.detailsEl) {
            this.detailsEl.addClass(this.detailsHighlightClass);
        }

        new Sortable(list, {
            animation: 150,
            delay: 200,
            delayOnTouchOnly: true,
            draggable: '.portals-sortable-item',
            onEnd: () => {
                const newOrder = Array.from(list.querySelectorAll('.portals-sortable-item'))
                    .map(el => (el as HTMLElement).dataset.path!);
                // Save positions
                const custom = this.plugin.settings.customTreeOrder;
                for (const item of this.items) {
                    delete custom[item.path];
                }
                newOrder.forEach((key, index) => {
                    custom[key] = index;
                });
                this.plugin.saveData(this.plugin.settings).then(() => {
                    this.view.renderContent();
                });
            },
        });
        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Done', cls: 'mod-cta' })
            .addEventListener('click', () => this.close());
        }
        onClose() {
            if (this.sourceEl) {
                this.sourceEl.removeClass('portals-reordering-source-active');
            }
            if (this.detailsEl) {
                this.detailsEl.removeClass(this.detailsHighlightClass);
            }
            this.contentEl.empty();
        }
    }

// ==================BULK FRONTMATTER MODAL=============================================

declare module 'obsidian' {
    interface Menu {
        dom?: HTMLElement;
    }
}

type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'list';

export class BulkFrontmatterPopup {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;
    private files: TFile[];
    private container!: HTMLElement;
    private backdrop!: HTMLElement;
    private propBtn!: HTMLButtonElement;
    private propertyInput!: HTMLInputElement;
    private propertyIsExisting = false;
    private valBtn!: HTMLButtonElement;
    private valueInput!: HTMLInputElement;
    private valueIsExisting = false;
    private valueGroup!: HTMLElement;
    propertyTypeSelect!: HTMLSelectElement;
    private propertySearchPopover: SearchPopover | null = null;
    private valueSearchPopover: SearchPopover | null = null;
    private allProperties: string[] = [];
    private propertyValues: string[] = [];
    private propertyType: PropertyType = 'string';
    private propertyName = '';
    private value = '';
    private keyHandler: (e: KeyboardEvent) => void;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView, files: TFile[]) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
        this.files = files;

        // Key handler for Escape
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        };
    }

    open(): void {
        // Backdrop
        this.backdrop = document.body.createDiv('portals-bulk-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        // Container
        this.container = document.body.createDiv('portals-bulk-modal');
        this.container.addClass('bulk-fm-modal');
        // Stop clicks inside from closing
        this.container.addEventListener('click', (e) => e.stopPropagation());

        this.buildUI();
        document.addEventListener('keydown', this.keyHandler);
    }

    close(): void {
        this.propertySearchPopover?.destroy();
        this.valueSearchPopover?.destroy();
        this.backdrop?.remove();
        this.container?.remove();
        document.removeEventListener('keydown', this.keyHandler);
    }

    private buildUI(): void {
        const { container, files } = this;

        // Title
        container.createEl('h3', { text: 'Bulk frontmatter editing' });
        container.createEl('p', { text: `${files.length} markdown file(s)` });

        // Gather all known properties
        const propSet = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (fm) Object.keys(fm).forEach(k => propSet.add(k));
        }
        this.allProperties = Array.from(propSet).sort();

       // ── Property picker ──
        const propRow = container.createDiv({ cls: 'bulk-fm-row' });
        propRow.createSpan({ text: 'Property' });
        const propGroup = propRow.createDiv({ cls: 'bulk-fm-input-group' });
        this.propBtn = propGroup.createEl('button', {
            text: this.propertyName || '-- choose --',
            cls: 'clickable-icon',
            attr: { 'aria-label': 'Choose existing property' },
        });
        // Left‑click → show menu of all properties
        this.propBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = new Menu();
            menu.dom?.addClass?.('bulk-fm-menu');
            this.allProperties.forEach(p => {
                menu.addItem(item => item
                    .setTitle(p)
                    .onClick(() => {
                        this.propertyName = p;
                        this.propBtn.setText(p);
                        this.propertyInput.value = p;
                        this.propertyIsExisting = true;
                        this.derivePropertyType();
                        this.updateValueOptions();
                        this.updateValueInput();
                    }));
            });
            menu.showAtMouseEvent(e);
        });
        this.propBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showPropertySearch(this.propBtn);
        });

        this.propertyInput = propGroup.createEl('input', {
            type: 'text',
            placeholder: 'Custom property name',
            value: this.propertyName,
            cls: 'portals-search-input',
        });
        this.propertyInput.addEventListener('input', () => {
            this.propertyName = this.propertyInput.value;
            this.propBtn.setText(this.propertyName || 'Existing');
            this.propertyIsExisting = false;
            this.derivePropertyType();
            this.updateValueOptions();
            this.updateValueInput();
        });

        // ── Type selector ──
        const typeRow = container.createDiv({ cls: 'bulk-fm-row' });
        typeRow.createSpan({ text: 'Type' });
        this.propertyTypeSelect = typeRow.createEl('select', { cls: 'dropdown' });
        ['string', 'number', 'boolean', 'date', 'datetime', 'list'].forEach(t => {
            const opt = this.propertyTypeSelect.createEl('option', { text: t, value: t });
            if (t === this.propertyType) opt.selected = true;
        });
        this.propertyTypeSelect.addEventListener('change', () => {
            this.propertyType = this.propertyTypeSelect.value as PropertyType;
            this.updateValueInput();
            this.value = '';
            this.valBtn.setText('Existing');
        }); 

        // ── Value picker ──
        const valRow = container.createDiv({ cls: 'bulk-fm-row' });
        valRow.createSpan({ text: 'Value' });
        const valGroup = valRow.createDiv({ cls: 'bulk-fm-input-group' });
        this.valueGroup = valGroup;
        this.valBtn = valGroup.createEl('button', {
            text: this.value || 'Existing',
            cls: 'clickable-icon',
            attr: { 'aria-label': 'Choose existing value' },
        });
        this.valBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = new Menu();
            menu.dom?.addClass?.('bulk-fm-menu');
            this.propertyValues.forEach(v => {
                menu.addItem(item => item
                    .setTitle(v)
                    .onClick(() => {
                        this.value = v;
                        this.valBtn.setText(v);
                        this.valueInput.value = v;
                        this.valueIsExisting = true;                     
                    }));
            });
            menu.showAtMouseEvent(e);
        });
        this.valBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showValueSearch(this.valBtn);
        });
        
        this.updateValueInput();

        // ── Buttons ──
        const btnDiv = container.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Save', cls: 'mod-cta' })
            .addEventListener('click', () => this.apply('add'));
        btnDiv.createEl('button', { text: 'Remove', cls: 'mod-warning' })
            .addEventListener('click', () => this.apply('remove'));
        btnDiv.createEl('button', { text: 'Close' })
            .addEventListener('click', () => this.close());
    }

    private updateValueInput(): void {
        if (this.valueInput) this.valueInput.remove();
        
        const oldBtn = this.valueGroup.querySelector('.portals-today-btn');
        if (oldBtn) oldBtn.remove();

        if (this.propertyType === 'date') {
            this.valueInput = this.valueGroup.createEl('input', {
                type: 'date',
                value: this.value,
                cls: 'portals-search-input',
            });
        } else if (this.propertyType === 'datetime') {
            this.valueInput = this.valueGroup.createEl('input', {
                type: 'datetime-local',
                value: this.value,
                cls: 'portals-search-input',
            });
        } else {
            this.valueInput = this.valueGroup.createEl('input', {
                type: 'text',
                placeholder: 'Custom value',
                value: this.value,
                cls: 'portals-search-input',
            });
        }

        this.valueInput.addEventListener('input', () => {
            this.value = this.valueInput.value;
            this.valBtn.setText(this.value || 'Existing');
            this.valueIsExisting = false;
        });
        this.valueInput.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showValueSearch(this.valueInput);
        });
        
        // If date/datetime, add a "Today" button
        if (this.propertyType === 'date' || this.propertyType === 'datetime') {
            const todayBtn = this.valueGroup.createEl('button', {
                text: 'Today',
                cls: 'clickable-icon portals-today-btn',
                attr: { 'aria-label': 'Set to today' },
            });
            todayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const now = new Date();
                if (this.propertyType === 'date') {
                    const yyyy = now.getFullYear();
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const dd = String(now.getDate()).padStart(2, '0');
                    const dateStr = `${yyyy}-${mm}-${dd}`;
                    this.value = dateStr;
                    this.valueInput.value = dateStr;
                } else {
                    // datetime-local expects YYYY-MM-DDTHH:MM
                    const yyyy = now.getFullYear();
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const dd = String(now.getDate()).padStart(2, '0');
                    const hh = String(now.getHours()).padStart(2, '0');
                    const min = String(now.getMinutes()).padStart(2, '0');
                    const datetimeStr = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
                    this.value = datetimeStr;
                    this.valueInput.value = datetimeStr;
                }
                this.valBtn.setText(this.value || 'Existing');
                this.valueIsExisting = false;
            });
        }
    }

    private derivePropertyType(): void {
        if (!this.propertyName) {
            this.propertyType = 'string';
            this.propertyTypeSelect.value = 'string';
            return;
        }

        let type: PropertyType | null = null;
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const v = fm?.[this.propertyName];
            if (v === undefined) continue;

            // Determine the type of this value
            let currentType: PropertyType;
            if (Array.isArray(v)) {
                currentType = 'list';
            } else if (typeof v === 'number') {
                currentType = 'number';
            } else if (typeof v === 'boolean') {
                currentType = 'boolean';
            } else {
                // string, also could be date/datetime – but we can't auto‑detect,
                // so keep as string unless the user changes manually
                currentType = 'string';
            }

            // If we already have a type and it differs, fall back to string (mixed)
            if (type !== null && type !== currentType) {
                type = 'string';
                break;          // can't be more specific, stop scanning
            }
            type = currentType;
        }

        // Fallback to string if somehow the value doesn't stick
        if (!this.propertyTypeSelect.value) {
            this.propertyTypeSelect.value = 'string';
        }

        // If no existing property, default to string
        if (type === null) type = 'string';

        this.propertyType = type;
        this.propertyTypeSelect.value = type;
    }

    private updateValueOptions(): void {
        const valSet = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const v = fm?.[this.propertyName];
            if (v !== undefined) {
                const vals = Array.isArray(v) ? v : [v];
                vals.forEach(x => valSet.add(String(x)));
            }
        }
        this.propertyValues = Array.from(valSet).sort();
    }

    private showPropertySearch(anchor: HTMLElement): void {
        this.propertySearchPopover?.destroy();
        const popover = new SearchPopover(anchor, {
            items: this.allProperties,
            currentSelected: this.propertyName,
            onSelect: (item) => {
                this.propertyName = item;
                this.propBtn.setText(item);
                this.propertyInput.value = item;
                this.propertyIsExisting = true;
                this.value = '';
                this.valBtn.setText('--choose--');
                this.updateValueOptions();
                this.updateValueInput();
            },
        });
        this.propertySearchPopover = popover;
    }

    private showValueSearch(anchor: HTMLElement): void {
        this.valueSearchPopover?.destroy();
        const popover = new SearchPopover(anchor, {
            items: this.propertyValues,
            currentSelected: this.value,
            onSelect: (item) => {
                this.value = item;
                this.valBtn.setText(item);
                this.valueInput.value = item;
                this.valueIsExisting = true;
            },
        });
        this.valueSearchPopover = popover;
    }

    private parseValue(input: string): string | number | boolean | string[] {
        switch (this.propertyType) {
            case 'number': {
                const n = parseFloat(input);
                return isNaN(n) ? 0 : n;
            }
            case 'boolean':
                return input.toLowerCase() === 'true';
            case 'list':
                return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
            case 'date':
            case 'datetime':
                return input; // ISO string
            default:
                return input;
        }
    }

    private getOriginalTypedValue(): unknown {
        if (!this.propertyName || !this.value) return undefined;
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!fm) continue;
            const raw = fm[this.propertyName];
            if (raw === undefined) continue;
            const vals = Array.isArray(raw) ? raw : [raw];
            if (vals.some(v => String(v) === this.value)) {
                // Found the original value. Return the raw value as-is.
                return Array.isArray(raw) ? raw : raw;
            }
        }
        return undefined;
    }

    private async apply(op: 'add' | 'remove'): Promise<void> {
        if (!this.propertyName) {
            new Notice('Please select or type a property name.');
            return;
        }
        let changed = 0;
        for (const file of this.files) {
            if (file.extension !== 'md') continue;
            try {
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                    if (op === 'add') {
                        if (this.propertyIsExisting && this.valueIsExisting) {
                            const originalVal = this.getOriginalTypedValue();
                            if (originalVal !== undefined) {
                                fm[this.propertyName] = originalVal;
                                changed++;
                                return;
                            }
                        }
                        fm[this.propertyName] = this.parseValue(this.value);
                        changed++;
                    } else {
                        if (fm[this.propertyName] !== undefined) {
                            delete fm[this.propertyName];
                            changed++;
                        }
                    }
                });
            } catch (e) {
                console.error(`Failed to process frontmatter for ${file.path}`, e);
            }
        }
        if (changed) {
            const savedSelection = new Set(this.view.selectedItems);
            await this.plugin.saveSettings();
            this.view.renderContent();
            this.view.selectedItems = savedSelection;
            setTimeout(() => this.view.reapplySelectionHighlights(), 50);
        }
        new Notice(`Updated ${changed} file(s).`);
        this.value = '';
        this.valBtn.setText('-- choose --');
    }
}