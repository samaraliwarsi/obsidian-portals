import { App } from 'obsidian';
import { overlayStack, OverlayLayer } from './overlayStack';

export interface PortalsModalOptions {
    containerClass: string;
    backdropClass?: string;
    rootClass?: string;
    closeOnBackdrop?: boolean;
    /** May open above another PortalsModal (e.g. a confirm dialog raised from one). */
    nested?: boolean;
}

// Base for the modals that are not Obsidian `Modal`s (those are unusable when a
// custom layout is required). Lifecycle, single-instance and the backdrop live
// here; subclasses only build their own content.
//
// We deliberately do NOT borrow Obsidian's .modal / .modal-bg class names. In
// practice Obsidian's own definitions dominate wherever both apply (and .modal
// drags in 16px padding plus its own sizing), so chasing those classes reshuffles
// the look on every Obsidian update. The durable approach is to define our own
// surface and only consume Obsidian's CSS variables, e.g.
// background: var(--background-modifier-cover) for the backdrop.
// What we do take from Obsidian is behaviour: Escape via overlayStack, and no
// focus trap (which is what breaks body-appended popovers).
export abstract class PortalsModal implements OverlayLayer {
    // One modal of ours at a time, except for explicitly nested ones. Commands can
    // fire while a modal is open (the palette is not blocked for custom modals),
    // and stacking two unrelated dialogs is never what the user meant.
    private static readonly openStack: PortalsModal[] = [];

    protected root!: HTMLElement;
    protected backdrop!: HTMLElement;
    protected container!: HTMLElement;
    private opened = false;

    protected constructor(protected readonly app: App, private readonly options: PortalsModalOptions) {}

    public get isOpen(): boolean {
        return this.opened;
    }

    public open(): void {
        const alreadyThisClass = PortalsModal.openStack.some(m => m.constructor === this.constructor);
        const blocked = alreadyThisClass || (!this.options.nested && PortalsModal.openStack.length > 0);
        if (blocked) return;
        PortalsModal.openStack.push(this);

        this.opened = true;
        this.root = activeDocument.body.createDiv({ cls: this.options.rootClass ?? 'portals-modal-root' });

        this.backdrop = this.root.createDiv({ cls: this.options.backdropClass ?? 'portals-modal-backdrop' });
        if (this.options.closeOnBackdrop !== false) {
            this.backdrop.addEventListener('click', () => this.close());
        }

        this.container = this.root.createDiv({ cls: this.options.containerClass });
        this.container.addEventListener('click', (e) => e.stopPropagation());

        this.buildContent(this.container);
        overlayStack.push(this);
    }

    public close(): void {
        if (!this.opened) return;
        this.opened = false;
        const index = PortalsModal.openStack.indexOf(this);
        if (index !== -1) PortalsModal.openStack.splice(index, 1);
        overlayStack.remove(this);
        this.beforeClose();
        this.root?.remove();
    }

    /** Subclass cleanup that must run before the DOM is removed. */
    protected beforeClose(): void {
        // nothing by default
    }

    protected abstract buildContent(container: HTMLElement): void;
}
