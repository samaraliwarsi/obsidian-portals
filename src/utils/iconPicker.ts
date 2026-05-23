import { App, Modal } from 'obsidian';
import { iconNames } from './iconMap';

export class IconPickerModal extends Modal {
    onSubmit: (iconName: string) => void;
    private searchTimeout: number | null = null;

    constructor(app: App, onSubmit: (iconName: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('icon-picker-modal');

        contentEl.createEl('h2', { text: 'Choose an icon' });

        const searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search icons...',
            cls: 'icon-picker-search'
        });

        const iconGrid = contentEl.createDiv({ cls: 'portals-icon-grid' });

        const BATCH_SIZE = 500;
        let displayCount = BATCH_SIZE;
        let currentFilter = '';
        let allFiltered: string[] = [];

        const renderIcons = (filter: string) => {
            if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
            this.searchTimeout = window.setTimeout(() => {
                const filtered = filter
                    ? iconNames.filter((name: string) => name.toLowerCase().includes(filter.toLowerCase()))
                    : iconNames;
                allFiltered = filtered;

                if (filter !== currentFilter) {
                    displayCount = BATCH_SIZE;
                    currentFilter = filter;
                }

                const toRender = filter ? filtered : filtered.slice(0, displayCount);
                iconGrid.empty();

                if (toRender.length === 0) {
                    iconGrid.createEl('p', { text: 'No icons found.' });
                    return;
                }

                for (const name of toRender) {
                    const iconEl = iconGrid.createDiv({ cls: 'icon-item' });

                    // Create an <i> element with the Phosphor icon class
                    iconEl.createEl('i', { cls: `ph ph-${name} portals-icon-picker-icon` });

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

        const buttonContainer = contentEl.createDiv({ cls: 'icon-picker-buttons' });
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
    }

    onClose() {
        if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
        this.contentEl.empty();
    }
}