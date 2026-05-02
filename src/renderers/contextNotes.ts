import { App, Component, MarkdownRenderer, Notice, TFile, TFolder, EventRef } from 'obsidian';
import type PortalsPlugin from '../main';

// ────────────────View interface (avoids circular import)────────────────────────────────────────────
export interface ContextNotesView {
    addChild(component: Component): void;
    removeChild(component: Component): void;
    addHoverPreview(el: HTMLElement, filePath: string): void;
}

// ====================================Helper Functions====================================

export function getContextNote(app: App, plugin: PortalsPlugin, target: TFolder | string): TFile | undefined {
    if (target instanceof TFolder) {
        if (target.path === '/') {
            const vaultName = app.vault.getName();
            const file = app.vault.getAbstractFileByPath(vaultName + '.md');
            return file instanceof TFile ? file : undefined;
        }
        return target.children.find(
            (child): child is TFile =>
                child instanceof TFile && isContextNote(app, plugin, child, target),
        );
    } else {
        const folderPath = plugin.settings.tagNotesFolderPath;
        const safeName = sanitizeTagForFilename(target) + '.md';
        const fullPath = folderPath ? `${folderPath}/${safeName}` : safeName;
        const file = app.vault.getAbstractFileByPath(fullPath);
        return file instanceof TFile ? file : undefined;
    }
}

export function isContextNoteFile(app: App, plugin: PortalsPlugin, file: TFile, target?: TFolder | string): boolean {
    if (!target) return false;
    return isContextNote(app, plugin, file, target);
}

export function resolveContextNote(app: App, plugin: PortalsPlugin, selectedSpace: { path: string; type: 'folder' | 'tag' } | null): TFile | null {
    if (!selectedSpace) return null;

    if (
        selectedSpace.type === 'folder' &&
        plugin.settings.contextNoteFollowActive !== 'off'
    ) {
        const activeFile = app.workspace.getActiveFile();
        if (activeFile?.parent) {
            let currentFolder: TFolder | null = activeFile.parent;
            while (currentFolder) {
                const note = getContextNote(app, plugin, currentFolder);
                if (note) return note;
                currentFolder = currentFolder.parent;
            }
        }
    }

    if (selectedSpace.type === 'folder') {
        const folder = app.vault.getAbstractFileByPath(selectedSpace.path);
        return folder instanceof TFolder ? getContextNote(app, plugin, folder) ?? null : null;
    } else {
        return getContextNote(app, plugin, selectedSpace.path) ?? null;
    }
}

export function isContextNote(app: App, plugin: PortalsPlugin, file: TFile, target: TFolder | string): boolean {
    if (target instanceof TFolder) {
        if (target.path === '/') {
            return (
                file.extension === 'md' &&
                file.name.toLowerCase() === (app.vault.getName() + '.md').toLowerCase() &&
                file.parent?.path === '/'
            );
        } else {
            return (
                file.extension === 'md' &&
                file.name.toLowerCase() === (target.name + '.md').toLowerCase() &&
                file.parent?.path === target.path
            );
        }
    } else {
        const folderPath = plugin.settings.tagNotesFolderPath;
        const expectedParent = folderPath || '';
        if (file.parent?.path !== expectedParent) return false;

        const cache = app.metadataCache.getFileCache(file);
        const tags = cache?.frontmatter?.tags;
        const hasTag = Array.isArray(tags) ? tags.includes(target) : tags === target;
        const safeName = sanitizeTagForFilename(target);
        return hasTag && file.basename === safeName && file.extension === 'md';
    }
}

export function hasContextNote(app: App, plugin: PortalsPlugin, target: TFolder | string): boolean {
    if (target instanceof TFolder) {
        return target.children.some(
            (child) => child instanceof TFile && isContextNote(app, plugin, child, target),
        );
    } else {
        return getContextNote(app, plugin, target) !== undefined;
    }
}

