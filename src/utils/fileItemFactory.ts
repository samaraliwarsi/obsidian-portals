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

            let previewEl: HTMLDivElement | null = null;

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newState = FileItemFactory.toggleFilePreview(plugin, file.path, toggleIcon as HTMLElement);
                if (previewEl) {
                    previewEl.classList.toggle('file-item-preview-hidden', !newState);
                }
            });
            
            app.vault.cachedRead(file).then((content: string) => {
                const snippet = FileItemFactory.extractSnippet(content, 300);
                if (snippet.length > 0) {
                    previewEl = fileEl.createDiv({ cls: 'portals-file-preview' });
                    previewEl.setText(snippet);
                    if (isExcluded) previewEl.addClass('file-item-preview-hidden');
                    if (savedColor) {
                        previewEl.addClass('has-file-color');
                        previewEl.style.setProperty('--file-color', savedColor);
                    } else {
                        previewEl.removeClass('has-file-color');
                        previewEl.style.removeProperty('--file-color');
                    }
                }
            }).catch(() => {}); 
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

    private static extractSnippet(content: string, maxLength: number): string {
        // Remove YAML frontmatter
        let text = content.replace(/^---[\s\S]*?---\n?/, '');

        // Remove fenced code blocks (``` ... ```)
        //text = text.replace(/```[\s\S]*?```/g, '');

        // Remove callouts ([!note], [!info], [!warning], etc.)
        text = text.replace(/^> \[!.*?\].*$/gm, '');

        // Remove wiki links [[target]] and [[target|alias]]
        text = text.replace(/\[\[.*?\]\]/g, '');

        // Remove markdown links [text](url)
        text = text.replace(/\[.*?\]\(.*?\)/g, '');

        // Remove Obsidian comments %% ... %%
        text = text.replace(/%%.*?%%/g, '');

        // Remove horizontal rules
        text = text.replace(/^[-*_]{3,}\s*$/gm, '');

        // Remove blockquotes (lines starting with >)
        text = text.replace(/^>.*$/gm, '');

        // Remove list markers (-, *, +, 1.)
        text = text.replace(/^\s*[-*+]\s+/gm, '');
        text = text.replace(/^\s*\d+\.\s+/gm, '');

        // Remove headings (lines starting with #)
        text = text.replace(/^#+\s+/gm, '');

        // Remove inline formatting (*, _, ~, `)
        text = text.replace(/[*_~`]/g, '');

        // Remove inline tags #tag
        text = text.replace(/#\S+/g, '');

        // Collapse multiple spaces and blank lines
        text = text.replace(/\n{2,}/g, '\n');
        text = text.replace(/[ \t]+/g, ' ');
        text = text.trim();

        // Slice and add ellipsis if needed
        return text.slice(0, maxLength) + (text.length > maxLength ? '…' : '');
    }

    public static toggleFilePreview(plugin: PortalsPlugin, filePath: string, iconEl?: HTMLElement): boolean {
        const tempExcluded = plugin.settings.previewExcludedFiles[filePath] ?? false;
        plugin.settings.previewExcludedFiles[filePath] = !tempExcluded;
        void plugin.saveSettings();
        if (iconEl) {
            iconEl.className = `ph ph-${!tempExcluded ? 'plus-circle' : 'minus-circle'}`;
        }
        return !tempExcluded;
    }
}