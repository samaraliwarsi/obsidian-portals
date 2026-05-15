import { TFile, TFolder, TAbstractFile, App } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { isContextNote, hasContextNote } from '../renderers/contextNotes';

export class FolderTreeRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
    }

    render(
        folder: TFolder,
        container: HTMLElement,
        openFiles: Set<string>,
        iconName: string = 'folder',
        depth: number = 0,
        index: number = 0,
        totalFirstLevelFolders: number = 0
    ): void {
        const details = container.createEl('details');
        details.addClass('folder-details');

        if (this.plugin.settings.openFolders.includes(folder.path)) {
            details.setAttr('open', 'true');
        }

        const summary = details.createEl('summary');
        summary.addClass('folder-summary');

        const customIcon = PortalsActions.getCustomIcon(this.plugin, folder.path);
        const folderIcon = customIcon || iconName;
        const iconSpan = summary.createSpan({ cls: 'folder-icon' });
        iconSpan.createEl('i', { cls: `ph ph-${folderIcon}` });

        const displayName = folder.path === '/' ? this.app.vault.getName() : folder.name;
        const nameSpan = summary.createSpan({ text: displayName });
        nameSpan.addClass('portals-item-name');
        summary.dataset.path = folder.path;
        summary.dataset.reorderKey = folder.path;

        const hasNote = hasContextNote(this.app, this.plugin, folder);
        if (this.plugin.settings.enableContextNotes && hasNote) {
            const style = this.plugin.settings.contextNoteHighlightStyle;
            if (style === 'icon') {
                iconSpan.addClass('has-context-note-icon');
                if (this.plugin.settings.treeStyle === 'minimal' || this.plugin.settings.treeStyle === 'shades') {
                    summary.addClass('has-context-note-icon');
                }
            } else if (style === 'underline') {
                nameSpan.addClass('has-context-note-underline');
            }
        }

        const activePath = this.view.getActiveFilePath();  // need to keep getActiveFilePath public or add a getter
        if (activePath) {
            const isAncestor = folder.path === '/' ? true : activePath.startsWith(folder.path + '/');
            if (isAncestor) {
                summary.createSpan({ cls: 'open-dot' });
            }
        }

        this.view.quickFolderIcon?.(summary, () => void PortalsActions.newFolderInFolder(this.app, this.plugin, this.view, folder));
        this.view.quickFileIcon?.(summary, () => void PortalsActions.newNoteInFolder(this.app, this.plugin, this.view, folder));

        this.view.makeDropTarget(summary, folder, true);

        TreeEventHelpers.attachFolderSummaryListeners(summary, folder, this.view);
        TreeEventHelpers.attachIconContextNoteOpener(iconSpan, folder, this.view);

        summary.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            ContextMenuFactory.showFolderMenu(this.view, folder, summary, e);
        });

        const childrenContainer = details.createDiv({ cls: 'folder-children' });

        const customColor = this.plugin.settings.customColors[folder.path];
        const style = this.plugin.settings.treeStyle;
        const shouldApplyColor = customColor &&
            style !== 'shades' &&
            style !== 'hues' &&
            !(style === 'portals' && this.plugin.settings.tabColorEnabled);

        if (shouldApplyColor) {
            summary.classList.add('has-folder-color');
            details.classList.add('has-folder-color');
            childrenContainer.classList.add('has-folder-color');
            details.style.setProperty('--folder-color', customColor);
            summary.style.setProperty('--folder-color', customColor);
        } else {
            summary.classList.remove('has-folder-color');
            summary.style.removeProperty('--folder-color');
            details.classList.remove('has-folder-color');
            details.style.removeProperty('--folder-color');
            childrenContainer.classList.remove('has-folder-color');
        }

        // Shades style for first-level folders
        if (depth === 1 && this.plugin.settings.treeStyle === 'shades') {
            const minOpacity = 0.1;
            const maxOpacity = 0.3;
            let shadeOpacity;
            const total = totalFirstLevelFolders > 0 ? totalFirstLevelFolders : 1;
            if (total <= 1) {
                shadeOpacity = minOpacity;
            } else {
                const progress = index / (total - 1);
                shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
            }
            shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));
            summary.classList.add('shaded-folder-summary');
            summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
            childrenContainer.classList.add('shaded-folder-children');
            childrenContainer.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
        }

        // Hues style for first-level folders
        if (depth === 1 && this.plugin.settings.treeStyle === 'hues') {
            const total = totalFirstLevelFolders > 0 ? totalFirstLevelFolders : 1;
            let progress = index / (total - 1);
            if (total <= 1) progress = 0.5;
            const hue = progress * 360;
            const minOpacity = 0.1;
            const maxOpacity = 0.3;
            let opacity;
            if (total <= 1) {
                opacity = minOpacity;
            } else {
                opacity = maxOpacity - progress * (maxOpacity - minOpacity);
            }
            opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
            summary.classList.add('hued-folder-summary');
            summary.style.setProperty('--hue-start', String(hue));
            summary.style.setProperty('--hue-end', String((hue + 30) % 360));
            summary.style.setProperty('--hue-opacity', String(opacity));
            childrenContainer.classList.add('hued-folder-children');
            childrenContainer.style.setProperty('--hue-start', String(hue));
            childrenContainer.style.setProperty('--hue-end', String((hue + 30) % 360));
            childrenContainer.style.setProperty('--hue-opacity', String(opacity * 0.6));
        }

        const loadChildren = () => {
            if (childrenContainer.children.length > 0) return;
            const sorted = this.sortFolderChildren(Array.from(folder.children));
            let childIndex = 0;
            for (const child of sorted) {
                if (this.plugin.settings.hiddenItems[child.path]) continue;
                if (child instanceof TFolder) {
                    this.render(child, childrenContainer, openFiles, 'folder', depth + 1, childIndex, totalFirstLevelFolders);
                    childIndex++;
                } else if (child instanceof TFile) {
                    const isContext = isContextNote(this.app, this.plugin, child, folder);
                    if (isContext && this.plugin.settings.enableContextNotes) {
                        if (!this.plugin.settings.showContextNotesInTree) continue;
                    }
                    this.view.createFileItem(child, childrenContainer, openFiles);
                }
            }
        };

        if (details.open) {
            loadChildren();
        }

        details.addEventListener('toggle', () => {
            if (details.open) {
                loadChildren();
            }
            const path = folder.path;
            let openFolders = this.plugin.settings.openFolders;
            if (details.open) {
                if (!openFolders.includes(path)) {
                    openFolders.push(path);
                }
            } else {
                openFolders = openFolders.filter(p => p !== path);
            }
            this.plugin.settings.openFolders = openFolders;
            void this.plugin.saveData(this.plugin.settings);
        });
    }

    private sortFolderChildren(children: TAbstractFile[]): TAbstractFile[] {
        const folders = children.filter((c): c is TFolder => c instanceof TFolder);
        const files = children.filter((c): c is TFile => c instanceof TFile);

        // custom folder or tag order
        const orderMap = this.plugin.settings.customTreeOrder;
        const hasCustom = folders.some(f => orderMap[f.path] !== undefined);
        if (hasCustom) {
            folders.sort((a, b) => {
                const aPos = orderMap[a.path] ?? Number.MAX_SAFE_INTEGER;
                const bPos = orderMap[b.path] ?? Number.MAX_SAFE_INTEGER;
                if (aPos !== bPos) return aPos - bPos;
                return a.name.localeCompare(b.name);
            });
        } else {
            folders.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Files 
        const fileSortFunc = (a: TFile, b: TFile) => {
            let aVal: string | number, bVal: string | number;
            switch (this.plugin.settings.sortBy) {
                case 'name':
                    aVal = a.name;
                    bVal = b.name;
                    break;
                case 'created':
                    aVal = a.stat.ctime;
                    bVal = b.stat.ctime;
                    break;
                case 'modified':
                    aVal = a.stat.mtime;
                    bVal = b.stat.mtime;
                    break;
                default:
                    aVal = a.name;
                    bVal = b.name;
            }
            if (this.plugin.settings.sortOrder === 'asc') {
                if (aVal < bVal) return -1;
                if (aVal > bVal) return 1;
                return 0;
            } else {
                if (aVal > bVal) return -1;
                if (aVal < bVal) return 1;
                return 0;
            }
        };
        files.sort(fileSortFunc);
        return [...folders, ...files];
    }
}