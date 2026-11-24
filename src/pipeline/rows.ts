import { App, Platform, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { FileItemFactory } from '../utils/fileItemFactory';

// Everything a row builder needs. A row is a projection of state: it reads the
// context, never the DOM.
export interface RowCtx {
    app: App;
    plugin: PortalsPlugin;
    view: PortalsView;
    openFiles: Set<string>;
}

export interface BranchSpec {
    key: string;
    /// Which data attribute carries the key: folders use data-path, tags use data-tag-path.
    keyAttr?: 'path' | 'tagPath';
    label: string;
    iconKey: string;
    iconFallback: string;
    reorderKey?: string;
    open?: boolean;
    colorKey?: string;
    colorSource?: 'folder' | 'tag';
    depth?: number;
    index?: number;
    totalFirstLevel?: number;
    contextNoteHighlight?: boolean;
    openDot?: boolean;
    /// Shades ramp ceiling, and the multiplier applied to the children's opacity.
    /// Shared by folders, tags and groups: same DOM, same ramp.
    shadeMaxOpacity?: number;
    shadeChildrenFactor?: number;
    hueMaxOpacity?: number;
    hueChildrenFactor?: number;
    /// Hue position used when a level has a single row. Folders and tag groups
    /// sit at the middle (0.5); subtag levels start at 0.
    singleHueProgress?: number;
    tooltip?: (nameSpan: HTMLElement) => string | null;
}

export interface BranchParts {
    details: HTMLDetailsElement;
    summary: HTMLElement;
    children: HTMLDivElement;
    icon: HTMLElement;
}

export class Rows {
    // One file row. This is the single implementation shared by the main tree,
    // the section list and every side-panel list.
    static file(ctx: RowCtx, file: TFile, container: HTMLElement): HTMLElement {
        const { app, plugin, view, openFiles } = ctx;
        const fileEl = container.createDiv({ cls: 'file-item' });
        const appearance = plugin.getFileAppearance(file);
        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        plugin.renderIconString(iconSpan, appearance.icon, 'file');

        const nameSpan = fileEl.createSpan({ text: FileItemFactory.getDisplayName(file, plugin) });
        nameSpan.addClass('portals-item-name');
        fileEl.dataset.path = file.path;
        // reminder icon
        FileItemFactory.applyReminderIndicator(fileEl, file, app, plugin);

        const savedColor = appearance.color;
        if (savedColor) {
            fileEl.classList.add('has-file-color');
            fileEl.setCssProps({ '--file-color': savedColor });
            const icon = fileEl.querySelector('.file-icon i');
            if (icon) icon.addClass('has-file-color');
        } else {
            fileEl.classList.remove('has-file-color');
            fileEl.setCssProps({ '--file-color': '' });
        }

        const isOpen = openFiles.has(file.path);
        let openDotSpan: HTMLSpanElement | null = null;
        if (isOpen) openDotSpan = fileEl.createSpan({ cls: 'open-dot' });

        if (plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md') {
            const extSpan = fileEl.createSpan({ cls: 'file-extension' });
            extSpan.setText('.' + file.extension.toUpperCase());
            if (openDotSpan) {
                openDotSpan.setCssProps({ display: 'none' });
            }
            if (isOpen) extSpan.addClass('is-open');
        }

        if (plugin.settings.showFilePreview && file.extension === 'md') {
            fileEl.addClass('file-item-has-preview');


            const toggleBtn = fileEl.createSpan({ cls: 'portals-file-action-icons' });
            const excludedAtBuild = plugin.settings.previewExcludedFiles[file.path];
            const shownAtBuild = view.previewsCollapsed ? excludedAtBuild === false : excludedAtBuild !== true;
            plugin.renderPluginIcon(toggleBtn, shownAtBuild ? 'minus-circle' : 'plus-circle');

            let previewEl: HTMLDivElement | null = null;
            let infoBar: HTMLDivElement | null = null;
            let taskEl: HTMLDivElement | null = null;

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newExcludedState = !plugin.settings.previewExcludedFiles[file.path];
                plugin.settings.previewExcludedFiles[file.path] = newExcludedState;
                void plugin.saveData(plugin.settings);

                const noShown = !newExcludedState;
                if (previewEl) {
                    previewEl.classList.toggle('file-item-preview-hidden', !noShown);
                }
                if (taskEl) {
                    taskEl.classList.toggle('file-item-preview-hidden', !noShown);
                }
                if (infoBar) {
                    infoBar.classList.toggle('file-item-preview-hidden', !noShown);
                }
                plugin.renderPluginIcon(toggleBtn, noShown ? 'minus-circle' : 'plus-circle');
            });

            app.vault.cachedRead(file).then((content: string) => {
                const snippet = FileItemFactory.extractSnippet(content, 300);
                if (snippet.length > 0) {
                    previewEl = fileEl.createDiv({ cls: 'portals-file-preview' });
                    previewEl.setText(snippet);
                }

                taskEl = FileItemFactory.buildTaskPreview(fileEl, content, plugin);

                if (plugin.settings.showFileInfoBar) {
                    infoBar = fileEl.createDiv({ cls: 'portals-file-info-bar' });
                    const portalType = plugin.settings.selectedSpace?.type;
                    if (portalType === 'folder') {
                        FileItemFactory.applyFileInfoBarTags(infoBar, file, app);
                    } else if (portalType === 'tag') {
                        const parentFolder = file.parent;
                        if (parentFolder && parentFolder.path !== '/') {
                            const folderName = parentFolder.name;
                            infoBar.createSpan({ cls: 'portals-file-info-bar-text', text: 'in ' + folderName });
                        }
                    }
                }

                // Re-read the state: the +/- button may have been clicked while
                // this cachedRead was in flight, so a value captured at build
                // time would resurrect the very elements the user just hid.
                const excludedNow = plugin.settings.previewExcludedFiles[file.path] ?? false;
                const visibleNow = view.previewsCollapsed ? excludedNow === false : excludedNow !== true;
                if (!visibleNow) {
                    if (previewEl) previewEl.addClass('file-item-preview-hidden');
                    if (infoBar) infoBar.addClass('file-item-preview-hidden');
                    if (taskEl) taskEl.addClass('file-item-preview-hidden');
                }

                if (savedColor) {
                    if (previewEl) {
                        previewEl.addClass('has-file-color');
                        previewEl.setCssProps({ '--file-color': savedColor });
                    }
                    if (taskEl) {
                        taskEl.addClass('has-file-color');
                        taskEl.setCssProps({ '--file-color': savedColor });
                    }
                    if (infoBar) {
                        infoBar.addClass('has-file-color');
                        infoBar.setCssProps({ '--file-color': savedColor });
                    }
                } else {
                    if (previewEl) {
                        previewEl.removeClass('has-file-color');
                        previewEl.setCssProps({ '--file-color': '' });
                    }
                    if (taskEl) {
                        taskEl.removeClass('has-file-color');
                        taskEl.setCssProps({ '--file-color': '' });
                    }
                    if (infoBar) {
                        infoBar.removeClass('has-file-color');
                        infoBar.setCssProps({ '--file-color': '' });
                    }
                }
            }).catch(() => {});
        }

        TreeEventHelpers.attachFileItemListeners(fileEl, file, view);

        fileEl.addEventListener('contextmenu', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            ContextMenuFactory.showFileMenu(view, file, fileEl, e);
        });

        if (plugin.settings.showTreeItemToolTips && !Platform.isMobile) {
            fileEl.addEventListener('mouseenter', () => {
                void FileItemFactory.fetchFileTooltip(file, app, nameSpan, plugin).then(tip => {
                    if (tip) {
                        view.showTooltip(tip, fileEl, 300, 'right');
                    }
                });
            });

            fileEl.addEventListener('mouseleave', () => {
                view.hideTooltip(100);
            });
        }

        view.addHoverPreview(fileEl, file.path);

        view.fileElementMap.set(file.path, fileEl);

        return fileEl;
    }

    // A folder, a tag and a tag group are the same object in the DOM: a
    // <details> holding a <summary> row and a children container. One builder
    // serves all three so their styling and behaviour cannot drift apart.
    static branch(ctx: RowCtx, parent: HTMLElement, spec: BranchSpec): BranchParts {
        const { plugin, view } = ctx;
        const keyAttr = spec.keyAttr ?? 'path';

        const details = parent.createEl('details', { cls: 'folder-details' });
        if (spec.open) details.setAttr('open', 'true');

        const summary = details.createEl('summary', { cls: 'folder-summary' });
        const iconSpan = summary.createSpan({ cls: 'folder-icon' });
        plugin.renderCustomIcon(iconSpan, spec.iconKey, spec.iconFallback);

        const nameSpan = summary.createSpan({ text: spec.label });
        nameSpan.addClass('portals-item-name');
        if (keyAttr === 'tagPath') summary.dataset.tagPath = spec.key;
        else summary.dataset.path = spec.key;
        if (spec.reorderKey) summary.dataset.reorderKey = spec.reorderKey;

        if (spec.tooltip && !Platform.isMobile && plugin.settings.showTreeItemToolTips) {
            summary.addEventListener('mouseenter', () => {
                const tooltip = spec.tooltip?.(nameSpan);
                if (tooltip) view.showTooltip(tooltip, summary, 300, 'right');
            });
            summary.addEventListener('mouseleave', () => {
                view.hideTooltip(100);
            });
        }

        if (spec.contextNoteHighlight) {
            const style = plugin.settings.contextNoteHighlightStyle;
            if (style === 'icon') {
                iconSpan.addClass('has-context-note-icon');
                summary.addClass('has-context-note-icon');
            } else if (style === 'underline') {
                summary.addClass('has-context-note-underline');
                nameSpan.addClass('has-context-note-underline');
            }
        }

        if (spec.openDot) summary.createSpan({ cls: 'open-dot' });

        const children = details.createDiv({ cls: 'folder-children' });

        const treeStyle = plugin.settings.treeStyle;
        const colorKey = spec.colorKey;
        const savedColor = colorKey
            ? (spec.colorSource === 'tag' ? plugin.settings.tagColors[colorKey] : plugin.settings.customColors[colorKey])
            : undefined;
        const canApplyColor = savedColor
            && treeStyle !== 'shades'
            && treeStyle !== 'hues'
            && !(treeStyle === 'portals' && plugin.settings.tabColorEnabled);

        if (canApplyColor) {
            summary.classList.add('has-folder-color');
            details.classList.add('has-folder-color');
            children.classList.add('has-folder-color');
            details.setCssProps({ '--folder-color': savedColor });
            summary.setCssProps({ '--folder-color': savedColor });
        }

        const depth = spec.depth ?? 0;
        const total = (spec.totalFirstLevel ?? 0) > 0 ? (spec.totalFirstLevel ?? 1) : 1;
        const position = spec.index ?? 0;
        const hasRamp = total > 1;
        const progress = hasRamp ? position / (total - 1) : 0;
        const minOpacity = 0.1;
        const ramp = (ceiling: number, at: number) =>
            Math.min(ceiling, Math.max(minOpacity, ceiling - at * (ceiling - minOpacity)));

        if (depth === 1 && treeStyle === 'shades') {
            // A lone first-level row sits at the floor, as in the original
            // folder and tag implementations.
            const ceiling = spec.shadeMaxOpacity ?? 0.3;
            const shade = hasRamp ? ramp(ceiling, progress) : minOpacity;
            const childShade = shade * (spec.shadeChildrenFactor ?? 1);
            summary.classList.add('shaded-folder-summary');
            summary.setCssProps({ '--folder-shade-opacity': String(shade) });
            children.classList.add('shaded-folder-children');
            children.setCssProps({ '--folder-shade-opacity': String(childShade) });
        }

        if (depth === 1 && treeStyle === 'hues') {
            // A lone first-level row takes the middle of the wheel.
            const at = hasRamp ? progress : (spec.singleHueProgress ?? 0.5);
            const hue = at * 360;
            const hueOpacity = hasRamp ? ramp(spec.hueMaxOpacity ?? 0.3, at) : minOpacity;
            const childHue = hueOpacity * (spec.hueChildrenFactor ?? 0.6);
            summary.classList.add('hued-folder-summary');
            summary.setCssProps({ '--hue-start': String(hue) });
            summary.setCssProps({ '--hue-end': String((hue + 30) % 360) });
            summary.setCssProps({ '--hue-opacity': String(hueOpacity) });
            children.classList.add('hued-folder-children');
            children.setCssProps({ '--hue-start': String(hue) });
            children.setCssProps({ '--hue-end': String((hue + 30) % 360) });
            children.setCssProps({ '--hue-opacity': String(childHue) });
        }

        return { details, summary, children, icon: iconSpan };
    }
}