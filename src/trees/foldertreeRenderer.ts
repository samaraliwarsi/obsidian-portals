import { TFile, TFolder, TAbstractFile, App } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { isContextNote, hasContextNote } from '../renderers/contextNotes';
import { Rows } from '../pipeline/rows';
import { SectionRenderer } from '../utils/sectionsRenderer';
import { sortFilesBySetting } from '../utils/sortHelpers';

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
        const activePath = this.view.getActiveFilePath();
        const isAncestor = activePath
            ? (folder.path === '/' ? true : activePath.startsWith(folder.path + '/'))
            : false;

        const { details, summary, children: childrenContainer, icon: iconSpan } = Rows.branch(
            { app: this.app, plugin: this.plugin, view: this.view, openFiles },
            container,
            {
                key: folder.path,
                label: folder.path === '/' ? this.app.vault.getName() : folder.name,
                iconKey: folder.path,
                iconFallback: iconName,
                // The portal's own root row is the container for everything in the
                // space: it must always start open, or the whole portal looks
                // collapsed on entry.
                open: depth === 0 || this.plugin.settings.openFolders.includes(folder.path),
                reorderKey: folder.path,
                colorKey: folder.path,
                colorSource: 'folder',
                depth,
                index,
                totalFirstLevel: totalFirstLevelFolders,
                contextNoteHighlight: this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, folder),
                openDot: isAncestor,
                tooltip: (nameSpan) => this.getFolderTooltip(folder, nameSpan),
            },
        );

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

        const loadChildren = () => {
            if (childrenContainer.children.length > 0) return;
            const sorted = this.sortFolderChildren(Array.from(folder.children));
            
            const folderList = sorted.filter((c): c is TFolder => c instanceof TFolder);
            let childIndex = 0;
            for (const child of folderList) {
                if (this.plugin.settings.hiddenItems[child.path]) continue;
                this.render(child, childrenContainer, openFiles, 'folder', depth + 1, childIndex, totalFirstLevelFolders);
                childIndex++;
            } 

            const fileList = sorted.filter((c): c is TFile => c instanceof TFile);
            const filesContextAware = fileList.filter(file => {
                const isContex = isContextNote(this.app, this.plugin, file, folder);
                if (isContex && this.plugin.settings.enableContextNotes) {
                    if (!this.plugin.settings.showContextNotesInTree) return false; 
                }
                return true;
            });
            const sectioned = SectionRenderer.renderSections(
                this.app, this.plugin, this.view,
                filesContextAware, folder.path, childrenContainer, openFiles
            );

            if (!sectioned) {
                for (const file of filesContextAware) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    Rows.file({ app: this.app, plugin: this.plugin, view: this.view, openFiles }, file, childrenContainer);
                }
            }
        };

        if (details.open) {
            loadChildren();
        }

        details.addEventListener('toggle', () => {
            if (details.dataset.autoCollapsed) {
                delete details.dataset.autoCollapsed;
                return;
            }
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

    private getFolderTooltip(folder: TFolder, nameSpan: HTMLElement): string | null {
        if (!this.plugin.settings.showTreeItemToolTips) return null;
        let subfolders = 0;
        let files = 0;
        for (const child of folder.children) {
            if (child instanceof TFolder) subfolders++;
            else if (child instanceof TFile) files++;
        }
        const truncated = nameSpan.scrollWidth > nameSpan.clientWidth;
        const displayName = folder.path === '/' ? this.app.vault.getName() : folder.name;
        let tooltip = truncated ? displayName : '';
        
        const parts: string[] = [];
        if (subfolders > 0) parts.push(`${subfolders} folder${subfolders !== 1 ? 's' : ''}`);
        if (files > 0) parts.push(`${files} file${files !== 1 ? 's' : ''}`);
        const countsString = parts.join(', ');
        
        if (countsString) {
            if (tooltip) tooltip += ' · ';
            tooltip += countsString;
        }
        return tooltip || null;
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
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });
        } else {
            folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        }

        // Files 
        return [
            ...folders, 
            ...sortFilesBySetting(files, this.plugin.settings)
        ];
    }
}