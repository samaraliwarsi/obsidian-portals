import { App, Modal, Notice, TFile } from 'obsidian';
import type PortalsPlugin from '../../main';
import { formatLocalDate } from '../../utils/dateHelpers';

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
        const prop = this.plugin.settings.reminderProperty || 'remind_at';
        const cache = this.app.metadataCache.getFileCache(this.file);
        const existingDate = cache?.frontmatter?.[prop];

        contentEl.createEl('h3', { text: `Reminder for ${this.file.basename}` });
        
        const input = contentEl.createEl('input', { 
            type: 'date', 
            value: existingDate || formatLocalDate(new Date())
        });
        input.style.width = '100%';
        input.style.marginBottom = '16px';
        input.style.padding = '8px';
        
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
            btnDiv.createEl('button', { text: 'Remove', cls: 'mod-warning' })
                .addEventListener('click', removeAction);
        }

        btnDiv.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());

        btnDiv.createEl('button', { text: 'Save', cls: 'mod-cta' })
            .addEventListener('click', saveAction);
    }

    onClose() {
        this.contentEl.empty();
    }
}