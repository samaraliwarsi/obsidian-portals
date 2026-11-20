import { App, Menu, Modal, Notice, Platform } from 'obsidian';
import PortalsPlugin from '../main';
import { AppearanceRule } from '../types';
import Sortable from 'sortablejs';
import { SearchPopover } from '../utils/searchPopover';
import { IconPickerPopover } from './iconPickerPopover';
import { ColorPickerPopover } from './colorPopover';
import { PortalsView, VIEW_TYPE_PORTALS } from '../view';
import { ConfirmModal } from './confirmModal';

export class AppearanceRulesModal extends Modal {
    private plugin: PortalsPlugin;
    private view: PortalsView | null;
    private rules: AppearanceRule[];
    private listEl!: HTMLElement;
    private allProperties: string[] = [];
    private activePopover: { destroy(): void } | null = null;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView | null) {
        super(app);
        this.plugin = plugin;
        this.view = view || null;
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
            text: 'Drag items higher for higher priority. Manual file override is top priority.',
            //text: 'Rules priority is top-to-bottom. Manual file overrides take highest priority.',
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
        const addBtn = contentEl.createEl('button', { text: '+ New Rule', cls: 'portals-reset-btn portals-ar-add-btn' });
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
        btnDiv.createEl('button', { text: 'Clear All', cls: 'mod-warning' })
            .addEventListener('click', () => {
                void (async () => {
                    if (this.rules.length === 0) {
                        new Notice('No rules to clear.');
                        return;
                    }
                    const confirmed = await ConfirmModal.confirm(
                        this.app,
                        'Are you sure you want to delete all rules? This cannot be undone.'
                    );
                    if (!confirmed) return;

                    this.rules = [];
                    this.plugin.settings.appearanceRules = [];
                    await this.plugin.saveData(this.plugin.settings);

                    // Surgical refresh
                    this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                        if (leaf.view instanceof PortalsView) {
                            leaf.view.refreshFileAppearances();
                        }
                    });
                    this.plugin.refreshAltRightPanelContent();

                    new Notice('All appearance rules cleared.');
                    this.renderList();
                })();
        });

        btnDiv.createEl('button', { text: 'Close' })
            .addEventListener('click', () => this.close());
        btnDiv.createEl('button', { text: 'Save Rules', cls: 'mod-cta' })
            .addEventListener('click', () => {
                new Notice('Appearance rules saved.');
                this.plugin.settings.appearanceRules = this.rules;
                this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS).forEach(leaf => {
                    if (leaf.view instanceof PortalsView) {
                        leaf.view.refreshFileAppearances();
                    }
                });
                this.plugin.refreshAltRightPanelContent();
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
            const handle = decisionWrap.createSpan({ cls: 'portals-ar-reorder-handle' });
            this.plugin.renderPluginIcon(handle, 'dots-six-vertical');

            // 2. Property Button
            const propBtn = decisionWrap.createEl('button', { 
                cls: 'portals-reset-btn portals-ar-prop-btn',
                text: rule.property || 'Property' 
            });

            if (!Platform.isMobile) {
                if (this.view) {
                    this.view.attachTooltip(propBtn, 'Right-click: find', 300, 'left');
                } else {
                    propBtn.setAttribute('aria-label', 'Right-click to search');
                }
            }
            // left click
            propBtn.addEventListener('click', () => {
                this.closeActivePopover();
                const menu = new Menu();
                this.allProperties.forEach(p => {
                    menu.addItem(item => item
                        .setTitle(p)
                        .onClick(() => {
                            rule.property = p;
                            propBtn.setText(p);
                        }));
                });
                const rect = propBtn.getBoundingClientRect();
                menu.showAtPosition({ x: rect.left, y: rect.bottom });
            });

            
            // right click
            propBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
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

            if (!Platform.isMobile) {
                if (this.view) {
                    this.view.attachTooltip(valBtn, 'Right-click: find', 300, 'right');
                } else {
                    propBtn.setAttribute('aria-label', 'Right-click to search');
                }
            }

            // left click
            valBtn.addEventListener('click', () => {
                if (!rule.property) return;
                this.closeActivePopover();
                const vals = this.getValuesForProperty(rule.property);
                const menu = new Menu();
                vals.forEach(v => {
                    menu.addItem(item => item
                        .setTitle(v)
                        .onClick(() => {
                            rule.value = v;
                            valBtn.setText(v);
                        }));
                });
                const rect = valBtn.getBoundingClientRect();
                menu.showAtPosition({ x: rect.left, y: rect.bottom });
            });

            // rightclik search
            valBtn.addEventListener('contextmenu', (e) => {
                if (!rule.property) {
                    new Notice('Select a property first.');
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                this.closeActivePopover();
                const vals = this.getValuesForProperty(rule.property);                
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
            handle: '.portals-ar-reorder-handle',
            draggable: '.portals-rule-row',
            onEnd: () => {
                const newOrderIds = Array.from(this.listEl.querySelectorAll('.portals-rule-row'))
                    .map(el => (el as HTMLElement).dataset.id);
                
                // Reorder the array based on DOM order
                this.rules.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
            }
        });
    }

    private getValuesForProperty(prop: string): string[] {
        const vals = new Set<string>();
        for (const f of this.app.vault.getMarkdownFiles()) {
            const raw = this.app.metadataCache.getFileCache(f)?.frontmatter?.[prop];
            if (raw !== undefined && raw !== null) {
                if (Array.isArray(raw)) {
                    raw.forEach(x => vals.add(String(x)));
                } else {
                    vals.add(String(raw));
                }
            }
        }
        return Array.from(vals).sort();
    }

    onClose() {
        this.closeActivePopover();
        this.contentEl.empty();
    }
}