import { App } from "obsidian";
import PortalsPlugin from "../main";
import { SpaceConfig } from "../types";
import { PortalsModal } from "./portalsModal";

export class RemovePortalModal extends PortalsModal {
    private plugin: PortalsPlugin;
    private onRemove: (space: SpaceConfig) => void;

    constructor(app: App, plugin: PortalsPlugin, onRemove: (space: SpaceConfig) => void) {
        super(app, {
            containerClass: "portals-remP-container portals-remP-modal",
            backdropClass: "portals-remP-backdrop",
        });
        this.plugin = plugin;
        this.onRemove = onRemove;
    }

    protected buildContent(): void {
        this.renderList();
    }

    private renderList(): void {
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

            const row = this.container.createDiv({ cls: "remove-portal-row" });
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
}
