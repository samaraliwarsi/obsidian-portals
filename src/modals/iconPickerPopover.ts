import { App } from 'obsidian';
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
    private scrollHandler!: () => void;

    constructor(
        private app: App,
        private plugin: PortalsPlugin,
        private anchor: HTMLElement,
        private parent: HTMLElement,
        private onSelect: (iconKey: string) => void
    ) {
        // Ensure parent is a positioning context
        if (getComputedStyle(parent).position === 'static') {
            parent.setCssStyles({ position: 'relative' });
        }

        this.popover = parent.createDiv('portals-inline-icon-popover');
        this.buildUI();
        this.position();
        this.attachListeners();

        // Default to favorites if any, else phosphor
        this.currentLibrary = this.plugin.settings.iconFavorites.length > 0 ? 'favorites' : 'phosphor';
        this.updateTabStates();
        this.renderGrid();
        this.input.focus();
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
        this.popover.setCssProps({
            position: 'absolute',
            top: `${anchorRect.bottom - parentRect.top + 4}px`,
            left: `${anchorRect.left - parentRect.left}px`,
            zIndex: 'var(--layer-popover, 30)'
        });
    }

    private attachListeners() {
        this.popover.addEventListener('mousedown', (e) => e.stopPropagation());

        this.clickOutsideHandler = (e: MouseEvent) => {
            if (!this.popover.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) {
                this.destroy();
            }
        };
        activeDocument.addEventListener('click', this.clickOutsideHandler, { capture: true });

        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.destroy();
        };
        activeDocument.addEventListener('keydown', this.keyHandler);

        // Close on modal scroll so the popover doesn't detach visually
        this.scrollHandler = () => this.destroy();
        this.parent.addEventListener('scroll', this.scrollHandler, { capture: true });
    }

    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        activeDocument.removeEventListener('click', this.clickOutsideHandler, { capture: true });
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.parent.removeEventListener('scroll', this.scrollHandler, { capture: true });
        this.popover.remove();
    }
}