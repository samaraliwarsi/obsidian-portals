import { App, Modal } from "obsidian";
import PortalsPlugin from "../main";

export const DEFAULT_PORTALS_PALETTE: string[] = [
  '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
  '#1e88e5', '#039be5', '#00acc1', '#00897b', '#43a047',
];

export class ColorPickerModal extends Modal {
    private plugin: PortalsPlugin;
    private color: string;
    private opacity: number;
    private onSave: (color: string) => void;
    private targetElement: HTMLElement;
    private summaryElement: HTMLElement | null;
    private childrenContainer: HTMLElement | null;
    private originalDetailsClass: boolean;
    private originalChildrenClass: boolean;
    private originalSummaryClass: boolean;
    private originalColor: string;
    private originalFileTextColor: string = '';
    private originalFileIconColor: string = '';
    private paletteContainer!: HTMLDivElement;
    private paletteSlots: HTMLDivElement[] = [];
    private paletteColors: string[] = [];
    private readonly defaultPalette: string[] = [...DEFAULT_PORTALS_PALETTE];
    private readonly paletteSlotCount: number = DEFAULT_PORTALS_PALETTE.length;
    

    constructor(app: App, plugin: PortalsPlugin, onSave: (color: string) => void, targetElement: HTMLElement, currentColor?: string) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
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
    }

    onOpen() {
        const { contentEl } = this;
        this.contentEl.addClass('portals-modal');
        this.contentEl.addClass('portals-color-modal');
        contentEl.createEl('h3', { text: 'Pick folder color' });

        const inputContainer = contentEl.createDiv({ cls: 'portals-input-container' });
        const colorInput = inputContainer.createEl('input', { type: 'color', value: this.color }) as HTMLInputElement;
        const opacityInput = inputContainer.createEl('input', {
            type: 'range',
            attr: { min: '0', max: '1', step: '0.05', value: String(this.opacity) }
        }) as HTMLInputElement;
        opacityInput.classList.add('portals-opacity-input-full');

        const paletteSection = contentEl.createDiv('portals-palette-section');
        this.paletteContainer = paletteSection.createDiv('portals-palette-container');
        this.renderPalette(colorInput, opacityInput);

        const previewContainer = contentEl.createDiv({ cls: 'portals-preview-container' });
        const preview = previewContainer.createDiv();
        preview.style.backgroundColor = `rgba(255, 0, 0, ${this.opacity})`;

        const updatePreview = () => {
            const rgb = this.hexToRgb(colorInput.value);
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

        colorInput.addEventListener('input', updatePreview);
        opacityInput.addEventListener('input', updatePreview);

        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
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
        const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
        saveBtn.onclick = () => {
            const rgb = this.hexToRgb(colorInput.value);
            const newColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityInput.value})`;
            this.onSave(newColor);
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

    private renderPalette(colorInput: HTMLInputElement, opacityInput: HTMLInputElement) {
        this.paletteContainer.empty();
    
        for (let i = 0; i < this.paletteColors.length; i++) {
            const swatch = this.paletteContainer.createDiv('portals-palette-swatch');
            swatch.style.backgroundColor = this.paletteColors[i]!;
            swatch.addEventListener('click', () => {
                colorInput.value = this.paletteColors[i]!;
                colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
            swatch.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.paletteColors[i] = DEFAULT_PORTALS_PALETTE[i]!;
                this.renderPalette(colorInput, opacityInput);
                this.savePalette();
            });
            swatch.addEventListener('dblclick', () => {
                this.editPaletteSlot(i, colorInput, opacityInput);
            });
        }
    }

    private editPaletteSlot(index: number, colorInput: HTMLInputElement, opacityInput: HTMLInputElement) {
        const current = this.paletteColors[index] ?? '#000000';
        const picker = document.createElement('input') as HTMLInputElement;
        picker.type = 'color';
        picker.value = current;
        picker.addClass('portals-hidden-picker')
        picker.setCssProps({
            position: 'absolute',
            opacity: '0',
            pointerevents: 'none'
        });
        document.body.appendChild(picker);

        picker.addEventListener('change', () => {
            this.paletteColors[index] = picker.value;
            this.renderPalette(colorInput, opacityInput);
            this.savePalette();
            document.body.removeChild(picker);
        });
        picker.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.body.contains(picker)) {
                    document.body.removeChild(picker);
                }
            }, 100);
        });
        picker.click();
    }

    private async savePalette() {
        this.plugin.settings.userPalette = [...this.paletteColors];
        await this.plugin.saveSettings();
    }

    onClose() { 
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
        this.contentEl.empty();
    }
}