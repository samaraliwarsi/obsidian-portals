import { App } from "obsidian";



export class RenamePortalModal {
    private app: App;
    private currentName: string;
    private onSave: (newName: string) => void;
    private onCancel?: () => void;
    private container!: HTMLElement;
    private keyHandler: (e: KeyboardEvent) => void;
    private backdrop!: HTMLElement;


    constructor(app: App, currentName: string, onSave: (newName: string) => void, onCancel?: () => void) {
        this.app = app;
        this.currentName = currentName;
        this.onSave = onSave;
        this.onCancel = onCancel;
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.close();
            }
        }
    }

    open(): void {
        if (this.container) {
            this.close();
        }

        this.backdrop = activeDocument.body.createDiv('portals-rename-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        this.container = activeDocument.body.createDiv('portals-rename-modal');
        this.container.addClass('portals-modal');
        this.container.addEventListener('click', (e) => e.stopPropagation());

        try {
            this.buildUI();
            activeDocument.addEventListener('keydown', this.keyHandler)
        } catch (e) {
            console.error('Error building color picker UI', e);
            this.close();
        }
    }

    buildUI(): void {
        const { container } = this;
        if (!container) return;

        container.createDiv({ text: 'Rename portal', cls: 'rename-popup-title' });

        const renameInput = container.createDiv({ cls: 'rename-input-wrapper' });
        const input = renameInput.createEl('input', {
            type: 'text',
            value: this.currentName,
            cls: 'portals-rename-input',
            placeholder: 'Leave empty to use default name'
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.onSave(input.value);
                this.close();
            }
        });

        const buttonDiv = container.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = () => {
            this.onSave(input.value);
            this.close();
        };
        input.focus();
        input.select();
    }

    close(): void {
        this.container.remove();
        this.backdrop.remove();
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.onCancel?.();
    }
}