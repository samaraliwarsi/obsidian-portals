import { Platform } from 'obsidian';
import PortalsPlugin from '../main';
import { DEFAULT_PORTALS_PALETTE } from './colorModal';

export class ColorPickerPopover {
    private popover: HTMLElement;
    private destroyed = false;

    private clickOutsideHandler!: (e: MouseEvent) => void;
    private keyHandler!: (e: KeyboardEvent) => void;
    private scrollHandler!: (e: Event) => void;

    constructor(
        private plugin: PortalsPlugin,
        private anchor: HTMLElement,
        private parent: HTMLElement,
        private onSelect: (color: string) => void,
        currentColor?: string
    ) {
        /*
        if (getComputedStyle(parent).position === 'static') {
            parent.setCssStyles({ position: 'relative' });
        }*/

        this.popover = activeDocument.body.createDiv('portals-inline-color-popover');
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

/*
// the one with gap, 
private position() {
        const anchorRect = this.anchor.getBoundingClientRect();
        const parentRect = this.parent.getBoundingClientRect();
        this.popover.setCssProps({
            position: 'fixed',
            top: '0px',
            left: '0px',
            visibility: 'hidden',
            display: 'block'
        });
        const popoverRect = this.popover.getBoundingClientRect();
        // Vertical center relative to modal
        const parentCenterY = parentRect.top + (parentRect.height / 2);
        let top = parentCenterY - (popoverRect.height / 2);

        // safety clamps to keep on screen, prevent going off top or bottom
        top = Math.max(10, Math.min(top, window.innerHeight - popoverRect.height - 10));
        
        // Right edge of pop = left edge of button
        const gap = 8;
        let left = anchorRect.right - popoverRect.width - gap;

        // safety flip - if goes off the left side, open to right instead
        if (left < 10) {
            left = anchorRect.right + gap;
            // If it still goes off the right edge, just clamp it to the screen edge
            if (left + popoverRect.width > window.innerWidth - 10) {
                left = window.innerWidth - popoverRect.width - 10;
            }
        }

        this.popover.setCssStyles({
            top: `${top}px`,
            left: `${left}px`,
            visibility: 'visible'
        });
    }


private position() {
    const anchorRect = this.anchor.getBoundingClientRect();
    // We use this.parent (the modal) as the reference for vertical centering
    const parentRect = this.parent.getBoundingClientRect();

    // 1. Temporarily hide the popover to measure its true size
    this.popover.setCssStyles({
        position: 'fixed',
        top: '0px',
        left: '0px',
        visibility: 'hidden',
        display: 'block',
        zIndex: '9999'
    });
    const popoverRect = this.popover.getBoundingClientRect();

    // 2. Calculate Vertical Center (relative to the modal)
    const parentCenterY = parentRect.top + (parentRect.height / 2);
    let top = parentCenterY - (popoverRect.height / 2);

    // 3. Calculate Right-Alignment (align popover's right edge to button's right edge)
    let left = anchorRect.right - popoverRect.width;

    // 4. Safety Clamps (Keep it on screen)
    // Prevent going off the top or bottom of the viewport
    top = Math.max(10, Math.min(top, window.innerHeight - popoverRect.height - 10));
    // Prevent going off the left side of the viewport
    left = Math.max(10, left);

    // 5. Apply final position and make visible
    this.popover.setCssStyles({
        top: `${top}px`,
        left: `${left}px`,
        visibility: 'visible'
    });
}

private position() {
        const anchorRect = this.anchor.getBoundingClientRect();
        const parentRect = this.parent.getBoundingClientRect();
        this.popover.setCssProps({
            position: 'fixed',
            top: `${anchorRect.bottom - parentRect.top + 4}px`,
            left: `${anchorRect.left - parentRect.left}px`,
        });
    }
    */