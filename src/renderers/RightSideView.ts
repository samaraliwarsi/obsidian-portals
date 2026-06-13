// src/RightSidePanelView.ts
import { ItemView, WorkspaceLeaf } from 'obsidian';
import PortalsPlugin from '../main';
import { renderSidePanel } from '../sidePanelTabs';
import { PortalsView, VIEW_TYPE_PORTALS } from '../view';

export const VIEW_TYPE_ALT_SIDE_PANEL = 'portals-alt-side-panel';

export class AltSidePanelView extends ItemView {
    plugin: PortalsPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: PortalsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_ALT_SIDE_PANEL;
    }

    getDisplayText(): string {
        return 'Portals Side Panel';
    }

    getIcon(): string {
        return 'layout-sidebar-right';
    }

    async onOpen(): Promise<void> {
        const mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
        const mainView = mainLeaf?.view instanceof PortalsView ? mainLeaf.view : null;

        const tabs = this.plugin.settings.alternateSideTabs;
        const active = this.plugin.settings.alternateActiveTab || tabs[0] || '';

        const onTabsUpdate = (newTabs: string[], newActive: string) => {
            this.plugin.settings.alternateSideTabs = newTabs;
            this.plugin.settings.alternateActiveTab = newActive;
            void this.plugin.saveSettings().then(() => {
                // Re‑render this panel's content
                renderSidePanel(
                    this.contentEl,
                    this.plugin,
                    mainView!,
                    newTabs,
                    newActive,
                    onTabsUpdate
                );
            });
        };

        renderSidePanel(
            this.contentEl,
            this.plugin,
            mainView!,
            tabs,
            active,
            onTabsUpdate
        );
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }
}