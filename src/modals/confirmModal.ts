import { App } from 'obsidian';

export class ConfirmModal {
    private resolve!: (value: boolean) => void;
    promise: Promise<boolean>;
    private message: string;
    private container?: HTMLElement;
    private backdrop?: HTMLElement;
    private keyHandler: (e: KeyboardEvent) => void;

    constructor(app: App, message: string) {
        this.message = message;
        this.promise = new Promise<boolean>((res) => { this.resolve = res; });
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.resolve(false);
                this.close();
            }
        };
    }

    open(): void {
        if (this.container) this.close();

        this.backdrop = activeDocument.body.createDiv('portals-confirm-backdrop');
        this.backdrop.addEventListener('click', () => {
            this.resolve(false);
            this.close();
        });

        this.container = activeDocument.body.createDiv('portals-confirm-container');
        this.container.addClass('portals-cnf-modal');
        this.container.addEventListener('click', (e) => e.stopPropagation());

        try {
            this.buildUI();
            activeDocument.addEventListener('keydown', this.keyHandler);
        } catch (e) {
            console.error('Error building confirm modal', e);
            this.close();
        }
    }

    private buildUI(): void {
        if (!this.container) return;
        this.container.createEl('p', { text: this.message, cls: 'portals-confirm-message' });
        const btnDiv = this.container.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Cancel' }).onclick = () => {
            this.resolve(false);
            this.close();
        };
        btnDiv.createEl('button', { text: 'OK', cls: 'mod-warning' }).onclick = () => {
            this.resolve(true);
            this.close();
        };
    }

    close(): void {
        this.container?.remove();
        this.backdrop?.remove();
        this.container = undefined;
        this.backdrop = undefined;
        activeDocument.removeEventListener('keydown', this.keyHandler);
    }

    static async confirm(app: App, message: string): Promise<boolean> {
        const modal = new ConfirmModal(app, message);
        modal.open();
        return modal.promise;
    }
}