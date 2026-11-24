import { App, TFile } from 'obsidian';
import PortalsPlugin from '../main';
import { getFrontmatterTags } from './tagHelpers';
import { formatDisplayDate, getDaysDifference, parseLocalDate } from './dateHelpers';
import { Frontmatter } from '../types';
import { parseTasks } from './taskParser';


export class FileItemFactory {

    private static tooltipCache = new Map<string, { wordCount: number, mtime: number }>();

    public static applyFileInfoBarTags( infoBar: HTMLElement, file: TFile, app: App): void {
        infoBar.empty();
        const cache = app.metadataCache.getFileCache(file);
        const tags = [
            ...(cache?.tags?.map(t => t.tag.slice(1)) || []),
            ...getFrontmatterTags(cache)
        ];
        const uniqueTags = [...new Set(tags.map(t => t.toLowerCase()))].sort();
        uniqueTags.forEach(tag => {
            infoBar.createSpan({ cls: 'portals-file-info-bar-text', text: '#' + tag });
        });
    }

    public static applyReminderIndicator( fileEl: HTMLElement, file: TFile, app: App, plugin: PortalsPlugin): void {
        fileEl.querySelectorAll(':scope > .portals-reminder-indicator').forEach(el => el.remove());
        if (plugin.settings.reminderTreeIndicator === 'off') return;
        const prop = plugin.settings.reminderProperty || 'remind_at';
        const fm: Frontmatter | undefined = app.metadataCache.getFileCache(file)?.frontmatter;
        const hasReminder = fm?.[prop];
        if (!hasReminder) return;
        const clockSpan = fileEl.createSpan({ cls: 'portals-reminder-indicator' });

        if (plugin.settings.reminderTreeIndicator === 'dynamic') {
            const dateObj = parseLocalDate(String(hasReminder));
            if (dateObj) {
                const diffDays = getDaysDifference(dateObj);
                if (diffDays < 0) {
                    clockSpan.addClass('is-overdue');
                } else if (diffDays === 0) {
                    clockSpan.addClass('is-today');
                } else if (diffDays <= 7) {
                    clockSpan.addClass('is-upcoming');
                } else {
                    clockSpan.addClass('is-later');
                }
            }
        }
        plugin.renderPluginIcon(clockSpan, 'bell');
        const nameSpan = fileEl.querySelector<HTMLElement>(':scope > .portals-item-name');
        if (nameSpan) {
            nameSpan.insertAdjacentElement('afterend', clockSpan);
        }
    }

    public static getDisplayName(file: TFile, plugin: PortalsPlugin): string {
        if (file.extension === 'md') return file.basename;
        return plugin.settings.enableFileExtensionNonMD ? file.basename : file.name;
    }

