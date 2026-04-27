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
    private pollInterval: number | null = null;
    private treeEl: HTMLElement | null = null;

    constructor(app: App, container: HTMLElement) {
        this.app = app;
        this.container = container;
    }

    public destroy() {
        this.destroyed = true;
        this.container.empty();
        this.stopPolling();
    }

    // =============== MAIN RENDER ======================

    async render() {
        this.container.empty();
        this.stopPolling();
        await this.loadTrashItems();

        if (this.destroyed) return;

        if (this.items.length === 0) {
            this.container.createEl('p', { cls: 'unhide-items-message', text: 'Trash is empty.' });
            this.startPolling();
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
            text: 'Empty all'
        });

        restoreAllBtn.addEventListener('click', () => this.restoreAll());
        deleteAllBtn.addEventListener('click', () => {
            if (confirm('Permanently delete ALL items in trash?')) {
                this.deleteAll();
            }
        });

        this.treeEl = this.container.createDiv({ cls: 'trash-tree' });
        this.renderTree(this.items, this.treeEl);
        this.startPolling();
    }

    // -============= FLAT LOADING =================================

    private async loadTrashItems() {
        this.items = [];
        const adapter = this.app.vault.adapter;
        const trashPath = '.trash';
        if (!(await adapter.exists(trashPath))) return;

        const { files, folders } = await adapter.list(trashPath);
            for (const folder of folders) {
                const basename = folder.split('/').pop() || folder;
                this.items.push({ path: folder, basename, kind: 'folder', children: [] });
            }
            for (const file of files) {
                if (file.endsWith('.DS_Store')) continue;
                const basename = file.split('/').pop() || file;
                this.items.push({ path: file, basename, kind: 'file' });
            }
    }

    // ==================== TREE RENDERING ====================

    private renderTree(items: TrashItem[], parentEl: HTMLElement) {
        for (const item of items) {
            if (item.kind === 'folder') {
                const details = parentEl.createEl('details', { cls: 'folder-details' });
                const summary = details.createEl('summary', { cls: 'folder-summary' });
                summary.createSpan({ cls: 'folder-icon' }).createEl('i', { cls: 'ph ph-folder' });
                summary.createSpan({ text: item.basename, cls: 'portals-item-name' });
                const childrenContainer = details.createDiv({ cls: 'folder-children' });

                // Lazy load children only when folder is opened for the first time
                details.addEventListener('toggle', async () => {
                    if (!details.open || item.children?.length) return;
                    try {
                        const { files, folders } = await this.app.vault.adapter.list(item.path);
                        const childItems: TrashItem[] = [];
                        for (const f of folders) {
                            childItems.push({ path: f, basename: f.split('/').pop() || f, kind: 'folder', children: [] });
                        }
                        for (const f of files) {
                            if (f.endsWith('.DS_Store')) continue;
                            childItems.push({ path: f, basename: f.split('/').pop() || f, kind: 'file' });
                        }
                        item.children = childItems;
                        childrenContainer.empty();
                        this.renderTree(childItems, childrenContainer);
                    } catch (e) {
                        console.error(e);
                    }
                });

                this.addItemActions(summary, item);
            } else {
                const fileEl = parentEl.createDiv({ cls: 'file-item' });
                fileEl.createSpan({ cls: 'file-icon' }).createEl('i', { cls: 'ph ph-file' });
                fileEl.createSpan({ text: item.basename, cls: 'portals-item-name' });
                this.addItemActions(fileEl, item);
            }
        }
    }

    // =================== ACTION BUTTONS ================================

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

    // ================ POLLING (tree only refresh) ==================================

    private startPolling() {
        if (this.pollInterval) return;
        this.pollInterval = window.setInterval(() => {
            if (this.destroyed) {
                this.stopPolling();
                return;
            }
            this.checkForChanges();
        }, 1000);
    }

    private stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    private async checkForChanges() {
        try {
            const adapter = this.app.vault.adapter;
            const trashPath = '.trash';
            if (!(await adapter.exists(trashPath))) {
                if (this.items.length > 0) {
                    this.items = [];
                    this.refreshTree();
                }
                return;
            }

            const { files, folders } = await adapter.list(trashPath);
            const newSnapshot = [...files, ...folders].sort().join(',');
            const currentSnapshot = this.items.map(i => i.path).sort().join(',');

            if (newSnapshot !== currentSnapshot) {
                await this.loadTrashItems(); 
                this.refreshTree();
            }
        } catch { /* silent */ }
    }

    // ================ TREE ONLY REFRESH =================================

    private refreshTree() {
        if (!this.treeEl) return;
        this.treeEl.empty();
        if (this.items.length === 0) {
            this.treeEl.createEl('p', { text: 'Trash is empty.' });
        } else {
            this.renderTree(this.items, this.treeEl);
        }
    }

    // ==================== ITEM OPERATIONS ====================

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
            if (item.kind === 'folder') {
                const removeRecursive = async (folderPath: string) => {
                    const { files, folders } = await this.app.vault.adapter.list(folderPath);
                    for (const file of files) {
                        await this.app.vault.adapter.remove(file);
                    }
                    for (const subFolder of folders) {
                        await removeRecursive(subFolder);
                        await this.app.vault.adapter.rmdir(subFolder, false);
                    }
                };
                await removeRecursive(item.path);
                await this.app.vault.adapter.rmdir(item.path, false);
                new Notice(`Deleted folder: ${item.basename}`);
            } else {
                await this.app.vault.adapter.remove(item.path);
                new Notice(`Deleted ${item.basename}`);
            }
        } catch (e) {
            new Notice(`Failed to delete ${item.basename}`);
            console.error(e);
        }
        await this.render();  // outdented – runs after both success and failure
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