import { ItemView, WorkspaceLeaf } from 'obsidian';
import PortalsPlugin from '../main';
import { renderSidePanel } from '../sidePanelTabs';
import { PortalsView, VIEW_TYPE_PORTALS } from '../view';
import { destroySidePanelRenderer, getContextRenderer, renderSidePanelContent } from './sidePanelContent';


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

        // Listen for the main view to appear (fixes the startup race)
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            if (!this.mainView) {
                const newMainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0]; // <-- Fixed this line
                if (newMainLeaf?.view instanceof PortalsView) {
                    this.refresh();
                }
            }
        }));

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
            const reordered = JSON.stringify(newTabs) !== JSON.stringify(this.plugin.settings.alternateSideTabs);
            this.plugin.settings.alternateSideTabs = newTabs;
            this.plugin.settings.alternateActiveTab = newActive;
            this.activeTabId = newActive;
            // saveData, not saveSettings: switching a side tab must not trigger a
            // full rebuild of the main explorer behind it.
            void this.plugin.saveData(this.plugin.settings).then(() => {
                if (reordered) {
                    this.refresh();
                    return;
                }
                // A switch only changes one class and the content pane.
                this.applyActiveTab(newActive);
                void this.refreshContent();
            });
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

    // In-place active state, so switching tabs does not rebuild the strip.
    private applyActiveTab(activeTabId: string): void {
        const displayMode = this.plugin.settings.tabNameDisplay;
        this.contentEl.querySelectorAll<HTMLElement>('.portals-split-tab').forEach(tab => {
            const isActive = tab.dataset.tabId === activeTabId;
            tab.toggleClass('is-active', isActive);
            const label = tab.querySelector('span.tab-label');
            if (label) {
                const show = displayMode === 'all' || (displayMode === 'activeOnly' && isActive);
                label.toggleClass('hide', !show);
            }
        });
    }

    async onClose() {
        destroySidePanelRenderer(this);
        this.contentEl.empty();
    }
}