export async function createContextNote(app: App, plugin: PortalsPlugin, target: TFolder | string): Promise<TFile> {
    if (target instanceof TFolder) {
        let noteName: string;
        let notePath: string;
        let displayName: string;

        if (target.path === '/') {
            const vaultName = app.vault.getName();
            noteName = vaultName + '.md';
            notePath = noteName;
            displayName = vaultName;
        } else {
            noteName = target.name + '.md';
            notePath = `${target.path}/${noteName}`;
            displayName = target.name;
        }

        try {
            const file = await app.vault.create(notePath, `# ${displayName}\n\n`);
            await app.workspace.getLeaf().openFile(file);
            new Notice('Context note created.');
            return file;
        } catch (err) {
            const existing = app.vault.getAbstractFileByPath(notePath);
            if (existing instanceof TFile) {
                new Notice('Context note already exists. Opening it.');
                await app.workspace.getLeaf().openFile(existing);
                return existing;
            }
            throw err;
        }
    } else {
        const folderPath = plugin.settings.tagNotesFolderPath;
        if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
            await app.vault.createFolder(folderPath);
        }

        const safeName = sanitizeTagForFilename(target);
        const filePath = folderPath ? `${folderPath}/${safeName}.md` : `${safeName}.md`;

        try {
            const file = await app.vault.create(filePath, `# ${target}\n\n`);
            await app.fileManager.processFrontMatter(file, (fm) => {
                if (!fm.tags) {
                    fm.tags = [target];
                } else if (Array.isArray(fm.tags)) {
                    if (!fm.tags.includes(target)) fm.tags.push(target);
                } else {
                    fm.tags = [fm.tags, target];
                }
            });
            await app.workspace.getLeaf().openFile(file);
            new Notice('Tag note created.');
            return file;
        } catch (err) {
            const existing = app.vault.getAbstractFileByPath(filePath);
            if (existing instanceof TFile) {
                new Notice('Tag note already exists. Opening it.');
                await app.workspace.getLeaf().openFile(existing);
                return existing;
            }
            throw err;
        }
    }
}

export async function handleContextNoteCreation(app: App, plugin: PortalsPlugin, target: TFolder | string): Promise<void> {
    const existing = getContextNote(app, plugin, target);
    if (existing) {
        await app.workspace.getLeaf().openFile(existing);
    } else {
        await createContextNote(app, plugin, target);
    }
}

