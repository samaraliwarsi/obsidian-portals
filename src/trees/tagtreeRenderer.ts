import { App, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { isContextNoteFile, hasContextNote, getContextNote } from '../renderers/contextNotes';
import { getFrontmatterTags } from '../utils/tagHelpers';
import { FileItemFactory } from '../utils/fileItemFactory';
import { SectionRenderer } from '../utils/sectionsRenderer';


interface TagNode {
    fullPath: string;
    name: string;
    children: Map<string, TagNode>;
    files: TFile[];
}

interface TopLevelItem {
    type: 'subtag' | 'group';
    name: string;
    data: TagNode | { tag: string; files: TFile[] };
}

export class TagTreeRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
    }

    private shouldShowOpenDot(tagPath: string, isGroup: boolean): boolean {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return false;
        const cache = this.app.metadataCache.getFileCache(activeFile);
        if (!cache) return false;
        const fileTags = [
            ...(cache.tags?.map(t => t.tag.slice(1)) ?? []),
            ...getFrontmatterTags(cache)
        ];
        if (isGroup) {
            return fileTags.includes(tagPath);
        }
        // Main tag or subtag: direct match or hierarchical prefix
        return fileTags.some(t => t === tagPath || t.startsWith(tagPath + '/'));
    }

    // Highlights the summary/icon if a context note exists
    private applyContextNoteHighlight(summary: HTMLElement, iconSpan: HTMLElement, tagPath: string): void {
        if (!this.plugin.settings.enableContextNotes
            || !hasContextNote(this.app, this.plugin, tagPath)
            || this.plugin.settings.contextNoteHighlightStyle === 'none') {
            return;
        }
        const style = this.plugin.settings.contextNoteHighlightStyle;
        if (style === 'icon') {
            iconSpan.addClass('has-context-note-icon');
            summary.addClass('has-context-note-icon');
        } else if (style === 'underline') {
            summary.addClass('has-context-note-underline');
            const nameSpan = summary.querySelector('.portals-item-name');
            nameSpan?.addClass('has-context-note-underline');
        }
    }

    // Applies and remove custom color to a details/summary/children group.
    private applyColorToDetails(details: HTMLElement, summary: HTMLElement, childrenContainer: HTMLElement, colorKey: string): void {
        const savedColor = this.plugin.settings.tagColors[colorKey];
        const style = this.plugin.settings.treeStyle;
        const canApplyColor = savedColor
            && style !== 'shades'
            && style !== 'hues'
            && !(style === 'portals' && this.plugin.settings.tabColorEnabled);

        if (canApplyColor) {
            details.classList.add('has-folder-color');
            summary.classList.add('has-folder-color');
            childrenContainer.classList.add('has-folder-color');
            //details.style.setProperty('--folder-color', savedColor);
            details.setCssProps({ '--folder-color': savedColor });
        } else {
            details.classList.remove('has-folder-color');
            //details.style.removeProperty('--folder-color');
            details.setCssProps({ '--folder-color': '' });
            summary.classList.remove('has-folder-color');
            childrenContainer.classList.remove('has-folder-color');
        }
    }

    // ============MAIN TAG SPACE RENDER==============================================================================================================
    render(tagName: string, container: HTMLElement, iconName: string, openFiles: Set<string>, groupTags?: string[], totalGroups: number = 0): void {
        const mainTag = '#' + tagName;
        const allFiles = this.app.vault.getMarkdownFiles();

        // collect all files that have the main tag or any subtag (tagname/anything)
        const relevantFiles = allFiles.filter(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const fileTags = [
                ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                ...getFrontmatterTags(cache)
            ];
            return fileTags.some(t => t === tagName || t.startsWith(tagName + '/'));
        });

        if (relevantFiles.length === 0) {
            container.createEl('p', { text: 'No files with this tag or its subtags.' });
            return;
        }

        // build a map : full tag path > array of files that have that tag
        const tagToFiles = new Map<string, TFile[]>();
        const allTags = new Set<string>();
        for (const file of relevantFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fileTags = [
                ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                ...getFrontmatterTags(cache)
            ];
            for (const tag of fileTags) {
                if (tag === tagName || tag.startsWith(tagName + '/')) {
                    allTags.add(tag);
                    if (!tagToFiles.has(tag)) tagToFiles.set(tag, []);
                    tagToFiles.get(tag)!.push(file);
                }
            }
        }

        if (groupTags && groupTags.length > 0) {
            const liveGroupTags = groupTags.filter(gTag => relevantFiles.some(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                const fileTags = [
                    ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                    ...getFrontmatterTags(cache)
                ];
                return fileTags.includes(gTag);
            }));
            if (liveGroupTags.length !== groupTags.length) {
                const space = this.plugin.settings.spaces.find(s => s.path === tagName && s.type === 'tag');
                if (space) {
                    space.groupTags = liveGroupTags;

                    const expanded = this.plugin.settings.expandedGroups[tagName];
                    if (expanded && Array.isArray(expanded)) {
                        const cleaned = expanded.filter(g => liveGroupTags.includes(g));
                        if (cleaned.length !== expanded.length) {
                            this.plugin.settings.expandedGroups[tagName] = cleaned;
                        }
                    }
                    void this.plugin.saveSettings();
                }
                groupTags = liveGroupTags;
            }
        }

        // Determine if there are any subtags (i.e., tags longer than the main tag)
        const hasSubtags = Array.from(allTags).some(t => t !== tagName && t.startsWith(tagName + '/'));

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
        // FLAT LIST TAG PATH
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

        if (!hasSubtags) {
            const taggedFiles = allFiles.filter(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                return cache?.tags?.some(t => t.tag === mainTag) || getFrontmatterTags(cache).includes(tagName);
            });
            if (taggedFiles.length === 0) {
                container.createEl('p', { text: 'No files with this tag.' });
                return;
            }

            // FLAT LIST: Sort helper
            const sortFiles = (files: TFile[]) => files.sort((a, b) => {
                const sortBy = this.plugin.settings.sortBy;
                const sortOrder = this.plugin.settings.sortOrder;
                let aVal: string | number, bVal: string | number;
                switch (sortBy) {
                    case 'name': aVal = a.name; bVal = b.name; break;
                    case 'created': aVal = a.stat.ctime; bVal = b.stat.ctime; break;
                    case 'modified': aVal = a.stat.mtime; bVal = b.stat.mtime; break;
                    default: aVal = a.name; bVal = b.name;
                }
                if (sortOrder === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                else return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            });

            // FLAT LIST: Create elements for Main Tag
            const mainDetails = container.createEl('details', { cls: 'folder-details' });
            mainDetails.setAttr('open', 'true');
            const mainSummary = mainDetails.createEl('summary', { cls: 'folder-summary' });
            const mainIconSpan = mainSummary.createSpan({ cls: 'folder-icon' });
            this.plugin.renderCustomIcon(mainIconSpan, `tag:${tagName}`, iconName || 'tag-simple');
            mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
            const childrenContainer = mainDetails.createDiv({ cls: 'folder-children' });
            mainSummary.dataset.tagPath = tagName;

            // FLAT LIST: opendot
            if (this.shouldShowOpenDot(tagName, false)) {
                mainSummary.createSpan({ cls: 'open-dot' });
            }

            // FLAT LIST: Apply context note highlight to main tag
            const mainTagPath = tagName;
            this.applyContextNoteHighlight(mainSummary, mainIconSpan, mainTagPath);

            // FLAT LIST: Quick‑create note for tag lists (tagName)
            this.view.quickFileIcon(mainSummary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName));

            // FLAT LIST: Context Menu
            mainSummary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                ContextMenuFactory.showTagContextMenu(this.view, tagName, iconName || 'tag', mainSummary, e);
            });

            // FLAT LIST: treeEventHelpers.ts hook
            TreeEventHelpers.attachMainTagListeners(mainSummary, tagName, this.view);
            TreeEventHelpers.attachIconContextNoteOpener(mainIconSpan, tagName, this.view);

            // FLAT LIST: If no groups, list all files under the main tag
            if (!groupTags || groupTags.length === 0) {
                const flatFiles = sortFiles(taggedFiles);
                const flatFilesContextAware = flatFiles.filter(file => {
                    if (this.plugin.settings.enableContextNotes && 
                        !this.plugin.settings.showContextNotesInTree 
                        && isContextNoteFile(this.app, this.plugin, file, tagName)) {
                            return false;
                        }
                        return true;
                });
                const sectioned = SectionRenderer.renderSections(this.app, this.plugin, this.view, flatFilesContextAware, `tag:${tagName}`, childrenContainer, openFiles);
                if (!sectioned) {
                    for (const file of flatFilesContextAware) {
                        if (this.plugin.settings.hiddenItems[file.path]) continue;
                        FileItemFactory.createFileItem(this.app, this.plugin, this.view, file, childrenContainer, openFiles);
                    }
                }
                return;
            }

            // FLAT LIST: TAG GROUPS================================================
            const groups = new Map<string, TFile[]>();
            groupTags.forEach(t => groups.set(t, []));
            const ungrouped: TFile[] = [];
            for (const file of taggedFiles) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fileTags = new Set([
                    ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                    ...getFrontmatterTags(cache)
                ]);
                let hasGroup = false;
                for (const gTag of groupTags) {
                    if (fileTags.has(gTag)) {
                        groups.get(gTag)!.push(file);
                        hasGroup = true;
                    }
                }
                if (!hasGroup) ungrouped.push(file);
            }

            // Sort groups according to customTreeOrder if present
            const orderMap = this.plugin.settings.customTreeOrder;
            const sortedGroupEntries = Array.from(groups.entries()).sort(([a], [b]) => {
                const aKey = this.view.getTagGroupKey(tagName, a);
                const bKey = this.view.getTagGroupKey(tagName, b);
                const aPos = orderMap[aKey] ?? Number.MAX_SAFE_INTEGER;
                const bPos = orderMap[bKey] ?? Number.MAX_SAFE_INTEGER;
                if (aPos !== bPos) return aPos - bPos;
                return a.localeCompare(b);
            });

            // FLAT LIST: TAG GROUPS - Render each group as a nested details element
            let groupIndex = 0;
            for (const [gTag, files] of sortedGroupEntries) {
                if (files.length === 0) continue;
                const groupDetails = childrenContainer.createEl('details', { cls: 'folder-details' });
                const groupKey = this.view.getTagGroupKey(tagName, gTag);
                groupDetails.dataset.groupKey = groupKey;

                // FLAT LIST: TAG GROUPS - open state based on expanded groups
                const saveExpanded = this.plugin.settings.expandedGroups[tagName] || [];
                if (saveExpanded.includes(gTag)) {
                    groupDetails.open = true;
                } else {
                    groupDetails.open = false;
                }
                const summary = groupDetails.createEl('summary', { cls: 'folder-summary' });
                const groupChildren = groupDetails.createDiv({ cls: 'folder-children' });

                this.applyColorToDetails(groupDetails, summary, groupChildren, groupKey);

                // FLAT LIST: TAG GROUPS - Shades Style
                if (this.plugin.settings.treeStyle === 'shades') {
                    const minOpacity = 0.1;
                    const maxOpacity = 0.4;
                    let shadeOpacity;
                    const total = totalGroups > 0 ? totalGroups : 1;
                    if (total <= 1) {
                        shadeOpacity = minOpacity
                    } else {
                        const progress = groupIndex / (total -1);
                        shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                    }
                    shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));

                    summary.classList.add('shaded-folder-summary');
                    //summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                    summary.setCssProps({ '--folder-shade-opacity': String(shadeOpacity) });
                    groupChildren.classList.add('shaded-folder-children');
                    //groupChildren.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                    groupChildren.setCssProps({ '--folder-shade-opacity': String(shadeOpacity) });
                }

                // FLAT LIST: TAG GROUPS - Hue Style
                if (this.plugin.settings.treeStyle === 'hues') {
                    const total = totalGroups > 0 ? totalGroups : 1;
                    let progress = groupIndex / (total - 1);
                    if (total <= 1) progress = 0.5;
                    const hue = progress * 360;
                    const minOpacity = 0.1;
                    const maxOpacity = 0.3;
                    let opacity;
                    if (total <= 1) {
                        opacity = minOpacity;
                    } else {
                        opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                        opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
                    }
                    summary.classList.add('hued-folder-summary');
                    //summary.style.setProperty('--hue-start', String(hue));
                    //summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                    //summary.style.setProperty('--hue-opacity', String(opacity));
                    summary.setCssProps({ '--hue-start': String(hue) });
                    summary.setCssProps({ '--hue-end': String((hue + 30) % 360) });
                    summary.setCssProps({ '--hue-opacity': String(opacity) });
                    groupChildren.classList.add('hued-folder-children');
                    //groupChildren.style.setProperty('--hue-start', String(hue));
                    //groupChildren.style.setProperty('--hue-end', String((hue + 30) % 360));
                    //groupChildren.style.setProperty('--hue-opacity', String(opacity * 0.6));
                    groupChildren.setCssProps({ '--hue-start': String(hue) });
                    groupChildren.setCssProps({ '--hue-end': String((hue + 30) % 360) });
                    groupChildren.setCssProps({ '--hue-opacity': String(opacity * 0.6) });
                }

                // FLAT LIST: TAG GROUPS - icon with custom support
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                this.plugin.renderCustomIcon(iconSpan, groupKey, 'tag-simple');
                summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
                summary.dataset.tagPath = gTag;
                summary.dataset.reorderKey = groupKey;

                // FLAT LIST: open-dot
                if (this.shouldShowOpenDot(gTag, true)) {
                    summary.createSpan({ cls: 'open-dot' });
                }

                // FLAT LIST: TAG GROUPS - Quick‑create note for tag groups flat list (mainT + gTag)
                this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName, [gTag]));

                // FLAT LIST: TAG GROUPS - Apply context note highlight to group tag
                const groupTagPath = gTag;
                this.applyContextNoteHighlight(summary, iconSpan, groupTagPath);

                // FLAT LIST: TAG GROUPS - context menu for group
                summary.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const groupKey = this.view.getTagGroupKey(tagName, gTag);
                    ContextMenuFactory.showGroupTagContextMenu(this.view, tagName, groupKey, gTag, groupDetails, summary, e);
                });

                // FLAT LIST: TAG GROUPS - treeEventHelpers.ts hook
                TreeEventHelpers.attachTagNodeListeners(summary, groupKey, gTag, this.view);
                TreeEventHelpers.attachIconContextNoteOpener(iconSpan, gTag, this.view);

                // FLAT LIST: TAG GROUP - Sorting with Sections + show context note file if setting enabled (same as subtag groups)
                const contextNotesOn = this.plugin.settings.enableContextNotes;
                const showContextNotes = this.plugin.settings.showContextNotesInTree;

                let groupFiles = sortFiles(files);
                if (!contextNotesOn || (contextNotesOn && showContextNotes)) {
                    const flatGroupContextNote = getContextNote(this.app, this.plugin, gTag);
                    if (flatGroupContextNote && !this.plugin.settings.hiddenItems[flatGroupContextNote.path]) {
                        const alreadyListed = groupFiles.some(f => f.path === flatGroupContextNote.path);
                        if (!alreadyListed) {
                            groupFiles = [...groupFiles, flatGroupContextNote];
                        }
                    }
                }
                const groupFilesContextAware = groupFiles.filter(file => {
                    if (contextNotesOn && !showContextNotes && isContextNoteFile(this.app, this.plugin, file, gTag)) {
                        return false;
                    }
                    return true;
                });
                const sectioned = SectionRenderer.renderSections(
                    this.app, this.plugin, this.view, 
                    groupFilesContextAware, 
                    `tag:${tagName}/group:${gTag}`, 
                    groupChildren, 
                    openFiles,
                    (fileEl) => {
                        fileEl.addEventListener('click', () => {
                            this.view.activeGroupTag = gTag;
                        }, true);
                    });
                if (!sectioned) {
                    for (const file of groupFilesContextAware) {
                        if (this.plugin.settings.hiddenItems[file.path]) continue;
                        const fileEl = FileItemFactory.createFileItem(this.app, this.plugin, this.view, file, groupChildren, openFiles);
                        fileEl.addEventListener('click', () => {
                            this.view.activeGroupTag = gTag;
                        }, true);
                    }
                }

                groupDetails.addEventListener('toggle', () => {
                    const isOpen = groupDetails.open;
                    let expanded = this.plugin.settings.expandedGroups[tagName] || [];
                    if (isOpen) {
                        if (!expanded.includes(gTag)) {
                            expanded = [...expanded, gTag];
                        }
                    } else {
                        expanded = expanded.filter(t => t !== gTag);
                    }
                    this.plugin.settings.expandedGroups[tagName] = expanded;
                    this.plugin.saveData(this.plugin.settings).catch(console.error);
                });
                groupIndex++;
            }

            // FLAT LIST: TAG GROUPS - Render ungrouped files directly under main tag
            const ungroupedSorted = sortFiles(ungrouped);
            const ungroupedContextAware = ungroupedSorted.filter(file => {
                if (this.plugin.settings.enableContextNotes && !this.plugin.settings.showContextNotesInTree && isContextNoteFile(this.app, this.plugin, file, tagName)) {
                    return false;
                }
                return true;
            })
            const sectioned = SectionRenderer.renderSections(this.app, this.plugin, this.view, ungroupedContextAware, `tag:${tagName}`, childrenContainer, openFiles);
            if (!sectioned) {
                for (const file of ungroupedContextAware) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    FileItemFactory.createFileItem(this.app, this.plugin, this.view, file, childrenContainer, openFiles);
                }
            }
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // HIERARCHICAL TAG PATH  –  subtags exist
        // ═══════════════════════════════════════════════════════════

        const root: TagNode = { fullPath: tagName, name: tagName, children: new Map(), files: tagToFiles.get(tagName) || [] };

        // HLIST: Insert each tag into the tree
        for (const tag of allTags) {
            if (tag === tagName) continue;
            const parts = tag.split('/');
            let current = root;
            let currentPath = tagName;
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (!part) continue;
                currentPath = currentPath + '/' + part;
                if (!current.children.has(part)) {
                    current.children.set(part, {
                        fullPath: currentPath,
                        name: part,
                        children: new Map(),
                        files: tagToFiles.get(currentPath) || []
                    });
                }
                current = current.children.get(part)!;
            }
        }

        const sortFiles = (files: TFile[]) => files.sort((a, b) => {
            const sortBy = this.plugin.settings.sortBy;
            const sortOrder = this.plugin.settings.sortOrder;
            let aVal: string | number, bVal: string | number;
            switch (sortBy) {
                case 'name': aVal = a.name; bVal = b.name; break;
                case 'created': aVal = a.stat.ctime; bVal = b.stat.ctime; break;
                case 'modified': aVal = a.stat.mtime; bVal = b.stat.mtime; break;
                default: aVal = a.name; bVal = b.name;
            }
            if (sortOrder === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            else return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        });

        // ── HLIST: SUBTAGS - Recursive subtag node renderer ───────────────
        const renderNode = (node: TagNode, parentEl: HTMLElement, level: number, index: number = 0, total: number = 1) => {
            const nodeKey = `tag:${tagName}/node:${node.fullPath}`;
            if (this.plugin.settings.hiddenItems[nodeKey]) return;
            const details = parentEl.createEl('details', { cls: 'folder-details' });
            const expandedSet = this.plugin.settings.expandedTagHierarchy[tagName] || [];
            if (expandedSet.includes(node.fullPath)) {
                details.open = true;
            }

            const summary = details.createEl('summary', { cls: 'folder-summary' });

            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            this.plugin.renderCustomIcon(iconSpan, nodeKey, 'tag');
            const nameSpan = summary.createSpan({ text: node.name });
            nameSpan.addClass('portals-item-name');
            summary.dataset.tagPath = node.fullPath;
            summary.dataset.reorderKey = nodeKey;

            // HLIST: SUBTAGS - opendot
            if (this.shouldShowOpenDot(node.fullPath, false)) {
                summary.createSpan({ cls: 'open-dot' });
            }

            const childrenContainer = details.createDiv({ cls: 'folder-children' });

            // HLIST: SUBTAGS - Quick‑create note for sub tag tree sub item (node.fullpath)
            this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, node.fullPath));

            // HLIST: SUBTAGS - Apply context note highlight to subtag node
            const nodeTagPath = node.fullPath; // e.g., "project/ideas"
            this.applyContextNoteHighlight(summary, iconSpan, nodeTagPath);

            this.applyColorToDetails(details, summary, childrenContainer, nodeKey)

            // HLIST: SUBTAGS - Apply shades/hues styling only at level 1
            if (level === 1 && this.plugin.settings.treeStyle === 'shades') {
                const minOpacity = 0.1, maxOpacity = 0.4;
                let shadeOpacity;
                if (total > 1) {
                    const progress = index / (total - 1);
                    shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    shadeOpacity = minOpacity;
                }
                shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));
                summary.classList.add('shaded-folder-summary');
                //summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                summary.setCssProps({ '--folder-shade-opacity': String(shadeOpacity) });
                childrenContainer.classList.add('shaded-folder-children');
                //childrenContainer.style.setProperty('--folder-shade-opacity', String(shadeOpacity * 0.6));
                childrenContainer.setCssProps({ '--folder-shade-opacity': String(shadeOpacity * 0.6) });
            } else if (level === 1 && this.plugin.settings.treeStyle === 'hues') {
                const minOpacity = 0.1, maxOpacity = 0.3;
                let hue, opacity;
                if (total > 1) {
                    const progress = index / (total - 1);
                    hue = progress * 360;
                    opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    hue = 0;
                    opacity = minOpacity;
                }
                opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
                summary.classList.add('hued-folder-summary');
                //summary.style.setProperty('--hue-start', String(hue));
                //summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                //summary.style.setProperty('--hue-opacity', String(opacity));
                summary.setCssProps({ '--hue-start': String(hue) });
                summary.setCssProps({ '--hue-end': String((hue + 30) % 360) });
                summary.setCssProps({ '--hue-opacity': String(opacity) });
                childrenContainer.classList.add('hued-folder-children');
                //childrenContainer.style.setProperty('--hue-start', String(hue));
                //childrenContainer.style.setProperty('--hue-end', String((hue + 30) % 360));
                //childrenContainer.style.setProperty('--hue-opacity', String(opacity * 0.6));
                childrenContainer.setCssProps({ '--hue-start': String(hue) });
                childrenContainer.setCssProps({ '--hue-end': String((hue + 30) % 360) });
                childrenContainer.setCssProps({ '--hue-opacity': String(opacity * 0.6) });
            }

            // HLIST: SUBTAGS - Render child tags
            const orderMap = this.plugin.settings.customTreeOrder;
            const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
                const aKey = `tag:${tagName}/node:${a.fullPath}`;
                const bKey = `tag:${tagName}/node:${b.fullPath}`;
                const aPos = orderMap[aKey] ?? Number.MAX_SAFE_INTEGER;
                const bPos = orderMap[bKey] ?? Number.MAX_SAFE_INTEGER;
                if (aPos !== bPos) return aPos - bPos;
                return a.name.localeCompare(b.name);
            });
            for (const child of sortedChildren) {
                renderNode(child, childrenContainer, level + 1);
            }

            // HLIST: SUBTAGS - Render files belonging to this node
            if (node.files.length > 0) {
                const contextNotesOn = this.plugin.settings.enableContextNotes;
                const showContextNotes = this.plugin.settings.showContextNotesInTree;
                let nodeFiles = sortFiles(node.files);

                if (!contextNotesOn || (contextNotesOn && showContextNotes)) {
                    const subtagContextNote = getContextNote(this.app, this.plugin, node.fullPath);
                    if (subtagContextNote && !this.plugin.settings.hiddenItems[subtagContextNote.path]) {
                        const alreadyListed = nodeFiles.some(f => f.path === subtagContextNote.path);
                        if (!alreadyListed) {
                            nodeFiles = [...nodeFiles, subtagContextNote];
                        }
                    }
                }
                const nodeFilesContextAware = nodeFiles.filter(file => {
                    if (contextNotesOn && !showContextNotes && isContextNoteFile(this.app, this.plugin, file, node.fullPath)) {
                        return false;
                    }
                    return true;
                });
                const sectioned = SectionRenderer.renderSections(this.app, this.plugin, this.view, nodeFilesContextAware, `tag:${tagName}/node:${node.fullPath}`, childrenContainer, openFiles);
                if (!sectioned) {
                    for (const file of nodeFilesContextAware) {
                        if (this.plugin.settings.hiddenItems[file.path]) continue;
                        FileItemFactory.createFileItem(this.app, this.plugin, this.view, file, childrenContainer, openFiles);
                    }
                }
            }

            // HLIST: SUBTAGS - Context menu for custom icon on tag node
            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                ContextMenuFactory.showSubtagNodeContextMenu(this.view, tagName, node.fullPath, iconName || 'tag', details, summary, e);
            });

            // HLIST: SUBTAGS - treeEventHelpers.ts hook
            TreeEventHelpers.attachTagNodeListeners(summary, nodeKey, node.fullPath, this.view);
            TreeEventHelpers.attachIconContextNoteOpener(iconSpan, node.fullPath, this.view);

            details.addEventListener('toggle', () => {
                let expanded = this.plugin.settings.expandedTagHierarchy[tagName] || [];
                if (details.open) {
                    if (!expanded.includes(node.fullPath)) {
                        expanded = [...expanded, node.fullPath];
                    }
                } else {
                    expanded = expanded.filter(p => p !== node.fullPath);
                }
                this.plugin.settings.expandedTagHierarchy[tagName] = expanded;
                this.plugin.saveData(this.plugin.settings).catch(console.error);
            });
        };

        // HLIST: Main wrapper details for the portal
        const mainDetails = container.createEl('details', { cls: 'folder-details' });
        mainDetails.open = true;
        const mainSummary = mainDetails.createEl('summary', { cls: 'folder-summary' });
        const mainIconSpan = mainSummary.createSpan({ cls: 'folder-icon' });
        this.plugin.renderCustomIcon(mainIconSpan, `tag:${tagName}`, iconName || 'tag');
        mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
        const mainChildren = mainDetails.createDiv({ cls: 'folder-children' });
        mainSummary.dataset.tagPath = tagName;

        // HLIST: opendot
        if (this.shouldShowOpenDot(tagName, false)) {
            mainSummary.createSpan({ cls: 'open-dot' });
        }

        // HLIST: Quick‑create note for sub tag tree head item (tagName)
        this.view.quickFileIcon(mainSummary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName));

        // HLIST: Apply context note highlight to main tag
        const mainTagPath = tagName;
        this.applyContextNoteHighlight(mainSummary, mainIconSpan, mainTagPath);

        mainSummary.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            ContextMenuFactory.showTagContextMenu(this.view, tagName, iconName || 'tag', mainSummary, e);
        });

        // HLIST: TreeEventHelpers.ts hook
        TreeEventHelpers.attachMainTagListeners(mainSummary, tagName, this.view);
        TreeEventHelpers.attachIconContextNoteOpener(mainIconSpan, tagName, this.view);

        // HLIST: Build unified list of top-level items (subtags + groups from root files)
        const topLevelItems: TopLevelItem[] = [];

        // HLIST: SUBTAGS - Add subtag nodes
        const topChildren = Array.from(root.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const child of topChildren) {
            topLevelItems.push({ type: 'subtag', name: child.name, data: child });
        }

        // HLIST: SUBTAGS - Add groups from root files (if any groupTags)
        if (groupTags && groupTags.length > 0) {
            const groupsMap = new Map<string, TFile[]>();
            groupTags.forEach(t => groupsMap.set(t, []));
            for (const file of root.files) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fileTags = new Set([
                    ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                    ...getFrontmatterTags(cache)
                ]);
                for (const gTag of groupTags) {
                    if (fileTags.has(gTag)) {
                        groupsMap.get(gTag)!.push(file);
                    }
                }
            }
            for (const [gTag, files] of groupsMap.entries()) {
                if (files.length) {
                    topLevelItems.push({ type: 'group', name: gTag, data: { tag: gTag, files } });
                }
            }
        }

        // HLIST: Sorting  alphabetically
        const orderMap = this.plugin.settings.customTreeOrder;
        topLevelItems.sort((a, b) => {
            const aKey = a.type === 'subtag' ? `tag:${tagName}/node:${(a.data as TagNode).fullPath}` : `tag:${tagName}/group:${a.name}`;
            const bKey = b.type === 'subtag' ? `tag:${tagName}/node:${(b.data as TagNode).fullPath}` : `tag:${tagName}/group:${b.name}`;
            const aPos = orderMap[aKey] ?? Number.MAX_SAFE_INTEGER;
            const bPos = orderMap[bKey] ?? Number.MAX_SAFE_INTEGER;
            if (aPos !== bPos) return aPos - bPos;
            return a.name.localeCompare(b.name);
        });

        // HLIST: GROUPS INSIDE HEIRARACHAL TAGS
        const renderSingleGroup = (gTag: string, files: TFile[], parentEl: HTMLElement, level: number, idx: number, total: number) => {
            if (files.length === 0) return;
            const groupDetails = parentEl.createEl('details', { cls: 'folder-details' });
            const groupKey = this.view.getTagGroupKey(tagName, gTag);
            groupDetails.dataset.groupKey = groupKey;
            const savedExpanded = this.plugin.settings.expandedGroups[tagName] || [];
            groupDetails.open = savedExpanded.includes(gTag);
            const summary = groupDetails.createEl('summary', { cls: 'folder-summary' });
            const groupChildren = groupDetails.createDiv({ cls: 'folder-children' });

            this.applyColorToDetails(groupDetails, summary, groupChildren, groupKey);

            // HLIST: GROUPS - Apply styling for level 1
            if (level === 1 && this.plugin.settings.treeStyle === 'shades') {
                const minOpacity = 0.1, maxOpacity = 0.4;
                let shadeOpacity;
                if (total > 1) {
                    const progress = idx / (total - 1);
                    shadeOpacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    shadeOpacity = minOpacity;
                }
                shadeOpacity = Math.min(maxOpacity, Math.max(minOpacity, shadeOpacity));
                summary.classList.add('shaded-folder-summary');
                //summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                summary.setCssProps({ '--folder-shade-opacity': String(shadeOpacity) });
                groupChildren.classList.add('shaded-folder-children');
                //groupChildren.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                groupChildren.setCssProps({ '--folder-shade-opacity': String(shadeOpacity) });
            } else if (level === 1 && this.plugin.settings.treeStyle === 'hues') {
                const minOpacity = 0.1, maxOpacity = 0.3;
                let hue, opacity;
                if (total > 1) {
                    const progress = idx / (total - 1);
                    hue = progress * 360;
                    opacity = maxOpacity - progress * (maxOpacity - minOpacity);
                } else {
                    hue = 0;
                    opacity = minOpacity;
                }
                opacity = Math.min(maxOpacity, Math.max(minOpacity, opacity));
                summary.classList.add('hued-folder-summary');
                //summary.style.setProperty('--hue-start', String(hue));
                //summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                //summary.style.setProperty('--hue-opacity', String(opacity));
                summary.setCssProps({ '--hue-start': String(hue) });
                summary.setCssProps({ '--hue-end': String((hue + 30) % 360) });
                summary.setCssProps({ '--hue-opacity': String(opacity) });
                groupChildren.classList.add('hued-folder-children');
                //groupChildren.style.setProperty('--hue-start', String(hue));
                //groupChildren.style.setProperty('--hue-end', String((hue + 30) % 360));
                //groupChildren.style.setProperty('--hue-opacity', String(opacity * 0.6));
                groupChildren.setCssProps({ '--hue-start': String(hue) });
                groupChildren.setCssProps({ '--hue-end': String((hue + 30) % 360) });
                groupChildren.setCssProps({ '--hue-opacity': String(opacity * 0.6) });
            }

            // HLIST: GROUPS - Elements
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            this.plugin.renderCustomIcon(iconSpan, groupKey, 'tag-simple');
            summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
            summary.dataset.tagPath = gTag;
            summary.dataset.reorderKey = groupKey;

            // HLIST: GROUPS - open-dot
            if (this.shouldShowOpenDot(gTag, true)) {
                summary.createSpan({ cls: 'open-dot' });
            }

            // HLIST: GROUPS - Quick‑create note for tag groups subtagtree (mainT + gTag)
            this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName, [gTag]));

            // HLIST: GROUPS - Apply context note highlight to group
            const groupTagPath = gTag;
            this.applyContextNoteHighlight(summary, iconSpan, groupTagPath);

            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const groupKey = this.view.getTagGroupKey(tagName, gTag);
                ContextMenuFactory.showGroupTagContextMenu(this.view, tagName, groupKey, gTag, groupDetails, summary, e);
            });

            const contextNoteOn = this.plugin.settings.enableContextNotes;
            const showContextNotes = this.plugin.settings.showContextNotesInTree;
            let sGroupFiles = sortFiles(files);
            if (!contextNoteOn || (contextNoteOn && showContextNotes)) {
                const sGroupContextNote = getContextNote(this.app, this.plugin, gTag);
                if (sGroupContextNote && !this.plugin.settings.hiddenItems[sGroupContextNote.path]) {
                    const alreadyListed = files.some(f => f.path === sGroupContextNote.path);
                    if (!alreadyListed) {
                        sGroupFiles = [...sGroupFiles, sGroupContextNote];
                    }
                }
            }
            const sGroupFilesContextAware = sGroupFiles.filter(file => {
                if (this.plugin.settings.enableContextNotes && !this.plugin.settings.showContextNotesInTree && isContextNoteFile(this.app, this.plugin, file, gTag)) {
                    return false;
                }
                return true;
            });
            const sectioned = SectionRenderer.renderSections(
                this.app, this.plugin, this.view, 
                sGroupFilesContextAware, 
                `tag:${tagName}/group:${gTag}`, 
                groupChildren, openFiles,
                (fileEl) => {
                    fileEl.addEventListener('click', () => {
                        this.view.activeGroupTag = gTag;
                    }, true);
                }
            );
            if (!sectioned) {
                for (const file of sGroupFilesContextAware) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    const fileEl = FileItemFactory.createFileItem(this.app, this.plugin, this.view, file, groupChildren, openFiles);
                    fileEl.addEventListener('click', () => {
                        this.view.activeGroupTag = gTag;
                    }, true);
                }
            }

            groupDetails.addEventListener('toggle', () => {
                let expanded = this.plugin.settings.expandedGroups[tagName] || [];
                if (groupDetails.open) {
                    if (!expanded.includes(gTag)) expanded = [...expanded, gTag];
                } else {
                    expanded = expanded.filter(t => t !== gTag);
                }
                this.plugin.settings.expandedGroups[tagName] = expanded;
                this.plugin.saveData(this.plugin.settings).catch(console.error);
            });

            // HLIST: GROUPS - treeEventHelpers.ts
            TreeEventHelpers.attachTagNodeListeners(summary, groupKey, gTag, this.view);
            TreeEventHelpers.attachIconContextNoteOpener(iconSpan, gTag, this.view);
        };

        // HLIST: GROUPS - Render all top-level items with global index
        const totalTop = topLevelItems.length;
        topLevelItems.forEach((item, idx) => {
            if (item.type === 'subtag') {
                renderNode(item.data as TagNode, mainChildren, 1, idx, totalTop);
            } else {
                const groupData = item.data as { tag: string; files: TFile[] };
                renderSingleGroup(groupData.tag, groupData.files, mainChildren, 1, idx, totalTop);
            }
        });

        // HLIST: Render ungrouped root files (files directly under main tag that are not in any group)
        const ungroupedRootFiles: TFile[] = [];
        if (groupTags && groupTags.length > 0) {
            const groupedFiles = new Set<TFile>();
            for (const item of topLevelItems) {
                if (item.type === 'group') {
                    for (const f of (item.data as { files: TFile[] }).files) groupedFiles.add(f);
                }
            }
            for (const file of root.files) {
                if (!groupedFiles.has(file)) ungroupedRootFiles.push(file);
            }
        } else {
            ungroupedRootFiles.push(...root.files);
        }

        const noGroupRootFiles = sortFiles(ungroupedRootFiles);
        const noGroupRootFilesContextAware = noGroupRootFiles.filter(file => {
            if (this.plugin.settings.enableContextNotes && !this.plugin.settings.showContextNotesInTree && isContextNoteFile(this.app, this.plugin, file, tagName)) {
                return false;
            }
            return true;
        });
        const sectioned = SectionRenderer.renderSections(this.app, this.plugin, this.view, noGroupRootFilesContextAware, `tag:${tagName}`, mainChildren, openFiles)
        if (!sectioned) {
            for (const file of noGroupRootFilesContextAware) {
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                FileItemFactory.createFileItem(this.app, this.plugin, this.view, file, mainChildren, openFiles);
            }
        }   
    }
}