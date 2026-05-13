import { App, Modal, TFolder, Notice, Setting } from 'obsidian';
import PortalsPlugin from '../main';
import { SpaceConfig } from '../types';
import Sortable from 'sortablejs';
import { PortalsView } from '../view';

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
            const icon = targetElement.querySelector('.file-icon i');
            this.originalFileTextColor = targetElement.style.color;
            this.originalFileIconColor = (icon instanceof HTMLElement) ? icon.style.color : '';
            
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
        opacityInput.classList.add('portals-opacity-input-full');

        const previewContainer = contentEl.createDiv({ cls: 'portals-preview-container' });
        const preview = previewContainer.createDiv();
        preview.style.backgroundColor = `rgba(255, 0, 0, ${this.opacity})`;

        const updatePreview = () => {
            const rgb = this.hexToRgb(colorInput.value);
            const newOpacity = parseFloat(opacityInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${newOpacity})`;
            preview.style.backgroundColor = newColor;
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = newColor
                const icon = this.targetElement.querySelector('.file-icon i');
                if (icon instanceof HTMLElement) {
                    icon.style.color = newColor;
                }
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
                const icon = this.targetElement.querySelector('.file-icon i');
                if (icon instanceof HTMLElement) {
                    icon.style.color = this.originalFileIconColor;
                }
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
            const icon = this.targetElement.querySelector('.file-icon i');
            if (icon instanceof HTMLElement) {
                icon.style.color = this.originalFileIconColor;
            }
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
            const tab = tabBar.createDiv({ cls: 'add-portal-tab', text: label });
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
            div.createSpan({ text: tag });
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
        if (this.detailsEl?.instanceOf(HTMLDetailsElement)) {
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
        contentEl.addClass('portals-modal');
        contentEl.addClass('portals-reorder-modal');
        contentEl.createEl('h3', { text: 'Reorder items' });

        const list = contentEl.createDiv({ cls: 'portals-sortable-list' });

        for (const item of this.items) {
            const row = list.createDiv({ cls: 'portals-sortable-item' });
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
                void this.plugin.saveData(this.plugin.settings).then(() => {
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

//======== CONFIRM MODAL =======================

export class ConfirmModal extends Modal {
    private resolve!: (value: boolean) => void;
    promise: Promise<boolean>;
    private message: string;

    constructor(app: App, message: string) {
        super(app);
        this.message = message;
        this.promise = new Promise<boolean>((res) => { this.resolve = res; });
    }

    onOpen() {
        this.contentEl.addClass('portals-modal');
        this.contentEl.createEl('p', { text: this.message, cls: 'portals-confirm-message' });
        const btnDiv = this.contentEl.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Cancel' }).onclick = () => { this.resolve(false); this.close(); };
        btnDiv.createEl('button', { text: 'OK', cls: 'mod-warning' }).onclick = () => { this.resolve(true); this.close(); };
    }

    onClose() {
        this.contentEl.empty();
    }

    static async confirm(app: App, message: string): Promise<boolean> {
        const modal = new ConfirmModal(app, message);
        modal.open();
        return modal.promise;
    }
}