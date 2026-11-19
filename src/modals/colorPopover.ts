import PortalsPlugin from '../main';
import { DEFAULT_PORTALS_PALETTE } from './colorModal';

export class ColorPickerPopover {
    private popover: HTMLElement;
    private destroyed = false;

    private clickOutsideHandler!: (e: MouseEvent) => void;
    private keyHandler!: (e: KeyboardEvent) => void;
    private scrollHandler!: () => void;

    constructor(
        private plugin: PortalsPlugin,
        private anchor: HTMLElement,
        private parent: HTMLElement,
        private onSelect: (color: string) => void,
        currentColor?: string
    ) {
        if (getComputedStyle(parent).position === 'static') {
            parent.setCssStyles({ position: 'relative' });
        }

        this.popover = parent.createDiv('portals-inline-color-popover');
        this.buildUI(currentColor);
        this.position();
        this.attachListeners();
    }

    private buildUI(currentColor?: string) {
        // 10 palette swatches in a 5x2 grid
        const palette = this.plugin.settings.userPalette ?? DEFAULT_PORTALS_PALETTE;
        const swatchGrid = this.popover.createDiv({ cls: 'portals-inline-color-swatches' });

        for (const color of palette) {
            const swatch = swatchGrid.createDiv({ cls: 'portals-inline-color-swatch' });
            swatch.setCssProps({ '--swatch-bg': color });
            swatch.setAttribute('title', color);
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect(color);
                this.destroy();
            });
        }

        // Custom color row
        const customRow = this.popover.createDiv({ cls: 'portals-inline-color-custom-row' });
        customRow.createSpan({ text: 'Custom', cls: 'portals-inline-color-label' });

        const customSwatch = customRow.createDiv({ cls: 'portals-inline-color-custom-swatch' });
        const picker = customSwatch.createEl('input', {
            type: 'color',
            cls: 'portals-inline-color-picker-hidden'
        });

        // Seed custom picker with current color if it's a hex value
        const seed = currentColor && currentColor.startsWith('#') ? currentColor : '#328cec';
        picker.value = seed;
        customSwatch.setCssProps({ '--swatch-bg': seed });

        customSwatch.addEventListener('click', (e) => {
            e.stopPropagation();
            picker.click();
        });
        picker.addEventListener('input', () => {
            customSwatch.setCssProps({ '--swatch-bg': picker.value });
        });
        picker.addEventListener('change', () => {
            this.onSelect(picker.value);
            this.destroy();
        });

        // Clear option
        if (currentColor) {
            const clearBtn = this.popover.createEl('button', {
                text: 'Remove color',
                cls: 'portals-inline-color-clear-btn'
            });
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect('');
                this.destroy();
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