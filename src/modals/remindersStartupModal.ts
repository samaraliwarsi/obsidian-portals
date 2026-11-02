import { App, Modal, TFile, Notice } from 'obsidian';
import type PortalsPlugin from '../main';
import { getDaysDifference, parseLocalDate, formatDisplayDate } from '../utils/dateHelpers';
import { Frontmatter } from '../types';

export class RemindersStartupModal extends Modal {
    private plugin: PortalsPlugin;
    private files: TFile[] = [];

    constructor(app: App, plugin: PortalsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Use your standard modal classes
        this.contentEl.addClass('portals-reminder-startup-modal');
        this.contentEl.addClass('portals-modal');

        const prop = this.plugin.settings.reminderProperty || 'remind_at';
        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const rawDate = fm?.[prop];
            if (rawDate) {
                const dateObj = parseLocalDate(String(rawDate));
                if (dateObj && getDaysDifference(dateObj) <= 0) {
                    this.files.push(file);
                }
            }
        }

        if (this.files.length === 0) {
            contentEl.createEl('p', { text: 'No reminders are due today or overdue.', cls: 'portals-fm-modal-select-status' });
            const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });
            btnDiv.createEl('button', { text: 'Close', cls: 'mod-cta' }).onclick = () => this.close();
            return;
        }

        // Use your standard custom title div
        contentEl.createDiv({ text: 'Portals reminders due', cls: 'portals-reminder-startup-title' });
        
        contentEl.createEl('p', {
            text: `${this.files.length} file(s) need your attention.`,
            cls: 'portals-fm-modal-select-status'
        });

        const listContainer = contentEl.createDiv({ cls: 'portals-reminder-startup-list' });

        for (const file of this.files) {
            const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const rawDate = fm?.[prop];
            const dateObj = parseLocalDate(String(rawDate));
            const dateStr = dateObj ? formatDisplayDate(dateObj, this.plugin.settings.dateDisplayFormat) : '';

            const row = listContainer.createDiv({ cls: 'portals-reminder-startup-row' });
            
            // Clickable title
            const titleSpan = row.createSpan({ text: file.basename, cls: 'portals-reminder-startup-name' });
            titleSpan.addEventListener('click', () => {
                void this.app.workspace.getLeaf().openFile(file);
                this.close();
            });

            // Date
            row.createSpan({ text: dateStr, cls: 'portals-reminder-startup-date' });

            // Remove button
            const removeBtn = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove reminder' } });
            this.plugin.renderPluginIcon(removeBtn, 'trash');
            removeBtn.addEventListener('click', () => {
                void (async () => {
                    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                        delete frontmatter[prop];
                    });
                    new Notice(`Reminder removed from ${file.basename}`);
                    row.remove();
                    this.files = this.files.filter(f => f !== file);
                    
                    this.plugin.refreshSidePortal('reminders');
                    this.plugin.updateReminderBadge();
                    
                    if (this.files.length === 0) {
                        this.close();
                    }
                })();
            });
        }

        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Dismiss', cls: 'mod-cta' }).onclick = () => this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}