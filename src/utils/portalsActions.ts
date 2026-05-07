import { App, TFile, TFolder, Notice, Modal, TAbstractFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { IconPickerModal } from './iconPicker';
import { ColorPickerModal, SelectFolderModal } from './modals';

// ====================================================================
// All vault‑operation helpers, customisation helpers, and rename helpers
// extracted from PortalsView to keep the view lean.
// ====================================================================

export class PortalsActions {

    // ──────── VAULT OPERATIONS ────────

    static async newNoteInFolder(app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder): Promise<void> {
        const defaultName = 'Untitled.md';
        const basePath = folder.path === '/' ? '' : folder.path;
        let candidate = basePath ? `${basePath}/${defaultName}` : defaultName;
        let counter = 1;
        while (app.vault.getAbstractFileByPath(candidate)) {
            candidate = basePath ? `${basePath}/Untitled ${counter}.md` : `Untitled ${counter}.md`;
            counter++;
        }
        try {
            const newFile = await app.vault.create(candidate, '');
            await app.workspace.getLeaf().openFile(newFile);

            if (!plugin.settings.openFolders.includes(folder.path)) {
                plugin.settings.openFolders.push(folder.path);
                await plugin.saveData(plugin.settings);
            }

            view.renderContent();
            view.triggerRenameOnPath(newFile.path);   // this method remains in view for now
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create note: ${message}`);
        }
    }

    static async newFolderInFolder(app: App, plugin: PortalsPlugin, view: PortalsView, parent: TFolder): Promise<void> {
        const defaultName = 'New Folder';
        const basePath = parent.path === '/' ? '' : parent.path;
        let candidate = basePath ? `${basePath}/${defaultName}` : defaultName;
        let counter = 1;
        while (app.vault.getAbstractFileByPath(candidate)) {
            candidate = basePath ? `${basePath}/New Folder ${counter}` : `New Folder ${counter}`;
            counter++;
        }
        try {
            await app.vault.createFolder(candidate);

            if (!plugin.settings.openFolders.includes(parent.path)) {
                plugin.settings.openFolders.push(parent.path);
                await plugin.saveData(plugin.settings);
            }

            view.renderContent();
            view.triggerRenameOnPath(candidate);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create folder: ${message}`);
        }
    }

    static async newCanvasInFolder(app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder): Promise<void> {
        const defaultName = 'Untitled.canvas';
        let candidate = `${folder.path}/${defaultName}`;
        let counter = 1;
        while (app.vault.getAbstractFileByPath(candidate)) {
            candidate = `${folder.path}/Untitled ${counter}.canvas`;
            counter++;
        }
        try {
            await app.vault.create(candidate, '{"nodes":[],"edges":[]}');
            new Notice('Canvas created');
            view.renderContent();
            view.triggerRenameOnPath(candidate);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create canvas: ${message}`);
        }
    }

    static async newNoteInTagSpace(app: App, plugin: PortalsPlugin, view: PortalsView, tagName: string, extraTags?: string[]): Promise<void> {
        const defaultName = 'Untitled.md';
        let candidate = defaultName;
        let counter = 1;
        while (app.vault.getAbstractFileByPath(candidate)) {
            candidate = `Untitled ${counter}.md`;
            counter++;
        }
        try {
            const newFile = await app.vault.create(candidate, '');
            // add the tags to frontmatter
            await app.fileManager.processFrontMatter(newFile, (frontmatter) => {
                const allTags = [tagName, ...(extraTags || [])];
                if (!frontmatter.tags) {
                    frontmatter.tags = allTags;
                } else if (Array.isArray(frontmatter.tags)) {
                    for (const t of allTags) {
                        if (!frontmatter.tags.includes(t)) {
                            frontmatter.tags.push(t);
                        }
                    }
                } else {
                    frontmatter.tags = [frontmatter.tags, ...allTags];
                }
            });
            await app.workspace.getLeaf().openFile(newFile);
            view.renderContent();
            view.triggerRenameOnPath(newFile.path);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create note: ${message}`);
        }
    }

    static async duplicateFile(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile): Promise<void> {
        const dir = file.parent?.path || '';
        const ext = file.extension;
        const baseName = file.basename;
        let newName = `${baseName} copy.${ext}`;
        let newPath = dir ? `${dir}/${newName}` : newName;
        let counter = 1;
        while (app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            newName = `${baseName} copy ${counter}.${ext}`;
            newPath = dir ? `${dir}/${newName}` : newName;
        }
        try {
            view.saveTreeScroll();                     // scroll saved numerically
            const savedScroll = view.scrollToRestore;
            await app.vault.copy(file, newPath);
            new Notice(`Duplicated to ${newName}`);
            // preserve the saved scroll across the render
            view.scrollToRestore = savedScroll;
            view.renderContent();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Duplicate failed: ${message}`);
        }
    }

    static async duplicateFolder(app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder): Promise<void> {
        const parent = folder.parent;
        const parentPath = parent ? parent.path : '';
        let newName = `${folder.name} copy`;
        let newPath = parentPath ? `${parentPath}/${newName}` : newName;
        let counter = 1;
        while (app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            newName = `${folder.name} copy ${counter}`;
            newPath = parentPath ? `${parentPath}/${newName}` : newName;
        }
        try {
            view.saveTreeScroll();
            const savedScroll = view.scrollToRestore;
            await app.vault.createFolder(newPath);
            await PortalsActions.copyFolderContents(app, folder, newPath);
            new Notice(`Folder duplicated to ${newName}`);
            view.scrollToRestore = savedScroll;
            view.renderContent();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Duplicate failed: ${message}`);
        }
    }

    private static async copyFolderContents(app: App, source: TFolder, destPath: string): Promise<void> {
        for (const child of source.children) {
            const childDestPath = `${destPath}/${child.name}`;
            if (child instanceof TFolder) {
                await app.vault.createFolder(childDestPath);
                await PortalsActions.copyFolderContents(app, child, childDestPath);
            } else if (child instanceof TFile) {
                await app.vault.copy(child, childDestPath);
            }
        }
    }

    static async deleteFile(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile): Promise<void> {
        view.saveTreeScroll();
        try {
            await app.fileManager.trashFile(file);
            delete plugin.settings.customIcons[file.path];
            await plugin.saveSettings();
            view.renderContent();
            new Notice(`File "${file.name}" deleted`, 2000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Delete failed: ${message}`, 3000);
        }
    }

    static async deleteFolder(
        app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder
    ): Promise<void> {
        view.saveTreeScroll();
        try {
            await app.fileManager.trashFile(folder);
            const toDelete = Object.keys(plugin.settings.customIcons).filter(
                path => path === folder.path || path.startsWith(folder.path + '/')
            );
            for (const path of toDelete) {
                delete plugin.settings.customIcons[path];
            }
            await plugin.saveSettings();
            new Notice(`Folder "${folder.name}" deleted`, 2000);
            view.renderContent();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Delete failed: ${message}`, 3000);
        }
    }

    static async deleteSelectedItems(app: App, plugin: PortalsPlugin, view: PortalsView): Promise<void> {
        if (view.selectedItems.size === 0) return;
        const confirmMsg = `Delete ${view.selectedItems.size} item(s) permanently?`;
        if (!confirm(confirmMsg)) return;

        view.cancelScheduledRender();
        const firstItemPath = view.selectedItems.values().next().value!;
        const item = app.vault.getAbstractFileByPath(firstItemPath);
        const parentFolderPath = item?.parent?.path;
        const parentEl = parentFolderPath
            ? view.containerEl.querySelector(`[data-path="${parentFolderPath}"]`) as HTMLElement
            : null;

        if (parentEl) {
            view.saveScrollWithAnchor(parentEl);
        } else {
            view.saveTreeScroll();
        }

        for (const path of view.selectedItems) {
            const item = app.vault.getAbstractFileByPath(path);
            if (!item) continue;
            try {
                await app.fileManager.trashFile(item);
                if (item instanceof TFile) {
                    delete plugin.settings.customIcons[path];
                } else if (item instanceof TFolder) {
                    const toDelete = Object.keys(plugin.settings.customIcons).filter(
                        p => p === path || p.startsWith(path + '/')
                    );
                    for (const iconPath of toDelete) {
                        delete plugin.settings.customIcons[iconPath];
                    }
                }
            } catch (err) {
                console.error(err);
                new Notice(`Failed to delete ${item.name}`);
            }
        }
        await plugin.saveSettings();
        const deletedCount = view.selectedItems.size;
        view.clearSelection();
        view.renderContent();
        new Notice(`Deleted ${deletedCount} item(s)`);
    }

    static async moveSelectedItemsToFolder(app: App, plugin: PortalsPlugin, view: PortalsView): Promise<void> {
        if (view.selectedItems.size === 0) return;
        view.cancelScheduledRender();
        const firstItemPath = view.selectedItems.values().next().value!;
        const item = app.vault.getAbstractFileByPath(firstItemPath);
        const parentFolderPath = item?.parent?.path;
        const parentEl = parentFolderPath
            ? view.containerEl.querySelector(`[data-path="${parentFolderPath}"]`) as HTMLElement
            : null;

        if (parentEl) {
            view.saveScrollWithAnchor(parentEl);
        } else {
            view.saveTreeScroll();
        }
        new SelectFolderModal(app, async (targetFolder) => {
            let movedCount = 0;
            for (const path of view.selectedItems) {
                const item = app.vault.getAbstractFileByPath(path);
                if (!item) continue;
                const newPath = `${targetFolder.path}/${item.name}`;
                if (app.vault.getAbstractFileByPath(newPath)) {
                    new Notice(`${item.name} already exists in destination, skipped.`);
                    continue;
                }
                try {
                    await app.vault.rename(item, newPath);
                    movedCount++;
                    if (plugin.settings.customIcons[path]) {
                        plugin.settings.customIcons[newPath] = plugin.settings.customIcons[path];
                        delete plugin.settings.customIcons[path];
                    }
                } catch (err) {
                    console.error(err);
                    new Notice(`Failed to move ${item.name}`);
                }
            }
            plugin.saveData(plugin.settings).then(() => {
                view.clearSelection();
                view.renderContent();
                new Notice(`Moved ${movedCount} item(s) to ${targetFolder.path}`);
            });
        }).open();
    }

    static async createFolderFromSelected(app: App, plugin: PortalsPlugin, view: PortalsView): Promise<void> {
        if (view.selectedItems.size === 0) return;
        view.cancelScheduledRender();
        const firstItemPath = view.selectedItems.values().next().value!;
        const item = app.vault.getAbstractFileByPath(firstItemPath);
        const parentFolderPath = item?.parent?.path;
        const parentEl = parentFolderPath
            ? view.containerEl.querySelector(`[data-path="${parentFolderPath}"]`) as HTMLElement
            : null;

        if (parentEl) {
            view.saveScrollWithAnchor(parentEl);
        } else {
            view.saveTreeScroll();
        }
        const parentFolder = PortalsActions.getCommonParentFolder(app, view);
        if (!parentFolder) {
            new Notice('Selected items are not in a common parent folder');
            return;
        }
        const folderName = await PortalsActions.promptForFolderName(app);
        if (!folderName) return;

        const newFolderPath = `${parentFolder.path}/${folderName}`;
        if (app.vault.getAbstractFileByPath(newFolderPath)) {
            new Notice('Folder already exists');
            return;
        }

        try {
            await app.vault.createFolder(newFolderPath);
            let movedCount = 0;
            for (const path of view.selectedItems) {
                const item = app.vault.getAbstractFileByPath(path);
                if (!item) continue;
                const newPath = `${newFolderPath}/${item.name}`;
                if (app.vault.getAbstractFileByPath(newPath)) {
                    new Notice(`${item.name} already exists in new folder, skipped.`);
                    continue;
                }
                await app.vault.rename(item, newPath);
                movedCount++;
                if (plugin.settings.customIcons[path]) {
                    plugin.settings.customIcons[newPath] = plugin.settings.customIcons[path];
                    delete plugin.settings.customIcons[path];
                }
            }
            await plugin.saveSettings();
            view.clearSelection();
            view.renderContent();
            new Notice(`Created folder "${folderName}" and moved ${movedCount} item(s)`);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to create folder: ${message}`);
        }
    }

    private static getCommonParentFolder(app: App, view: PortalsView): TFolder | null {
        let commonParent: TFolder | null = null;
        for (const path of view.selectedItems) {
            const item = app.vault.getAbstractFileByPath(path);
            if (!item) return null;
            let parent = item.parent;
            if (!parent && item instanceof TFolder && item.path === '/') {
                parent = item;
            }
            if (!commonParent) commonParent = parent;
            else if (commonParent !== parent) return null;
        }
        return commonParent;
    }

    private static promptForFolderName(app: App): Promise<string | null> {
        return new Promise((resolve) => {
            class FolderNameModal extends Modal {
                constructor(app: App) { super(app); }
                onOpen() {
                    const { contentEl } = this;
                    contentEl.createEl('h3', { text: 'Create new folder' });
                    const input = contentEl.createEl('input', { type: 'text', placeholder: 'Folder name', cls: 'portals-search-input' });
                    const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
                    const okBtn = buttonDiv.createEl('button', { text: 'Create', cls: 'mod-cta' });
                    const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
                    okBtn.addEventListener('click', () => {
                        const val = input.value.trim();
                        resolve(val || null);
                        this.close();
                    });
                    cancelBtn.addEventListener('click', () => { resolve(null); this.close(); });
                    input.focus();
                    input.select();
                }
                onClose() { this.contentEl.empty(); }
            }
            new FolderNameModal(app).open();
        });
    }

    // ──────── CUSTOMISATION HELPERS ────────

    static getCustomIcon(plugin: PortalsPlugin, path: string): string | null {
        return plugin.settings.customIcons[path] || null;
    }

    static async setCustomIcon(app: App, plugin: PortalsPlugin, view: PortalsView, path: string, displayName: string): Promise<void> {
        new IconPickerModal(app, (iconName) => {
            view.saveTreeScroll();
            plugin.settings.customIcons[path] = iconName;
            plugin.saveSettings().then(() => {
                view.render();
                new Notice(`Icon set for ${displayName}`);
            });
        }).open();
    }

    static async removeCustomIcon(app: App, plugin: PortalsPlugin, view: PortalsView, path: string): Promise<void> {
        view.saveTreeScroll();
        delete plugin.settings.customIcons[path];
        await plugin.saveSettings();
        view.render();
        new Notice('Custom icon removed');
    }

    static async setCustomIconForTagGroup(app: App, plugin: PortalsPlugin, view: PortalsView, mainTag: string, groupTag: string, groupKey: string): Promise<void> {
        const displayName = `#${groupTag}`;
        new IconPickerModal(app, (iconName) => {
            view.saveTreeScroll();
            plugin.settings.customIcons[groupKey] = iconName;
            plugin.saveSettings().then(() => {
                view.render();
                new Notice(`Icon set for group ${displayName}`);
            });
        }).open();
    }

    static async removeCustomIconForTagGroup(app: App, plugin: PortalsPlugin, view: PortalsView, groupKey: string): Promise<void> {
        view.saveTreeScroll();
        delete plugin.settings.customIcons[groupKey];
        await plugin.saveSettings();
        view.render();
        new Notice('Custom icon removed');
    }

    static setCustomColor(app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder, summaryEl: HTMLElement): void {
        const currentColor = plugin.settings.customColors[folder.path];
        view.saveTreeScroll();
        new ColorPickerModal(app, (color) => {
            plugin.settings.customColors[folder.path] = color;
            plugin.saveSettings().then(() => view.render());
        }, summaryEl, currentColor).open();
    }

    static setCustomColorForFile(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile, fileEl: HTMLElement): void {
        const currentColor = plugin.settings.customColors[file.path];
        view.saveTreeScroll();
        new ColorPickerModal(app, (color) => {
            plugin.settings.customColors[file.path] = color;
            plugin.saveSettings().then(() => view.render());
        }, fileEl, currentColor).open();
    }

    static resetCustomColorForFile(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile): void {
        view.saveTreeScroll();
        delete plugin.settings.customColors[file.path];
        plugin.saveSettings().then(() => view.render());
        new Notice('File color reset');
    }

    static resetCustomColor(app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder): void {
        view.saveTreeScroll();
        delete plugin.settings.customColors[folder.path];
        plugin.saveSettings().then(() => view.render());
    }

    static setTagColor(app: App, plugin: PortalsPlugin, view: PortalsView, key: string, targetElement: HTMLElement): void {
        const currentColor = plugin.settings.tagColors[key];
        view.saveTreeScroll();
        new ColorPickerModal(app, (color) => {
            plugin.settings.tagColors[key] = color;
            plugin.saveSettings().then(() => view.render());
        }, targetElement, currentColor).open();
    }

    static resetTagColor(app: App, plugin: PortalsPlugin, view: PortalsView, key: string, _targetElement: HTMLElement): void {
        view.saveTreeScroll();
        delete plugin.settings.tagColors[key];
        plugin.saveSettings().then(() => view.render());
    }

    // ──────── RENAME HELPERS ────────

    static createRenameInput(initialValue: string, onSave: (val: string) => void, onCancel: () => void): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = initialValue;
        input.addClass('portals-rename-input');

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSave(input.value); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        });
        return input;
    }

    static startRenameFile(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile, fileEl: HTMLElement): void {
        const nameSpan = fileEl.querySelector('.portals-item-name') as HTMLElement;
        if (!nameSpan) return;
        const isMd = file.extension === 'md';
        const hideExtension = plugin.settings.enableFileExtensionNonMD;
        const base = isMd ? file.basename : (hideExtension ? file.basename : file.name);

        const input = PortalsActions.createRenameInput(base, (newBase) => {
            (async () => {
                if (!newBase || newBase === base) return;
                let newName: string;
                if (isMd) newName = newBase + '.' + file.extension;
                else newName = hideExtension ? newBase + '.' + file.extension : newBase;
                const newPath = file.parent ? `${file.parent.path}/${newName}` : newName;
                view.saveTreeScroll();
                try {
                    await app.vault.rename(file, newPath);
                    new Notice('File renamed');
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Rename failed: ${message}`);
                } finally {
                    view.renaming = false;
                    document.removeEventListener('mousedown', outsideClickListener);
                    view._activeOutsideClickListener = null;
                    view.renderContent();
                }
            })().catch(err => console.error('Rename error:', err));
        }, () => {
            view.renaming = false;
            document.removeEventListener('mousedown', outsideClickListener);
            view._activeOutsideClickListener = null;
            view.renderContent();
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        view.renaming = true;

        const outsideClickListener = (e: MouseEvent) => {
            if (!input.contains(e.target as Node)) {
                document.removeEventListener('mousedown', outsideClickListener);
                view.renaming = false;
                view.renderContent();
            }
        };
        view._activeOutsideClickListener = outsideClickListener;
        document.addEventListener('mousedown', outsideClickListener);
    }

    static startRenameFolder(app: App, plugin: PortalsPlugin, view: PortalsView, folder: TFolder, summaryEl: HTMLElement): void {
        const nameSpan = summaryEl.querySelector('.portals-item-name') as HTMLElement;
        if (!nameSpan) return;

        const input = PortalsActions.createRenameInput(folder.name, (newName) => {
            (async () => {
                if (!newName || newName === folder.name) return;
                const parent = folder.parent?.path || '';
                const newPath = parent ? `${parent}/${newName}` : newName;
                view.saveTreeScroll();
                try {
                    await app.vault.rename(folder, newPath);
                    new Notice('Folder renamed');
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    new Notice(`Rename failed: ${message}`);
                } finally {
                    view.renaming = false;
                    document.removeEventListener('mousedown', outsideClickListener);
                    view._activeOutsideClickListener = null;
                    view.renderContent();
                }
            })().catch(err => console.error('Rename error:', err));
        }, () => {
            view.renaming = false;
            document.removeEventListener('mousedown', outsideClickListener);
            view._activeOutsideClickListener = null;
            view.renderContent();
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        view.renaming = true;

        const outsideClickListener = (e: MouseEvent) => {
            if (!input.contains(e.target as Node)) {
                document.removeEventListener('mousedown', outsideClickListener);
                view.renaming = false;
                view.renderContent();
            }
        };
        view._activeOutsideClickListener = outsideClickListener;
        document.addEventListener('mousedown', outsideClickListener);
    }

    // Vault‑rename event handler
    static handleRename(app: App, plugin: PortalsPlugin, view: PortalsView,file: TAbstractFile, oldPath: string): void {
        if (plugin.settings.customIcons[oldPath]) {
            const icon = plugin.settings.customIcons[oldPath]!;
            plugin.settings.customIcons[file.path] = icon;
            delete plugin.settings.customIcons[oldPath];
            void plugin.saveSettings();
        }

        if (file instanceof TFolder) {
            const openFolders = plugin.settings.openFolders;
            const index = openFolders.indexOf(oldPath);
            if (index !== -1) {
                openFolders[index] = file.path;
                void plugin.saveSettings();
            }
            if (plugin.settings.selectedSpace?.type === 'folder' &&
                plugin.settings.selectedSpace.path === oldPath) {
                plugin.settings.selectedSpace.path = file.path;
                void plugin.saveSettings();
            }
            view.scheduleRender();
            return;
        }

        if (!(file instanceof TFile)) {
            if (plugin.settings.customIcons[oldPath]) {
                const icon = plugin.settings.customIcons[oldPath]!;
                plugin.settings.customIcons[file.path] = icon;
                delete plugin.settings.customIcons[oldPath];
                void plugin.saveSettings();
            }
            view.scheduleRender();
            return;
        }

        const oldDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newDir = file.parent?.path || '';
        if (oldDir !== newDir) {
            view.scheduleRender();
            return;
        }
        const element = view.fileElementMap.get(oldPath);
        if (!element) {
            view.scheduleRender();
            return;
        }
        const nameSpan = element.querySelector('.portals-item-name') as HTMLElement;
        if (nameSpan) nameSpan.innerText = view.getDisplayName(file);
        element.dataset.path = file.path;
        view.fileElementMap.delete(oldPath);
        view.fileElementMap.set(file.path, element);
    }
}