import { App, DropdownComponent } from "obsidian";
import PortalsPlugin from "../main";
import { SpaceConfig } from "../types";



export class SetQuickTabNumberModal {
    private app: App;
    private plugin: PortalsPlugin;
    private space: SpaceConfig;
    private keyHandler: (e: KeyboardEvent) => void;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    
    constructor(app: App, plugin: PortalsPlugin, space: SpaceConfig, private onSave: () => void, private onClose?: () => void) {
        this.app = app;
        this.plugin = plugin;
        this.space = space;
        this.onSave = onSave;
        this.onClose = onClose;
        
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        }
    }

    open(): void {
        if (this.container) {
            this.close();
        }

        this.backdrop = activeDocument.body.createDiv('portals-qtn-backdrop');
        this.backdrop.addEventListener('click', () => this.close());

        this.container = activeDocument.body.createDiv('portals-qtn-modal');
        this.container.addEventListener('click', (e) => e.stopPropagation());
        this.container.addClass('portals-modal');

        try {
            this.buildUI();
            activeDocument.addEventListener('keydown', this.keyHandler)
        } catch (e) {
            console.error('Error building color picker UI', e);
            this.close();
        }
    }

    buildUI(): void {
        const { container } = this; 
        
        container.createDiv({ text: 'Quick switch tabs', cls: 'qtn-popup-title' });

        const dropdownRow = container.createDiv('qtn-input-wrapper');
        dropdownRow.createSpan({ 
            text: 'Assign a number for tab quick switch commands & hotkey access',
            cls: 'portals-qtn-modal-subtext'
        });

        const dropdown = new DropdownComponent(dropdownRow);
        dropdown.addOption('none', 'None');
        for (let i = 1; i <= 10; i++) {
            dropdown.addOption(`${i}`, `${i}`);
        }
        dropdown.setValue(this.space.quickTabNumber?.toString() || 'none');
        dropdown.selectEl.addClass('portals-reset-dropdown');
        dropdown.selectEl.addClass('portals-qtn-dropdown');

        const buttonDiv = container.createDiv({ cls: 'modal-button-container' });
        buttonDiv.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
        buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' }).onclick = () => {
            const val = dropdown.getValue();
            const newNumber = val === 'none' ? undefined : parseInt(val, 10);

            // Clear the number from any other portal that might have it
            if (newNumber !== undefined) {
                for (const s of this.plugin.settings.spaces) {
                    if (s !== this.space && s.quickTabNumber === newNumber) {
                        s.quickTabNumber = undefined;
                    }
                }
            }

            this.space.quickTabNumber = newNumber;
            this.plugin.saveSettings().then(() => this.onSave());
            this.close();
        };
    }

    close(): void {
        this.container.remove();
        this.backdrop.remove();
        activeDocument.removeEventListener('keydown', this.keyHandler);
        this.onClose?.();
    }
}