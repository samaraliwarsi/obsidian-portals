import { App, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { PortalsActions } from './portalsActions';
import { TreeEventHelpers } from './treeEventHelpers';
import { ContextMenuFactory } from './contextMenuFactory';

export class FileItemFactory {

    static createFileItem(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile, container: HTMLElement, openFiles: Set<string>): HTMLElement {
        const fileEl = container.createDiv({ cls: 'file-item' });

        const customIcon = PortalsActions.getCustomIcon(plugin, file.path);
        const fileIconClass = customIcon ? `ph ph-${customIcon}` : 'ph ph-file';
        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        iconSpan.createEl('i', { cls: fileIconClass });

        const nameSpan = fileEl.createSpan({ text: FileItemFactory.getDisplayName(file, plugin) });
        nameSpan.addClass('portals-item-name');
        fileEl.dataset.path = file.path;

        const savedColor = plugin.settings.customColors[file.path];
        const icon = fileEl.querySelector('.file-icon i');
        if (savedColor) {
            fileEl.classList.add('has-file-color');
            fileEl.style.setProperty('--file-color', savedColor);
            if (icon) icon.addClass('has-file-color');
        } else {
            fileEl.classList.remove('has-file-color');
            fileEl.style.removeProperty('--file-color');
        }

        const isOpen = openFiles.has(file.path);
        let openDotSpan: HTMLSpanElement | null = null;
        if (isOpen) openDotSpan = fileEl.createSpan({ cls: 'open-dot' });

        if (plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md') {
            const extSpan = fileEl.createSpan({ cls: 'file-extension' });
            extSpan.setText('.' + file.extension.toUpperCase());
            if (openDotSpan) openDotSpan.style.display = 'none';
            if (isOpen) extSpan.addClass('is-open');
        }

        if (plugin.settings.showFilePreview && file.extension === 'md') {
            fileEl.addClass('file-item-has-preview');

            const isExcluded = plugin.settings.previewExcludedFiles[file.path] ?? false;

            const toggleBtn = fileEl.createSpan({ cls: 'portals-file-action-icons' });
            const toggleIcon = toggleBtn.createEl('i', {
                cls: `ph ph-${isExcluded ? 'plus-circle' : 'minus-circle'}`
            });
            const previewEl = fileEl.createDiv({ cls: 'portals-file-preview' });
            if (isExcluded) previewEl.addClass('file-item-preview-hidden');

            app.vault.cachedRead(file).then((content: string) => {
                const noYaml = content.replace(/^---[\s\S]*?---/, '');
                const snippet = noYaml
                    .replace(/#+\s*/g, '')
                    .replace(/\[\[.*?\]\]/g, '')
                    .replace(/\[.*?\]\(.*?\)/g, '')
                    .replace(/[*_~`>]/g, '')
                    .trim()
                    .slice(0, 300);
                previewEl.setText(snippet + (snippet.length >= 300 ? '…' : ''));
            }).catch(() => {});

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tempExcluded = plugin.settings.previewExcludedFiles[file.path] ?? false;
                plugin.settings.previewExcludedFiles[file.path] = !tempExcluded;
                void plugin.saveSettings();
                previewEl.classList.toggle('file-item-preview-hidden', !tempExcluded);
                toggleIcon.className = `ph ph-${!tempExcluded ? 'plus-circle' : 'minus-circle'}`;
            });
            
            if (savedColor) {
                previewEl.addClass('has-file-color');
                previewEl.style.setProperty('--file-color', savedColor);
            } else {
                previewEl.removeClass('has-file-color');
                previewEl.style.removeProperty('--file-color');
            }
        }

        TreeEventHelpers.attachFileItemListeners(fileEl, file, view);

        fileEl.addEventListener('contextmenu', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            ContextMenuFactory.showFileMenu(view, file, fileEl, e)
        });

        view.addHoverPreview(fileEl, file.path);

        view.fileElementMap.set(file.path, fileEl);

        return fileEl;
    }

    private static getDisplayName(file: TFile, plugin: PortalsPlugin): string {
        if (file.extension === 'md') return file.basename;
        return plugin.settings.enableFileExtensionNonMD ? file.basename : file.name;
    }
}