export function sanitizeTagForFilename(tag: string): string {
    let safe = tag.replace(/[\\:*?"<>|]/g, '-');
    safe = safe.replace(/\//g, '--');
    safe = safe.trim().replace(/^\.+|\.+$/g, '');
    return safe || 'untitled-tag';
}

// ==================HOVER PREVIEW ELEMENT CLASS ===============================

interface HoverPreviewElement extends HTMLElement {
    __portalsHoverPreview?: boolean;
}

// =======================RENDERER CLASS =====================================================

export class ContextNotesRenderer {
    private readonly MAX_CACHE_SIZE = 20;

    private readonly app: App;
    private readonly plugin: PortalsPlugin;
    private readonly view: ContextNotesView; 
    private container: HTMLElement;
    private readonly cache = new Map<string, { element: HTMLElement; component: Component }>();
    private readonly cacheOrder: string[] = [];
    private scrollCache = new Map<string, number>();
    private linkObserver: MutationObserver | null = null;
    private eventRefs: EventRef[] = [];
    private destroyed = false;
    private currentNotePath: string | null = null;

    constructor(app: App, plugin: PortalsPlugin, view: ContextNotesView, container: HTMLElement, scrollCache: Map<string, number>) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
        this.container = container;
        this.scrollCache = scrollCache;
    }

    // =====================================PUBLIC API====================================

    public saveScroll(overridePath?: string): void {
        const prevNotePath = overridePath ?? resolveContextNote(this.app, this.plugin, this.plugin.settings.selectedSpace)?.path;
        if (!prevNotePath) return;
        const noteContainer = this.container.querySelector('.portals-context-note-container') as HTMLElement | null;
        if (noteContainer) {
            const scroll = noteContainer.scrollTop
            this.scrollCache.set(prevNotePath, scroll);
        }
    }

    public getCurrentNotePath(): string | null {
        return this.currentNotePath;
    }

    public setContainer(container: HTMLElement): void {
        this.container = container;
    }

    public async render(): Promise<void> {
        this.destroyed = false;
        this.container.empty();

        const targetFile = resolveContextNote(this.app, this.plugin, this.plugin.settings.selectedSpace);
        if (!targetFile) {
            this.showMessage('No context note found for the current space.');
            return;
        }

        this.ensureContextNoteOverlay(this.container, targetFile);
        await this.renderNote(targetFile);
        this.watchForInternalLinks(this.container, targetFile.path);
        this.registerVaultEvents();
    }

    public destroy(): void {
        this.destroyed = true;

        if (this.linkObserver) {
            this.linkObserver.disconnect();
            this.linkObserver = null;
        }

        for (const ref of this.eventRefs) {
            this.app.vault.offref(ref);
        }
        this.eventRefs = [];

        this.cache.clear();
        this.cacheOrder.length = 0;
        this.currentNotePath = null;
        this.container.empty();
    }

    public invalidateCache(file: TFile): void {
        const entry = this.cache.get(file.path);
        if (entry) {
            this.view.removeChild(entry.component);
            this.cache.delete(file.path);
            const idx = this.cacheOrder.indexOf(file.path);
            if (idx !== -1) this.cacheOrder.splice(idx, 1);
        }
    }

    // =================================PRIVATE HELPERS ===================================

    private showMessage(text: string): void {
        this.container.createEl('p', {
            cls: 'portals-context-note-message',
            text,
        });
    }

    private async renderNote(targetFile: TFile): Promise<void> {
        const path = targetFile.path;
        this.currentNotePath = targetFile.path;

        // --- Cache hit ---
        const cached = this.cache.get(path);
        if (cached) {
            const idx = this.cacheOrder.indexOf(path);
            if (idx !== -1) this.cacheOrder.splice(idx, 1);
            this.cacheOrder.push(path);

            this.container.appendChild(cached.element);
            const savedScroll = this.scrollCache.get(targetFile.path);
            if (savedScroll !== undefined) {
                requestAnimationFrame(() => {
                    cached.element.scrollTop = savedScroll;
                });
            }
            return;
        }

        // --- Cache miss: render from scratch ---
        const noteContainer = document.createElement('div');
        noteContainer.addClasses(['markdown-preview-view', 'portals-context-note-container']);

        try {
            const content = await this.app.vault.read(targetFile);
            const component = new Component();
            this.view.addChild(component);

            await MarkdownRenderer.render(this.app, content, noteContainer, targetFile.path, component);
            await this.processEmbeds(noteContainer, component, targetFile.path);

            noteContainer.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const link = target.closest('a');
                if (!link) return;
                const href = link.getAttribute('href') || link.getAttribute('data-href');
                if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
                    e.preventDefault();
                    const resolved = this.app.metadataCache.getFirstLinkpathDest(href, targetFile.path);
                    if (resolved instanceof TFile) {
                        void this.app.workspace.getLeaf().openFile(resolved);
                    }
                }
            });

            noteContainer.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('a')) return;
                void this.app.workspace.getLeaf().openFile(targetFile);
            });

            this.cache.set(path, { element: noteContainer, component });
            this.cacheOrder.push(path);

            if (this.cache.size > this.MAX_CACHE_SIZE) {
                const oldest = this.cacheOrder.shift()!;
                const evicted = this.cache.get(oldest);
                if (evicted) {
                    this.view.removeChild(evicted.component);
                    this.cache.delete(oldest);
                }
            }
        } catch (err) {
            console.error('Error rendering context note:', err);
            noteContainer.setText('Error rendering note.');
        }
        this.container.appendChild(noteContainer);
        const savedScroll = this.scrollCache.get(targetFile.path);
        if (savedScroll !== undefined) {
            requestAnimationFrame(() => {
                noteContainer.scrollTop = savedScroll;
            });
        }
    }

    private ensureContextNoteOverlay(container: HTMLElement, currentNote: TFile): void {
        const old = container.querySelector('.portals-context-note-status-overlay');
        if (old) old.remove();

        if (this.plugin.settings.contextNoteFollowActive !== 'on-status' ||
            this.plugin.settings.selectedSpace?.type !== 'folder') {
            return;
        }

        const overlay = container.createDiv({ cls: 'portals-context-note-status-overlay' });
        
        let portalNote: TFile | null = null;
        const space = this.plugin.settings.selectedSpace;
        if (space) {
            if (space.type === 'folder') {
                const folder = this.app.vault.getAbstractFileByPath(space.path);
                if (folder instanceof TFile === false && folder) {
                    portalNote = getContextNote(this.app, this.plugin, space.path) ?? null;
                }
            } else {
                portalNote = getContextNote(this.app, this.plugin, space.path) ?? null;
            }
        }

        const text = (portalNote && currentNote.path === portalNote.path)
            ? `Fallback ➜ ${currentNote.basename} portal`
            : `Following ➜ ${currentNote.basename}`;

        overlay.createSpan({
            cls: 'portals-context-note-status-overlay-text',
            text,
        });
        
    }

    private watchForInternalLinks(container: HTMLElement, sourcePath: string): void {
        if (this.linkObserver) {
            this.linkObserver.disconnect();
            this.linkObserver = null;
        }

        const attachToLinks = (parent: HTMLElement) => {
            const links = parent.querySelectorAll('a.internal-link');
            links.forEach((link) => {
                if ((link as HoverPreviewElement).__portalsHoverPreview) return;
                const href = link.getAttribute('data-href') || link.getAttribute('href');
                if (!href || (link as HoverPreviewElement).__portalsHoverPreview) return;
                const cleanHref = href.split('#')[0];
                if (!cleanHref) return;

                const resolved = this.app.metadataCache.getFirstLinkpathDest(cleanHref, sourcePath);
                if (resolved instanceof TFile) {
                    (link as HoverPreviewElement).__portalsHoverPreview = true;
                    this.view.addHoverPreview(link as HTMLElement, resolved.path);
                }
            });
        };

        attachToLinks(container);

        this.linkObserver = new MutationObserver((mutations) => {
            for (const mut of mutations) {
                if (mut.type === 'childList') {
                    for (const node of Array.from(mut.addedNodes)) {
                        if (node instanceof HTMLElement) {
                            if (node.matches('a.internal-link')) {
                                const href = node.getAttribute('data-href') || node.getAttribute('href');
                                if (href) {
                                    const cleanHref = href.split('#')[0] || '';
                                    if (cleanHref) {
                                        const resolved = this.app.metadataCache.getFirstLinkpathDest(cleanHref, sourcePath);
                                        if (resolved instanceof TFile && !(node as HoverPreviewElement).__portalsHoverPreview) {
                                            (node as HoverPreviewElement).__portalsHoverPreview = true;
                                            this.view.addHoverPreview(node, resolved.path);
                                        }
                                    }
                                }
                            }
                            attachToLinks(node);
                        }
                    }
                }
            }
        });
        this.linkObserver.observe(container, { childList: true, subtree: true });
    }

    // =============================EMBED PROCESSING=====================================

    private async processEmbeds(container: HTMLElement, component: Component, sourcePath: string, depth = 0): Promise<void> { 
        if (depth > 5) return;

        const embeds = container.querySelectorAll('.internal-embed:not(.processed)');
        for (const embed of Array.from(embeds)) {
            embed.classList.add('processed');
            const src = embed.getAttribute('src') || embed.getAttribute('data-src');
            if (!src) continue;

            const cleanSrc = src.split('#')[0];
            if (!cleanSrc) continue;

            const targetFile = this.app.metadataCache.getFirstLinkpathDest(cleanSrc, sourcePath);
            if (!(targetFile instanceof TFile)) continue;

            if (targetFile.extension === 'md') {
                const embedContainer = container.createDiv({ cls: 'markdown-preview-view' });
                embedContainer.setAttr('data-source-path', targetFile.path);
                const content = await this.app.vault.read(targetFile);
                const childComponent = new Component();
                this.view.addChild(childComponent);
                component.addChild(childComponent);
                await MarkdownRenderer.render(this.app, content, embedContainer, targetFile.path, childComponent);
                await this.processEmbeds(embedContainer, childComponent, targetFile.path, depth + 1);
                embed.replaceWith(embedContainer);
            } else {
                const linkContainer = container.createDiv({ cls: 'portals-embed-link' });
                const link = linkContainer.createEl('a', { href: '#' });
                link.setText(targetFile.name);
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    void this.app.workspace.getLeaf().openFile(targetFile);
                });
                embed.replaceWith(linkContainer);
            }
        }
    }

    private registerVaultEvents(): void {
        if (this.eventRefs.length > 0) return;

        const currentNotePath = () =>
            resolveContextNote(this.app, this.plugin, this.plugin.settings.selectedSpace)?.path;

        const modifyRef = this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && file.path === currentNotePath()) {
                this.invalidateCache(file);
                this.render();
            }
        });

        const renameRef = this.app.vault.on('rename', (file, oldPath) => {
            const curPath = currentNotePath();
            if (curPath && (file.path === curPath || oldPath === curPath)) {
                this.render();
            }
        });

        const deleteRef = this.app.vault.on('delete', (file) => {
            const curPath = currentNotePath();
            if (curPath && file.path === curPath) {
                this.render();
            }
        });

        const fileOpenRef = this.app.workspace.on('file-open', () => {
            if (!this.destroyed) this.render();
        });

        this.eventRefs.push(modifyRef, renameRef, deleteRef, fileOpenRef);
    }
}