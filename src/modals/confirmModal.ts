import { App } from 'obsidian';
import { PortalsModal } from './portalsModal';

// Our own modal rather than Obsidian's: FrontmatterPopup (also ours) calls it,
// and a native Modal opened from a custom one stacks in Obsidian's modal layer,
// above ours, with its own Escape and focus handling. Same family, same rules.
export class ConfirmModal extends PortalsModal {
    private resolve!: (value: boolean) => void;
    promise: Promise<boolean>;
    private message: string;
    private settled = false;

    constructor(app: App, message: string) {
        super(app, {
            containerClass: 'portals-confirm-container portals-cnf-modal',
            backdropClass: 'portals-confirm-backdrop',
            // Legitimately opened on top of another modal (bulk edit confirm).
            nested: true,
        });
        this.message = message;
        this.promise = new Promise<boolean>((res) => { this.resolve = res; });
    }

    protected buildContent(container: HTMLElement): void {
        container.createEl('p', { text: this.message, cls: 'portals-confirm-message' });
        const btnDiv = container.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.settle(false);
        btnDiv.createEl('button', { text: 'OK', cls: 'mod-warning' }).onclick = () => this.settle(true);
    }

    // Escape or a backdrop click also lands here: the awaiting caller must always
    // get an answer, or `await ConfirmModal.confirm(...)` never returns.
    protected beforeClose(): void {
        this.settle(false);
    }

    private settle(value: boolean): void {
        if (this.settled) return;
        this.settled = true;
        this.resolve(value);
        this.close();
    }

    static async confirm(app: App, message: string): Promise<boolean> {
        const modal = new ConfirmModal(app, message);
        modal.open();
        return modal.promise;
    }
}
