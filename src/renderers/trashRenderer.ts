import { App, normalizePath, Notice, Platform } from 'obsidian';
import { PortalsView } from '../view';

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
    private loadId = 0;
    private view: PortalsView;

    constructor(app: App, container: HTMLElement, view: PortalsView) {
        this.app = app;
        this.container = container;
        this.view = view;
    }

    public destroy() {
        this.destroyed = true;
        this.stopPolling();
        this.container.empty();
    }

    // =============== MAIN RENDER (instant + guarded) ======================

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
        // ═══════════════════ Synchronous part → visible immediately ══════════
        this.stopPolling();
        this.container.empty();

        // Buttons row – appears instantly
        const btnRow = this.container.createDiv({ cls: 'trash-btn-row' });
        const restoreAllBtn = btnRow.createEl('button', {
            cls: 'side-portal-btn', text: 'Restore All'
        });
        const deleteAllBtn = btnRow.createEl('button', {
            cls: 'side-portal-btn-warn', text: 'Empty all'
        });
        restoreAllBtn.addEventListener('click', () => this.restoreAll());
        deleteAllBtn.addEventListener('click', () => {
            if (confirm('Permanently delete ALL items in trash?')) this.deleteAll();
        });

        // Empty tree area – will be filled asynchronously
        const treeContainer = this.container.createDiv({ cls: 'trash-tree' });

        // ═══════════════════ Asynchronous load → fills the tree ══════════════
        const id = ++this.loadId;
        const items = await this.loadTopLevelItems();
        if (this.destroyed || id !== this.loadId) return;

        this.items = items;
        treeContainer.empty();               // clear the empty placeholder

        if (items.length === 0) {
            treeContainer.createEl('p', {
                cls: 'unhide-items-message',
                text: 'Trash is empty.'
            });
            this.lastSnapshot = '';
            this.startPolling();
            return;
        }

        // Render the tree with lazy‑loaded subfolders
        this.renderTree(items, treeContainer)

        // ── Background full snapshot → enables accurate polling ──
        this.buildFullSnapshot().then(snapshot => {
            if (this.destroyed || id !== this.loadId) return;
            this.lastSnapshot = snapshot;
            if (!this.pollInterval) this.startPolling();
        });
    }

    // ────────── Top‑level listing (only root of .trash, fast) ──────────
    private async loadTopLevelItems(): Promise<TrashItem[]> {
        const adapter = this.app.vault.adapter;
        const trashPath = '.trash';
        if (!(await adapter.exists(trashPath))) return [];

        const { files, folders } = await adapter.list(trashPath);
        const items: TrashItem[] = [];
        for (const folder of folders) {
            items.push({
                path: folder,
                basename: folder.split('/').pop() || folder,
                kind: 'folder',
                children: undefined,          // will be lazy‑loaded on expand
            });
        }
        for (const file of files) {
            if (file.endsWith('.DS_Store')) continue;
            items.push({
                path: file,
                basename: file.split('/').pop() || file,
                kind: 'file',
            });
        }
        return items;
    }

    // ────────── Tree rendering with lazy children ──────────
    private renderTree(items: TrashItem[], parentEl: HTMLElement) {
        for (const item of items) {
            if (item.kind === 'folder') {
                const details = parentEl.createEl('details', { cls: 'folder-details' });
                details.open = false;                            // collapsed by default
                const summary = details.createEl('summary', { cls: 'folder-summary' });
                summary.createSpan({ cls: 'folder-icon' }).createEl('i', { cls: 'ph ph-folder' });
                summary.createSpan({ text: item.basename, cls: 'portals-item-name' });

                const childrenContainer = details.createDiv({ cls: 'folder-children' });

                // Load children on first expand
                details.addEventListener('toggle', async () => {
                    if (!details.open || item.children !== undefined) return;
                    try {
                        const adapter = this.app.vault.adapter;
                        const { files, folders } = await adapter.list(item.path);
                        const children: TrashItem[] = [];
                        for (const f of folders) {
                            children.push({
                                path: f,
                                basename: f.split('/').pop() || f,
                                kind: 'folder',
                                children: undefined,
                            });
                        }
                        for (const f of files) {
                            if (f.endsWith('.DS_Store')) continue;
                            children.push({
                                path: f,
                                basename: f.split('/').pop() || f,
                                kind: 'file',
                            });
                        }
                        item.children = children;
                        childrenContainer.empty();
                        this.renderTree(children, childrenContainer);
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

    // ────────── Action buttons (restore/delete) ──────────
    private addItemActions(parentEl: HTMLElement, item: TrashItem) {
        const actionBar = parentEl.createDiv({ cls: 'trash-item-actions' });

        const restoreBtn = actionBar.createEl('button', { cls: 'trash-action-btn' });
        if (!Platform.isMobile) {
            this.view.attachTooltip(restoreBtn, 'Restore', 300, 'left')
        }
        restoreBtn.createEl('i', { cls: 'ph ph-arrow-counter-clockwise' });

        const deleteBtn = actionBar.createEl('button', { cls: 'trash-delete-btn' });
        if (!Platform.isMobile) {
            this.view.attachTooltip(deleteBtn, 'Delete item', 300, 'right');
        }
            deleteBtn.createEl('i', { cls: 'ph ph-trash' });

        restoreBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.restoreItem(item);
            await this.render();          // full refresh after restore
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

            const newSnapshot = await this.buildFullSnapshot();
            if (newSnapshot !== this.lastSnapshot) {
                await this.render();
            }
        } catch { /* ignore */ }
    }

    // ────────── Full recursive snapshot (for accurate polling) ──────────
    private async buildFullSnapshot(): Promise<string> {
        const adapter = this.app.vault.adapter;
        const trashPath = '.trash';
        if (!(await adapter.exists(trashPath))) return '';

        const paths: string[] = [];
        const collect = async (dir: string) => {
            const { files, folders } = await adapter.list(dir);
            paths.push(...files, ...folders);
            for (const sub of folders) {
                await collect(sub);
            }
        };
        await collect(trashPath);
        return paths.sort().join(',');
    }

    // ────────── Restore: item → vault root, auto copy‑numbering ──────────
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

    // Helper: delete empty parent directories in .trash after a move
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