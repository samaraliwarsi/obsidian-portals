import { App, DropdownComponent } from "obsidian";
import PortalsPlugin from "../main";
import { SpaceConfig } from "../types";
import { PortalsModal } from "./portalsModal";

export class SetQuickTabNumberModal extends PortalsModal {
    private plugin: PortalsPlugin;
    private space: SpaceConfig;

    constructor(app: App, plugin: PortalsPlugin, space: SpaceConfig, private onSave: () => void, private onClose?: () => void) {
        super(app, {
            containerClass: 'portals-qtn-modal portals-modal',
            backdropClass: 'portals-qtn-backdrop',
        });
        this.plugin = plugin;
        this.space = space;
    }

    protected buildContent(): void {
        this.buildUI();
    }

    protected beforeClose(): void {
        this.onClose?.();
    }

    buildUI(): void {
        const container = this.container;

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
            void this.plugin.saveSettings().then(() => this.onSave());
            this.close();
        };
    }
}
