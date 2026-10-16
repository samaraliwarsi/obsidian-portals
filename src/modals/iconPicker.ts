import { App, Modal, Notice } from 'obsidian';
import { IconProvider } from '../icons/iconProvider';
import PortalsPlugin from '../main';
import { EMOJI_LIST } from '../icons/emojiList';

export class IconPickerModal extends Modal {
    onSubmit: (iconKey: string) => void;
    private phosphorProvider: IconProvider;
    private plugin: PortalsPlugin;
    private lucideProvider: IconProvider;
    private currentLibrary: 'phosphor' | 'lucide' | 'emoji' | 'favorites' = 'phosphor';
    private displayCount = 300;
    private initialBatchSizes = { phosphor: 300, lucide: 60, emoji: 60, favorites: 300 };
    private batchSize = 300;
    private currentFilter = '';
    private searchInput!: HTMLInputElement;
    private iconGrid!: HTMLElement;
    private cachedIconList: { name: string; lower: string } [] = [];
    private _debounceTimer: number | null = null;
    private _rafId: number | null = null;

    constructor(app: App, phosphorProvider: IconProvider, lucideProvider: IconProvider, plugin: PortalsPlugin, onSubmit: (iconKey: string) => void) {
        super(app);
        this.plugin = plugin;
        this.phosphorProvider = phosphorProvider;
        this.lucideProvider = lucideProvider;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('portals-icon-picker-modal');

        contentEl.createDiv({ text: 'Choose an icon', cls: 'portals-icon-picker-modal-title' });
        const tabContainer = contentEl.createDiv({ cls: 'portals-icon-picker-tabs' });
        
        const favTab = tabContainer.createDiv({
            text: '★',
            cls: 'portals-icon-picker-tab-btn portals-icon-picker-fav-tab-btn',
            attr: { 'aria-label': 'Favorites' }
        });        
        const phosphorTab = tabContainer.createDiv({
            text: 'Phosphor',
            cls: 'portals-icon-picker-tab-btn'
        });
        const lucideTab = tabContainer.createDiv({
            text: 'Lucide',
            cls: 'portals-icon-picker-tab-btn'
        });
        const emojiTab = tabContainer.createDiv({
            text: 'Emoji',
            cls: 'portals-icon-picker-tab-btn'
        });
        phosphorTab.addEventListener('click', () => this.switchTab('phosphor'));
        lucideTab.addEventListener('click', () => this.switchTab('lucide'));
        favTab.addEventListener('click', () => this.switchTab('favorites'));
        emojiTab.addEventListener('click', () => this.switchTab('emoji'))
        

        this.searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search icons...',
            cls: 'icon-picker-search'
        });
        this.searchInput.addEventListener('input', () => {
            this.currentFilter = this.searchInput.value;
            this.renderIcons();
        });

        this.iconGrid = contentEl.createDiv({ cls: 'portals-icon-grid' });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        
        if (this.plugin.settings.iconFavorites.length > 0) {
            this.switchTab('favorites');
        } else {
            this.switchTab('phosphor');
        }
    }

    onClose() {
        if (this._debounceTimer) window.clearTimeout(this._debounceTimer);
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.contentEl.empty();
    }

    private getProvider(): IconProvider {
        return this.currentLibrary === 'phosphor' ? this.phosphorProvider : this.lucideProvider;
    }

    private updateCachedList() {
        const provider = this.getProvider();
        const list = provider.getIconList();
        this.cachedIconList = list.map(name => ({ name, lower: name.toLowerCase() }));
    }

    private switchTab(library: 'phosphor' | 'lucide' | 'emoji' | 'favorites') {
        this.currentLibrary = library;
        
        const tabs = this.contentEl.querySelectorAll('.portals-icon-picker-tab-btn');
        tabs.forEach(tab => {
            const tabText = tab.textContent?.trim();
            let isActive = false;
            if (library === 'favorites') {
                isActive = tabText === '★';
            } else {
                isActive = (tabText?.toLowerCase() === library);
            }
            tab.classList.toggle('active', isActive);
        });
        this.displayCount = this.initialBatchSizes[library];
        this.currentFilter = this.searchInput.value;
        if (library !== 'favorites' && library !== 'emoji') {
            this.updateCachedList();
        }
        this.renderIcons();
    }

    private toggleFavorite(name: string, library: 'phosphor' | 'lucide' | 'emoji') {
        const favs = this.plugin.settings.iconFavorites;
        const existingIndex = favs?.findIndex(f => f.name === name && f.library === library);
        if (existingIndex === -1) {
            favs?.push({ name, library });
        } else {
            favs?.splice(existingIndex, 1);
        }
        void this.plugin.saveSettings().then(() => {
            this.renderIcons()
        });
    }

    private renderEmojiGrid() {
        if (this._debounceTimer) window.clearTimeout(this._debounceTimer);
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = window.requestAnimationFrame(() => {
            const filter = this.currentFilter.toLowerCase().trim();
            const filtered = filter ? EMOJI_LIST.filter(e => e.name.toLowerCase().includes(filter) || e.char.includes(filter)) : EMOJI_LIST;
            this.iconGrid.empty();

            //paste row
            const pasteRow = this.iconGrid.createDiv({ cls: 'portals-emoji-paste-row' });
            const pasteInput = pasteRow.createEl('input', {
                type: 'text',
                placeholder: 'Or paste any emoji here (e.g. 🏳️‍⚧️)',
                cls: 'portals-emoji-paste-input'
            });
            pasteInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const pasted = pasteInput.value.trim();
                if (!pasted) return;
                this.onSubmit(`emoji:${pasted}`);
                this.close();
            });

            if (filtered.length === 0) {
                this.iconGrid.createSpan({ text: 'No emojis found.', cls: 'portals-iconpicker-subtext' });
                return;
            }
            
            const fragment = createFragment();
            for (const entry of filtered) {
                const iconEl = createDiv({ cls: 'icon-item portals-emoji-item' });
                const glyph = iconEl.createSpan({ cls: 'portals-emoji-glyph' });
                glyph.setText(entry.char);
                iconEl.setAttribute('aria-label', entry.name);
                iconEl.setAttribute('title', entry.name);
                iconEl.addEventListener('click', () => {
                    this.onSubmit(`emoji:${entry.char}`);
                    this.close();
                });

                const starBtn = createSpan({ cls: 'portals-icon-picker-fav-star' });
                const isFav = this.isFavorite(entry.char, 'emoji');
                starBtn.textContent = isFav ? '★' : '☆';
                starBtn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
                starBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFavorite(entry.char, 'emoji');
                });
                iconEl.appendChild(starBtn);
                fragment.appendChild(iconEl);
            }
            this.iconGrid.appendChild(fragment);
        });
    }

    private renderIcons() {
        if (this._debounceTimer) window.clearTimeout(this._debounceTimer);

        if (this.currentLibrary === 'favorites') {
            this.renderFavoritesTab();
            return;
        }
        if (this.currentLibrary === 'emoji') {
            this.renderEmojiGrid();
            return;
        }

        this._debounceTimer = window.setTimeout(() => {
            if (this._rafId) cancelAnimationFrame(this._rafId);
            this._rafId = window.requestAnimationFrame(() => {
                const provider = this.getProvider();

                // Filter based on search input
                const filtered = this.currentFilter
                    ? this.cachedIconList
                        .filter(item => item.lower.includes(this.currentFilter.toLowerCase()))
                        .map(item => item.name)
                    : this.cachedIconList.map(item => item.name);

                // Apply batch limit only when not searching
                const toRender = this.currentFilter
                    ? filtered
                    : filtered.slice(0, this.displayCount);

                this.iconGrid.empty();

                if (toRender.length === 0) {
                    this.iconGrid.createSpan({ text: 'No icons found.', cls: 'portals-iconpicker-subtext' });
                    return;
                }

                // Render each icon
                const fragment = createFragment();
                for (const name of toRender) {
                    const iconEl = createDiv();
                    iconEl.className = 'icon-item';
                    provider.renderIcon(iconEl, name);
                    iconEl.createSpan({ cls: 'portals-icon-label', text: name });
                    iconEl.addEventListener('click', () => {
                        this.onSubmit(`${this.currentLibrary}:${name}`);
                        this.close();
                    });

                    const iconLibrary = this.currentLibrary as 'phosphor' | 'lucide';                    
            
                    const starBtn = createSpan();
                    starBtn.className = 'portals-icon-picker-fav-star';
                    const updateStar = () => {
                        const fav = this.plugin.settings.iconFavorites.some(f => f.name === name && f.library === iconLibrary);
                        starBtn.textContent = fav ? '★' : '☆';
                        const favorited = this.isFavorite(name, iconLibrary);
                        starBtn.setAttribute('aria-label', favorited ? 'Remove from favorites' : 'Add to favorites');
                    };
                    updateStar();
                    
                    starBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const currentlyFav = this.plugin.settings.iconFavorites.some(f => f.name === name && f.library === iconLibrary);
                        if (currentlyFav) {
                            this.plugin.settings.iconFavorites = this.plugin.settings.iconFavorites.filter(f => !(f.name === name && f.library === iconLibrary));
                        } else {
                            this.plugin.settings.iconFavorites.push({ name, library: iconLibrary });
                        }
                        updateStar();
                        this.plugin.saveSettings().catch(err => {
                            console.error(err);
                            new Notice('Failed to save icon - check console of details');
                        });
                    });
                    iconEl.appendChild(starBtn);
                    fragment.appendChild(iconEl);
                }
                this.iconGrid.appendChild(fragment);

                // "Load more" button (only when not searching)
                if (!this.currentFilter && this.displayCount < filtered.length) {
                    const remaining = filtered.length - this.displayCount;
                    const loadBtn = this.iconGrid.createDiv({
                        cls: 'portals-load-more-btn',
                        text: `Load more (${remaining} remaining)`
                    });
                    loadBtn.addEventListener('click', () => {
                        this.displayCount = Math.min(this.displayCount + this.batchSize, filtered.length);
                        this.renderIcons();
                    });
                }
            });
        }, 200);
    }

    private isFavorite(name: string, library: 'phosphor' | 'lucide' | 'emoji'): boolean {
        return this.plugin.settings.iconFavorites.some(
            f => f.name === name && f.library === library
        );
    }

    private renderFavoritesTab() {
        const favs = this.plugin.settings.iconFavorites;
        if (favs.length === 0) {
            this.iconGrid.empty();
            this.iconGrid.createDiv({
                text: 'No Favorites marked yet. Click the star next to any icon to add it here.',
                cls: 'portals-icon-picker-subtext'
            });
            return;
        }

        let filteredFavs = favs;
        if (this.currentFilter) {
            const q = this.currentFilter.toLowerCase();
            filteredFavs = favs.filter(f => f.name.toLowerCase().includes(q));
        }

        const fragment = createFragment();
        for (const fav of filteredFavs) {
            const iconEl = createDiv();
            iconEl.className = 'icon-item';

            if (fav.library === 'emoji') {
                iconEl.addClass('portals-emoji-item');
                const glyph = iconEl.createSpan({ cls: 'portals-emoji-glyph' });
                glyph.setText(fav.name);
                const entry = EMOJI_LIST.find(e => e.char === fav.name);
                const label = entry ? entry.name : fav.name;
                iconEl.setAttribute('title', label);
                iconEl.setAttribute('aria-label', label);
            } else {
                const provider = fav.library === 'lucide' ? this.lucideProvider : this.phosphorProvider;
                provider.renderIcon(iconEl, fav.name);
                iconEl.setAttribute('title', fav.name);
                iconEl.setAttribute('aria-label', fav.name);
            }
            iconEl.addEventListener('click', () => {
                this.onSubmit(`${fav.library}:${fav.name}`);
                this.close();
            });

            const starBtn = createSpan();
            starBtn.className = 'portals-favorite-star';
            starBtn.textContent = '★';
            starBtn.setAttribute('aria-label', 'Remove from favorites');
            starBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(fav.name, fav.library);
            });
            iconEl.appendChild(starBtn);
            fragment.appendChild(iconEl);
        }
        this.iconGrid.empty();
        this.iconGrid.appendChild(fragment);
    }
}