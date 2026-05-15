import { App, TFile, TFolder, Menu } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import type { BookmarkItem, InternalPluginsWithBookmarks, PublicBookmarksAPI } from '../types';

export class BookmarksRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;
    private container: HTMLElement | null = null;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView, private refresh: () => void) {
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
        contentEl.addClass('bookmarks-tree');

        let items: BookmarkItem[] = [];
        let usePublic = false;

        // Public API if available
        // @ts-expect-error - bookmarks is not in public App type
        const publicBookmarks = this.app.bookmarks as unknown as PublicBookmarksAPI | undefined;
        if (publicBookmarks) {
            if (typeof publicBookmarks.getBookmarks === 'function') {
                items = publicBookmarks.getBookmarks();
                usePublic = true;
            } else if (Array.isArray(publicBookmarks.items)) {
                items = publicBookmarks.items;
                usePublic = true;
            }
        }

        // internal API fallback 
        if (!usePublic || items.length === 0) {
            // @ts-expect-error - accessing internal plugin API
            const internalPlugins = this.app.internalPlugins as unknown as InternalPluginsWithBookmarks | undefined;
            const bookmarksPlugin = internalPlugins?.getPluginById('bookmarks');
            if (!bookmarksPlugin?.enabled || !bookmarksPlugin.instance) {
                contentEl.createEl('p', {
                    text: 'The bookmarks core plugin is not enabled. Settings → core plugins.'
                });
                return;
            }
            const pluginItems = bookmarksPlugin.instance.items;
            if (!pluginItems || !Array.isArray(pluginItems)) {
                contentEl.createEl('p', { text: 'No bookmarks found.' });
                return;
            }
            items = pluginItems;
        }

        if (items.length === 0) {
            contentEl.createEl('p', { text: 'No bookmarks found.' });
            return;
        }

        // Recursive render function
        const renderItem = (item: BookmarkItem, container: HTMLElement) => {
            const isFolder = (item.children && Array.isArray(item.children) && item.children.length > 0) ||
                             item.type === 'group' || item.type === 'folder';

            if (isFolder) {
                const details = container.createEl('details', { cls: 'folder-details' });
                details.setAttr('open', 'true');
                const summary = details.createEl('summary', { cls: 'folder-summary' });
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                iconSpan.createEl('i', { cls: 'ph ph-folder' });
                const nameSpan = summary.createSpan({ text: item.title || 'Group' });
                nameSpan.addClass('portals-item-name');

                summary.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const menu = new Menu();
                    menu.addItem(menuItem => menuItem
                        .setTitle('Delete group')
                        .setIcon('trash')
                        .onClick(() => this.deleteBookmarkItem(item, usePublic, this.refresh))
                    );
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                });

                const childrenContainer = details.createDiv({ cls: 'folder-children' });
                const children = item.children || (item as { items?: BookmarkItem[] }).items || [];
                children.forEach((child: BookmarkItem) => renderItem(child, childrenContainer));
            } else {
                const fileEl = container.createDiv({ cls: 'file-item' });
                const iconSpan = fileEl.createSpan({ cls: 'file-icon' });

                let iconClass = 'ph-file';
                if (item.type === 'url') iconClass = 'ph-link';
                else if (item.type === 'folder') iconClass = 'ph-folder';
                else if (item.type === 'file') iconClass = 'ph-file';
                else if (item.url) iconClass = 'ph-link';
                else if (item.path) {
                    const abstractFile = this.app.vault.getAbstractFileByPath(item.path);
                    if (abstractFile instanceof TFolder) iconClass = 'ph-folder';
                    else iconClass = 'ph-file';
                }

                iconSpan.createEl('i', { cls: `ph ${iconClass}` });

                const displayName = item.title || item.path || item.url || 'Untitled';
                const nameSpan = fileEl.createSpan({ text: displayName });
                nameSpan.addClass('portals-item-name');
                fileEl.dataset.path = item.path || item.url || '';

                fileEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.type === 'url' || item.url) {
                        const url = item.url || item.path;
                        if (url) window.open(url, '_blank');
                    } else if (item.type === 'file' || item.path) {
                        if (item.path) {
                            const file = this.app.vault.getAbstractFileByPath(item.path);
                            if (file instanceof TFile) {
                                void this.app.workspace.getLeaf().openFile(file);
                            } else if (file instanceof TFolder) {
                                void this.app.workspace.openLinkText(item.path, '/', false);
                            }
                        }
                    } else if (item.type === 'folder') {
                        if (item.path) {
                            void this.app.workspace.openLinkText(item.path, '/', false);
                        }
                    }
                });

                if (item.path) {
                    this.view.addHoverPreview(fileEl, item.path);
                }

                fileEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const menu = new Menu();
                    menu.addItem(menuItem => menuItem
                        .setTitle('Delete bookmark')
                        .setIcon('trash')
                        .onClick(() => this.deleteBookmarkItem(item, usePublic, this.refresh))
                    );
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                });

                fileEl.addEventListener('mouseup', (e: MouseEvent) => {
                    if (e.button === 1 && item.path) {
                        e.preventDefault();
                        e.stopPropagation();
                        const abstractFile = this.app.vault.getAbstractFileByPath(item.path);
                        if (abstractFile instanceof TFile) {
                            this.app.workspace.getLeaf('tab').openFile(abstractFile);
                        }
                    }
                });
            }
        };

        items.forEach(item => renderItem(item, contentEl));
    }

    private deleteBookmarkItem(item: BookmarkItem, usePublic: boolean, refresh: () => void) {
        if (usePublic) {
            // @ts-expect-error - bookmarks is not in public App type
            const publicBookmarks = this.app.bookmarks as unknown as PublicBookmarksAPI | null;
            if (publicBookmarks?.remove && item.id) {
                publicBookmarks.remove(item.id);
            }
        } else {
            // @ts-expect-error - internal plugin API
            const internalPlugins = this.app.internalPlugins as unknown as InternalPluginsWithBookmarks | undefined;
            const bookmarksPlugin = internalPlugins?.getPluginById('bookmarks');
            if (!bookmarksPlugin?.instance) return;
            if (typeof bookmarksPlugin.instance.removeItem === 'function') {
                bookmarksPlugin.instance.removeItem(item);
            } else if (typeof bookmarksPlugin.instance.delete === 'function') {
                bookmarksPlugin.instance.delete(item);
            } else if (item.id && typeof bookmarksPlugin.instance.deleteItem === 'function') {
                bookmarksPlugin.instance.deleteItem(item.id);
            }
        }
        refresh();
    }
}