import { App, TFile, Notice, Menu, Platform } from 'obsidian';
import PortalsPlugin from './main';
import { SearchPopover } from './utils/searchPopover';
import { PortalsView } from './view';


interface PropertyValueCounts {
    counts: Map<string, Map<string, number>>;
    fileFrontmatter: Map<string, Map<string, string | string[]>>;
}

const clinicCache = {
    properties: new Map<string, Set<string>>(),
    noFrontmatterPaths: new Set<string>(),
    ready: false,
    buildingPromise: null as Promise<void> | null,
    refs: {
        counts: new Map<string, Map<string, number>>(),
        fileFrontmatter: new Map<string, Map<string, string | string[]>>()
    } as PropertyValueCounts
}

export class FrontmatterClinicRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private container: HTMLElement;
    private filteredFiles: TFile[] = [];
    private activeSearchPopover: SearchPopover | null = null;
    private view: PortalsView;

    static async buildCache(app: App) {
        if (clinicCache.ready) return;
        if (clinicCache.buildingPromise) return clinicCache.buildingPromise;

        clinicCache.buildingPromise = (async () => {
            try {
                clinicCache.properties.clear();
                clinicCache.noFrontmatterPaths.clear();
                clinicCache.refs.counts.clear();
                clinicCache.refs.fileFrontmatter.clear();

                const files = app.vault.getMarkdownFiles();
                for (const file of files) {
                    FrontmatterClinicRenderer.updateFileCache(app, file);
                }
                clinicCache.ready = true;
                const propCount = clinicCache.properties.size;
                let uniqueVals = 0;
                clinicCache.properties.forEach(set => uniqueVals += set.size);
                const noFm = clinicCache.noFrontmatterPaths.size;
                console.debug(`[Portals] Frontmatter cache built: ${propCount} properties, ${uniqueVals} unique values, ${noFm} files without frontmatter`);
            } catch (error) {
                console.error('[Portals] Failed to build frontmatter cache:', error);
                clinicCache.ready = true;
                clinicCache.properties.clear();
                clinicCache.noFrontmatterPaths.clear()
                clinicCache.refs.counts.clear();
                clinicCache.refs.fileFrontmatter.clear();
            } finally {
                clinicCache.buildingPromise = null;
            }
        })();
        await clinicCache.buildingPromise;
    }

    private showSearchPopoverForClinic(anchor: HTMLElement, items: string[], currentSelected: string, onSelect: (item: string) => void) {
        this.activeSearchPopover?.destroy();
        this.activeSearchPopover = new SearchPopover(anchor, {
            items,
            currentSelected,
            onSelect: (item: string) => {
                onSelect(item);
                this.activeSearchPopover = null;
            },
        });
    }

    static updateFileCache(app: App, file: TFile) {
        const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter || {};
        const currentFM = new Map<string, string | string[]>();
        for (const [key, value] of Object.entries(frontmatter)) {
            currentFM.set(key, value as string | string[]);
        }

        const oldFM = clinicCache.refs.fileFrontmatter.get(file.path) || new Map();

        clinicCache.noFrontmatterPaths.delete(file.path);

        if (currentFM.size === 0) {
            clinicCache.noFrontmatterPaths.add(file.path);
            for (const [key, value] of oldFM.entries()) {
                FrontmatterClinicRenderer.decrementValueCounts(key, value);
            }
            clinicCache.refs.fileFrontmatter.delete(file.path);
            return;
        }

        for (const [key, value] of currentFM.entries()) {
            if (!clinicCache.properties.has(key)) {
                clinicCache.properties.set(key, new Set());
            }
            if (!clinicCache.refs.counts.has(key)) {
                clinicCache.refs.counts.set(key, new Map());
            }
            const countMap = clinicCache.refs.counts.get(key)!;
            const values = Array.isArray(value) ? value.map(v => String(v)) : [String(value)];
            for (const v of values) {
                const count = countMap.get(v) || 0;
                countMap.set(v, count + 1);
                clinicCache.properties.get(key)!.add(v);
            }
        }

        for (const [key, oldValue] of oldFM.entries()) {
            const newValue = currentFM.get(key);
            if (newValue === undefined) {
                FrontmatterClinicRenderer.decrementValueCounts(key, oldValue);
            } else {
                const oldValues = new Set(Array.isArray(oldValue) ? oldValue.map(String) : [String(oldValue)]);
                const newValues = new Set(Array.isArray(newValue) ? newValue.map(String) : [String(newValue)]);
                for (const v of oldValues) {
                    if (!newValues.has(v)) {
                        FrontmatterClinicRenderer.decrementValueCount(key, v);
                    }
                }
            }
        }
        clinicCache.refs.fileFrontmatter.set(file.path, currentFM);
    }

    private static decrementValueCounts(key: string, value: string | string[]) {
        const values = Array.isArray(value) ? value.map(String) : [String(value)];
        for (const v of values) {
            FrontmatterClinicRenderer.decrementValueCount(key, v);
        }
    }

    private static decrementValueCount(key: string, value: string) {
        const countMap = clinicCache.refs.counts.get(key);
        if (!countMap) return;
        const count = countMap.get(value) || 0;
        if (count <= 1) {
            countMap.delete(value);
            const propSet = clinicCache.properties.get(key);
            if (propSet) {
                propSet.delete(value);
                if (propSet.size === 0) {
                    clinicCache.properties.delete(key);
                    clinicCache.refs.counts.delete(key);
                }
            }
        } else {
            countMap.set(value, count - 1);
        }
    }

    static removeFileCache(path: string) {
        const oldFM = clinicCache.refs.fileFrontmatter.get(path);
        if (oldFM) {
            for (const [key, value] of oldFM.entries()) {
                FrontmatterClinicRenderer.decrementValueCounts(key, value);
            }
            clinicCache.refs.fileFrontmatter.delete(path);
        }
        clinicCache.noFrontmatterPaths.delete(path);
    }

    static resetCache() {
        clinicCache.properties.clear();
        clinicCache.noFrontmatterPaths.clear();
        clinicCache.refs.counts.clear();
        clinicCache.refs.fileFrontmatter.clear();
        clinicCache.ready = false;
        clinicCache.buildingPromise = null;
    }


    static getProperties() {
        return clinicCache.properties;
    }

    static getNoFrontmatterPaths() {
        return clinicCache.noFrontmatterPaths;
    }

    static isCacheReady() {
        return clinicCache.ready;
    }

    // ... rest of class (instance methods) ...


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


    constructor(app: App, plugin: PortalsPlugin, container: HTMLElement, view: PortalsView) {
        this.app = app;
        this.plugin = plugin;
        this.container = container;
        this.view = view;
    }

    async render() {
        this.container.empty()
        this.container.addClass('portals-frontmatter-clinic');

        this.activeSearchPopover = null;

        // Lazy-load cache
        if (!FrontmatterClinicRenderer.isCacheReady()) {
            const loadingEl =this.container.createEl('p', { 
                text: 'Scanning frontmatter...', 
                cls: 'fm-noFound-txt' 
            });
            await FrontmatterClinicRenderer.buildCache(this.app);
            loadingEl.remove();
        }

        // Set accent color from active space
        const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
        const tabColorEnabled = this.plugin.settings.tabColorEnabled;
        if (tabColorEnabled && rootSpace?.color && rootSpace.color !== 'transparent') {
            this.container.style.setProperty('--fm-accent-color', rootSpace.color);
        } else {
            this.container.style.removeProperty('--fm-accent-color');
        }

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
            (menu as {dom?: HTMLElement}).dom?.addClass('portals-fm-dropdown');
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
            for (const prop of FrontmatterClinicRenderer.getProperties().keys()) {
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
            (menu as {dom?: HTMLElement }).dom?.addClass('portals-fm-dropdown');
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
            
            const values = FrontmatterClinicRenderer.getProperties().get(this.selectedProperty) || new Set();
            const sorted = Array.from(values).sort();
            console.debug(`[Value Menu] Values for "${this.selectedProperty}":`, sorted);
            
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


        if (!Platform.isMobile) {
            // Right‑click property button – ALWAYS opens popover
            propBtn.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const properties = Array.from(FrontmatterClinicRenderer.getProperties().keys());
                properties.unshift('No frontmatter');
                this.showSearchPopoverForClinic(propBtn, properties, this.selectedProperty, async (selected) => {
                    if (selected === 'No frontmatter') {
                        this.selectedProperty = 'No frontmatter';
                        this.selectedValue = '';
                    } else {
                        this.selectedProperty = selected;
                        this.selectedValue = '';
                    }
                    await this.plugin.saveSettings();
                    this.render();
                });
            });

            // Right‑click value button – only if a real property is selected
            valueBtn.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this.selectedProperty || this.selectedProperty === 'No frontmatter') {
                    new Notice('Select a property first.');
                    return;
                }
                const valuesSet = FrontmatterClinicRenderer.getProperties().get(this.selectedProperty) || new Set<string>();
                const values = ['All values', 'None', ...Array.from(valuesSet).sort()];
                this.showSearchPopoverForClinic(valueBtn, values,
                    this.selectedValue === '' ? 'All values' : this.selectedValue === '__none__' ? 'None' : this.selectedValue,
                    async (selected) => {
                        switch (selected) {
                            case 'All values':
                                this.selectedValue = ''; break;
                            case 'None':
                                this.selectedValue = '__none__'; break;
                            default:
                                this.selectedValue = selected; break;
                        }
                        await this.plugin.saveSettings();
                        this.render();
                    }
                );
            });

            // Reuse view’s tooltip system
            propBtn.addEventListener('mouseenter', () => this.view.showTooltip('Right-click: find', propBtn, 300));
            propBtn.addEventListener('mouseleave', () => this.view.hideTooltip(100));

            valueBtn.addEventListener('mouseenter', () => this.view.showTooltip('Right-click: find', valueBtn, 300));
            valueBtn.addEventListener('mouseleave', () => this.view.hideTooltip(100));
        }

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

    private filterFiles() {
        const files = this.app.vault.getMarkdownFiles();
        // special case: no frontmatter 
        if (this.selectedProperty === 'No frontmatter') {
            this.filteredFiles = files.filter(file => {
            return FrontmatterClinicRenderer.getNoFrontmatterPaths().has(file.path)
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
        this.activeSearchPopover?.destroy();
    }
}
