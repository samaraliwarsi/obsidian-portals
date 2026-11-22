import { Platform } from "obsidian";

interface SearchPopoverOptions {
    items: string[];
    currentSelected: string;
    onSelect: (item: string) => void;
    placeholder?: string;
    parent?: HTMLElement;
}

export class SearchPopover {
    private static activePopover: SearchPopover | null = null;
    private popover: HTMLElement;
    private input: HTMLInputElement;
    private list: HTMLElement;
    private destroyed = false;
    private clickOutsideHandler!: (e: MouseEvent) => void;
    private resizeObserver!: ResizeObserver;
    private resizeHandler!: () => void;
    private scrollHandler!: (e: Event) => void;

    constructor(
        private anchor: HTMLElement,
        private options: SearchPopoverOptions
    ) {
        if (SearchPopover.activePopover) {
            SearchPopover.activePopover.destroy();
        }
        SearchPopover.activePopover = this;

        //const parent = options.parent || activeDocument.body;
        this.popover = activeDocument.body.createDiv('portals-search-popover');

        this.input = this.popover.createEl('input', {
            type: 'text',
            placeholder: options.placeholder ?? 'Filter…',
            cls: 'portals-search-input'
        });

        this.list = this.popover.createDiv({ cls: 'portals-results-container' });

        this.input.addEventListener('input', () => {
            this.renderFiltered(this.input.value);
            this.position();
        });
        this.input.addEventListener('keydown', (e) => this.handleKeyboard(e));
        this.position();

        this.attachListeners();

        this.input.focus();
        this.input.select();
    }

    private position() {
        if (this.destroyed) return;

        this.popover.setCssStyles({
            position: 'fixed',
            top: '0px',
            left: '0px',
            visibility: 'hidden',
            display: 'flex'
        });

        const popoverRect = this.popover.getBoundingClientRect();
        const anchorRect = this.anchor.getBoundingClientRect();

        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const viewportTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
        const viewportLeft = window.visualViewport ? window.visualViewport.offsetLeft : 0;

        let top = 0;
        let left = 0;

        if (Platform.isMobile) {
            // Mobile: center in visible area above virtual keyboard
            top = viewportTop + Math.max(10, (viewportHeight - popoverRect.height) / 3);
            left = viewportLeft + Math.max(10, (viewportWidth - popoverRect.width) / 2);
        } else {
            const gap = 4;
            const spaceAbove = anchorRect.top - viewportTop;
            const spaceBelow = (viewportTop + viewportHeight) - anchorRect.bottom;
            // Flip: open above if enough space, otherwise open below
            if (spaceAbove >= popoverRect.height + gap || spaceAbove >= spaceBelow) {
                top = anchorRect.top - popoverRect.height - gap;
            } else {
                top = anchorRect.bottom + gap;
            }

            left = anchorRect.left;
            // Horizontal failsafe: clamp to window edges for half-sized / narrow windows
            if (left + popoverRect.width > viewportLeft + viewportWidth - 10) {
                left = viewportLeft + viewportWidth - popoverRect.width - 10;
            }
            if (left < viewportLeft + 10) {
                left = viewportLeft + 10;
            }
            // Vertical failsafe: clamp within screen bounds
            top = Math.max(viewportTop + 10, Math.min(top, viewportTop + viewportHeight - popoverRect.height - 10));
        }
        this.popover.setCssStyles({
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            zIndex: 'calc(var(--layer-modal) + 1)',
            visibility: 'visible'
        });
    }

    private attachListeners() {
        const stopEvent = (e: Event) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        this.popover.addEventListener('focusin', stopEvent);
        this.popover.addEventListener('focusout', stopEvent);
        this.popover.addEventListener('mousedown', stopEvent);
        this.popover.addEventListener('click', stopEvent);
        this.popover.addEventListener('pointerdown', stopEvent);
        // Click outside to dismiss
        this.clickOutsideHandler = (e: MouseEvent) => {
            if (!this.popover.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) {
                this.destroy();
            }
        };
        setTimeout(() => {
            if (!this.destroyed) {
                activeDocument.addEventListener('mousedown', this.clickOutsideHandler, { capture: true });
            }
        }, 10);
        // Dismiss if the parent list/modal scrolls
        this.scrollHandler = (e: Event) => {
            if (!this.popover.contains(e.target as Node)) {
                this.destroy();
            }
        };
        activeDocument.addEventListener('scroll', this.scrollHandler, { capture: true });
        // Real-time tracking: Window resize & visual viewport changes
        this.resizeHandler = () => this.position();
        window.addEventListener('resize', this.resizeHandler);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.resizeHandler);
        }
        // Real-time tracking: ResizeObserver tracks the anchor button moving as the modal centers/resizes
        this.resizeObserver = new ResizeObserver(() => this.position());
        this.resizeObserver.observe(this.anchor);
        if (this.anchor.parentElement) {
            this.resizeObserver.observe(this.anchor.parentElement);
        }
    }
    private renderFiltered(filter: string) {
        if (!filter.trim()) {
            this.list.empty();
            return;
        }
        this.list.empty();
        const lowerFilter = filter.toLowerCase();
        const filtered = this.options.items.filter(i => i.toLowerCase().includes(lowerFilter));
        filtered.forEach(item => {
            const row = this.list.createDiv({ cls: 'add-portal-item', text: item });
            if (item === this.options.currentSelected) {
                row.addClass('is-selected');
            }
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                this.options.onSelect(item);
                this.destroy();
            });
        });
    }

    private handleKeyboard(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.destroy();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selectedEl = this.list.querySelector('.add-portal-item.is-selected');
            if (selectedEl && selectedEl.textContent) {
                this.options.onSelect(selectedEl.textContent);
            } else {
                const first = this.list.querySelector('.add-portal-item');
                if (first && first.textContent) {
                    this.options.onSelect(first.textContent);
                }
            }
            this.destroy();
        }
    }

    public focus(): void {
        this.input?.focus()
    }

    public getInput(): HTMLInputElement {
        return this.input;
    }

    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        activeDocument.removeEventListener('mousedown', this.clickOutsideHandler, { capture: true });
        activeDocument.removeEventListener('scroll', this.scrollHandler, { capture: true });
        window.removeEventListener('resize', this.resizeHandler);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.resizeHandler);
        }
        this.resizeObserver?.disconnect();
        this.popover.remove();
        if (SearchPopover.activePopover === this) {
            SearchPopover.activePopover = null;
        }
    }
}