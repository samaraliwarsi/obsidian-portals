import { App, Platform, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { ContextMenuFactory } from '../utils/contextMenuFactory';
import { formatDisplayDate, getDaysDifference, parseLocalDate } from '../utils/dateHelpers';

export class RemindersRenderer {
    private app: App;
    private plugin: PortalsPlugin;
    private view: PortalsView;
    private container: HTMLElement | null = null;

    constructor(app: App, plugin: PortalsPlugin, view: PortalsView) {
        this.app = app;
        this.plugin = plugin;
        this.view = view;
    }

    setContainer(container: HTMLElement): void {
        this.container = container;
    }

    render(): void {
        if (!this.container) return;
        this.container.empty();

        const propName = this.plugin.settings.reminderProperty || 'remind_at';

        const showOverdue = this.plugin.settings.reminderShowOverdue;
        const order = this.plugin.settings.reminderOrder;
        const files = this.app.vault.getMarkdownFiles();

        const today = new Date();

        const overdue: {file: TFile, date: Date}[] = [];
        const todayList: {file: TFile, date: Date}[] = [];
        const upcoming: {file: TFile, date: Date}[] = [];
        const later: {file: TFile, date: Date}[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const rawDate = cache?.frontmatter?.[propName];
            if (!rawDate) continue;

            const dateObj = parseLocalDate(String(rawDate));
            if (!dateObj) continue;

            const diffDays = getDaysDifference(dateObj, today);

            if (diffDays < 0) {
                overdue.push({ file, date: dateObj });
            } else if (diffDays === 0) {
                todayList.push({ file, date: dateObj });
            } else if (diffDays <= 7) {
                upcoming.push({ file, date: dateObj });
            } else {
                later.push({ file, date: dateObj });
            }
        }

        // Sort chronologically
        overdue.sort((a, b) => a.date.getTime() - b.date.getTime());
        todayList.sort((a, b) => a.date.getTime() - b.date.getTime());
        upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
        later.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Handle Order
        if (order === 'overdue-first') {
            if (showOverdue && overdue.length > 0) this.renderSection('Overdue', overdue, 'overdue');
            if (todayList.length > 0) this.renderSection('Today', todayList, 'today');
            if (upcoming.length > 0) this.renderSection('Next 7 Days', upcoming, 'upcoming');
            if (later.length > 0) this.renderSection('Later', later, 'later');
        } else {
            if (later.length > 0) this.renderSection('Later', later, 'later');
            if (upcoming.length > 0) this.renderSection('Next 7 Days', upcoming, 'upcoming');
            if (todayList.length > 0) this.renderSection('Today', todayList, 'today');
            if (showOverdue && overdue.length > 0) this.renderSection('Overdue', overdue, 'overdue');
        }

        // handle empty state (delete duplicate renders above this!)

        const hasVisibleItems = 
            (showOverdue && overdue.length > 0) || 
            todayList.length > 0 || 
            upcoming.length > 0 ||
            later.length > 0;
        if (!hasVisibleItems) {
            this.container.createEl('p', { text: 'No reminders found.', cls: 'portals-context-note-message' });
        }
    }

    private renderSection(title: string, items: {file: TFile, date: Date}[], type: 'overdue' | 'today' | 'upcoming' | 'later') {
        if (!this.container) return;

        const details = this.container.createEl('details', {cls: 'reminders-section' });

        const isOpen = this.plugin.settings.reminderSectionStates?.[type] ?? true;
        if (isOpen) details.open = true;

        const summary = details.createEl('summary', { cls: `reminders-header is-${type}` });
        summary.createSpan({ text: title });

        details.addEventListener('toggle', () => {
            if (!this.plugin.settings.reminderSectionStates) {
                this.plugin.settings.reminderSectionStates = {};
            }
            this.plugin.settings.reminderSectionStates[type] = details.open;
            void this.plugin.saveData(this.plugin.settings);
        });

        const content = details.createDiv({ cls: 'reminders-section-content' });

        for (const item of items) {
            const fileEl = content.createDiv({ cls: 'file-item' });
            const iconSpan = fileEl.createSpan({ cls: 'file-icon' });
            this.plugin.renderCustomIcon(iconSpan, item.file.path, 'calendar');
            
            fileEl.createSpan({ text: this.view.getDisplayName(item.file), cls: 'portals-item-name' });
            
            // Format date as YYYY-MM-DD
            const dateStr = formatDisplayDate(item.date, this.plugin.settings.dateDisplayFormat);
            const dateEl = fileEl.createSpan({ text: dateStr, cls: 'reminders-date' });

            if (!Platform.isMobile) {
                const DiffDays = getDaysDifference(item.date);
                let tooltip = '';
                if (DiffDays === 0) tooltip = 'Due today';
                else if (DiffDays === 1) tooltip = 'Due tomorrow';
                else if (DiffDays < 0) tooltip = `Overdue by ${Math.abs(DiffDays)} day(s)`;
                else tooltip = `Due in ${DiffDays} days`;

                const isRightSidebar = this.container.closest('.mod-right-split') !== null;
                const preferred = isRightSidebar ? 'left' : 'right';
                this.view.attachTooltip(dateEl, tooltip, 300, preferred);
            }

            this.view.addHoverPreview(fileEl, item.file.path);

            fileEl.addEventListener('click', () => {
                void this.app.workspace.getLeaf().openFile(item.file);
            });
            
            fileEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                ContextMenuFactory.showFileMenu(this.view, item.file, fileEl, e);
            });
        }
    }
}