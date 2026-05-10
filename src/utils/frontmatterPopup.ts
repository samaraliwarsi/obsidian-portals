import { App, TFile, Notice, Menu } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { SearchPopover } from './searchPopover';

declare module 'obsidian' {
    interface Menu {
        dom?: HTMLElement;
    }
}

type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'list';

export class FrontmatterPopup {
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
    private typeBtn!: HTMLButtonElement;
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
        this.backdrop = document.body.createDiv('portals-fm-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        // Container
        this.container = document.body.createDiv('portals-fm-modal');
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
        container.createEl('h3', { text: 'Frontmatter editing' });
        container.createEl('p', {
            text: files.length === 1
            ? `Editing frontmatter of ${files[0]?.name ?? 'a file'}`
            : `Editing frontmatter of ${files.length} markdown files`,
            cls: 'portals-fm-modal-select-status'
        });

        // Gather all known properties
        const propSet = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (fm) Object.keys(fm).forEach(k => propSet.add(k));
        }
        this.allProperties = Array.from(propSet).sort();

       // ── Property picker ──
        const propRow = container.createDiv({ cls: 'fm-input-wrapper' });
        propRow.createSpan({ text: 'Property', cls: 'fm-wrapper-text' });
        const propGroup = propRow.createDiv({ cls: 'fm-input-group' });
        this.propBtn = propGroup.createEl('button', {
            text: this.propertyName || 'Choose from existing, right-click to search',
            cls: 'fm-input-btn',
            attr: { 'aria-label': 'Select or search properties' },
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
                        this.updateValueInputState();
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
            cls: 'portals-fm-search-input',
        });
        this.propertyInput.addEventListener('input', () => {
            this.propertyName = this.propertyInput.value;
            this.updateValueInputState();
            this.propBtn.setText(this.propertyName || 'Existing');
            this.propertyIsExisting = false;
            this.derivePropertyType();
            this.updateValueOptions();
            this.updateValueInput();
        });

        // ── Type selector ──
        const typeRow = container.createDiv({ cls: 'fm-type-wrapper' });
        typeRow.createSpan({ text: 'Ensure type on new items, ignore on existing items:', cls: 'fm-type-text' });
        this.typeBtn = typeRow.createEl('button', {
            text: this.propertyType,
            cls: 'fm-type-btn',
            attr: { 'aria-label': 'Choose type' }
        });
        this.typeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = new Menu();
            menu.dom?.addClass?.('bulk-fm-menu');
            (['string', 'number', 'boolean', 'date', 'datetime', 'list'] as PropertyType[]).forEach(t => {
                menu.addItem(item => item
                    .setTitle(t)
                    .onClick(() => {
                        this.propertyType = t;
                        this.typeBtn.setText(t);
                        this.updateValueOptions();
                        this.value = '';
                        this.valBtn.setText('Select a property first');
                    }));
                });
                menu.showAtMouseEvent(e);
        });
        

        // ── Value picker ──
        const valRow = container.createDiv({ cls: 'fm-input-wrapper' });
        valRow.createSpan({ text: 'Value', cls: 'fm-wrapper-text' });
        const valGroup = valRow.createDiv({ cls: 'fm-input-group' });
        this.valueGroup = valGroup;
        this.valBtn = valGroup.createEl('button', {
            cls: 'fm-input-btn',
            attr: { 'aria-label': 'Select or search values' },
        });
        this.valBtn.addEventListener('click', (e) => {
            if (!this.propertyName) {
                new Notice('Please select a property first.');
                return;
            }
            e.stopPropagation();
            const menu = new Menu();
            menu.dom?.addClass?.('bulk-fm-menu');
            this.propertyValues.forEach(v => {
                menu.addItem(item => item
                    .setTitle(v)
                    .onClick(() => {
                        this.value = v;
                        this.valueInput.value = v;
                        this.updateValueInputState();
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

        this.updateValueInputState();
    }

    private updateValueInputState(): void {
        if (!this.valBtn || !this.valueInput) return;
        if (this.propertyName) {
            // Normal active state
            this.valBtn.setText(this.value || 'Choose from existing, right-click to search');
            this.valueInput.disabled = false;
            this.valueInput.placeholder = 'Type or select a value';
        } else {
            // No property selected yet – disable and show guidance
            this.valBtn.setText('Select a property first');
            this.valueInput.disabled = true;
            this.valueInput.placeholder = 'Select a property first';
        }
    }

    private updateValueInput(): void {
        if (this.valueInput) this.valueInput.remove();
        const oldBtn = this.valueGroup.querySelector('.portals-today-btn');
        if (oldBtn) oldBtn.remove();
        if (this.propertyType === 'date') {
            this.valueInput = this.valueGroup.createEl('input', {
                type: 'date',
                value: this.value,
                cls: 'portals-fm-search-input',
            });
        } else if (this.propertyType === 'datetime') {
            this.valueInput = this.valueGroup.createEl('input', {
                type: 'datetime-local',
                value: this.value,
                cls: 'portals-fm-search-input',
            });
        } else {
            this.valueInput = this.valueGroup.createEl('input', {
                type: 'text',
                value: this.value,
                cls: 'portals-fm-search-input',
            });
        }
        this.valueInput.addEventListener('input', () => {
            this.value = this.valueInput.value;
            this.updateValueInputState();
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
                this.updateValueInputState();
                this.valueIsExisting = false;
            });
        }
        this.updateValueInputState();
    }

    private derivePropertyType(): void {
        if (!this.propertyName) {
            this.propertyType = 'string';
            this.typeBtn.setText('string');
            return;
        }

        let type: PropertyType | null = null;
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const v = fm?.[this.propertyName];
            if (v === undefined) continue;

            let currentType: PropertyType;
            if (Array.isArray(v)) {
                currentType = 'list';
            } else if (typeof v === 'number') {
                currentType = 'number';
            } else if (typeof v === 'boolean') {
                currentType = 'boolean';
            } else {
                currentType = 'string';
            }

            if (type !== null && type !== currentType) {
                type = 'string';
                break;
            }
            type = currentType;
        }
        // If no existing property, default to string
        if (type === null) type = 'string';
        this.propertyType = type;
        this.typeBtn.setText(type);
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
                this.updateValueInputState();
                this.propertyIsExisting = true;
                this.value = '';
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
                this.valueInput.value = item;
                this.updateValueInputState();
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
        this.updateValueInputState();
    }
}