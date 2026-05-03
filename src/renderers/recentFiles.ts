import { App, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';   // only used for type

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
            contentEl.createEl('p', { text: 'No recent files.' });
            return;
        }

        const openFiles = this.view.getOpenFilePaths();

        for (const file of existingRecentFiles) {
            const fileEl = contentEl.createDiv({ cls: 'file-item recent-file-item' });
            const customIcon = this.view.getCustomIcon(file.path);
            const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
            const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
            iconSpan.createEl('i', { cls: fileIconClass });
            const nameSpan = fileEl.createSpan({ text: this.view.getDisplayName(file) });
            nameSpan.addClass('portals-item-name');
            fileEl.dataset.path = file.path;

            const isOpen = openFiles.has(file.path);
            let openDotspan: HTMLSpanElement | null = null;
            if (isOpen) openDotspan = fileEl.createSpan({ cls: 'open-dot' });

            const enableExtBadge = this.plugin.settings.enableFileExtensionNonMD
                && file.extension && file.extension !== 'md';
            if (enableExtBadge) {
                const extSpan = fileEl.createSpan({ cls: 'file-extension' });
                extSpan.setText('.' + file.extension.toUpperCase());
                if (openDotspan) openDotspan.style.display = 'none';
                if (isOpen) extSpan.addClass('is-open');
            }

            fileEl.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                void this.app.workspace.getLeaf().openFile(file);
            });

            fileEl.addEventListener('contextmenu', (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                this.view.showFileContextMenu(e, file, fileEl);
            });

            this.view.addHoverPreview(fileEl, file.path);
        }
    }
}