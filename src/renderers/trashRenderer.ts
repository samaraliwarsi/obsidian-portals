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
    private lastSnapshot = '';
    private rendering = false;

    constructor(app: App, container: HTMLElement) {
        this.app = app;
        this.container = container;
    }

    public destroy() {
        this.destroyed = true;
        this.stopPolling();
        this.container.empty();
    }

    // =============== MAIN RENDER ======================

    async render() {
        if (this.rendering) return;
        this.rendering = true;
        try {
            await this.actualRender();
        } finally {
            this.rendering = false;
        }
    }

    private async actualRender() {
        this.container.empty();
        this.stopPolling();
        console.time('trash load');
        this.items = await this.loadAllItems();
        console.timeEnd('trash load');

        if (this.destroyed) return;

        this.lastSnapshot = this.buildSnapshot(this.items);


        if (this.items.length === 0) {
            this.container.createEl('p', { cls: 'unhide-items-message', text: 'Trash is empty.' });
            this.startPolling();
            return;
        }

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

        const tree = this.container.createDiv({ cls: 'trash-tree' });
        this.renderTree(this.items, tree);

        this.startPolling();
    }

    // ────────── Recursive load (eager, simple) ──────────
    private async loadAllItems(): Promise<TrashItem[]> {
        const adapter = this.app.vault.adapter;
        const trashPath = '.trash';
        if (!(await adapter.exists(trashPath))) return [];

        const buildTree = async (dir: string): Promise<TrashItem[]> => {
            const { files, folders } = await adapter.list(dir);
            const children: TrashItem[] = [];

            for (const folder of folders) {
                children.push({
                    path: folder,
                    basename: folder.split('/').pop() || folder,
                    kind: 'folder',
                    children: await buildTree(folder),
                });
            }
            for (const file of files) {
                if (file.endsWith('.DS_Store')) continue;
                children.push({
                    path: file,
                    basename: file.split('/').pop() || file,
                    kind: 'file',
                });
            }
            return children;
        };

        return buildTree(trashPath);
    }

    // ────────── Tree rendering (no restrictions) ──────────
    private renderTree(items: TrashItem[], parentEl: HTMLElement) {
        for (const item of items) {
            if (item.kind === 'folder') {
                const details = parentEl.createEl('details', { cls: 'folder-details' });
                details.open = true;
                const summary = details.createEl('summary', { cls: 'folder-summary' });
                summary.createSpan({ cls: 'folder-icon' }).createEl('i', { cls: 'ph ph-folder' });
                summary.createSpan({ text: item.basename, cls: 'portals-item-name' });

                const childrenContainer = details.createDiv({ cls: 'folder-children' });
                if (item.children?.length) {
                    this.renderTree(item.children, childrenContainer);
                }

                this.addItemActions(summary, item);
            } else {
                const fileEl = parentEl.createDiv({ cls: 'file-item' });
                fileEl.createSpan({ cls: 'file-icon' }).createEl('i', { cls: 'ph ph-file' });
                fileEl.createSpan({ text: item.basename, cls: 'portals-item-name' });

                this.addItemActions(fileEl, item);
            }
        }
    }

    // ────────── Action buttons (restore/delete) ──────────
    private addItemActions(parentEl: HTMLElement, item: TrashItem) {
        const actionBar = parentEl.createDiv({ cls: 'trash-item-actions' });

        const restoreBtn = actionBar.createEl('button', {
            cls: 'trash-action-btn',
            attr: { 'aria-label': 'Restore' }
        });
        restoreBtn.createEl('i', { cls: 'ph ph-arrow-counter-clockwise', title: 'Restore' });

        const deleteBtn = actionBar.createEl('button', {
            cls: 'trash-delete-btn',
            attr: { 'aria-label': 'Delete permanently' }
        });
        deleteBtn.createEl('i', { cls: 'ph ph-trash', title: 'Delete permanently' });

        restoreBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.restoreItem(item);
            await this.render();
        });

        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Permanently delete ${item.basename}?`)) {
                await this.deleteItem(item);
                await this.render();
            }
        });
    }

    // ────────── Polling with full snapshot comparison ──────────
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
                    await this.render();
                }
                return;
            }

            const freshItems = await this.loadAllItems();
            const newSnapshot = this.buildSnapshot(freshItems);
            if (newSnapshot !== this.lastSnapshot) {
                await this.render();
            }
        } catch { /* ignore */ }
    }

    private buildSnapshot(items: TrashItem[]): string {
        const paths: string[] = [];
        const collect = (list: TrashItem[]) => {
            for (const item of list) {
                paths.push(item.path);
                if (item.children) collect(item.children);
            }
        };
        collect(items);
        return paths.sort().join(',');
    }

    // ────────── Restore: item → vault root, copy-numbering if needed ──────────
    private async restoreItem(item: TrashItem): Promise<void> {
        const basename = item.path.split('/').pop()!;
        let targetPath = normalizePath(basename);

        const stem = item.kind === 'file'
            ? basename.replace(/\.[^.]+$/, '')
            : basename;
        const ext = item.kind === 'file'
            ? basename.slice(stem.length)
            : '';
        let counter = 1;
        while (await this.app.vault.adapter.exists(targetPath)) {
            targetPath = item.kind === 'file'
                ? normalizePath(`${stem} copy ${counter}${ext}`)
                : normalizePath(`${stem} copy ${counter}`);
            counter++;
        }

        await this.app.vault.adapter.rename(item.path, targetPath);

        await this.cleanEmptyTrashParents(item.path);

        new Notice(`Restored ${basename}`);
    }

    private async cleanEmptyTrashParents(trashPath: string) {
        let parent = trashPath.substring(0, trashPath.lastIndexOf('/'));
        while (parent && parent !== '.trash') {
            if (!(await this.app.vault.adapter.exists(parent))) return;
            const { files, folders } = await this.app.vault.adapter.list(parent);
            if (files.length === 0 && folders.length === 0) {
                await this.app.vault.adapter.rmdir(parent, false);
                parent = parent.substring(0, parent.lastIndexOf('/'));
            } else {
                break;
            }
        }
    }

    // ────────── Delete (recursive for folders) ──────────
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
    }

    // ────────── Bulk operations ──────────
    private async restoreAll() {
        if (this.items.length === 0) {
            new Notice('Trash is empty.');
            return;
        }
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