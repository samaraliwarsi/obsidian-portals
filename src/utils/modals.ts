import { App, Modal, TFolder, Notice, Setting, DropdownComponent } from 'obsidian';
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
        this.contentEl.addClass('remove-portal-modal');
        this.contentEl.addClass('portals-modal');
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

// ==================== CHOOSE SIDE PORTAL MODAL ====================
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
            this.contentEl.addClass('portals-side-portal-modal');
            this.containerEl.addClass('portals-modal');
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

            const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });

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
        contentEl.addClass('portals-add-portal-modal');
        contentEl.addClass('portals-modal');
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

        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
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
        contentEl.addClass('portals-reorder-modal');
        contentEl.addClass('portals-modal');
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

//======================Quick Tab Number Modal=============================================

export class SetQuickTabNumberModal {
    private app: App;
    private plugin: PortalsPlugin;
    private space: SpaceConfig;
    private keyHandler: (e: KeyboardEvent) => void;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    
    constructor(app: App, plugin: PortalsPlugin, space: SpaceConfig, private onSave: () => void, private onClose?: () => void) {
        this.app = app;
        this.plugin = plugin;
        this.space = space;
        this.onSave = onSave;
        this.onClose = onClose;
        
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        }
    }

    open(): void {
        if (this.container) {
            this.close();
        }

        this.backdrop = activeDocument.body.createDiv('portals-qtn-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        this.container = activeDocument.body.createDiv('portals-qtn-modal');
        this.container.addEventListener('click', (e) => e.stopPropagation());
        this.container.addClass('portals-modal');

        try {
            this.buildUI();
            activeDocument.addEventListener('keydown', this.keyHandler)
        } catch (e) {
            console.error('Error building color picker UI', e);
            this.close();
        }
    }

    buildUI(): void {
        const { container } = this; 
        
        container.createDiv({ text: 'Set tab number for quick switching', cls: 'qtn-popup-title' });

        const dropdown = new DropdownComponent(container);
        dropdown.addOption('none', 'None');
        for (let i = 1; i <= 10; i++) {
            dropdown.addOption(`${i}`, `${i}`);
        }
        dropdown.setValue(this.space.quickTabNumber?.toString() || 'none');

        const buttonDiv = container.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = () => {
            const val = dropdown.getValue();
            const newNumber = val === 'none' ? undefined : parseInt(val, 10);

            // Clear the number from any other portal that might have it
            if (newNumber !== undefined) {
                for (const s of this.plugin.settings.spaces) {
                    if (s !== this.space && s.quickTabNumber === newNumber) {
                        s.quickTabNumber = undefined;
                    }
                }
            }

            this.space.quickTabNumber = newNumber;
            this.plugin.saveSettings().then(() => this.onSave());
            this.close();
        };
    }

    close(): void {
        this.container.remove();
        this.backdrop.remove();
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.onClose?.();
    }
}