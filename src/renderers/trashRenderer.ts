import { App, normalizePath, Notice } from 'obsidian';

interface TrashItem {
    path: string;
    basename: string;
    kind: 'file' | 'folder';
    children?: TrashItem[];
}

export class TrashRenderer {
    private app: App;
    private container: HTMLElement;
    private items: TrashItem[] = [];
    private destroyed = false;

    constructor(app: App, container: HTMLElement) {
        this.app = app;
        this.container = container;
    }

    public destroy() {
        this.destroyed = true;
        this.container.empty();
    }

    async render() {
        this.container.empty();
        await this.loadTrashItems();

        if (this.destroyed) return;

        if (this.items.length === 0) {
            this.container.createEl('p', { text: 'Trash is empty.' });
            return;
        }

        // Bulk action buttons
        const btnRow = this.container.createDiv({ cls: 'trash-btn-row' });

        const restoreAllBtn = btnRow.createEl('button', {
            cls: 'side-portal-btn',
            text: 'Restore All'
        });
        const deleteAllBtn = btnRow.createEl('button', {
            cls: 'side-portal-btn-warn',
            text: 'Empty bin'
        });

        restoreAllBtn.addEventListener('click', () => this.restoreAll());
        deleteAllBtn.addEventListener('click', () => {
            if (confirm('Permanently delete ALL items in trash?')) {
                this.deleteAll();
            }
        });

        // Render tree
        const tree = this.container.createDiv({ cls: 'trash-tree' });
        this.renderTree(this.items, tree);
    }

    private async loadTrashItems() {
        this.items = [];
        const adapter = this.app.vault.adapter;
        const trashPath = '.trash';
        if (!(await adapter.exists(trashPath))) return;

        // Recursive list
        const listRecursive = async (dir: string): Promise<TrashItem[]> => {
            const result: TrashItem[] = [];
            const { files, folders } = await adapter.list(dir);
            for (const folder of folders) {
                const basename = folder.split('/').pop() || folder;
                const children = await listRecursive(folder);
                result.push({ path: folder, basename, kind: 'folder', children });
            }
            for (const file of files) {
                if (file.endsWith('.DS_Store')) continue; // skip macOS junk
                const basename = file.split('/').pop() || file;
                result.push({ path: file, basename, kind: 'file' });
            }
            return result;
        };

        this.items = await listRecursive(trashPath);
    }

    private renderTree(items: TrashItem[], parentEl: HTMLElement) {
        for (const item of items) {
            if (item.kind === 'folder') {
                const details = parentEl.createEl('details', { cls: 'folder-details' });
                const summary = details.createEl('summary', { cls: 'folder-summary' });
                summary.createSpan({ cls: 'folder-icon' }).createEl('i', { cls: 'ph ph-folder' });
                summary.createSpan({ text: item.basename, cls: 'portals-item-name' });
                const children = details.createDiv({ cls: 'folder-children' });
                if (item.children?.length) {
                    this.renderTree(item.children, children);
                }
                // Folder actions
                this.addItemActions(summary, item);
            } else {
                const fileEl = parentEl.createDiv({ cls: 'file-item' });
                fileEl.createSpan({ cls: 'file-icon' }).createEl('i', { cls: 'ph ph-file' });
                fileEl.createSpan({ text: item.basename, cls: 'portals-item-name' });
                this.addItemActions(fileEl, item);
            }
        }
    }

    private addItemActions(parentEl: HTMLElement, item: TrashItem) {
        const actionBar = parentEl.createDiv({ cls: 'trash-item-actions' });

        const restoreBtn = actionBar.createEl('button', { 
            cls: 'trash-action-btn',
            attr: { 'aria-label': 'Restore' }
        });
        restoreBtn.createEl('i', { cls: 'ph ph-arrow-counter-clockwise', title: 'Restore' });

        const deleteBtn = actionBar.createEl('button', { 
            cls: 'trash-delete-btn',
            attr: { 'aria-label': 'Delete' }
        });
        deleteBtn.createEl('i', { cls: 'ph ph-trash', title: 'Delete' });

        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.restoreItem(item);
        });
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Permanently delete ${item.basename}?`)) {
                this.deleteItem(item);
            }
        });
    }

    private async restoreItem(item: TrashItem): Promise<void> {
        const sourcePath = item.path;
        const targetPath = normalizePath(sourcePath.replace(/^\.trash\//, ''));

        if (item.kind === 'folder') {
            if (item.children) {
                for (const child of item.children) {
                    await this.restoreItem(child);
                }
            }

            if (!(await this.app.vault.adapter.exists(targetPath))) {
                // Ensure the parent directory of the target exists
                const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
                if (parentDir && !(await this.app.vault.adapter.exists(parentDir))) {
                    await this.app.vault.adapter.mkdir(parentDir);
                }
                await this.app.vault.adapter.mkdir(targetPath);
            }

            if (await this.app.vault.adapter.exists(sourcePath)) {
                await this.app.vault.adapter.rmdir(sourcePath, false);
            }

            new Notice(`Restored folder: ${item.basename}`);
        } else {
            if (await this.app.vault.adapter.exists(targetPath)) {
                new Notice(`Cannot restore: ${targetPath} already exists.`);
                return;
            }

            const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
            if (parentDir && !(await this.app.vault.adapter.exists(parentDir))) {
                await this.app.vault.adapter.mkdir(parentDir);
            }
            await this.app.vault.adapter.rename(sourcePath, targetPath);
            new Notice(`Restored ${item.basename}`);
        }
    }

    private async deleteItem(item: TrashItem) {
        try {
            await this.app.vault.adapter.remove(item.path);
            new Notice(`Deleted ${item.basename}`);
        } catch (e) {
            new Notice(`Failed to delete ${item.basename}`);
            console.error(e);
        }
        await this.render();
    }

    private async restoreAll() {
        let count = 0;
        for (const item of this.items) {
            try {
                await this.restoreItem(item);
                count++;
            } catch (e) {
                console.error(e);
            }
        }
        new Notice(`Restored ${count} items`);
        await this.render();
    }

    private async deleteAll() {
        let count = 0;
        const trashPath = '.trash';
        try {
            const removeRecursive = async (path: string) => {
                const { files, folders } = await this.app.vault.adapter.list(path);
                for (const file of files) {
                    await this.app.vault.adapter.remove(file);
                    count++;
                }
                for (const folder of folders) {
                    await removeRecursive(folder);
                    await this.app.vault.adapter.rmdir(folder, true);
                }
            };
            await removeRecursive(trashPath);
            new Notice(`Deleted all trash (${count} items)`);
        } catch (e) {
            new Notice('Failed to delete all trash.');
            console.error(e);
        }
        await this.render();
    }
}