import { ItemView, WorkspaceLeaf } from 'obsidian';
import PortalsPlugin from '../main';
import { renderSidePanel } from '../sidePanelTabs';
import { PortalsView, VIEW_TYPE_PORTALS } from '../view';

export const VIEW_TYPE_ALT_SIDE_PANEL = 'portals-alt-side-panel';

export class AltSidePanelView extends ItemView {
    plugin: PortalsPlugin;
    private mainView: PortalsView | null = null;

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
        return 'folder-tree';
    }

    async onOpen(): Promise<void> {
        const mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
        this.mainView = mainLeaf?.view instanceof PortalsView ? mainLeaf.view : null;

        if (!this.mainView) {
            this.contentEl.createEl('p', {
                text: 'Open the main Portals view first.',
            });
            return;
        }

        this.refresh();
    }

    /** Re‑render the tab bar and content from current settings */
    public refresh() {
        if (!this.mainView) return;
        const tabs = this.plugin.settings.alternateSideTabs;
        const active = this.plugin.settings.alternateActiveTab || tabs[0] || '';

        const onTabsUpdate = (newTabs: string[], newActive: string) => {
            this.plugin.settings.alternateSideTabs = newTabs;
            this.plugin.settings.alternateActiveTab = newActive;
            void this.plugin.saveSettings().then(() => this.refresh());
        };

        renderSidePanel(this.contentEl, this.plugin, this.mainView, tabs, active, onTabsUpdate);
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }
}