    public static extractSnippet(content: string, maxLength: number): string {
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

    private static countWords(content: string): number {
        // 1. Remove YAML
        let text = content.replace(/^---[\s\S]*?---/, '');
        // 2. Remove code blocks
        text = text.replace(/```[\s\S]*?```/g, '');
        // 3. Remove wiki links
        text = text.replace(/\[\[.*?\]\]/g, '');
        // 4. Remove markdown links
        text = text.replace(/\[.*?\]\(.*?\)/g, '');
        // 5. Remove markdown syntax (*, _, #, >)
        text = text.replace(/[*_~>#-]/g, '');
        // 6. Count words
        const words = text.match(/\b\w+\b/g);
        return words ? words.length : 0;
    }

    public static toggleFilePreview(plugin: PortalsPlugin, filePath: string, iconEl?: HTMLElement): boolean {
        const tempExcluded = plugin.settings.previewExcludedFiles[filePath] ?? false;
        plugin.settings.previewExcludedFiles[filePath] = !tempExcluded;
        void plugin.saveData(plugin.settings);
        const newState = !tempExcluded;
        if (iconEl) {
            plugin.renderPluginIcon(iconEl, newState ? 'plus-circle' : 'minus-circle');
        }
        return newState;
    }

    public static async fetchFileTooltip(file: TFile, app: App, nameSpan: HTMLElement, plugin: PortalsPlugin): Promise<string | null> {
        try {
            if (file.extension === 'md') {
                let wordCount = 0;
                const cached = FileItemFactory.tooltipCache.get(file.path);

                if (cached && cached.mtime === file.stat.mtime) {
                    wordCount = cached.wordCount;
                } else {
                    const content = await app.vault.cachedRead(file);
                    wordCount = FileItemFactory.countWords(content);
                    FileItemFactory.tooltipCache.set(file.path, {
                        wordCount,
                        mtime: file.stat.mtime
                    });
                }

                const lastModifiedDate = new Date(file.stat.mtime);
                const lastModified = formatDisplayDate(lastModifiedDate, plugin.settings.dateDisplayFormat);
                let infoLine = `${wordCount} words · Modified: ${lastModified}`;

                const prop = plugin.settings.reminderProperty || 'remind_at';
                const fm: Frontmatter | undefined = app.metadataCache.getFileCache(file)?.frontmatter;
                const rawDate = fm?.[prop];
                if (rawDate) {
                    const dateObj = parseLocalDate(String(rawDate));
                    const displayDate = dateObj ? formatDisplayDate(dateObj, plugin.settings.dateDisplayFormat) : String(rawDate);
                    infoLine += ` · Reminder: ${displayDate}`;
                }
                if (nameSpan.scrollWidth > nameSpan.clientWidth) {
                    const displayName = FileItemFactory.getDisplayName(file, plugin);
                    return `${displayName} · ${infoLine}`;
                }
                return infoLine;
            } else {
                if (nameSpan.scrollWidth > nameSpan.clientWidth) {
                    const displayName = FileItemFactory.getDisplayName(file, plugin);
                    return `${displayName}`;
                }
                return null;
            } 
        } catch {
            return null;
        }
    }

    public static buildTaskPreview(fileEl: HTMLElement, content: string, plugin: PortalsPlugin): HTMLDivElement | null {
        // buildTaskPreview is called from BOTH Rows.file and updateFileElement.
        // These can race when refreshSidePortal fires Rows.file while an
        // updateFileElement is still in flight. Making this function idempotent
        // (find existing, remove duplicates, update or create) prevents duplicate
        // taskEls without needing coordination between the two callers.
        
         // Find ALL existing task previews to clean up any race-condition duplicates
        const existingTasks = fileEl.querySelectorAll('.portals-task-preview');
        const taskEl = existingTasks.length > 0 ? (existingTasks[0] as HTMLDivElement) : null;
        
        // Remove duplicates if they exist
        for (let i = 1; i < existingTasks.length; i++) {
            existingTasks[i]?.remove();
        }

        // check if the feature is disabled or tasks are completed
        if (plugin.settings.showTaskProgress === 'off') {
            if (taskEl) taskEl.remove();
            return null;
        }

        const stats = parseTasks(content);

        // If no tasks or all complete, remove the element and return
        if (stats.total === 0 || stats.isComplete) {
            if (taskEl) taskEl.remove();
            return null;
        }

        // Create or clear
        let finalTaskEl: HTMLDivElement;
        if (!taskEl) {
            finalTaskEl = fileEl.createDiv({ cls: 'portals-task-preview' });
        } else {
            finalTaskEl = taskEl;
            finalTaskEl.empty();
        }

        const percent = Math.round((stats.completed / stats.total) * 100);
        if (plugin.settings.showTaskProgress === 'number') {
            finalTaskEl.createSpan({ text: `${stats.completed}/${stats.total}`, cls: 'portals-task-text' });
        } 
        else if (plugin.settings.showTaskProgress === 'ring') {
            const svg = finalTaskEl.createSvg('svg', { attr: { width: '16', height: '16', viewBox: '0 0 16 16' } });
            svg.addClass('portals-task-ring');
            
            svg.createSvg('circle', { attr: { cx: '8', cy: '8', r: '6', stroke: 'var(--background-modifier-border)', 'stroke-width': '2', fill: 'none' } });
            
            svg.createSvg('circle', { 
                attr: { 
                    cx: '8', cy: '8', r: '6', 
                    stroke: 'var(--file-color, var(--text-normal))', 
                    'stroke-width': '2', 
                    fill: 'none',
                    'stroke-dasharray': '37.7',
                    'stroke-dashoffset': `${37.7 - (37.7 * percent / 100)}`,
                    'transform': 'rotate(-90 8 8)'
                } 
            });
            finalTaskEl.createSpan({ text: `${stats.completed}/${stats.total}`, cls: 'portals-task-text' });
        } 
        else if (plugin.settings.showTaskProgress === 'bar') {
            const barContainer = finalTaskEl.createDiv({ cls: 'portals-task-bar-container' });
            const barFill = barContainer.createDiv({ cls: 'portals-task-bar-fill' });
            barFill.setCssStyles({ width: `${percent}%` });
            finalTaskEl.createSpan({ text: `${stats.completed}/${stats.total}`, cls: 'portals-task-text' });
        }
        return finalTaskEl;
    }
}