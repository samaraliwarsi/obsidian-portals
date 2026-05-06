// src/trees/tagtreeRenderer.ts

import { App, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from '../utils/portalsActions';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { isContextNoteFile, hasContextNote, getContextNote } from '../renderers/contextNotes';

// -------------------------------------------------------------------
// Copy of the original buildTagSpace method, adapted to a standalone
// renderer. No logic changed – only this. references updated.
// -------------------------------------------------------------------

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

    /**
     * Renders the complete tag space for a given tag (including groups and subtags).
     * Parameters match the old PortalsView.buildTagSpace.
     */
    render(
        tagName: string,
        container: HTMLElement,
        iconName: string,
        openFiles: Set<string>,
        groupTags?: string[],
        totalGroups: number = 0
    ): void {
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

        // If no subtags, use the original logic (group tags or flat list)
        if (!hasSubtags) {
            // Original flat/group logic (unchanged from original)
            const taggedFiles = allFiles.filter(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                return cache?.tags?.some(t => t.tag === mainTag) || cache?.frontmatter?.tags?.includes(tagName);
            });
            if (taggedFiles.length === 0) {
                container.createEl('p', { text: 'No files with this tag.' });
                return;
            }

            // Sort helper (identical to original)
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

            // Create main details element for the tag
            const mainDetails = container.createEl('details', { cls: 'folder-details' });
            mainDetails.setAttr('open', 'true');
            const mainSummary = mainDetails.createEl('summary', { cls: 'folder-summary' });
            const mainIconSpan = mainSummary.createSpan({ cls: 'folder-icon' });
            mainIconSpan.createEl('i', { cls: `ph ph-${iconName || 'tag'}` });
            mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
            const childrenContainer = mainDetails.createDiv({ cls: 'folder-children' });
            mainSummary.dataset.tagPath = tagName;

            // Apply context note highlight to main tag
            const mainTagPath = tagName; // e.g., "project"
            if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, mainTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    mainIconSpan.addClass('has-context-note-icon');
                    mainSummary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    mainSummary.addClass('has-context-note-underline');
                }
            }

            // Quick‑create note for tag lists (tagName)
            this.view.quickFileIcon(mainSummary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName));

            mainSummary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                ContextMenuFactory.showTagContextMenu(this.view, tagName, iconName || 'tag', mainSummary, e);
            });

            TreeEventHelpers.attachMainTagListeners(mainSummary, tagName, this.view);
            TreeEventHelpers.attachIconContextNoteOpener(mainIconSpan, tagName, this.view);

            // If no groups, just list all files under the main tag
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

            // Build groups map
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

            // Render each group as a nested details element
            let groupIndex = 0;
            for (const [gTag, files] of groups.entries()) {
                if (files.length === 0) continue;
                const groupDetails = childrenContainer.createEl('details', { cls: 'folder-details' });
                const groupKey = this.view.getTagGroupKey(tagName, gTag);
                groupDetails.dataset.groupKey = groupKey;

                // open state based on expanded groups
                const saveExpanded = this.plugin.settings.expandedGroups[tagName] || [];
                if (saveExpanded.includes(gTag)) {
                    groupDetails.open = true;
                } else {
                    groupDetails.open = false;
                }
                const summary = groupDetails.createEl('summary', { cls: 'folder-summary' });
                const groupChildren = groupDetails.createDiv({ cls: 'folder-children' });

                const savedColor = this.plugin.settings.tagColors[groupKey];
                const style = this.plugin.settings.treeStyle;
                const canApplyColor = savedColor && style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);

                if (canApplyColor) {
                    groupDetails.classList.add('has-folder-color');
                    summary.classList.add('has-folder-color');
                    groupChildren.classList.add('has-folder-color');
                    groupDetails.style.setProperty('--folder-color', savedColor);
                } else {
                    groupDetails.classList.remove('has-folder-color');
                    groupDetails.style.removeProperty('--folder-color');
                    summary.classList.remove('has-folder-color');
                    groupChildren.classList.remove('has-folder-color');
                }

                // Shades Style
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

                // Hue Style
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

                // icon with custom support
                const customIcon = PortalsActions.getCustomIcon(this.plugin, groupKey);
                const iconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-tag-simple';
                const iconSpan = summary.createSpan({ cls: 'folder-icon' });
                iconSpan.createEl('i', { cls: iconClass });
                summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
                summary.dataset.tagPath = gTag;

                // Quick‑create note for tag groups flat list (mainT + gTag)
                this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName, [gTag]));

                // Apply context note highlight to group tag
                const groupTagPath = gTag;
                if (
                    this.plugin.settings.enableContextNotes &&
                    hasContextNote(this.app, this.plugin, groupTagPath) &&
                    this.plugin.settings.contextNoteHighlightStyle !== 'none'
                ) {
                    const highlightStyle = this.plugin.settings.contextNoteHighlightStyle;
                    if (highlightStyle === 'icon') {
                        iconSpan.addClass('has-context-note-icon');
                        summary.addClass('has-context-note-icon');
                    } else if (highlightStyle === 'underline') {
                        summary.addClass('has-context-note-underline');
                    }
                }

                // context menu for group
                summary.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const groupKey = this.view.getTagGroupKey(tagName, gTag);
                    ContextMenuFactory.showGroupTagContextMenu(this.view, tagName, groupKey, gTag, groupDetails, summary, e);
                });

                TreeEventHelpers.attachTagNodeListeners(summary, groupKey, gTag, this.view);
                TreeEventHelpers.attachIconContextNoteOpener(iconSpan, gTag, this.view);

                // Show context note file if setting enabled (same as subtag groups)
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

            // Render ungrouped files directly under main tag
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

        // ----- HIERARCHICAL TAGS (subtags exist) -----
        // Build a tree structure (TagNode already defined above)

        const root: TagNode = { fullPath: tagName, name: tagName, children: new Map(), files: tagToFiles.get(tagName) || [] };

        // Insert each tag into the tree
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

            const childrenContainer = details.createDiv({ cls: 'folder-children' });

            // Quick‑create note for sub tag tree sub item (node.fullpath)
            this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, node.fullPath));

            // Apply context note highlight to subtag node
            const nodeTagPath = node.fullPath; // e.g., "project/ideas"
            if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, nodeTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    iconSpan.addClass('has-context-note-icon');
                    summary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    summary.addClass('has-context-note-underline');
                }
            }

            if (this.plugin.settings.enableContextNotes && this.plugin.settings.showContextNotesInTree) {
                const contextNote = getContextNote(this.app, this.plugin, node.fullPath);
                if (contextNote && !this.plugin.settings.hiddenItems[contextNote.path]) {
                    const alreadyListed = node.files.some((f: TFile) => f.path === contextNote.path);
                    if (!alreadyListed) {
                        this.view.createFileItem(contextNote, childrenContainer, openFiles);
                    }
                }
            }

            const savedColor = this.plugin.settings.tagColors[nodeKey];
            const style = this.plugin.settings.treeStyle;
            const canApplyColor = savedColor && style !== 'shades' && style !== 'hues' && !(style === 'portals' && this.plugin.settings.tabColorEnabled);
            if (canApplyColor) {
                details.classList.add('has-folder-color');
                summary.classList.add('has-folder-color');
                details.style.setProperty('--folder-color', savedColor);
                childrenContainer.classList.add('has-folder-color');
            } else {
                summary.classList.remove('has-folder-color');
                details.classList.remove('has-folder-color');
                details.style.removeProperty('--folder-color');
                childrenContainer.classList.remove('has-folder-color');
            }

            // Apply shades/hues styling only at level 1
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

            // Render child tags
            const sortedChildren = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
            for (const child of sortedChildren) {
                renderNode(child, childrenContainer, level + 1);
            }

            // Render files belonging to this node
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

            // Context menu for custom icon on tag node
            summary.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                ContextMenuFactory.showSubtagNodeContextMenu(this.view, tagName, node.fullPath, iconName || 'tag', details, summary, e);
            });

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

        // Main wrapper details for the portal
        const mainDetails = container.createEl('details', { cls: 'folder-details' });
        mainDetails.open = true;
        const mainSummary = mainDetails.createEl('summary', { cls: 'folder-summary' });
        const mainIconSpan = mainSummary.createSpan({ cls: 'folder-icon' });
        mainIconSpan.createEl('i', { cls: `ph ph-${iconName || 'tag'}` });
        mainSummary.createSpan({ text: '#' + tagName }).addClass('portals-item-name');
        const mainChildren = mainDetails.createDiv({ cls: 'folder-children' });
        mainSummary.dataset.tagPath = tagName;

        // Quick‑create note for sub tag tree head item (tagName)
        this.view.quickFileIcon(mainSummary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName));

        // Apply context note highlight to main tag
        const mainTagPath = tagName;
        if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, mainTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
            const style = this.plugin.settings.contextNoteHighlightStyle;
            if (style === 'icon') {
                mainIconSpan.addClass('has-context-note-icon');
                mainSummary.addClass('has-context-note-icon');
            } else if (style === 'underline') {
                mainSummary.addClass('has-context-note-underline');
            }
        }

        mainSummary.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            ContextMenuFactory.showTagContextMenu(this.view, tagName, iconName || 'tag', mainSummary, e);
        });

        TreeEventHelpers.attachMainTagListeners(mainSummary, tagName, this.view);
        TreeEventHelpers.attachIconContextNoteOpener(mainIconSpan, tagName, this.view);

        // Build unified list of top-level items (subtags + groups from root files)
        const topLevelItems: TopLevelItem[] = [];

        // Add subtag nodes
        const topChildren = Array.from(root.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const child of topChildren) {
            topLevelItems.push({ type: 'subtag', name: child.name, data: child });
        }

        // Add groups from root files (if any groupTags)
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

        // Sort alphabetically
        topLevelItems.sort((a, b) => a.name.localeCompare(b.name));

        // Helper to render a single group (extracted from groupAndRenderFiles)
        const renderSingleGroup = (gTag: string, files: TFile[], parentEl: HTMLElement, level: number, idx: number, total: number) => {
            if (files.length === 0) return;
            const groupDetails = parentEl.createEl('details', { cls: 'folder-details' });
            const groupKey = this.view.getTagGroupKey(tagName, gTag);
            groupDetails.dataset.groupKey = groupKey;
            const savedExpanded = this.plugin.settings.expandedGroups[tagName] || [];
            groupDetails.open = savedExpanded.includes(gTag);
            const summary = groupDetails.createEl('summary', { cls: 'folder-summary' });
            const groupChildren = groupDetails.createDiv({ cls: 'folder-children' });

            const savedColor = this.plugin.settings.tagColors[groupKey];
            const style = this.plugin.settings.treeStyle;
            const canApplyColor = savedColor && style !== 'shades' && style !== 'hues' && !(style == 'portals' && this.plugin.settings.tabColorEnabled);
            if (canApplyColor) {
                groupDetails.classList.add('has-folder-color');
                summary.classList.add('has-folder-color');
                groupChildren.classList.add('has-folder-color');
                groupDetails.style.setProperty('--folder-color', savedColor);
            } else {
                groupDetails.classList.remove('has-folder-color');
                groupDetails.style.removeProperty('--folder-color');
                summary.classList.remove('has-folder-color');
                groupChildren.classList.remove('has-folder-color');
            }

            // Apply styling for level 1
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

            const customIconGroup = PortalsActions.getCustomIcon(this.plugin, groupKey);
            const iconClass = customIconGroup ? `ph ph-${customIconGroup}` : 'ph ph-tag-simple';
            const iconSpan = summary.createSpan({ cls: 'folder-icon' });
            iconSpan.createEl('i', { cls: iconClass });
            summary.createSpan({ text: '#' + gTag }).addClass('portals-item-name');
            summary.dataset.tagPath = gTag;

            // Quick‑create note for tag groups subtagtree (mainT + gTag)
            this.view.quickFileIcon(summary, () => void PortalsActions.newNoteInTagSpace(this.app, this.plugin, this.view, tagName, [gTag]));

            // Apply context note highlight to group
            const groupTagPath = gTag; // e.g., "urgent"
            if (this.plugin.settings.enableContextNotes && hasContextNote(this.app, this.plugin, groupTagPath) && this.plugin.settings.contextNoteHighlightStyle !== 'none') {
                const style = this.plugin.settings.contextNoteHighlightStyle;
                if (style === 'icon') {
                    iconSpan.addClass('has-context-note-icon');
                    summary.addClass('has-context-note-icon');
                } else if (style === 'underline') {
                    summary.addClass('has-context-note-underline');
                }
            }

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

            TreeEventHelpers.attachTagNodeListeners(summary, groupKey, gTag, this.view);
            TreeEventHelpers.attachIconContextNoteOpener(iconSpan, gTag, this.view);
        };

        // Render all top-level items with global index
        const totalTop = topLevelItems.length;
        topLevelItems.forEach((item, idx) => {
            if (item.type === 'subtag') {
                renderNode(item.data as TagNode, mainChildren, 1, idx, totalTop);
            } else {
                const groupData = item.data as { tag: string; files: TFile[] };
                renderSingleGroup(groupData.tag, groupData.files, mainChildren, 1, idx, totalTop);
            }
        });

        // Render ungrouped root files (files directly under main tag that are not in any group)
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