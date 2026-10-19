import { App, Modal, Notice, TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import { formatLocalDate } from '../utils/dateHelpers';

export class DatePickerModal extends Modal {
    private plugin: PortalsPlugin;
    private file: TFile;
    private onSubmit: () => void;

    constructor(app: App, plugin: PortalsPlugin, file: TFile, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.contentEl.addClass('portals-date-modal');
        this.contentEl.addClass('portals-modal');
        const prop = this.plugin.settings.reminderProperty || 'remind_at';
        const cache = this.app.metadataCache.getFileCache(this.file);
        const existingDate = cache?.frontmatter?.[prop];

        contentEl.createDiv({ text: `Reminder for ${this.file.basename}`, cls: 'portals-date-title' });

        contentEl.createEl('p', {
            text: `This will add the property "${prop} to the frontmatter.`,
            cls: 'portals-fm-modal-select-status'
        });
        
        const input = contentEl.createEl('input', { 
            type: 'date', 
            value: existingDate || formatLocalDate(new Date()),
            cls: 'portals-date-input'
        });
        
        // Focus input so pressing Enter works immediately
        window.setTimeout(() => input.focus(), 50);

        // --- SAVE LOGIC ---
        const saveAction = () => {
            const dateStr = input.value;
            if (!dateStr) return;
            this.close(); // Instant close

            void (async () => {
                try {
                    await this.app.fileManager.processFrontMatter(this.file, (fm) => {
                        fm[prop] = dateStr;
                    });
                    new Notice(`Reminder set for ${dateStr}`);
                    this.onSubmit();
                } catch (err) {
                    console.error(err);
                }
            })();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveAction();
            }
        });

        // --- REMOVE LOGIC ---
        const removeAction = () => {
            this.close(); // Instant close
            void (async () => {
                try {
                    await this.app.fileManager.processFrontMatter(this.file, (fm) => {
                        delete fm[prop];
                    });
                    new Notice('Reminder removed');
                    this.onSubmit();
                } catch (err) {
                    console.error(err);
                }
            })();
        };

        // --- BUTTONS ---
        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });

        if (existingDate) {
            btnDiv.createEl('button', { text: 'Remove', cls: 'mod-warning' }).onclick = removeAction;
        }

        btnDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();

        btnDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = saveAction;
    }

    onClose() {
        this.contentEl.empty();
    }
}