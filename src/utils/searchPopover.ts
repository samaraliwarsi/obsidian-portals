
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
    private clickOutsideHandler: (e: MouseEvent) => void;

    constructor(
        private anchor: HTMLElement,
        private options: SearchPopoverOptions
    ) {
        if (SearchPopover.activePopover) {
            SearchPopover.activePopover.destroy();
        }
        SearchPopover.activePopover = this;
        const parent = options.parent || activeDocument.body;
        this.popover = parent.createDiv('portals-search-popover');

        this.input = this.popover.createEl('input', {
            type: 'text',
            placeholder: options.placeholder ?? 'Filter…',
            cls: 'portals-search-input'
        });

        this.list = this.popover.createDiv({ cls: 'portals-results-container' });

        // Position relative to anchor
        const rect = anchor.getBoundingClientRect();
        if (options.parent) {
            // Used inside native Modal class. Open upwards inside the container
            if (getComputedStyle(parent).position === 'static') {
                parent.setCssStyles({ position: 'relative' })
            }
            const parentRect = parent.getBoundingClientRect();
            
            this.popover.setCssProps({ 
                position: 'absolute',
                top: `${rect.top - parentRect.top + parent.scrollTop}px`,
                left: `${rect.left - parentRect.left + parent.scrollLeft}px`,
                transform: 'translateY(calc(-100% - 4px))',
                zIndex: 'var(--layer-menu)'
            });    
        } else {
            this.popover.setCssProps({ 
                position: 'absolute',
                bottom: `${window.innerHeight - rect.top + 2}px`,
                left: `${rect.left}px`,
                zIndex: 'var(--layer-menu)' // Added to ensure it stays above other UI
            });
        }
        // to ensure it doesn't lose focus
        this.popover.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        this.input.addEventListener('input', () => this.renderFiltered(this.input.value));
        this.input.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Click outside to close
        this.clickOutsideHandler = (e: MouseEvent) => {
            if (!this.popover.contains(e.target as Node) && e.target !== this.anchor) {
                this.destroy();
            }
        };
        activeDocument.addEventListener('click', this.clickOutsideHandler, { capture: true });

        this.input.focus();
        this.input.select();
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
        this.input?.focus();
    }

    public getInput(): HTMLInputElement {
        return this.input;
    }

    destroy() {
        activeDocument.removeEventListener('click', this.clickOutsideHandler, { capture: true });
        this.popover.remove();
        if (SearchPopover.activePopover === this) {
            SearchPopover.activePopover = null;
        }
    }
}