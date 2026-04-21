import { App, TFile, Notice, Modal, Menu } from 'obsidian';
import PortalsPlugin from './main';

export class FrontmatterClinicRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private container: HTMLElement;
    private selectedProperty: string = '';
    private selectedValue: string = '';
    private properties: Map<string, Set<string>> = new Map();
    private filteredFiles: TFile[] = [];

    constructor(app: App, plugin: PortalsPlugin, container: HTMLElement) {
        this.app = app;
        this.plugin = plugin;
        this.container = container;
    }

    async render() {
        this.container.empty()
        this.container.addClass('portals-frontmatter-clinic');

        // Set accent color from active space
        const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
        const tabColorEnabled = this.plugin.settings.tabColorEnabled;
        if (tabColorEnabled && rootSpace?.color && rootSpace.color !== 'transparent') {
            this.container.style.setProperty('--fm-accent-color', rootSpace.color);
        } else {
            this.container.style.removeProperty('--fm-accent-color');
        }

        // Scan all markdown files for frontmatter properties
        await this.scanFrontmatter();

        // Header with two dropdowns
        const headerRow = this.container.createDiv({ cls: 'fm-clinic-header' });
        
        // Property button (funnel icon)
        const propBtn = headerRow.createEl('button', { cls: 'journal-btn fm-property-btn' });
        propBtn.createEl('i', { cls: 'ph ph-funnel' });
        propBtn.createEl('span', { 
            text: this.selectedProperty || 'Select property', 
            cls: 'journal-btn-text' 
        });

        propBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle('None')
                .onClick(() => {
                    this.selectedProperty = '';
                    this.selectedValue = '';
                    this.render();
                }));
            menu.addItem(item => item
            .setTitle('No frontmatter')
            .onClick(() => {
                this.selectedProperty = 'No frontmatter';
                this.selectedValue = '';
                this.render();
            }));
            menu.addSeparator();
            for (const prop of this.properties.keys()) {
                menu.addItem(item => item
                    .setTitle(prop)
                    .onClick(() => {
                        this.selectedProperty = prop;
                        this.selectedValue = '';
                        this.render();
                    }));
            }
            menu.showAtMouseEvent(e);
        });

        if (this.plugin.settings.showFilteredCount) {
            const countBadge = headerRow.createSpan({ cls: 'fm-file-count' });
            countBadge.setText(`${this.filteredFiles.length}`);
        }


        // Value button (funnel-simple icon)
        const valueBtn = headerRow.createEl('button', { cls: 'journal-btn fm-value-btn' });
        valueBtn.createEl('i', { cls: 'ph ph-funnel-simple' });
        valueBtn.createEl('span', { 
            text: this.selectedValue === '' ? 'All values' : 
                this.selectedValue === '__none__' ? 'None' : this.selectedValue,
            cls: 'journal-btn-text' 
        });

        if (this.selectedProperty === 'No frontmatter') {
            valueBtn.disabled = true;
            valueBtn.textContent = '-';
        } else {
            valueBtn.disabled = false
        }

        valueBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.selectedProperty) {
                new Notice('Select a property first');
                return;
            }
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle('All values')
                .onClick(() => {
                    this.selectedValue = '';
                    this.render();
                }));
            menu.addItem(item => item
                .setTitle('None')
                .onClick(() => {
                    this.selectedValue = '__none__';
                    this.render();
                }));
            menu.addSeparator();
            const values = this.properties.get(this.selectedProperty) || new Set();
            for (const val of values) {
                menu.addItem(item => item
                    .setTitle(val)
                    .onClick(() => {
                        this.selectedValue = val;
                        this.render();
                    }));
            }
            menu.showAtMouseEvent(e);
        });
        // Filter files based on selection
        this.filterFiles();

        // File list container
        const listContainer = this.container.createDiv({ cls: 'fm-clinic-file-list' });
        
        if (this.filteredFiles.length === 0) {
            listContainer.createEl('p', { cls: 'fm-noFound-txt', text: 'Select property from dropdown to view matching files.' });
            return;
        }

        for (const file of this.filteredFiles) {
            const fileRow = listContainer.createDiv({ cls: 'file-item fm-file-item' });
            //const fileRow = listContainer.createDiv({ cls: 'fm-clinic-file-row' });
            
            // File name (click to open)
            const nameSpan = fileRow.createSpan({ text: file.basename, cls: 'fm-file-name' });
            nameSpan.addEventListener('click', () => {
                this.app.workspace.getLeaf().openFile(file);
            });

            // Display current value(s) for selected property
            if (this.selectedProperty) {
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                let displayValue = '';
                if (frontmatter && frontmatter[this.selectedProperty] !== undefined) {
                    const val = frontmatter[this.selectedProperty];
                    displayValue = Array.isArray(val) ? val.join(', ') : String(val);
                } else {
                    displayValue = 'none';
                }
                if (this.plugin.settings.showCurrentPropertyValue) {
                    fileRow.createSpan({ text: displayValue, cls: 'fm-current-value' });
                }
            }

            // Edit button
            const editBtn = fileRow.createEl('button', { cls: 'clickable-icon fm-edit-btn' });
            editBtn.createEl('i', { cls: 'ph ph-pencil-simple' });
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditModal(file);
            });
        }
    }

    private async scanFrontmatter() {
        this.properties.clear();
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) continue;
            for (const [key, value] of Object.entries(frontmatter)) {
                if (!this.properties.has(key)) {
                    this.properties.set(key, new Set());
                }
                const values = this.properties.get(key)!;
                if (Array.isArray(value)) {
                    value.forEach(v => values.add(String(v)));
                } else if (value !== null && value !== undefined) {
                    values.add(String(value));
                }
            }
        }
    }

    private filterFiles() {
        const files = this.app.vault.getMarkdownFiles();
        // special case: no frontmatter 
        if (this.selectedProperty === 'No frontmatter') {
            this.filteredFiles = files.filter(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                return !frontmatter || Object.keys(frontmatter).length === 0;
            });
            this.filteredFiles.sort((a, b) => a.name.localeCompare(b.name));
            return;

        }
        if (!this.selectedProperty) {
            this.filteredFiles = [];
            return;
        }
        this.filteredFiles = files.filter(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            const propValue = frontmatter?.[this.selectedProperty];
            
            if (this.selectedValue === '') {
                // Show all files (including those without the property)
                return propValue !== undefined && propValue !== null && !(Array.isArray(propValue) && propValue.length === 0);
            } else if (this.selectedValue === '__none__') {
                // Show files missing the property or with empty value
                return propValue === undefined || propValue === null || 
                       (Array.isArray(propValue) && propValue.length === 0);
            } else {
                // Show files matching the specific value
                if (propValue === undefined) return false;
                if (Array.isArray(propValue)) {
                    return propValue.map(v => String(v)).includes(this.selectedValue);
                }
                return String(propValue) === this.selectedValue;
            }
        });
        // Sort by file name
        this.filteredFiles.sort((a, b) => a.name.localeCompare(b.name));
    }

    private openEditModal(file: TFile) {
        new FrontmatterEditModal(this.app, this.plugin, file, this.selectedProperty, () => {
            this.render();
        }).open();
    }

    public destroy() {
        this.container.empty();
    }
}

