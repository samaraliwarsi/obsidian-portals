import { App, Platform, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { TreeEventHelpers } from '../utils/treeEventHelpers';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { FileItemFactory } from '../utils/fileItemFactory';
import { getPluginInstance } from '../utils/Proxies/pluginInstance';

// Everything a row builder needs. A row is a projection of state: it reads the
// context, never the DOM.
export interface RowCtx {
    app: App;
    plugin: PortalsPlugin;
    view: PortalsView;
    openFiles: Set<string>;
}

export class Rows {
    // One file row. This is the single implementation shared by the main tree,
    // the section list and every side-panel list.
    static file(ctx: RowCtx, file: TFile, container: HTMLElement): HTMLElement {
        const { app, plugin, view, openFiles } = ctx;
        const fileEl = container.createDiv({ cls: 'file-item' });
        const appearance = plugin.getFileAppearance(file);
        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        getPluginInstance()?.renderIconString(iconSpan, appearance.icon, 'file');

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

            const explicit = plugin.settings.previewExcludedFiles[file.path];
            const collapsed = view.previewsCollapsed;
            const showPreview = collapsed ? explicit === false : explicit !== true;

            const toggleBtn = fileEl.createSpan({ cls: 'portals-file-action-icons' });
            plugin.renderPluginIcon(toggleBtn, showPreview ? 'minus-circle' : 'plus-circle');

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

                if (!showPreview) {
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
}