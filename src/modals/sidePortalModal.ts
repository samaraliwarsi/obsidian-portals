import { App, Notice } from "obsidian";
import PortalsPlugin from "../main";

export class SidePortalModal {
    private plugin: PortalsPlugin;
    private onSave: (tabs: string[]) => void;
    private selectedTabs: Set<string>;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    private keyHandler: (e: KeyboardEvent) => void;

    constructor(app: App, plugin: PortalsPlugin, onSave: (tabs: string[]) => void) {
        this.plugin = plugin;
        this.onSave = onSave;
        this.selectedTabs = new Set(plugin.settings.splitViewTabs);

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
            text: "At least one must be selected to enable side portal.",
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

        for (const tab of availableTabs) {
            const checkboxDiv = checkboxContainer.createDiv({
                cls: "portals-sp-checkbox-item",
            });

            const checkbox = checkboxDiv.createEl("input", {
                type: "checkbox",
                value: tab.id,
                attr: { id: `tab-${tab.id}` },
            });
            checkbox.checked = this.selectedTabs.has(tab.id);

            checkboxDiv.createEl("label", {
                text: ` ${tab.name}`,
                cls: "portals-sp-checkbox-label",
                attr: { for: `tab-${tab.id}` },
            });

            checkbox.addEventListener("change", (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    this.selectedTabs.add(tab.id);
                } else {
                    this.selectedTabs.delete(tab.id);
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
            const selected = Array.from(this.selectedTabs);
            if (selected.length === 0) {
                new Notice("Please select at least one tab.");
                return;
            }
            this.onSave(selected);
            this.close();
        });
    }

    close(): void {
        this.container?.remove();
        this.backdrop?.remove();
        activeDocument.removeEventListener("keydown", this.keyHandler);
    }
}