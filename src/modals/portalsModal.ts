import { App } from 'obsidian';
import { overlayStack, OverlayLayer } from './overlayStack';

export interface PortalsModalOptions {
    containerClass: string;
    backdropClass?: string;
    rootClass?: string;
    closeOnBackdrop?: boolean;
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
    // Keyed by constructor (`unknown` rather than `Function`, which the lint
    // rules reject as unsafe).
    private static readonly openByClass = new Map<unknown, PortalsModal>();

    protected root!: HTMLElement;
    protected backdrop!: HTMLElement;
    protected container!: HTMLElement;
    private opened = false;

    protected constructor(protected readonly app: App, private readonly options: PortalsModalOptions) {}

    public get isOpen(): boolean {
        return this.opened;
    }

    public open(): void {
        const ctor = this.constructor;
        // Call sites construct a new instance every time, so the guard has to be
        // per class rather than per instance.
        if (PortalsModal.openByClass.has(ctor)) return;
        PortalsModal.openByClass.set(ctor, this);

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
        const ctor = this.constructor;
        if (PortalsModal.openByClass.get(ctor) === this) PortalsModal.openByClass.delete(ctor);
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
