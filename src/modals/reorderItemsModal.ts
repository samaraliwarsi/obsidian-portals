import { App, Modal } from 'obsidian';
import PortalsPlugin from '../main';
import Sortable from 'sortablejs';
import { PortalsView } from '../view';

// ==================== REORDER MODAL ====================
export class ReorderItemsModal extends Modal {
    private sourceEl: HTMLElement | null;
    private detailsEl: HTMLElement |null;
    private detailsHighlightClass: string = '';
    constructor(
        app: App,
        private plugin: PortalsPlugin,
        private view: PortalsView,
        private items: { path: string; displayName: string }[],
        sourceEl?: HTMLElement,
    ) {
        super(app);
        this.sourceEl = sourceEl ?? null;
        this.detailsEl = sourceEl?.closest('.folder-details') as HTMLElement ?? null;
        if (this.detailsEl?.instanceOf(HTMLDetailsElement)) {
            this.detailsHighlightClass = this.detailsEl.open
                ? 'portals-reordering-details-open-active'
                : 'portals-reordering-details-closed-active';
        } else {
            this.detailsHighlightClass = 'portals-reordering-details-active';
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('portals-reorder-modal');
        contentEl.addClass('portals-modal');
        this.contentEl.createDiv({ text: 'Reorder items', cls: 'portals-reorder-title'});

        const list = contentEl.createDiv({ cls: 'portals-sortable-list' });

        for (const item of this.items) {
            const row = list.createDiv({ cls: 'portals-sortable-item' });
            row.createSpan({ text: item.displayName });
            row.dataset.path = item.path;
            row.createSpan({ cls: 'portals-reorder-handle'})
                .createEl('i', { cls: 'ph ph-dots-six-vertical' });
        }
        if (this.sourceEl) {
            this.sourceEl.addClass('portals-reordering-source-active');
        }
        if (this.detailsEl) {
            this.detailsEl.addClass(this.detailsHighlightClass);
        }

        new Sortable(list, {
            animation: 150,
            delay: 200,
            delayOnTouchOnly: true,
            draggable: '.portals-sortable-item',
            onEnd: () => {
                const newOrder = Array.from(list.querySelectorAll('.portals-sortable-item'))
                    .map(el => (el as HTMLElement).dataset.path!);
                // Save positions
                const custom = this.plugin.settings.customTreeOrder;
                for (const item of this.items) {
                    delete custom[item.path];
                }
                newOrder.forEach((key, index) => {
                    custom[key] = index;
                });
                void this.plugin.saveData(this.plugin.settings).then(() => {
                    this.view.renderContent();
                });
            },
        });
        const btnDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        btnDiv.createEl('button', { text: 'Done', cls: 'mod-cta' })
            .addEventListener('click', () => this.close());
        }
        onClose() {
            if (this.sourceEl) {
                this.sourceEl.removeClass('portals-reordering-source-active');
            }
            if (this.detailsEl) {
                this.detailsEl.removeClass(this.detailsHighlightClass);
            }
            this.contentEl.empty();
        }
    }
