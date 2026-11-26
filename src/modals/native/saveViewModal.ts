import { Modal, App } from 'obsidian';

export class SaveViewModal extends Modal {
    private onSubmit: (name: string) => void;
    private initalName: string;

    constructor(app: App, initalName: string, onSubmit: (name: string) => void) {
        super(app);
        this.initalName = initalName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.contentEl.addClass('portals-saveview-modal');
        this.containerEl.addClass('portals-modal');

        contentEl.createDiv({ 
            text: this.initalName ? 'Update Filter View' : 'Save filter view',
            cls: 'portals-saveview-title'
        });
        
        const input = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'e.g., Active Tasks',
            value: this.initalName,
            cls: 'portals-saveview-input'
        });

        window.setTimeout(() => input.focus(), 50);

        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });

        const saveAction = () => {
            const name = input.value.trim();
            if (name) {
                this.onSubmit(name);
                this.close();
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveAction();
            }
        });

        btnDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        btnDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = saveAction;
    }

    onClose() {
        this.contentEl.empty();
    }
}