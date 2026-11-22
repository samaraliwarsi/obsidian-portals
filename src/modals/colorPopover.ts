import { Platform } from 'obsidian';
import PortalsPlugin from '../main';
import { DEFAULT_PORTALS_PALETTE } from './colorModal';

export class ColorPickerPopover {
    private popover: HTMLElement;
    private destroyed = false;
    private resizeObserver!: ResizeObserver;
    private resizeHandler!: () => void;
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
        this.popover.addClass('portals-colpop')
        this.buildUI(currentColor);
        this.position();
        this.attachListeners();
    }

    private buildUI(currentColor?: string) {
        const textGrid = this.popover.createDiv({ cls: 'portals-colpop-text-div' });
        textGrid.createSpan({
            cls: 'portals-colpop-title',
            text: 'Color Palettes'
        });

        textGrid.createSpan({
            cls: 'portals-colpop-desc',
            text: 'Click: apply, double-click: edit, right-click: reset'
        });

        const palette = this.plugin.settings.userPalette ?? DEFAULT_PORTALS_PALETTE;
        const swatchGrid = this.popover.createDiv({ cls: 'portals-colpop-swatches' });

        // Create ONE hidden picker for all swatches to share
        const hiddenPalettePicker = this.popover.createEl('input', {
            type: 'color',
            cls: 'portals-inline-color-picker-hidden'
        });

        // Handle the double-click edit result
        hiddenPalettePicker.addEventListener('change', () => {
            const index = parseInt(hiddenPalettePicker.dataset.index || '-1', 10);
            if (index >= 0 && index < palette.length) {
                const newColor = hiddenPalettePicker.value;
                palette[index] = newColor;
                
                // Update the UI swatch immediately
                const swatch = swatchGrid.children[index] as HTMLElement;
                if (swatch) swatch.setCssProps({ '--swatch-bg': newColor });
                
                // Save to settings (this syncs the modal instantly)
                this.plugin.settings.userPalette = [...palette];
                void this.plugin.saveSettings();
            }
        });

        for (let i = 0; i < palette.length; i++) {
            const color = palette[i]!;
            const swatch = swatchGrid.createDiv({ cls: 'portals-colpop-swatch' });
            swatch.setCssProps({ '--swatch-bg': color });
            swatch.setAttribute('title', color);

            let clickTimeout: number | null = null;

            // 1. SINGLE CLICK: Apply color & close
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                if (clickTimeout) window.clearTimeout(clickTimeout);
                clickTimeout = window.setTimeout(() => {
                    this.onSelect(color);
                    this.destroy();
                }, 200);
            });

            // 2. DOUBLE CLICK: Open hidden picker to edit
            swatch.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (clickTimeout) window.clearTimeout(clickTimeout); // Cancel the single-click apply
                
                hiddenPalettePicker.dataset.index = String(i);
                hiddenPalettePicker.value = color;
                hiddenPalettePicker.click();
            });

            // 3. RIGHT CLICK: Reset to default
            swatch.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const defaultColor = DEFAULT_PORTALS_PALETTE[i] || '#000000';
                palette[i] = defaultColor;
                swatch.setCssProps({ '--swatch-bg': defaultColor });
                
                this.plugin.settings.userPalette = [...palette];
                void this.plugin.saveSettings();
            });
        }

        // --- Keep the Custom color row from before ---
        const titleRow = this.popover.createDiv({ cls: 'portals-colpop-custom-title-row' });
        titleRow.createSpan({ text: 'Custom', cls: 'portals-colpop-label' });

        const customRow = this.popover.createDiv({ cls: 'portals-colpop-control-row' });
        const customSwatch = customRow.createDiv({ cls: 'portals-colpop-custom-swatch' });
        const picker = customSwatch.createEl('input', {
            type: 'color',
            cls: 'portals-inline-color-picker-hidden'
        });

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

        if (currentColor) {
            const clearBtn = customRow.createEl('button', {
                text: 'Remove color',
                cls: 'portals-reset-btn portals-colpop-clear'
            });
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect('');
                this.destroy();
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
