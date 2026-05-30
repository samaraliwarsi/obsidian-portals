import { App, Modal } from 'obsidian';
import { IconProvider } from '../icons/iconProvider';

export class IconPickerModal extends Modal {
    onSubmit: (iconKey: string) => void;
    private phosphorProvider: IconProvider;
    private lucideProvider: IconProvider;
    private currentLibrary: 'phosphor' | 'lucide' = 'phosphor';
    private displayCount = 300;
    private batchSize = 300;
    private currentFilter = '';
    private searchInput!: HTMLInputElement;
    private iconGrid!: HTMLElement;
    private cachedIconList: { name: string; lower: string } [] = [];
    private _debounceTimer: number | null = null;
    private _rafId: number | null = null;

    constructor(app: App, phosphorProvider: IconProvider, lucideProvider: IconProvider, onSubmit: (iconKey: string) => void) {
        super(app);
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
        const phosphorTab = tabContainer.createDiv({
            text: 'Phosphor',
            cls: 'portals-icon-picker-tab-btn'
        });
        const lucideTab = tabContainer.createDiv({
            text: 'Lucide',
            cls: 'portals-icon-picker-tab-btn'
        });
        phosphorTab.addEventListener('click', () => this.switchTab('phosphor'));
        lucideTab.addEventListener('click', () => this.switchTab('lucide'));

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
        this.switchTab('phosphor');
    }

    onClose() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
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

    private switchTab(library: 'phosphor' | 'lucide') {
        this.currentLibrary = library;
        this.updateCachedList();
        const tabs = this.contentEl.querySelectorAll('.portals-icon-picker-tab-btn');
        tabs.forEach(tab => {
            const isActive = (tab.textContent?.toLowerCase() === library);
            tab.classList.toggle('active', isActive);
        });
        this.displayCount = this.batchSize;
        this.currentFilter = this.searchInput.value;
        this.renderIcons();
    }

    private renderIcons() {
        if (this._debounceTimer) window.clearTimeout(this._debounceTimer);

        this._debounceTimer = window.setTimeout(() => {
            if (this._rafId) cancelAnimationFrame(this._rafId);
            this._rafId = requestAnimationFrame(() => {
                const provider = this.getProvider();
                //const allIcons = provider.getIconList();

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
                const fragment = document.createDocumentFragment();
                for (const name of toRender) {
                    const iconEl = document.createElement('div');
                    iconEl.className = 'icon-item';
                    provider.renderIcon(iconEl, name);
                    iconEl.createSpan({ cls: 'portals-icon-label', text: name });
                    iconEl.addEventListener('click', () => {
                        this.onSubmit(`${this.currentLibrary}:${name}`);
                        this.close();
                    });
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
}