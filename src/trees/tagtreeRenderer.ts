import { App, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { isContextNoteFile, hasContextNote, getContextNote } from '../renderers/contextNotes';

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
            details.style.setProperty('--folder-color', savedColor);
        } else {
            details.classList.remove('has-folder-color');
            details.style.removeProperty('--folder-color');
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
                ...(cache?.frontmatter?.tags || [])
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
                ...(cache?.frontmatter?.tags || [])
            ];
            for (const tag of fileTags) {
                if (tag === tagName || tag.startsWith(tagName + '/')) {
                    allTags.add(tag);
                    if (!tagToFiles.has(tag)) tagToFiles.set(tag, []);
                    tagToFiles.get(tag)!.push(file);
                }
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
                return cache?.tags?.some(t => t.tag === mainTag) || cache?.frontmatter?.tags?.includes(tagName);
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
            mainIconSpan.createEl('i', { cls: `ph ph-${iconName || 'tag'}` });
            mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
            const childrenContainer = mainDetails.createDiv({ cls: 'folder-children' });
            mainSummary.dataset.tagPath = tagName;

            // FLAT LIST: Apply context note highlight to main tag
            const mainTagPath = tagName; // e.g., "project"
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
                for (const file of sortFiles(taggedFiles)) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    if (this.plugin.settings.enableContextNotes && !this.plugin.settings.showContextNotesInTree && isContextNoteFile(this.app, this.plugin, file, tagName)) {
                        continue;
                    }
                    this.view.createFileItem(file, childrenContainer, openFiles);
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
                    ...(cache?.frontmatter?.tags || [])
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
                    summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                    groupChildren.classList.add('shaded-folder-children');
                    groupChildren.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
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
                    summary.style.setProperty('--hue-start', String(hue));
                    summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                    summary.style.setProperty('--hue-opacity', String(opacity));
                    groupChildren.classList.add('hued-folder-children');
                    groupChildren.style.setProperty('--hue-start', String(hue));
                    groupChildren.style.setProperty('--hue-end', String((hue + 30) % 360));
                    groupChildren.style.setProperty('--hue-opacity', String(opacity * 0.6));
                }

                // FLAT LIST: TAG GROUPS - icon with custom support
                const customIcon = PortalsActions.getCustomIcon(this.plugin, groupKey);
                const iconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-tag-simple';
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                iconSpan.createEl('i', { cls: iconClass });
                summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
                summary.dataset.tagPath = gTag;
                summary.dataset.reorderKey = groupKey;


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

                // FLAT LIST: TAG GROUP - Show context note file if setting enabled (same as subtag groups)
                if (!this.plugin.settings.enableContextNotes || (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree)) {
                    const contextNote = getContextNote(this.app, this.plugin, gTag);
                    if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                        // Avoid duplication if the note is already in the file list
                        const alreadyListed = files.some(f => f.path === contextNote.path);
                        if (!alreadyListed) {
                            this.view.createFileItem(contextNote, groupChildren, openFiles);
                        }
                    }
                }

                for (const file of sortFiles(files)) {
                    this.view.createFileItem(file, groupChildren, openFiles);
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
            for (const file of sortFiles(ungrouped)) {
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                if (this.plugin.settings.enableContextNotes &&
                    !this.plugin.settings.showContextNotesInTree &&
                    isContextNoteFile(this.app, this.plugin, file, tagName)) {
                    continue;
                }
                this.view.createFileItem(file, childrenContainer, openFiles);
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

            const customIcon = PortalsActions.getCustomIcon(this.plugin, nodeKey);
            const iconClass = customIcon ? `ph ph-${customIcon}` : `ph ph-${iconName || 'tag'}`;
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            const nameSpan = summary.createSpan({ text: node.name });
            nameSpan.addClass('portals-item-name');
            summary.dataset.tagPath = node.fullPath;
            summary.dataset.reorderKey = nodeKey;

            const childrenContainer = details.createDiv({ cls: 'folder-children' });

            // HLIST: SUBTAGS - Quick‑create note for sub tag tree sub item (node.fullpath)
            this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, node.fullPath));

            // HLIST: SUBTAGS - Apply context note highlight to subtag node
            const nodeTagPath = node.fullPath; // e.g., "project/ideas"
            this.applyContextNoteHighlight(summary, iconSpan, nodeTagPath);

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = getContextNote(this.app, this.plugin, node.fullPath);
                if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                    const alreadyListed = node.files.some((f: TFile) => f.path === contextNote.path);
                    if (!alreadyListed) {
                        this.view.createFileItem(contextNote, childrenContainer, openFiles);
                    }
                }
            }

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
                summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                childrenContainer.classList.add('shaded-folder-children');
                childrenContainer.style.setProperty('--folder-shade-opacity', String(shadeOpacity * 0.6));
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
                summary.style.setProperty('--hue-start', String(hue));
                summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                summary.style.setProperty('--hue-opacity', String(opacity));
                childrenContainer.classList.add('hued-folder-children');
                childrenContainer.style.setProperty('--hue-start', String(hue));
                childrenContainer.style.setProperty('--hue-end', String((hue + 30) % 360));
                childrenContainer.style.setProperty('--hue-opacity', String(opacity * 0.6));
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
                for (const file of sortFiles(node.files)) {
                    if (this.plugin.settings.hiddenItems[file.path]) continue;
                    if (this.plugin.settings.enableContextNotes &&
                        !this.plugin.settings.showContextNotesInTree &&
                        isContextNoteFile(this.app, this.plugin, file, node.fullPath)) {
                        continue;
                    }
                    this.view.createFileItem(file, childrenContainer, openFiles);
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
        mainIconSpan.createEl('i', { cls: `ph ph-${iconName || 'tag'}` });
        mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
        const mainChildren = mainDetails.createDiv({ cls: 'folder-children' });
        mainSummary.dataset.tagPath = tagName;

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
                    ...(cache?.frontmatter?.tags || [])
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
                summary.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
                groupChildren.classList.add('shaded-folder-children');
                groupChildren.style.setProperty('--folder-shade-opacity', String(shadeOpacity));
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
                summary.style.setProperty('--hue-start', String(hue));
                summary.style.setProperty('--hue-end', String((hue + 30) % 360));
                summary.style.setProperty('--hue-opacity', String(opacity));
                groupChildren.classList.add('hued-folder-children');
                groupChildren.style.setProperty('--hue-start', String(hue));
                groupChildren.style.setProperty('--hue-end', String((hue + 30) % 360));
                groupChildren.style.setProperty('--hue-opacity', String(opacity * 0.6));
            }

            // HLIST: GROUPS - Elements
            const customIconGroup = PortalsActions.getCustomIcon(this.plugin, groupKey);
            const iconClass = customIconGroup ? `ph ph-${customIconGroup}` : 'ph ph-tag-simple';
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
            summary.dataset.tagPath = gTag;
            summary.dataset.reorderKey = groupKey;

            // HLIST: GROUPS - Quick‑create note for tag groups subtagtree (mainT + gTag)
            this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName, [gTag]));

            // HLIST: GROUPS - Apply context note highlight to group
            const groupTagPath = gTag; // e.g., "urgent"
            this.applyContextNoteHighlight(summary, iconSpan, groupTagPath);

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = getContextNote(this.app, this.plugin, gTag);
                if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                    const alreadyListed = files.some((f: TFile) => f.path === contextNote.path);
                    if (!alreadyListed) {
                        this.view.createFileItem(contextNote, groupChildren, openFiles);
                    }
                }
            }

            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const groupKey = this.view.getTagGroupKey(tagName, gTag);
                ContextMenuFactory.showGroupTagContextMenu(this.view, tagName, groupKey, gTag, groupDetails, summary, e);
            });

            for (const file of sortFiles(files)) {
                if (this.plugin.settings.hiddenItems[file.path]) continue;
                if (this.plugin.settings.enableContextNotes &&
                    !this.plugin.settings.showContextNotesInTree &&
                    isContextNoteFile(this.app, this.plugin, file, gTag)) {
                    continue;
                }
                this.view.createFileItem(file, groupChildren, openFiles);
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
        for (const file of sortFiles(ungroupedRootFiles)) {
            if (this.plugin.settings.hiddenItems[file.path]) continue;
            if (this.plugin.settings.enableContextNotes &&
                !this.plugin.settings.showContextNotesInTree &&
                isContextNoteFile(this.app, this.plugin, file, tagName)) {
                continue;
            }
            this.view.createFileItem(file, mainChildren, openFiles);
        }

        // Include context note file in tree if setting enabled
        if (this.plugin.settings.showContextNotesInTree) {
            const contextNote = getContextNote(this.app, this.plugin, tagName);
            if (contextNote) {
                // Avoid duplication if it's already in the list (shouldn't be, but safe)
                const alreadyListed = ungroupedRootFiles.some(f => f.path === contextNote.path);
                if (!alreadyListed) {
                    this.view.createFileItem(contextNote, mainChildren, openFiles);
                }
            }
        }
    }
}