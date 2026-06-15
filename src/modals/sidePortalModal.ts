import { App, Notice } from "obsidian";
import PortalsPlugin from "../main";

export class SidePortalModal {
    private plugin: PortalsPlugin;
    private onSave: (left: string[], right: string[]) => void;
    private selectedLeft: Set<string>;
    private selectedRight: Set<string>;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    private keyHandler: (e: KeyboardEvent) => void;

    constructor(app: App, plugin: PortalsPlugin, onSave: (left: string[], right: string[]) => void) {
        this.plugin = plugin;
        this.onSave = onSave;
        this.selectedLeft = new Set(plugin.settings.splitViewTabs);
        this.selectedRight = new Set(plugin.settings.alternateSideTabs);

        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") this.close();
        };
    }

    open(): void {
        if (this.container) this.close();

        this.backdrop = activeDocument.body.createDiv("portals-sp-backdrop");
        this.backdrop.addEventListener("click", () => this.close());

        this.container = activeDocument.body.createDiv("portals-sp-container");
        this.container.addClass("portals-modal");
        this.container.addEventListener("click", (e) => e.stopPropagation());

        try {
            this.buildUI();
            activeDocument.addEventListener("keydown", this.keyHandler);
        } catch (e) {
            console.error("Error building side portals UI", e);
            this.close();
        }
    }

    private buildUI(): void {
        if (!this.container) return;
        this.container.empty();
        this.container.addClass("portals-sp-modal");

        this.container.createDiv({ text: 'Choose side portals', cls: 'portals-sp-title'});

        this.container.createEl("p", {
            text: "At least one tab must be selected for the existing left side panel. The alternate right panel is optional.",
            cls: "portals-sp-modal-subtext",
        });

        // Available tabs
        const availableTabs = [
            { id: "recent", name: "Recent Files", icon: "clock-counter-clockwise" },
            { id: "context-notes", name: "Context Notes", icon: "note" },
            { id: "bookmarks", name: "Bookmarks", icon: "bookmark" },
            { id: "journal", name: "Journal", icon: "calendar-heart" },
            { id: "hidden", name: "Hidden", icon: "eye-slash" },
            { id: "properties", name: "Properties", icon: "list-checks" },
            { id: "trash", name: "Trash", icon: "trash" },
        ];

        const checkboxContainer = this.container.createDiv({
            cls: "portals-sp-checkbox-container",
        });

        checkboxContainer.createSpan({ text: 'Tab', cls: 'portals-sp-tab-name' });
        checkboxContainer.createSpan({ text: 'Left', cls: 'portals-sp-left-tab-name' });
        checkboxContainer.createSpan({ text: 'Right', cls: 'portals-sp-right-tab-name' });

        for (const tab of availableTabs) {
            const checkboxRow = this.container.createDiv({
                cls: "portals-sp-checkbox-item",
            });

            checkboxRow.createSpan({ text: tab.name, cls: 'portals-sp-checkbox-label' });

            const leftCheck = checkboxRow.createEl("input", {
                type: "checkbox",
                cls: 'tab-left-check',
            });
            leftCheck.checked = this.selectedLeft.has(tab.id);
            leftCheck.addEventListener('change', () => {
                if (leftCheck.checked) {
                    // When checking left, uncheck right for this tab
                    this.selectedLeft.add(tab.id);
                    this.selectedRight.delete(tab.id);
                    rightCheck.checked = false;
                } else {
                    // Prevent uncheck if left panel would become empty
                    if (this.selectedLeft.size === 1 && this.selectedLeft.has(tab.id)) {
                        leftCheck.checked = true;
                        new Notice('Existing left side split panel must have at least one tab.');
                        return;
                    }
                    this.selectedLeft.delete(tab.id);
                }
            });

            
            const rightCheck = checkboxRow.createEl("input", {
                type: "checkbox",
                cls: 'tab-right-check',
            });
            rightCheck.checked = this.selectedRight.has(tab.id);
            rightCheck.addEventListener('change', () => {
                if (rightCheck.checked) {
                    // If this tab is the last one in the left panel, prevent moving it
                    if (this.selectedLeft.has(tab.id) && this.selectedLeft.size === 1) {
                        rightCheck.checked = false;
                        new Notice('The left side panel must have at least one tab. Cannot move the last tab to the right.');
                        return;
                    }
                    this.selectedRight.add(tab.id);
                    this.selectedLeft.delete(tab.id);
                    leftCheck.checked = false;
                } else {
                    this.selectedRight.delete(tab.id);
                }
            });
        }

        // Buttons
        const buttonDiv = this.container.createDiv({
            cls: "modal-button-container",
        });

        const cancelBtn = buttonDiv.createEl("button", { text: "Cancel" });
        cancelBtn.addEventListener("click", () => this.close());

        const saveBtn = buttonDiv.createEl("button", {
            text: "Save",
            cls: "mod-cta",
        });
        saveBtn.addEventListener("click", () => {
            if (this.selectedLeft.size === 0) {
                new Notice("Please select at least one tab.");
                return;
            }
            this.onSave(Array.from(this.selectedLeft), Array.from(this.selectedRight));
            this.close();
        });
    }

    close(): void {
        this.container?.remove();
        this.backdrop?.remove();
        activeDocument.removeEventListener("keydown", this.keyHandler);
    }
}