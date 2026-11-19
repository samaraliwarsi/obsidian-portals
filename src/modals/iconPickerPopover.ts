import { App, Platform } from 'obsidian';
import PortalsPlugin from '../main';
import { EMOJI_LIST } from '../icons/emojiList';

export class IconPickerPopover {
    private popover: HTMLElement;
    private input!: HTMLInputElement;
    private grid!: HTMLElement;
    private tabContainer!: HTMLElement;
    private currentLibrary: 'favorites' | 'phosphor' | 'lucide' | 'emoji' = 'phosphor';
    private filter = '';
    private displayCount = 60;
    private destroyed = false;

    private clickOutsideHandler!: (e: MouseEvent) => void;
    private keyHandler!: (e: KeyboardEvent) => void;
    private scrollHandler!: (e: Event) => void;

    constructor(
        private app: App,
        private plugin: PortalsPlugin,
        private anchor: HTMLElement,
        private parent: HTMLElement,
        private onSelect: (iconKey: string) => void
    ) {
        this.popover = activeDocument.body.createDiv('portals-inline-icon-popover');
        this.buildUI();
        this.position();
        this.attachListeners();

        // Default to favorites if any, else phosphor
        this.currentLibrary = this.plugin.settings.iconFavorites.length > 0 ? 'favorites' : 'phosphor';
        this.updateTabStates();
        this.renderGrid();
        this.input.focus({ preventScroll: true });
    }

    private buildUI() {
        this.tabContainer = this.popover.createDiv({ cls: 'portals-inline-icon-tabs' });
        const tabs: { key: 'favorites' | 'phosphor' | 'lucide' | 'emoji'; label: string }[] = [
            { key: 'favorites', label: '★' },
            { key: 'phosphor', label: 'Phosphor' },
            { key: 'lucide', label: 'Lucide' },
            { key: 'emoji', label: 'Emoji' },
        ];
        for (const t of tabs) {
            const tab = this.tabContainer.createDiv({ cls: 'portals-inline-icon-tab', text: t.label });
            tab.dataset.tab = t.key;
            tab.addEventListener('click', () => {
                this.currentLibrary = t.key;
                this.filter = '';
                this.input.value = '';
                this.displayCount = 60;
                this.updateTabStates();
                this.renderGrid();
                this.input.focus();
            });
        }

        this.input = this.popover.createEl('input', {
            type: 'text',
            cls: 'portals-inline-icon-search',
            placeholder: 'Search icons...'
        });
        this.input.addEventListener('input', () => {
            this.filter = this.input.value;
            this.renderGrid();
        });

        this.grid = this.popover.createDiv({ cls: 'portals-inline-icon-grid' });
    }

    private updateTabStates() {
        this.tabContainer.querySelectorAll<HTMLElement>('.portals-inline-icon-tab').forEach(tab => {
            tab.toggleClass('is-active', tab.dataset.tab === this.currentLibrary);
        });
    }

