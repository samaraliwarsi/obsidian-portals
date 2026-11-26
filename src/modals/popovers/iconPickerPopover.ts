import { App, Platform } from 'obsidian';
import PortalsPlugin from '../../main';
import { EMOJI_LIST } from '../../icons/emojiList';
import { overlayStack } from '../overlayStack';

export class IconPickerPopover {
    private popover: HTMLElement;
    private readonly overlayLayer = { close: () => this.destroy() };
    private input!: HTMLInputElement;
    private grid!: HTMLElement;
    private tabContainer!: HTMLElement;
    private currentLibrary: 'favorites' | 'phosphor' | 'lucide' | 'emoji' = 'phosphor';
    private filter = '';
    private displayCount = 40;
    private destroyed = false;
    private resizeObserver!: ResizeObserver;
    private resizeHandler!: () => void;
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
        this.popover = activeDocument.body.createDiv('portals-icopop');
        overlayStack.push(this.overlayLayer);
        this.popover.addClass('portals-inline-icon-popover');
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
        this.tabContainer = this.popover.createDiv({ cls: 'portals-icopop-tabs' });
        const tabs: { key: 'favorites' | 'phosphor' | 'lucide' | 'emoji'; label: string }[] = [
            { key: 'favorites', label: '★' },
            { key: 'phosphor', label: 'Phosphor' },
            { key: 'lucide', label: 'Lucide' },
            { key: 'emoji', label: 'Emoji' },
        ];
        for (const t of tabs) {
            const tab = this.tabContainer.createDiv({ cls: 'portals-icopop-tab', text: t.label });
            tab.dataset.tab = t.key;
            tab.addEventListener('click', () => {
                this.currentLibrary = t.key;
                this.filter = '';
                this.input.value = '';
                this.displayCount = 40;
                this.updateTabStates();
                this.renderGrid();
                this.input.focus();
            });
        }
        const inputDiv = this.popover.createDiv({ cls: 'portals-icopop-input-div' });
        this.input = inputDiv.createEl('input', {
            type: 'text',
            cls: 'portals-icopop-search',
            placeholder: 'Search icons...'
        });
        this.input.addEventListener('input', () => {
            this.filter = this.input.value;
            this.renderGrid();
        });
        const gridDiv = this.popover.createDiv({ cls: 'portals-icopop-grid-div' });
        this.grid = gridDiv.createDiv({ cls: 'portals-icopop-grid' });
    }

    private updateTabStates() {
        this.tabContainer.querySelectorAll<HTMLElement>('.portals-icopop-tab').forEach(tab => {
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
            this.grid.createDiv({ text: 'No icons found', cls: 'portals-icopop-empty' });
            return;
        }

        const frag = createFragment();
        for (const name of toRender) {
            const iconEl = createDiv({ cls: 'portals-icopop-item' });
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
                cls: 'portals-icopop-loadmore',
                text: `Load more (${filtered.length - this.displayCount} remaining)`
            });
            more.addEventListener('click', () => {
                this.displayCount += 40;
                this.renderGrid();
            });
        }
    }

    private renderFavoritesGrid() {
        const favs = this.plugin.settings.iconFavorites;
        if (favs.length === 0) {
            this.grid.createDiv({ text: 'No favorites yet. Star any icon in the tree’s full picker to add one.', cls: 'portals-icopop-empty' });
            return;
        }

        const filter = this.filter.toLowerCase();
        const filtered = filter ? favs.filter(f => f.name.toLowerCase().includes(filter)) : favs;

        if (filtered.length === 0) {
            this.grid.createDiv({ text: 'No matching favorites', cls: 'portals-icopop-empty' });
            return;
        }

        const frag = createFragment();
        for (const fav of filtered) {
            const iconEl = createDiv({ cls: 'portals-icopop-item' });
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
            this.grid.createDiv({ text: 'No emojis found', cls: 'portals-icopop-empty' });
            return;
        }

        const frag = createFragment();
        for (const entry of toRender) {
            const iconEl = createDiv({ cls: 'portals-icopop-item portals-emoji-icon', text: entry.char });
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
                cls: 'portals-icopop-loadmore',
                text: `Load more (${list.length - this.displayCount} remaining)`
            });
            more.addEventListener('click', () => {
                this.displayCount += 40;
                this.renderGrid();
            });
        }
    }

    private position() {
        if (this.destroyed) return;

        const anchorRect = this.anchor.getBoundingClientRect();
        const parentRect = this.parent.getBoundingClientRect();

        this.popover.setCssStyles({
            position: 'fixed',
            top: '0px',
            left: '0px',
            visibility: 'hidden',
            display: 'block'
        });
        const popoverRect = this.popover.getBoundingClientRect();

        // USE VISUAL VIEWPORT (Accounts for mobile keyboard)
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;

        let top = 0;
        let left = 0;

        if (Platform.isMobile) {
            // Center on the *visible* screen (above keyboard)
            top = (viewportHeight - popoverRect.height) / 2;
            left = (viewportWidth - popoverRect.width) / 2;
        } else {
            // Desktop: Center vertically on the modal, stick to the left of the button
            const parentCenterY = parentRect.top + (parentRect.height / 2);
            top = parentCenterY - (popoverRect.height / 2);
            
            const gap = 8;
            left = anchorRect.left - popoverRect.width - gap;

            // Failsafes
            if (left < 10) {
                left = anchorRect.right + gap;
                if (left + popoverRect.width > viewportWidth - 10) {
                    left = viewportWidth - popoverRect.width - 10;
                }
            }
        }

        // Clamp vertically so it NEVER goes behind the keyboard or off-screen
        top = Math.max(10, Math.min(top, viewportHeight - popoverRect.height - 10));

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
        this.popover.addEventListener('focusin', stopEvent);
        this.popover.addEventListener('focusout', stopEvent);
        this.popover.addEventListener('mousedown', stopEvent);
        this.popover.addEventListener('click', stopEvent);
        this.popover.addEventListener('pointerdown', stopEvent);

        this.clickOutsideHandler = (e: MouseEvent) => {
            if (!this.popover.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) {
                this.destroy();
            }
        };
        
        // 10ms delay prevents the CURRENT click from instantly closing the popover
        window.setTimeout(() => {
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
        
        // Listen for window resizes
        this.resizeHandler = () => this.position();
        window.addEventListener('resize', this.resizeHandler);
        // listen for mobile keyboard open and close
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.resizeHandler);
        }
        this.resizeObserver = new ResizeObserver(() => this.position());
        this.resizeObserver.observe(this.anchor);
        this.resizeObserver.observe(this.parent);

    }

    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        overlayStack.remove(this.overlayLayer);
        
        activeDocument.removeEventListener('mousedown', this.clickOutsideHandler, { capture: true });
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.parent.removeEventListener('scroll', this.scrollHandler, { capture: true });

        window.removeEventListener('resize', this.resizeHandler);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.resizeHandler);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        this.popover.remove();
    }
}