import { App } from "obsidian";
import PortalsPlugin from "../main";

export const DEFAULT_PORTALS_PALETTE: string[] = [
  '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
  '#1e88e5', '#039be5', '#00acc1', '#00897b', '#43a047',
];

export class ColorPickerModal {
    private app: App;
    private plugin: PortalsPlugin;
    private color: string;
    private opacity: number;
    private onSave: (color: string) => void;
    private targetElement: HTMLElement;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    private keyHandler: (e: KeyboardEvent) => void;
    private summaryElement: HTMLElement | null;
    private childrenContainer: HTMLElement | null;
    private originalDetailsClass: boolean;
    private originalChildrenClass: boolean;
    private originalSummaryClass: boolean;
    private originalColor: string;
    private originalFileTextColor: string = '';
    private originalFileIconColor: string = '';
    private palettes!: HTMLDivElement;
    private paletteSlots: HTMLDivElement[] = [];
    private paletteColors: string[] = [];
    private readonly defaultPalette: string[] = [...DEFAULT_PORTALS_PALETTE];
    private readonly paletteSlotCount: number = DEFAULT_PORTALS_PALETTE.length;
    
    constructor(app: App, plugin: PortalsPlugin, targetElement: HTMLElement, onSave: (color: string) => void, private onClose?: () => void, currentColor?: string) {
        this.app = app;
        this.plugin = plugin;
        this.onSave = onSave;
        this.onClose = onClose;
        this.targetElement = targetElement;
        
        if (targetElement.classList.contains('file-item')) {
            const icon = targetElement.querySelector('.file-icon i');
            this.originalFileTextColor = targetElement.style.color;
            this.originalFileIconColor = (icon instanceof HTMLElement) ? icon.style.color : '';
            
        }
        this.summaryElement = targetElement.querySelector('.folder-summary');
        this.childrenContainer = targetElement.querySelector('.folder-children');
        this.originalDetailsClass = targetElement.classList.contains('has-folder-color');
        this.originalSummaryClass = this.summaryElement ? this.summaryElement.classList.contains('has-folder-color') : false;
        this.originalChildrenClass = this.childrenContainer ? this.childrenContainer.classList.contains('has-folder-color') : false;
        this.originalColor = targetElement.style.getPropertyValue('--folder-color') || '';

        if (currentColor) {
            const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match && match[1] && match[2] && match[3]) {
                const r = parseInt(match[1], 10);
                const g = parseInt(match[2], 10);
                const b = parseInt(match[3], 10);
                this.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                this.opacity = match[4] ? parseFloat(match[4]) : 1;
            } else {
                this.color = '#328cec';
                this.opacity = 1;
            }
        } else {
            this.color = '#328cec';
            this.opacity = 1;
        }
        this.paletteColors = [...plugin.settings.userPalette ?? DEFAULT_PORTALS_PALETTE];

        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        }
    }

    open(): void {
        if (this.container) {
            this.close();
        }
        // backdrop
        this.backdrop = activeDocument.body.createDiv('portals-cm-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        // container
        this.container = activeDocument.body.createDiv('portals-cm-modal');
        this.container.addClass('bulk-color-modal');
        this.container.addEventListener('click', (e) => e.stopPropagation());

        try {
            this.buildUI();
            activeDocument.addEventListener('keydown', this.keyHandler)
        } catch (e) {
            console.error('Error building color picker UI', e);
            this.close();
        }
    }

    private buildUI(): void {
        const { container } = this;
        container.createDiv({ text: 'Pick custom color', cls: 'cm-popup-title' });

        const inputRow = container.createDiv({ cls: 'cm-color-wrapper' });
        inputRow.createSpan({ text: 'Select color : ', cls: 'cm-wrapper-header' });
        
        // custom visible swatch to trigger hidden picker 
        const swatchWrapper = inputRow.createDiv('cm-color-swatch-wrapper');
        const customSwatch = swatchWrapper.createDiv('cm-color-swatch');
        customSwatch.style.backgroundColor = this.color;

        // hidden input
        const hiddenColorInput = swatchWrapper.createEl('input', { 
            type: 'color',
            cls: 'portals-hidden-picker',
            value: this.color 
        }) as HTMLInputElement;

        // hex input
        const hexInput = inputRow.createEl('input', {
            type: 'text',
            cls: 'cm-color-input',
            value: this.color
        }) as HTMLInputElement;
        hexInput.setAttr('maxlength', '7');
        hexInput.setAttr('placeholder', '#000000');

        // palette section
        const paletteRow = container.createDiv('cm-palette-section'); 
        paletteRow.createSpan({ text: 'Color palette', cls: 'cm-wrapper-header' });
        this.palettes = paletteRow.createDiv('cm-palette-container');
        paletteRow.createSpan({
            text: 'Click to apply, double-click to edit, right-click to reset.',
            cls: 'cm-palette-subtext',
        });
        

        // opacity section
        const opacityRow = container.createDiv({ cls: 'cm-input-wrapper' });
        opacityRow.createSpan({ text: 'Set opacity', cls: 'cm-wrapper-header' });
        const opacityInput = opacityRow.createEl('input', {
            cls: 'cm-opacity-slider',
            type: 'range',
            attr: { min: '0', max: '1', step: '0.05', value: String(this.opacity) }
        }) as HTMLInputElement;
       
        // preview
        const previewRow = container.createDiv({ cls: 'cm-input-wrapper' });
        previewRow.createSpan({ text: 'review', cls: 'cm-wrapper-header' });
        const preview = previewRow.createDiv('portals-preview-box');
        const initialColor = `rgba(${this.hexToRgb(this.color).join(',')},${this.opacity})`;
        preview.style.backgroundColor = initialColor;

        // ------------------- UPDATE FUNCTION ----------------

        const updatePreview = () => {
            const hex = hiddenColorInput.value;
            const rgb = this.hexToRgb(hex);
            const newOpacity = parseFloat(opacityInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${newOpacity})`;
            preview.style.backgroundColor = newColor;
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = newColor
                const icon = this.targetElement.querySelector('.file-icon i');
                if (icon instanceof HTMLElement) {
                    icon.style.color = newColor;
                }
            } else {
                // Add class to all elements that need it
                this.targetElement.classList.add('has-folder-color');
                this.targetElement.style.setProperty('--folder-color', newColor);
                if (this.summaryElement) {
                    this.summaryElement.classList.add('has-folder-color');
                    this.summaryElement.style.setProperty('--folder-color', newColor);
                    void this.summaryElement.offsetHeight;
                }
                if (this.childrenContainer) {
                    this.childrenContainer.classList.add('has-folder-color');
                    
                    void this.childrenContainer.offsetHeight;
                }
                // Force reflow
                void this.targetElement.offsetHeight;
            };
        }
    
        // ------------ WIRING ---------------------
        customSwatch.addEventListener('click', () => hiddenColorInput.click());

        hiddenColorInput.addEventListener('input', () => {
            const hex = hiddenColorInput.value;
            customSwatch.style.background = hex;
            hexInput.value = hex;
            updatePreview();
        });
        hexInput.addEventListener('input', () => {
            const hex = hexInput.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                hiddenColorInput.value = hex;
                customSwatch.style.backgroundColor = hex;
                updatePreview();
            }
        });
        opacityInput.addEventListener('input', updatePreview);
        this.renderPalette(hiddenColorInput, customSwatch, hexInput, opacityInput);

        // --------BUTTONS --------------------------------------
        const buttonDiv = container.createDiv({ cls: 'modal-button-container' }); // same in fm-modal
        const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
        saveBtn.onclick = () => {
            const rgb = this.hexToRgb(hiddenColorInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityInput.value})`;
            this.onSave(newColor);
            this.close();
        };
        const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => {
            if (this.targetElement.classList.contains('file-item')) {
                this.targetElement.style.color = this.originalFileTextColor;
                const icon = this.targetElement.querySelector('.file-icon i');
                if (icon instanceof HTMLElement) {
                    icon.style.color = this.originalFileIconColor;
                }
            } else {
                // Restore original class states
                if (!this.originalDetailsClass) this.targetElement.classList.remove('has-folder-color');
                else this.targetElement.classList.add('has-folder-color');
                if (this.summaryElement) {
                    if (!this.originalSummaryClass) this.summaryElement.classList.remove('has-folder-color');
                    else this.summaryElement.classList.add('has-folder-color');
                    // Remove any inline variable set during preview
                    this.summaryElement.style.removeProperty('--folder-color');
                }
                if (this.childrenContainer) {
                    if (!this.originalChildrenClass) this.childrenContainer.classList.remove('has-folder-color');
                    else this.childrenContainer.classList.add('has-folder-color');
                    this.childrenContainer.style.removeProperty('--folder-color');
                }
                // Restore the original variable on the details
                this.targetElement.style.setProperty('--folder-color', this.originalColor);
            }
            this.close();
        };
        updatePreview();
    }

    private hexToRgb(hex: string): [number, number, number] {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
    }

    private renderPalette(hiddenColorInput: HTMLInputElement, customSwatch: HTMLDivElement, hexInput: HTMLInputElement, opacityInput: HTMLInputElement) {
        this.palettes.empty();
    
        for (let i = 0; i < this.paletteColors.length; i++) {
            const wrapper = this.palettes.createDiv('cm-palette-swatch-wrapper');
            const swatch = wrapper.createDiv('cm-palette-swatch');
            swatch.style.backgroundColor = this.paletteColors[i]!;

            const palettePicker = wrapper.createEl('input', {
                type: 'color',
                cls: 'cm-palette-hidden-picker',
                value: this.paletteColors[i]!
            }) as HTMLInputElement;

            swatch.addEventListener('click', () => {
                const hex = this.paletteColors[i]!;
                hiddenColorInput.value = hex;
                customSwatch.style.backgroundColor = hex;
                hiddenColorInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
            swatch.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.paletteColors[i] = DEFAULT_PORTALS_PALETTE[i]!;
                this.renderPalette(hiddenColorInput, customSwatch, hexInput, opacityInput);
                this.savePalette();
            });
            swatch.addEventListener('dblclick', () => {
                palettePicker.style.pointerEvents = 'auto';
                palettePicker.click();
                palettePicker.style.pointerEvents = 'none';
            });
            palettePicker.addEventListener('change', () => {
                this.paletteColors[i] = palettePicker.value;
                swatch.style.backgroundColor = palettePicker.value;
                this.savePalette();
            });
        }
    }

    private async savePalette() {
        this.plugin.settings.userPalette = [...this.paletteColors];
        await this.plugin.saveSettings();
    }

    close(): void { 
        this.savePalette();
        if (this.targetElement.classList.contains('file-item')) {
            this.targetElement.style.color = this.originalFileTextColor;
            const icon = this.targetElement.querySelector('.file-icon i');
            if (icon instanceof HTMLElement) {
                icon.style.color = this.originalFileIconColor;
            }
        } else {
            if (!this.originalDetailsClass) this.targetElement.classList.remove('has-folder-color');
            else this.targetElement.classList.add('has-folder-color');
            if (this.summaryElement) {
                if (!this.originalSummaryClass) this.summaryElement.classList.remove('has-folder-color');
                else this.summaryElement.classList.add('has-folder-color');
                this.summaryElement.style.removeProperty('--folder-color');
                }
            if (this.childrenContainer) {
                if (!this.originalChildrenClass) this.childrenContainer.classList.remove('has-folder-color');
                else this.childrenContainer.classList.add('has-folder-color');
                this.childrenContainer.style.removeProperty('--folder-color');
            }
            this.targetElement.style.setProperty('--folder-color', this.originalColor);
        }
        this.container?.remove();
        this.backdrop?.remove();
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.onClose?.();
    }
}