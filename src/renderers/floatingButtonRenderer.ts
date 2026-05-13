import { App, Notice, Menu, Platform, TFolder } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { GroupTagsModal } from '../utils/modals';

export class FloatingButtonsRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;
    private mainPanel!: HTMLElement;
    private contextMenuFiredMap = new WeakMap<HTMLElement, boolean>();

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
    }

    render(mainPanel: HTMLElement): void {
        this.mainPanel = mainPanel;

        if (this.plugin.settings.floatingButtonsCollapsed) {
            this.createButton('stack-simple', 'Collapse/ Unfold', 10,
                () => this.view.collapseAllFolders(),
                (e: MouseEvent) => this.view.toggleFloatingButtonsCollapse(e)
            );
        } else {
            // New note / file button
            this.createButton('file-plus', 'New note', 136, () => {
                (async () => {
                    const currentSpace = this.plugin.settings.spaces.find(s =>
                        s.path === this.plugin.settings.selectedSpace?.path &&
                        s.type === this.plugin.settings.selectedSpace?.type
                    );
                    if (!currentSpace) {
                        new Notice('Please select a folder space first.');
                        return;
                    }
                    if (currentSpace.type === 'folder') {
                        const folder = this.app.vault.getAbstractFileByPath(currentSpace.path);
                        if (!(folder instanceof TFolder)) {
                            new Notice('Selected space is not a valid folder.');
                            return;
                        }
                        // folder is now guaranteed to be TFolder, but TS needs a hint
                        await PortalsActions.newNoteInFolder(this.app, this.plugin, this.view, folder);
                    } else if (currentSpace.type === 'tag') {
                        await PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, currentSpace.path);
                    }
                })().catch(err => console.error('Error creating note:', err));
            });

            // Second button: New folder OR Tag groups
            const currentSpace = this.plugin.settings.spaces.find(s =>
                s.path === this.plugin.settings.selectedSpace?.path &&
                s.type === this.plugin.settings.selectedSpace?.type
            );

            if (currentSpace && currentSpace.type === 'folder') {
                this.createButton('folder-simple-plus', 'New folder', 94, () => {
                    (async () => {
                        const folder = this.app.vault.getAbstractFileByPath(currentSpace.path);
                        if (!(folder instanceof TFolder)) {
                            new Notice('Selected space is not a valid folder.');
                            return;
                        }
                        await PortalsActions.newFolderInFolder(this.app, this.plugin, this.view, folder);
                    })().catch(err => console.error('Error creating folder:', err));
                });
            } else if (currentSpace && currentSpace.type === 'tag') {
                const mainTag = currentSpace.path;
                const allFiles = this.app.vault.getMarkdownFiles();
                const filesWithMainTag = allFiles.filter(file => {
                    const cache = this.app.metadataCache.getFileCache(file);
                    return cache?.tags?.some(t => t.tag === '#' + mainTag) || PortalsActions.getFrontmatterTags(cache).includes(mainTag);
                });
                const tagSet = new Set<string>();
                filesWithMainTag.forEach(file => {
                    const cache = this.app.metadataCache.getFileCache(file);
                    const fileTags = [
                        ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                        ...(cache?.frontmatter?.tags || [])
                    ];
                    fileTags.forEach(t => tagSet.add(t));
                });
                tagSet.delete(mainTag);
                const relevantTags = Array.from(tagSet).sort();

                this.createButton('funnel-simple', 'Tag groups', 94, (_e) => {
                    const oldGroups = currentSpace.groupTags || [];
                    new GroupTagsModal(this.app, this.plugin, currentSpace, (tags) => {
                        const removed = oldGroups.filter(g => !tags.includes(g));
                        for (const group of removed) {
                            const key = this.view.getTagGroupKey(currentSpace.path, group);
                            delete this.plugin.settings.customIcons[key];
                        }
                        currentSpace.groupTags = tags;

                        const expanded = this.plugin.settings.expandedGroups[currentSpace.path];
                        if (expanded) {
                            const validExpanded = expanded.filter(t => currentSpace.groupTags?.includes(t));
                            if (validExpanded.length !== expanded.length) {
                                this.plugin.settings.expandedGroups[currentSpace.path] = validExpanded;
                            }
                        }
                        void this.plugin.saveSettings().then(() => this.view.render());
                    }, relevantTags).open();
                });
            }

            // Sort button
            this.createButton('caret-circle-up-down', 'Sort', 52, (e: MouseEvent) => {
                const menu = new Menu();
                const setSort = (by: 'name' | 'created' | 'modified', order: 'asc' | 'desc') => {
                    this.plugin.settings.sortBy = by;
                    this.plugin.settings.sortOrder = order;
                    void this.plugin.saveData(this.plugin.settings);
                    this.view.renderContent();
                };
                menu.addItem(item => item
                    .setTitle('Name ascending')
                    .setChecked(this.plugin.settings.sortBy === 'name' && this.plugin.settings.sortOrder === 'asc')
                    .onClick(() => setSort('name', 'asc')));
                menu.addItem(item => item
                    .setTitle('Name descending')
                    .setChecked(this.plugin.settings.sortBy === 'name' && this.plugin.settings.sortOrder === 'desc')
                    .onClick(() => setSort('name', 'desc')));
                menu.addSeparator();
                menu.addItem(item => item
                    .setTitle('Created (oldest first)')
                    .setChecked(this.plugin.settings.sortBy === 'created' && this.plugin.settings.sortOrder === 'asc')
                    .onClick(() => setSort('created', 'asc')));
                menu.addItem(item => item
                    .setTitle('Created (newest first)')
                    .setChecked(this.plugin.settings.sortBy === 'created' && this.plugin.settings.sortOrder === 'desc')
                    .onClick(() => setSort('created', 'desc')));
                menu.addSeparator();
                menu.addItem(item => item
                    .setTitle('Modified (oldest first)')
                    .setChecked(this.plugin.settings.sortBy === 'modified' && this.plugin.settings.sortOrder === 'asc')
                    .onClick(() => setSort('modified', 'asc')));
                menu.addItem(item => item
                    .setTitle('Modified (newest first)')
                    .setChecked(this.plugin.settings.sortBy === 'modified' && this.plugin.settings.sortOrder === 'desc')
                    .onClick(() => setSort('modified', 'desc')));
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });

            // Collapse button with contextmenu toggling
            this.createButton('stack', 'Collapse/ Fold', 10,
                () => this.view.collapseAllFolders(),
                (e: MouseEvent) => this.view.toggleFloatingButtonsCollapse(e)
            );
        }
    }

    // ─── private ─────────────────────────────────────────

    private createButton(icon: string, tooltip: string, bottom: number, onClick: (e: MouseEvent) => void, onContextMenu?: (e: MouseEvent) => void): void {
        // Use Obsidian's createEl so the button has the helper methods
        const btn = this.mainPanel.createEl('button', { cls: 'portals-floating-btn' });
        btn.style.bottom = bottom + 'px';
        btn.createEl('i', { cls: `ph ph-${icon}` });

        if (!Platform.isMobile) {
            btn.addEventListener('mouseenter', () => {
                let actualTooltip = tooltip;
                if ((icon === 'stack' || icon === 'stack-simple') && !this.view.floatingBtnSpecialTooltipShown) {
                    actualTooltip = 'Right-click: fold/unfold';
                    this.view.floatingBtnSpecialTooltipShown = true;
                }
                this.view.showTooltip(actualTooltip, btn, 300, 'right');
            });
            btn.addEventListener('mouseleave', () => this.view.hideTooltip(100));
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.blur();
            btn.classList.add('portals-floating-btn-hidden');
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    btn.classList.remove('portals-floating-btn-hidden');
                });
            });
            onClick(e);
        });

        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            btn.blur();
            if (this.contextMenuFiredMap.get(btn)) return;
            this.contextMenuFiredMap.set(btn, true);
            window.setTimeout(() => this.contextMenuFiredMap.delete(btn), 300);
            if (onContextMenu) {
                onContextMenu(e);
            }
        });
    }
}