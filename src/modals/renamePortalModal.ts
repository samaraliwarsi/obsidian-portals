import { App } from "obsidian";
import { PortalsModal } from "./portalsModal";

export class RenamePortalModal extends PortalsModal {
    private currentName: string;
    private onSave: (newName: string) => void;
    private onCancel?: () => void;

    constructor(app: App, currentName: string, onSave: (newName: string) => void, onCancel?: () => void) {
        super(app, {
            containerClass: 'portals-rename-modal portals-modal',
            backdropClass: 'portals-rename-backdrop',
        });
        this.currentName = currentName;
        this.onSave = onSave;
        this.onCancel = onCancel;
    }

    protected buildContent(): void {
        this.buildUI();
    }

    // Runs on every close path, including a successful Save — same as before.
    protected beforeClose(): void {
        this.onCancel?.();
    }

    buildUI(): void {
        const container = this.container;

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
}
