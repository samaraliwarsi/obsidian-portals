import { App, Modal } from 'obsidian';
import { IconProvider } from '../icons/iconProvider';

export class IconPickerModal extends Modal {
    onSubmit: (iconKey: string) => void;
    private searchTimeout: number | null = null;
    private phosphorProvider: IconProvider;
    private lucideProvider: IconProvider;
    private currentLibrary: 'phosphor' | 'lucide' = 'phosphor';
    private displayCount = 300;
    private batchSize = 300;
    private currentFilter = '';
    private searchInput!: HTMLInputElement;
    private iconGrid!: HTMLElement;

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
        this.renderIcons();
    }

    onClose() {
        if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
        this.contentEl.empty();
    }

    private getProvider(): IconProvider {
        return this.currentLibrary === 'phosphor' ? this.phosphorProvider : this.lucideProvider;
    }

    private switchTab(library: 'phosphor' | 'lucide') {
        this.currentLibrary = library;
        const tabs = this.contentEl.querySelectorAll('.portals-icon-picker-tab-btn');
        tabs.forEach(tab => {
            const isActive = (tab.textContent?.toLowerCase() === library);
            tab.classList.toggle('active', isActive);
        });
        this.displayCount = 500;
        this.currentFilter = this.searchInput.value;
        this.renderIcons();
    }

    private renderIcons() {
        if (this.searchTimeout) window.clearTimeout(this.searchTimeout);

        this.searchTimeout = window.setTimeout(() => {
            const provider = this.getProvider();
            const allIcons = provider.getIconList();

            // Filter based on search input
            const filtered = this.currentFilter
                ? allIcons.filter(name => name.toLowerCase().includes(this.currentFilter.toLowerCase()))
                : allIcons;

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
            for (const name of toRender) {
                const iconEl = this.iconGrid.createDiv({ cls: 'icon-item' });

                // Provider draws the icon (Phosphor: <i>, Lucide: SVG)
                provider.renderIcon(iconEl, name);

                // Label under the icon
                iconEl.createSpan({ cls: 'portals-icon-label', text: name });

                // Click → return encoded string
                iconEl.addEventListener('click', () => {
                    this.onSubmit(`${this.currentLibrary}:${name}`);
                    this.close();
                });
            }

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
        }, 200);
    }
}