import { App, TFile, TFolder, Platform } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';

export class HiddenItemsRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;
    private container: HTMLElement | null = null;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
    }

    setContainer(container: HTMLElement): void {
        this.container = container;
    }

    render(): void {
        if (!this.container) return;

        const contentEl = this.container;
        contentEl.empty();
        contentEl.addClass('portals-hidden-tab');

        const tabColorEnabled = this.plugin.settings.tabColorEnabled;
        const rootSpace = this.plugin.settings.spaces.find(
            s => s.path === '/' && s.type === 'folder'
        );
        const rootColor = (tabColorEnabled && rootSpace && rootSpace.color !== 'transparent')
            ? rootSpace.color
            : null;

        const hidden = this.plugin.settings.hiddenItems;
        const hiddenKeys = Object.keys(hidden).filter(k => hidden[k]);

        if (hiddenKeys.length === 0) {
            contentEl.createEl('p', { text: 'No hidden items.', cls: 'unhide-items-message' });
            return;
        }

        const buttonWrapper = contentEl.createDiv({ cls: 'unhide-wrapper' });
        const unhideAllBtn = buttonWrapper.createEl('button', { cls: 'unhide-btn-all' });
        unhideAllBtn.createEl('i', { cls: 'ph ph-eye' });
        unhideAllBtn.createSpan({ text: 'Unhide all', cls: 'unhide-btn-text' });
        unhideAllBtn.addEventListener('click', () => {
            this.view.unhideAllItems();
        });

        if (rootColor) {
            contentEl.style.setProperty('--hidden-accent-color', rootColor);
        } else {
            contentEl.style.removeProperty('--hidden-accent-color');
        }

        hiddenKeys.sort();

        for (const key of hiddenKeys) {
            const fileEl = contentEl.createDiv({ cls: 'file-item' });
            fileEl.dataset.path = key;

            let displayName = key;
            let iconClass = 'ph-file';
            let typeLabel = '';

            const item = this.app.vault.getAbstractFileByPath(key);
            if (item instanceof TFile) {
                displayName = this.view.getDisplayName(item);
                iconClass = 'ph-file';
                typeLabel = 'File';
                const customIcon = PortalsActions.getCustomIcon(this.plugin, key);
                if (customIcon) iconClass = `ph-${customIcon}`;
            } else if (item instanceof TFolder) {
                displayName = item.name;
                iconClass = 'ph-folder';
                typeLabel = 'Folder';
                const customIcon = PortalsActions.getCustomIcon(this.plugin, key);
                if (customIcon) iconClass = `ph-${customIcon}`;
            } else if (key.startsWith('tag:')) {
                const withoutPrefix = key.slice(4);
                const groupMatch = withoutPrefix.match(/^([^/]+)\/group:(.+)$/);
                const nodeMatch = withoutPrefix.match(/^([^/]+)\/node:(.+)$/);

                if (groupMatch && groupMatch[1] && groupMatch[2]) {
                    displayName = groupMatch[2];
                    typeLabel = 'Tag Group';
                    iconClass = 'ph-tag-simple';
                } else if (nodeMatch && nodeMatch[1] && nodeMatch[2]) {
                    const nodePath = nodeMatch[2];
                    displayName = nodePath.split('/').pop() || nodePath;
                    typeLabel = 'Subtag';
                    iconClass = 'ph-tag';
                } else {
                    displayName = withoutPrefix;
                    typeLabel = 'Tag';
                    iconClass = 'ph-tag';
                }
                const customIcon = PortalsActions.getCustomIcon(this.plugin, key);
                if (customIcon) iconClass = `ph-${customIcon}`;
            }

            const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
            iconSpan.createEl('i', { cls: `ph ${iconClass}` });
            fileEl.createSpan({ text: displayName, cls: 'portals-item-name' });

            if (typeLabel) {
                const infoSpan = fileEl.createSpan({ cls: 'hidden-type-label' });
                infoSpan.setText(typeLabel);
            }

            const unhideBtn = fileEl.createEl('button', { cls: 'unhide-btn' });
            unhideBtn.createEl('i', { cls: 'ph ph-eye' });
            unhideBtn.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                this.view.unhideItem(key);
            });

            if (!Platform.isMobile) {
                unhideBtn.addEventListener('mouseenter', () => {
                    this.view.showTooltip('Unhide', unhideBtn, 300);
                });
                unhideBtn.addEventListener('mouseleave', () => {
                    this.view.hideTooltip(100);
                });
            }

            if (item instanceof TFile) {
                this.view.addHoverPreview(fileEl, item.path);
            }
        }
    }
}