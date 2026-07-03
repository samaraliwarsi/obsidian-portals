import { ItemView, WorkspaceLeaf } from 'obsidian';
import PortalsPlugin from '../main';
import { renderSidePanel } from '../sidePanelTabs';
import { PortalsView, VIEW_TYPE_PORTALS } from '../view';
import { getContextRenderer, renderSidePanelContent } from './sidePanelContent';


export const VIEW_TYPE_ALT_SIDE_PANEL = 'portals-alt-side-panel';

export class AltSidePanelView extends ItemView {
    plugin: PortalsPlugin;
    public mainView: PortalsView | null = null;
    public activeTabId: string = '';
    private contentArea: HTMLElement | null = null;
    //private currentContextRenderer: ContextNotesRenderer | null = null;

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
        const mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
        this.mainView = mainLeaf?.view instanceof PortalsView ? mainLeaf.view : null;
        if (!this.mainView) {
            this.contentEl.empty();
            this.contentEl.createEl('p', { text: 'Open the main Portals view first.' });
            return;
        }
        if (this.activeTabId === 'context-notes') {
            const renderer = getContextRenderer(this.mainView);
            if (renderer) renderer.saveScroll();
        }
        const tabs = this.plugin.settings.alternateSideTabs;
        const active = this.plugin.settings.alternateActiveTab || tabs[0] || '';
        this.activeTabId = active;

        const onTabsUpdate = (newTabs: string[], newActive: string) => {
            this.plugin.settings.alternateSideTabs = newTabs;
            this.plugin.settings.alternateActiveTab = newActive;
            void this.plugin.saveSettings().then(() => this.refresh());
        };

        renderSidePanel(this.contentEl, this.plugin, this.mainView, tabs, active, onTabsUpdate);
        this.contentArea = this.contentEl.querySelector('.portals-split-content');
    }

    public async refreshContent() {
        const mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
        if (mainLeaf?.view instanceof PortalsView) {
            this.mainView = mainLeaf.view;
        }
        if (!this.mainView || !this.contentArea || !this.activeTabId) return;

        if (this.activeTabId !== 'context-notes') {
            const renderer = getContextRenderer(this.mainView);
            if (renderer) renderer.saveScroll();
        }
        await renderSidePanelContent(
            this.plugin.app,
            this.plugin,
            this.contentArea,
            this.activeTabId,
            this.mainView
        );     
    }

    async onClose() {
        this.contentEl.empty();
    }
}