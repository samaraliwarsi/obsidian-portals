import { App, Modal, TFolder, Notice, Setting} from 'obsidian';
import PortalsPlugin from '../main';
import { SpaceConfig } from '../types';
import Sortable from 'sortablejs';
import { PortalsView } from '../view';

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