    private renderGrid() {
        if (this.destroyed) return;
        this.grid.empty();

        if (this.currentLibrary === 'favorites') {
            this.renderFavoritesGrid();
            return;
        }
        if (this.currentLibrary === 'emoji') {
            this.renderEmojiGrid();
            return;
        }

        const provider = this.currentLibrary === 'lucide' ? this.plugin.lucideProvider : this.plugin.phosphorProvider;
        const allIcons = provider.getIconList();
        const filtered = this.filter
            ? allIcons.filter(i => i.toLowerCase().includes(this.filter.toLowerCase()))
            : allIcons;

        const toRender = this.filter ? filtered : filtered.slice(0, this.displayCount);

        if (toRender.length === 0) {
            this.grid.createDiv({ text: 'No icons found', cls: 'portals-inline-icon-empty' });
            return;
        }

        const frag = createFragment();
        for (const name of toRender) {
            const iconEl = createDiv({ cls: 'portals-inline-icon-item' });
            provider.renderIcon(iconEl, name);
            iconEl.setAttribute('title', name);
            iconEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect(`${this.currentLibrary}:${name}`);
                this.destroy();
            });
            frag.appendChild(iconEl);
        }
        this.grid.appendChild(frag);

        if (!this.filter && this.displayCount < filtered.length) {
            const more = this.grid.createDiv({
                cls: 'portals-inline-icon-loadmore',
                text: `Load more (${filtered.length - this.displayCount} remaining)`
            });
            more.addEventListener('click', () => {
                this.displayCount += 60;
                this.renderGrid();
            });
        }
    }

    private renderFavoritesGrid() {
        const favs = this.plugin.settings.iconFavorites;
        if (favs.length === 0) {
            this.grid.createDiv({ text: 'No favorites yet. Star any icon in the tree’s full picker to add one.', cls: 'portals-inline-icon-empty' });
            return;
        }

        const filter = this.filter.toLowerCase();
        const filtered = filter ? favs.filter(f => f.name.toLowerCase().includes(filter)) : favs;

        if (filtered.length === 0) {
            this.grid.createDiv({ text: 'No matching favorites', cls: 'portals-inline-icon-empty' });
            return;
        }

        const frag = createFragment();
        for (const fav of filtered) {
            const iconEl = createDiv({ cls: 'portals-inline-icon-item' });
            if (fav.library === 'emoji') {
                iconEl.setText(fav.name);
                iconEl.addClass('portals-emoji-icon');
            } else {
                const provider = fav.library === 'lucide' ? this.plugin.lucideProvider : this.plugin.phosphorProvider;
                provider.renderIcon(iconEl, fav.name);
            }
            iconEl.setAttribute('title', fav.name);
            iconEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect(`${fav.library}:${fav.name}`);
                this.destroy();
            });
            frag.appendChild(iconEl);
        }
        this.grid.appendChild(frag);
    }

    private renderEmojiGrid() {
        const filter = this.filter.toLowerCase();
        const list = filter
            ? EMOJI_LIST.filter(e => e.name.toLowerCase().includes(filter) || e.char.includes(filter))
            : EMOJI_LIST;
        const toRender = filter ? list : list.slice(0, this.displayCount);

        if (toRender.length === 0) {
            this.grid.createDiv({ text: 'No emojis found', cls: 'portals-inline-icon-empty' });
            return;
        }

        const frag = createFragment();
        for (const entry of toRender) {
            const iconEl = createDiv({ cls: 'portals-inline-icon-item portals-emoji-icon', text: entry.char });
            iconEl.setAttribute('title', entry.name);
            iconEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect(`emoji:${entry.char}`);
                this.destroy();
            });
            frag.appendChild(iconEl);
        }
        this.grid.appendChild(frag);

        if (!filter && this.displayCount < list.length) {
            const more = this.grid.createDiv({
                cls: 'portals-inline-icon-loadmore',
                text: `Load more (${list.length - this.displayCount} remaining)`
            });
            more.addEventListener('click', () => {
                this.displayCount += 60;
                this.renderGrid();
            });
        }
    }

    private position() {
    const anchorRect = this.anchor.getBoundingClientRect();
    const parentRect = this.parent.getBoundingClientRect();

    // 1. Temporarily hide to measure
    this.popover.setCssStyles({
        position: 'fixed',
        top: '0px',
        left: '0px',
        visibility: 'hidden',
        display: 'block', 
        zIndex: '9999'
    });
    const popoverRect = this.popover.getBoundingClientRect();

    let top = 0;
    let left = 0;

    if (Platform.isMobile) {
        // MOBILE: Explicitly center it on the screen
        top = (window.innerHeight - popoverRect.height) / 2;
        left = (window.innerWidth - popoverRect.width) / 2;
    } else {
        // DESKTOP: Align to the left of the button, with failsafes
        const parentCenterY = parentRect.top + (parentRect.height / 2);
        top = parentCenterY - (popoverRect.height / 2);
        top = Math.max(10, Math.min(top, window.innerHeight - popoverRect.height - 10));

        const gap = 8;
        left = anchorRect.left - popoverRect.width - gap;

        // Failsafe: If it goes off the left edge, open to the right
        if (left < 10) {
            left = anchorRect.right + gap;
            // If it still goes off the right edge, clamp it
            if (left + popoverRect.width > window.innerWidth - 10) {
                left = window.innerWidth - popoverRect.width - 10;
            }
        }
    }

    // 5. Apply final position
    this.popover.setCssStyles({
        top: `${top}px`,
        left: `${left}px`,
        visibility: 'visible'
    });
}

    private attachListeners() {
        // This prevents Obsidian from knowing you clicked the popover
        const stopEvent = (e: Event) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        
        // Bind to multiple events to ensure macOS/Windows/Linux all catch it
        this.popover.addEventListener('mousedown', stopEvent);
        this.popover.addEventListener('click', stopEvent);
        this.popover.addEventListener('pointerdown', stopEvent);

        this.clickOutsideHandler = (e: MouseEvent) => {
            if (!this.popover.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) {
                this.destroy();
            }
        };
        
        // 10ms delay prevents the CURRENT click from instantly closing the popover
        setTimeout(() => {
            if (!this.destroyed) {
                activeDocument.addEventListener('mousedown', this.clickOutsideHandler, { capture: true });
            }
        }, 10);

        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.destroy();
        };
        activeDocument.addEventListener('keydown', this.keyHandler);

        this.scrollHandler = (e: Event) => {
            if (!this.popover.contains(e.target as Node)) {
                this.destroy();
            }
        };
        this.parent.addEventListener('scroll', this.scrollHandler, { capture: true });
    }

    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        console.log(`[Popover Log] destroy() called. Stack trace:`, new Error().stack); // This will tell us EXACTLY who closed it
        
        activeDocument.removeEventListener('mousedown', this.clickOutsideHandler, { capture: true });
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.parent.removeEventListener('scroll', this.scrollHandler, { capture: true });
        
        this.popover.remove();
    }
}