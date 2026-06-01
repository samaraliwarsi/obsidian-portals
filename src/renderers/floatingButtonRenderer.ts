import { App, Notice, Menu, Platform, TFolder } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { getFrontmatterTags } from '../utils/tagHelpers';
import { FrontmatterClinicRenderer } from './frontmatterClinic';
import { SearchPopover } from '../utils/searchPopover';
import { GroupTagsModal } from '../modals/groupTagsModal';
import { getMarkdownFiles } from '../utils/vaultProxy';

type ButtonId = 'collapse' | 'sections' | 'sort' | 'newFolder' | 'newNote';
const BUTTON_ORDER: ButtonId[] = ['collapse', 'sections', 'sort', 'newFolder', 'newNote'];

function getButtonPositions(plugin: PortalsPlugin): Record<ButtonId, number | null> {
    const visible: ButtonId[] = [];
    for (const id of BUTTON_ORDER) {
        switch (id) {
            case 'collapse':
                visible.push(id);
                break;
            case 'sections':
                if (plugin.settings.enableSections) visible.push(id);
                break;
            case 'sort':
                visible.push(id);
                break;
            case 'newFolder':
                visible.push(id);
                break;
            case 'newNote':
                visible.push(id);
                break;
        }
    }
    const positions: Record<ButtonId, number | null> = {
        collapse: null,
        sections: null,
        sort: null,
        newFolder: null,
        newNote: null,
    };
    visible.forEach((id, index) => {
        positions[id] = 10 + index * 42;
    });
    return positions;
}

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
        const pos = getButtonPositions(this.plugin);

        if (this.plugin.settings.floatingButtonsCollapsed) {
            this.createButton('stack-simple', 'Collapse/ Unfold', pos.collapse!,
                () => this.view.collapseAllFolders(),
                (e: MouseEvent) => this.view.toggleFloatingButtonsCollapse(e)
            );
        } else {
            // New note / file button
            this.createButton('file-plus', 'New note', pos.newNote!, () => {
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
                this.createButton('folder-simple-plus', 'New folder', pos.newFolder!, () => {
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
                const allFiles = getMarkdownFiles(this.app);
                const filesWithMainTag = allFiles.filter(file => {
                    const cache = this.app.metadataCache.getFileCache(file);
                    return cache?.tags?.some(t => t.tag === '#' + mainTag) || getFrontmatterTags(cache).includes(mainTag);
                });
                const tagSet = new Set<string>();
                filesWithMainTag.forEach(file => {
                    const cache = this.app.metadataCache.getFileCache(file);
                    const fileTags = [
                        ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                        ...getFrontmatterTags(cache)
                    ];
                    fileTags.forEach(t => tagSet.add(t));
                });
                tagSet.delete(mainTag);
                const relevantTags = Array.from(tagSet).sort();

                this.createButton('funnel-simple', 'Tag groups', pos.newFolder!, (_e) => {
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
            this.createButton('caret-circle-up-down', 'Sort', pos.sort!, (e: MouseEvent) => {
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

            if (this.plugin.settings.enableSections) {
                const space = this.plugin.settings.selectedSpace;
                const compositeKey = `${space!.type}:${space!.path}`;
                const prefs = this.plugin.settings.spaceSectionPrefs[compositeKey] ?? {};
                const currentCriterion = prefs.criterion ?? this.plugin.settings.sectionCriterion;
                const currentProp = prefs.propertyName ?? this.plugin.settings.sectionPropertyName ?? '';
                this.createButton('rows', 'Sections', pos.sections!, (e: MouseEvent) => {
                    const menu = new Menu();
                    const setCriterion = (criterion: 'extension' | 'property') => {
                        const entry = this.plugin.settings.spaceSectionPrefs[compositeKey] ?? {};
                        entry.criterion = criterion;
                        this.plugin.settings.spaceSectionPrefs[compositeKey] = entry;
                        void this.plugin.saveSettings();
                        this.view.renderContent();
                    };
                    menu.addItem(item => item
                        .setTitle(currentCriterion === 'property' && currentProp
                            ? `By frontmatter: ${currentProp}`
                            : 'By frontmatter')
                        .setChecked(currentCriterion === 'property')
                        .onClick(() => setCriterion('property')));
                    menu.addItem(item => item
                        .setTitle('By extension')
                        .setChecked(currentCriterion === 'extension')
                        .onClick(() => setCriterion('extension')));
                    menu.showAtPosition({ x: e.clientX, y: e.clientY });
                },
                (e) => { 
                    if (currentCriterion === 'property') {
                        e.preventDefault();
                        const properties = Array.from(FrontmatterClinicRenderer.getProperties().keys()).sort();
                        new SearchPopover(e.currentTarget as HTMLElement, {
                            items: properties,
                            currentSelected: currentProp,
                            onSelect: (selected: string) => {
                                const entry = this.plugin.settings.spaceSectionPrefs[compositeKey] ?? {};
                                entry.propertyName = selected;
                                entry.criterion = 'property';
                                this.plugin.settings.spaceSectionPrefs[compositeKey] = entry;
                                void this.plugin.saveSettings().then(() => this.view.render())
                            },
                            placeholder: 'Property name...'
                        });
                    }
                });
            }

            // Collapse button with contextmenu toggling
            this.createButton('stack', 'Collapse/ Fold', pos.collapse!,
                () => this.view.collapseAllFolders(),
                (e: MouseEvent) => this.view.toggleFloatingButtonsCollapse(e)
            );
        }
    }

    // ─── private ─────────────────────────────────────────

    private createButton(icon: string, tooltip: string, bottom: number, onClick: (e: MouseEvent) => void, onContextMenu?: (e: MouseEvent) => void): void {
        const btn = this.mainPanel.createEl('button', { cls: 'portals-reset-btn portals-floating-btn' });
        btn.setCssProps({ bottom: bottom + 'px' });
        this.plugin.renderPluginIcon(btn, icon);

        if (!Platform.isMobile) {
            btn.addEventListener('mouseenter', () => {
                let actualTooltip = tooltip;
                if ((icon === 'stack' || icon === 'stack-simple') && !this.view.floatingBtnCollapseTooltipShown) {
                    actualTooltip = 'Right-click: fold/unfold';
                    this.view.floatingBtnCollapseTooltipShown = true;
                } else if (icon === 'rows' && !this.view.floatingBtnSectionTooltipShown) {
                    actualTooltip = 'Right-click: find, if using frontmatter';
                    this.view.floatingBtnSectionTooltipShown = true;
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