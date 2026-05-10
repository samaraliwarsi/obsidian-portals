import { App, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { PortalsActions } from '../utils/portalsActions';


export class RecentFilesRenderer {
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

        const recentFiles = this.plugin.settings.recentFilesList || [];
        const existingRecentFiles = recentFiles
            .map(path => this.app.vault.getAbstractFileByPath(path))
            .filter((file): file is TFile => file instanceof TFile);

        if (existingRecentFiles.length === 0) {
            contentEl.createEl('p', { text: 'No recent files.', cls: 'portals-context-note-message' });
            return;
        }

        const openFiles = this.view.getOpenFilePaths();

        for (const file of existingRecentFiles) {
            const fileEl = contentEl.createDiv({ cls: 'file-item recent-file-item' });
            // custom icon
            const customIcon = PortalsActions.getCustomIcon(this.plugin, file.path);
            const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
            const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
            iconSpan.createEl('i', { cls: fileIconClass });
            // file name
            const nameSpan = fileEl.createSpan({ text: this.view.getDisplayName(file) });
            nameSpan.addClass('portals-item-name');
            fileEl.dataset.path = file.path;
            // open dot / extension badge
            const isOpen = openFiles.has(file.path);
            let openDotspan: HTMLSpanElement | null = null;
            if (isOpen) {
                openDotspan = fileEl.createSpan({ cls: 'open-dot' });
            }
            const enableExtBadge = this.plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md';
            if (enableExtBadge) {
                const extSpan = fileEl.createSpan({ cls: 'file-extension' });
                extSpan.setText('.' + file.extension.toUpperCase());
                if (openDotspan) {
                    openDotspan.style.display = 'none';
                }
                if (isOpen) {
                    extSpan.addClass('is-open');
                }
            }
            // custom color 
            const savedColor = this.plugin.settings.customColors[file.path];
            const iconEl = fileEl.querySelector('.file-icon i') as HTMLElement;
            if (savedColor) {
                fileEl.classList.add('has-file-color');
                fileEl.style.setProperty('--file-color', savedColor);
                if (iconEl) {
                    iconEl.classList.remove('has-file-color');
                }
            } else {
                fileEl.classList.remove('has-file-color');
                fileEl.style.removeProperty('--file-color');
                if (iconEl) {
                    iconEl.classList.remove('has-file-color');
                }
            }
            fileEl.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                this.view.suspendSidePortalUpdates = true;
                void this.app.workspace.getLeaf().openFile(file);
                setTimeout(() => { this.view.suspendSidePortalUpdates = false; }, 100);
            });

            fileEl.addEventListener('contextmenu', (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                ContextMenuFactory.showFileMenu(this.view, file, fileEl, e);
            });

            this.view.addHoverPreview(fileEl, file.path);
        }
    }
}