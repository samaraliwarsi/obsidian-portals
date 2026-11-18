import { App, Modal } from 'obsidian';
import PortalsPlugin from '../main';
import { AppearanceRule } from '../types';
import Sortable from 'sortablejs';
import { SearchPopover } from '../utils/searchPopover';
import { IconPickerModal } from './iconPicker';
import { ColorPickerModal } from './colorModal';

export class AppearanceRulesModal extends Modal {
    private plugin: PortalsPlugin;
    private rules: AppearanceRule[];
    private listEl!: HTMLElement;
    private allProperties: string[] = [];
    private activePopover: SearchPopover | null = null;

    constructor(app: App, plugin: PortalsPlugin) {
        super(app);
        this.plugin = plugin;
        // Clone to avoid mutating settings until Save is clicked
        this.rules = JSON.parse(JSON.stringify(plugin.settings.appearanceRules || []));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('portals-appearance-rules-modal');
        contentEl.createEl('h2', { text: 'Appearance Rules', cls: 'portals-modal-title' });
        contentEl.createEl('p', { 
            text: 'Rules are applied top-to-bottom. The first matching rule wins. Manual file overrides take highest priority.',
            cls: 'portals-modal-subtext'
        });

        // Gather all unique properties in the vault
        const props = new Set<string>();
        for (const f of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            if (fm) Object.keys(fm).forEach(k => props.add(k));
        }
        this.allProperties = Array.from(props).sort();

        this.listEl = contentEl.createDiv({ cls: 'portals-sortable-list portals-rules-list' });
        this.renderList();

        // Add button
        const addBtn = contentEl.createEl('button', { text: '+ Add New Rule', cls: 'portals-add-rule-btn' });
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
            this.listEl.createDiv({ text: 'No rules defined yet. Click "Add New Rule" to start.', cls: 'portals-empty-state' });
            return;
        }

        for (const rule of this.rules) {
            const row = this.listEl.createDiv({ cls: 'portals-sortable-item portals-rule-row' });
            row.dataset.id = rule.id;

            // 1. Drag Handle
            const handle = row.createSpan({ cls: 'portals-reorder-handle' });
            this.plugin.renderPluginIcon(handle, 'dots-six-vertical');

            // 2. Property Button
            const propBtn = row.createEl('button', { cls: 'portals-rule-btn', text: rule.property || 'Property' });
            propBtn.addEventListener('click', () => {
                this.activePopover?.destroy();
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

            row.createSpan({ text: 'is', cls: 'portals-rule-equals' });

            // 3. Value Button
            const valBtn = row.createEl('button', { cls: 'portals-rule-btn', text: rule.value || 'Value' });
            valBtn.addEventListener('click', () => {
                if (!rule.property) return;
                // Gather values for this property
                const vals = new Set<string>();
                for (const f of this.app.vault.getMarkdownFiles()) {
                    const raw = this.app.metadataCache.getFileCache(f)?.frontmatter?.[rule.property];
                    if (raw !== undefined) {
                        if (Array.isArray(raw)) raw.forEach(x => vals.add(String(x)));
                        else vals.add(String(raw));
                    }
                }
                this.activePopover?.destroy();
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

            row.createSpan({ text: '→', cls: 'portals-rule-arrow' });

            // 4. Icon Button
            const iconBtn = row.createEl('button', { cls: 'portals-rule-icon-btn' });
            this.plugin.renderIconString(iconBtn, rule.icon, 'file');
            iconBtn.addEventListener('click', () => {
                new IconPickerModal(
                    this.app, this.plugin.phosphorProvider, this.plugin.lucideProvider, this.plugin,
                    (iconKey) => {
                        rule.icon = iconKey;
                        iconBtn.empty();
                        this.plugin.renderIconString(iconBtn, iconKey, 'file');
                    }
                ).open();
            });

            // 5. Color Button
            const colorBtn = row.createEl('button', { cls: 'portals-rule-color-btn' });
            const swatch = colorBtn.createDiv({ cls: 'cm-color-swatch' });
            swatch.setCssProps({ '--swatch-bg': rule.color || 'transparent' });
            colorBtn.addEventListener('click', () => {
                // Reuse your existing ColorPickerModal
                new ColorPickerModal(
                    this.app, this.plugin, colorBtn, 
                    (newColor) => {
                        rule.color = newColor;
                        swatch.setCssProps({ '--swatch-bg': newColor });
                    },
                    undefined,
                    rule.color
                ).open();
            });

            // 6. Delete Button
            const delBtn = row.createEl('button', { cls: 'portals-rule-del-btn clickable-icon' });
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
        this.activePopover?.destroy();
        this.contentEl.empty();
    }
}