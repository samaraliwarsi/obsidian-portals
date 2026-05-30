import { App, Platform, TFile } from 'obsidian';
import PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { TreeEventHelpers } from './treeEventHelpers';
import { ContextMenuFactory } from './contextMenuFactory';
import { getFrontmatterTags } from './tagHelpers';
import { getPluginInstance } from './pluginInstance';


export class FileItemFactory {

    static createFileItem(app: App, plugin: PortalsPlugin, view: PortalsView, file: TFile, container: HTMLElement, openFiles: Set<string>): HTMLElement {
        const fileEl = container.createDiv({ cls: 'file-item' });

        const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
        getPluginInstance()?.renderCustomIcon(iconSpan, file.path, 'file');

        const nameSpan = fileEl.createSpan({ text: FileItemFactory.getDisplayName(file, plugin) });
        nameSpan.addClass('portals-item-name');
        fileEl.dataset.path = file.path;

        const savedColor = plugin.settings.customColors[file.path];
        const icon = fileEl.querySelector('.file-icon i');
        if (savedColor) {
            fileEl.classList.add('has-file-color');
            //fileEl.style.setProperty('--file-color', savedColor);
            fileEl.setCssProps({ '--file-color': savedColor });
            if (icon) icon.addClass('has-file-color');
        } else {
            fileEl.classList.remove('has-file-color');
            //fileEl.style.removeProperty('--file-color');
            fileEl.setCssProps({ '--file-color': '' });
        }

        const isOpen = openFiles.has(file.path);
        let openDotSpan: HTMLSpanElement | null = null;
        if (isOpen) openDotSpan = fileEl.createSpan({ cls: 'open-dot' });

        if (plugin.settings.enableFileExtensionNonMD && file.extension && file.extension !== 'md') {
            const extSpan = fileEl.createSpan({ cls: 'file-extension' });
            extSpan.setText('.' + file.extension.toUpperCase());
            if (openDotSpan) {
                //openDotSpan.style.display = 'none';
                openDotSpan.setCssProps({ display: 'none' });
            }
            if (isOpen) extSpan.addClass('is-open');
        }

        if (plugin.settings.showFilePreview && file.extension === 'md') {
            fileEl.addClass('file-item-has-preview');

            const isExcluded = plugin.settings.previewExcludedFiles[file.path] ?? false;

            const toggleBtn = fileEl.createSpan({ cls: 'portals-file-action-icons' });
            //const toggleIcon = toggleBtn.createEl('i', { cls: `ph ph-${isExcluded ? 'plus-circle' : 'minus-circle'}` });
            plugin.renderPluginIcon(toggleBtn, isExcluded ? 'plus-circle' : 'minus-circle');
            const toggleIcon = toggleBtn.firstElementChild as HTMLElement;
            let previewEl: HTMLDivElement | null = null;
            let infoBar: HTMLDivElement | null = null;

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newState = FileItemFactory.toggleFilePreview(plugin, file.path, toggleIcon as HTMLElement);
                if (previewEl) {
                    previewEl.classList.toggle('file-item-preview-hidden', !newState);
                }
                if (infoBar) {
                    infoBar.classList.toggle('file-item-preview-hidden', !newState);
                }
            });
            
            app.vault.cachedRead(file).then((content: string) => {
                const snippet = FileItemFactory.extractSnippet(content, 300);
                if (snippet.length > 0) {
                    previewEl = fileEl.createDiv({ cls: 'portals-file-preview' });
                    previewEl.setText(snippet);

                    if (plugin.settings.showFileInfoBar) {
                        infoBar = fileEl.createDiv({ cls: 'portals-file-info-bar' });
                        const portalType = plugin.settings.selectedSpace?.type;
                        if (portalType === 'folder') {
                            const cache = app.metadataCache.getFileCache(file);
                            const tags = [
                                ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
                                ...getFrontmatterTags(cache)
                            ];
                            const uniqueTags = [...new Set(tags.map(t => t.toLowerCase()))].sort();
                            uniqueTags.forEach(tag => {
                                infoBar!.createSpan({ cls: 'portals-file-info-bar-text', text: '#' + tag });
                            });         
                        } else if (portalType === 'tag') {
                            const parentFolder = file.parent;
                            if (parentFolder && parentFolder.path !== '/') {
                                const folderName = parentFolder.name;
                                infoBar.createSpan({ cls: 'portals-file-info-bar-text', text: 'in ' + folderName });
                            }
                        }
                    }

                    if (isExcluded) {
                        previewEl.addClass('file-item-preview-hidden');
                        if (infoBar) infoBar.addClass('file-item-preview-hidden');
                    }

                    if (savedColor) {
                        previewEl.addClass('has-file-color');
                        //previewEl.style.setProperty('--file-color', savedColor);
                        previewEl.setCssProps({ '--file-color': savedColor });
                        if (infoBar) {
                            infoBar.addClass('has-file-color');
                            //infoBar.style.setProperty('--file-color', savedColor);
                            infoBar.setCssProps({ '--file-color': savedColor });
                        }
                    } else {
                        previewEl.removeClass('has-file-color');
                        //previewEl.style.removeProperty('--file-color');
                        previewEl.setCssProps({ '--file-color': '' });
                        if (infoBar) {
                            infoBar.removeClass('has-file-color');
                            //infoBar.style.removeProperty('--file-color');
                            infoBar.setCssProps({ '--file-color': '' });
                        }
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

        if (plugin.settings.showFileToolTips && file.extension === 'md' && !Platform.isMobile) {
        fileEl.addEventListener('mouseenter', () => {
            FileItemFactory.fetchFileTooltip(file, app, nameSpan, plugin).then(tip => {
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
        const newState = !tempExcluded;
        if (iconEl) {
            iconEl.className = `ph ph-${newState ? 'plus-circle' : 'minus-circle'}`;
        }
        return newState;
    }

    private static async fetchFileTooltip(file: TFile, app: App, nameSpan: HTMLElement, plugin: PortalsPlugin): Promise<string | null> {
        try {
            const content = await app.vault.cachedRead(file);
            const plainText = FileItemFactory.extractSnippet(content, Infinity);
            const words = plainText.split(/\s+/).filter(w => w.length > 0);
            const wordCount = words.length;
            const lastModified = new Date(file.stat.mtime).toLocaleDateString();
            const infoLine = `${wordCount} words · Modified ${lastModified}`;
            if (nameSpan.scrollWidth > nameSpan.clientWidth) {
                const displayName = FileItemFactory.getDisplayName(file, plugin);
                return `${displayName} · ${infoLine}`;
            }
            return infoLine;
        } catch {
            return null;
        }
    }
}