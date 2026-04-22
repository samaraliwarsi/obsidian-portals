import { App, TFile, Notice, Menu } from 'obsidian';
import PortalsPlugin from './main';

export class FrontmatterClinicRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private container: HTMLElement;
    private properties: Map<string, Set<string>> = new Map();
    private filteredFiles: TFile[] = [];

    private get selectedProperty(): string{
        return this.plugin.settings.clinicState?.selectedProperty ?? '';
    }
    private set selectedProperty(value: string) {
        if (!this.plugin.settings.clinicState) {
            this.plugin.settings.clinicState = { selectedProperty: '', selectedValue: ''};
        }
        this.plugin.settings.clinicState.selectedProperty = value;
    }

    private get selectedValue(): string {
        return this.plugin.settings.clinicState?.selectedValue ?? '';
    }
    private set selectedValue(value: string) {
        if (!this.plugin.settings.clinicState) {
            this.plugin.settings.clinicState = { selectedProperty: '', selectedValue: ''};
        }
        this.plugin.settings.clinicState.selectedValue = value;
    }


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

        this.filterFiles();

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
                .onClick(async () => {
                    this.selectedProperty = '';
                    this.selectedValue = '';
                    await this.plugin.saveSettings();
                    this.render();
                }));
            menu.addItem(item => item
            .setTitle('No frontmatter')
            .onClick(async () => {
                this.selectedProperty = 'No frontmatter';
                this.selectedValue = '';
                await this.plugin.saveSettings();
                this.render();
            }));
            menu.addSeparator();
            for (const prop of this.properties.keys()) {
                menu.addItem(item => item
                    .setTitle(prop)
                    .onClick(async () => {
                        this.selectedProperty = prop;
                        this.selectedValue = '';
                        await this.plugin.saveSettings();
                        this.render();
                    }));
            }
            menu.showAtMouseEvent(e);
        });

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
                .onClick(async () => {
                    this.selectedValue = '';
                    await this.plugin.saveSettings();
                    this.render();
                }));
            menu.addItem(item => item
                .setTitle('None')
                .onClick(async () => {
                    this.selectedValue = '__none__';
                    await this.plugin.saveSettings();
                    this.render();
                }));
            menu.addSeparator();
            
            const values = this.properties.get(this.selectedProperty) || new Set();
            const sorted = Array.from(values).sort();
            console.log(`[Value Menu] Values for "${this.selectedProperty}":`, sorted);
            
            for (const val of sorted) {
                menu.addItem(item => item
                    .setTitle(val)
                    .onClick(async () => {
                        this.selectedValue = val;
                        await this.plugin.saveSettings();
                        this.render();
                    }));
            }
            
            menu.showAtMouseEvent(e);
            
            // Apply height limit
            setTimeout(() => {
                const menus = document.querySelectorAll('.menu');
                const lastMenu = menus[menus.length - 1] as HTMLElement;
                if (lastMenu) {
                    lastMenu.classList.add('fm-value-menu');
                }
            }, 10);
        });

        const hasFiles = this.filteredFiles.length > 0;

        if (!this.plugin.settings.hideFilteredCount && hasFiles) {
            const countRow = this.container.createDiv({ cls: 'fm-count-row' });
            countRow.createSpan({ cls: 'fm-file-count', text: `${this.filteredFiles.length} results` });
        }

        // File list container
        const listContainer = this.container.createDiv({ cls: 'fm-clinic-file-list' });
        
        if (!hasFiles) {
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

    public destroy() {
        this.container.empty();
    }
}
