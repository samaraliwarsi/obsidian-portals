import { Modal, App } from 'obsidian';

export class SaveViewModal extends Modal {
    onSubmit: (name: string) => void;
    initalName: string;

    constructor(app: App, initalName: string, onSubmit: (name: string) => void) {
        super(app);
        this.initalName = initalName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: this.initalName ? 'Update Filter View' : 'Save filter view' });
        
        const input = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'e.g., Active Tasks',
            value: this.initalName
        });
        input.style.width = '100%';
        input.style.marginBottom = '16px';
        input.style.padding = '8px';

        window.setTimeout(() => input.focus(), 50);

        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        
        btnDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        
        btnDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', () => {
            const name = input.value.trim();
            if (name) {
                this.onSubmit(name);
                this.close();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const name = input.value.trim();
                if (name) {
                    this.onSubmit(name);
                    this.close();
                }
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}