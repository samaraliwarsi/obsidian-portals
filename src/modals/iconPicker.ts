import { App, Modal } from 'obsidian';
import { IconProvider } from '../icons/iconProvider';

export class IconPickerModal extends Modal {
    onSubmit: (iconName: string) => void;
    private searchTimeout: number | null = null;
    private provider: IconProvider;

    constructor(app: App, provider: IconProvider, onSubmit: (iconName: string) => void) {
        super(app);
        this.provider = provider;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('portals-icon-picker-modal');

        //contentEl.createEl('h2', { text: 'Choose an icon' });
        contentEl.createDiv({ text: 'Choose an icon', cls: 'portals-icon-picker-modal-title' });


        const searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search icons...',
            cls: 'icon-picker-search'
        });

        const iconGrid = contentEl.createDiv({ cls: 'portals-icon-grid' });

        const BATCH_SIZE = 300;
        let displayCount = BATCH_SIZE;
        let currentFilter = '';
        let allFiltered: string[] = [];

        const iconList = this.provider.getIconList();

        const renderIcons = (filter: string) => {
            if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
            this.searchTimeout = window.setTimeout(() => {
                const filtered = filter
                    ? iconList.filter((name: string) => name.toLowerCase().includes(filter.toLowerCase()))
                    : iconList;
                allFiltered = filtered;

                if (filter !== currentFilter) {
                    displayCount = BATCH_SIZE;
                    currentFilter = filter;
                }

                const toRender = filter ? filtered : filtered.slice(0, displayCount);
                iconGrid.empty();

                if (toRender.length === 0) {
                    iconGrid.createSpan({ text: 'No icons found.', cls: 'portals-iconpicker-subtext' });
                    return;
                }

                for (const name of toRender) {
                    const iconEl = iconGrid.createDiv({ cls: 'icon-item' });

                    this.provider.renderIcon(iconEl, name);

                    // Create an <i> element with the Phosphor icon class
                    //iconEl.createEl('i', { cls: `ph ph-${name} portals-icon-picker-icon` });

                    iconEl.createSpan({ cls: 'portals-icon-label', text: name });

                    iconEl.addEventListener('click', () => {
                        this.onSubmit(name);
                        this.close();
                    });
                }
                if (displayCount < allFiltered.length) {
                    const loadBtn = iconGrid.createDiv({
                        cls: 'portals-load-more-btn',
                        text: `Load more (${allFiltered.length-displayCount} remaining)`
                    });
                    loadBtn.addEventListener('click', () => {
                        displayCount = Math.min(displayCount + BATCH_SIZE, allFiltered.length);
                        renderIcons(currentFilter);
                    });
                }
            }, 200);
        };

        renderIcons('');

        searchInput.addEventListener('input', () => renderIcons(searchInput.value));

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
    }

    onClose() {
        if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
        this.contentEl.empty();
    }
}