// Edit Modal with multiselect support
export class FrontmatterEditModal extends Modal {
    private file: TFile;
    private plugin: PortalsPlugin;
    private property: string;
    private onSave: () => void;
    private inputType: 'text' | 'multiselect' | 'date' | 'number' = 'text';
    private selectedValues: Set<string> = new Set();
    private allValues: Set<string> = new Set();

    constructor(app: App, plugin: PortalsPlugin, file: TFile, property: string, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        this.property = property;
        this.onSave = onSave;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: `Edit ${this.property} for ${this.file.basename}` });

        const cache = this.app.metadataCache.getFileCache(this.file);
        const frontmatter = cache?.frontmatter || {};
        const currentValue = frontmatter[this.property];

        if (this.property === 'tags' || this.property.endsWith('tags')) {
            this.inputType = 'multiselect';
            await this.collectAllValues();
            // Initialize selected values from current frontmatter
            if (Array.isArray(currentValue)) {
                currentValue.forEach(v => this.selectedValues.add(String(v)));
            } else if (currentValue !== undefined && currentValue !== null) {
                this.selectedValues.add(String(currentValue));
            }
        } else if (typeof currentValue === 'number') {
            this.inputType = 'number';
        }

        if (this.inputType === 'multiselect') {
            const container = contentEl.createDiv({ cls: 'fm-multiselect-container' });
            this.buildMultiselectUI(container);
        } else {
            const input = contentEl.createEl('input', { type: this.inputType, cls: 'fm-property-input' });
            input.value = currentValue !== undefined ? String(currentValue) : '';
            
            const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
            buttonDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
            buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', async () => {
                await this.saveValue(input.value);
                this.close();
            });
            return;
        }

        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', async () => {
            await this.saveValue(Array.from(this.selectedValues));
            this.close();
        });
    }

    // ✅ Add this method here, after onOpen
    private buildMultiselectUI(container: HTMLElement) {
        container.empty();
        for (const val of this.allValues) {
            const row = container.createDiv({ cls: 'fm-checkbox-row' });
            const checkbox = row.createEl('input', { type: 'checkbox', value: val });
            checkbox.checked = this.selectedValues.has(val);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedValues.add(val);
                } else {
                    this.selectedValues.delete(val);
                }
            });
            row.createEl('span', { text: val });
        }
        const newTagRow = container.createDiv({ cls: 'fm-new-tag-row' });
        const newTagInput = newTagRow.createEl('input', { type: 'text', placeholder: 'New tag...' });
        const addBtn = newTagRow.createEl('button', { text: 'Add' });
        addBtn.addEventListener('click', () => {
            const newVal = newTagInput.value.trim();
            if (newVal && !this.allValues.has(newVal)) {
                this.allValues.add(newVal);
                this.selectedValues.add(newVal);
                this.buildMultiselectUI(container);
            }
        });
    }

    private async collectAllValues() {
        const files = this.app.vault.getMarkdownFiles();
        for (const f of files) {
            const cache = this.app.metadataCache.getFileCache(f);
            const fm = cache?.frontmatter;
            if (fm && fm[this.property] !== undefined) {
                const val = fm[this.property];
                if (Array.isArray(val)) {
                    val.forEach(v => this.allValues.add(String(v)));
                } else {
                    this.allValues.add(String(val));
                }
            }
        }
    }

    private async saveValue(value: string | string[]) {
        const file = this.file;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (value === '' || (Array.isArray(value) && value.length === 0)) {
                delete fm[this.property];
            } else {
                fm[this.property] = value;
            }
        });
        this.onSave();
        new Notice(`Updated ${this.property} for ${file.basename}`);
    }

    onClose() {
        this.contentEl.empty();
    }
}