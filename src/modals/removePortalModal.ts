import { App } from "obsidian";
import PortalsPlugin from "../main";
import { SpaceConfig } from "../types";

export class RemovePortalModal {
    private app: App;
    private plugin: PortalsPlugin;
    private onRemove: (space: SpaceConfig) => void;
    private backdrop!: HTMLElement;
    private container!: HTMLElement;
    private keyHandler: (e: KeyboardEvent) => void;

    constructor(app: App, plugin: PortalsPlugin, onRemove: (space: SpaceConfig) => void) {
        this.app = app;
        this.plugin = plugin;
        this.onRemove = onRemove;
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") this.close();
        };
    }

    open(): void {
        if (this.container) {
            this.close();
        }

        this.backdrop = activeDocument.body.createDiv("portals-remP-backdrop");
        this.backdrop.addEventListener("click", () => this.close());

        this.container = activeDocument.body.createDiv("portals-remP-container");
        this.container.addClass("portals-remP-modal");
        this.container.addEventListener("click", (e) => e.stopPropagation());

        try {
            this.renderList();
            activeDocument.addEventListener("keydown", this.keyHandler);
        } catch (e) {
            console.error("Error building remove modal UI", e);
            this.close();
        }
    }

    private renderList(): void {
        if (!this.container) return;
        this.container.empty();
        this.container.createDiv({ text: 'Remove portal tab', cls: 'portals-remP-title'});

        const spaces = this.plugin.settings.spaces;
        if (spaces.length === 0) {
            this.container.createEl("p", { text: "No portals to remove." });
            return;
        }

        for (const space of spaces) {
            let displayName: string;
            if (space.type === "folder") {
                if (space.path === "/") {
                    displayName = this.app.vault.getName();
                } else {
                    displayName = space.path;
                }
            } else {
                displayName = "#" + space.path;
            }

            const row = this.container.createDiv({cls: "remove-portal-row",});
            row.createSpan({
                text: displayName,
                cls: "remove-portal-name",
            });

            const removeBtn = row.createEl("button", {
                text: "Remove",
                cls: "mod-warning",
            });
            removeBtn.addEventListener("click", () => {
                this.onRemove(space);
                this.renderList();
            });
        }
    }

    close(): void {
        this.container?.remove();
        this.backdrop?.remove();
        activeDocument.removeEventListener("keydown", this.keyHandler);
    }
}