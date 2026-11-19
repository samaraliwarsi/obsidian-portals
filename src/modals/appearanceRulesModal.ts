import { App, Modal } from 'obsidian';
import PortalsPlugin from '../main';
import { AppearanceRule } from '../types';
import Sortable from 'sortablejs';
import { SearchPopover } from '../utils/searchPopover';
import { IconPickerPopover } from './iconPickerPopover';
import { ColorPickerPopover } from './colorPopover';

export class AppearanceRulesModal extends Modal {
    private plugin: PortalsPlugin;
    private rules: AppearanceRule[];
    private listEl!: HTMLElement;
    private allProperties: string[] = [];
    private activePopover: { destroy(): void } | null = null;

    constructor(app: App, plugin: PortalsPlugin) {
        super(app);
        this.plugin = plugin;
        // Clone to avoid mutating settings until Save is clicked
        this.rules = JSON.parse(JSON.stringify(plugin.settings.appearanceRules || []));
    }

    private closeActivePopover() {
        if (this.activePopover) {
            this.activePopover.destroy();
            this.activePopover = null;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        //contentEl.addClass('portals-modal');
        contentEl.addClass('portals-appearance-rules-modal');
        contentEl.addClass('portals-ar-modal');
        contentEl.createDiv({ text: 'Appearance Rules', cls: 'portals-ar-modal-title' });
        contentEl.createDiv({ 
            text: 'Rules priority is top-to-bottom. Manual file overrides take highest priority.',
            cls: 'portals-ar-modal-subtext'
        });

        // Gather all unique properties in the vault
        const props = new Set<string>();
        for (const f of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            if (fm) Object.keys(fm).forEach(k => props.add(k));
        }
        this.allProperties = Array.from(props).sort();

        this.listEl = contentEl.createDiv({ cls: 'portals-ar-sortable-list portals-rules-list' });
        this.renderList();

        // Add button
        const addBtn = contentEl.createEl('button', { text: '+ Add New Rule', cls: 'portals-reset-btn portals-ar-add-btn' });
        addBtn.addEventListener('click', () => {
            this.rules.push({
                id: `rule-${Date.now()}`,
                property: '',
                value: '',
                icon: 'lucide:file',
                color: ''
            });
            this.renderList();
        });

        // Footer
        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        btnDiv.createEl('button', { text: 'Save Rules', cls: 'mod-cta' })
            .addEventListener('click', () => {
                this.plugin.settings.appearanceRules = this.rules;
                void this.plugin.saveSettings().then(() => {
                    this.plugin.refreshAllViews(); // Force update
                    this.close();
                });
            });
    }

    private renderList() {
        this.listEl.empty();
        if (this.rules.length === 0) {
            this.listEl.createDiv({ text: 'No rules defined yet. Click "Add New Rule" to start.', cls: 'portals-ar-empty-state' });
            return;
        }

        for (const rule of this.rules) {
            const row = this.listEl.createDiv({ cls: 'portals-sortable-item portals-rule-row' });
            row.dataset.id = rule.id;

            // 1. Drag Handle
            const decisionWrap = row.createDiv({ cls: 'portals-ar-rule-row-div' });
            const handle = decisionWrap.createSpan({ cls: 'portals-reorder-handle' });
            this.plugin.renderPluginIcon(handle, 'dots-six-vertical');

            // 2. Property Button
            const propBtn = decisionWrap.createEl('button', { 
                cls: 'portals-reset-btn portals-ar-prop-btn',
                text: rule.property || 'Property' 
            });
            propBtn.addEventListener('click', () => {
                this.closeActivePopover();
                this.activePopover = new SearchPopover(propBtn, {
                    items: this.allProperties,
                    currentSelected: rule.property,
                    onSelect: (val) => {
                        rule.property = val;
                        propBtn.setText(val);
                    },
                    parent: this.modalEl
                });
            });

            // 3. Value Button
            const valBtn = decisionWrap.createEl('button', {
                cls: 'portals-reset-btn portals-ar-prop-btn', 
                text: rule.value || 'Value' 
            });
            valBtn.addEventListener('click', () => {
                if (!rule.property) return;
                const vals = new Set<string>();
                for (const f of this.app.vault.getMarkdownFiles()) {
                    const raw = this.app.metadataCache.getFileCache(f)?.frontmatter?.[rule.property];
                    if (raw !== undefined) {
                        if (Array.isArray(raw)) raw.forEach(x => vals.add(String(x)));
                        else vals.add(String(raw));
                    }
                }
                this.closeActivePopover();
                this.activePopover = new SearchPopover(valBtn, {
                    items: Array.from(vals).sort(),
                    currentSelected: rule.value,
                    onSelect: (val) => {
                        rule.value = val;
                        valBtn.setText(val);
                    },
                    parent: this.modalEl
                });
            });

            // 4. Icon Button
            const controlWrap = row.createDiv({ cls: 'portals-ar-rule-row-div' });
            const iconBtn = controlWrap.createEl('button', { 
                cls: 'portals-reset-btn portals-ar-icon-btn' 
            });
            this.plugin.renderIconString(iconBtn, rule.icon, 'file');
            iconBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeActivePopover();
                this.activePopover = new IconPickerPopover(
                    this.app, this.plugin, iconBtn, this.modalEl,
                    (iconKey) => {
                        rule.icon = iconKey;
                        iconBtn.empty();
                        this.plugin.renderIconString(iconBtn, iconKey, 'file');
                    }
                );
                console.log('Popover created:', this.activePopover);
            });

            // 5. Color Button
            const colorBtn = controlWrap.createEl('button', { cls: 'portals-reset-btn portals-ar-color-btn' });
            const swatch = colorBtn.createDiv({ cls: 'cm-color-swatch' });
            swatch.setCssProps({ '--swatch-bg': rule.color || 'transparent' });
            colorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeActivePopover();
                this.activePopover = new ColorPickerPopover(
                    this.plugin,
                    colorBtn,
                    this.modalEl,
                    (newColor) => {
                        rule.color = newColor;
                        swatch.setCssProps({ '--swatch-bg': newColor || 'transparent' });
                    },
                    rule.color
                );
            });

            // 6. Delete Button
            const delBtn = controlWrap.createEl('button', { cls: 'portals-reset-btn portals-ar-del-btn clickable-icon' });
            this.plugin.renderPluginIcon(delBtn, 'trash');
            delBtn.addEventListener('click', () => {
                this.rules = this.rules.filter(r => r.id !== rule.id);
                this.renderList();
            });
        }

        // Initialize Sortable
        new Sortable(this.listEl, {
            animation: 150,
            handle: '.portals-reorder-handle',
            draggable: '.portals-rule-row',
            onEnd: () => {
                const newOrderIds = Array.from(this.listEl.querySelectorAll('.portals-rule-row'))
                    .map(el => (el as HTMLElement).dataset.id);
                
                // Reorder the array based on DOM order
                this.rules.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
            }
        });
    }

    onClose() {
        this.closeActivePopover();
        this.contentEl.empty();
    }
}