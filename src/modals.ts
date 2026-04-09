import { App, Modal } from 'obsidian';

export class RenamePortalModal extends Modal {
    constructor(
        app: App,
        private currentName: string,
        private onSave: (newName: string) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Rename portal' });
        const input = contentEl.createEl('input', {
            type: 'text',
            value: this.currentName,
            placeholder: 'Leave empty to use default name'
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.onSave(input.value);
                this.close();
            }
        });
        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = () => {
            this.onSave(input.value);
            this.close();
        };
        input.focus();
        input.select();
    }

    onClose() {
        this.contentEl.empty();
    }
}