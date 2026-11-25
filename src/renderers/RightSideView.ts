import { ItemView, WorkspaceLeaf } from 'obsidian';
import PortalsPlugin from '../main';
import Sortable from 'sortablejs';
import { renderSideTabs, updateSideTabs } from './sideTabs';
import { PortalsView, VIEW_TYPE_PORTALS } from '../view';
import { destroySidePanelRenderer, getContextRenderer, renderSidePanelContent } from './sidePanelContent';


export const VIEW_TYPE_ALT_SIDE_PANEL = 'portals-alt-side-panel';

export class AltSidePanelView extends ItemView {
    plugin: PortalsPlugin;
    public mainView: PortalsView | null = null;
    public activeTabId: string = '';
    private contentArea: HTMLElement | null = null;
    private stripSortable: Sortable | null = null;
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

        this.buildStrip(tabs, active);
    }

    // Header, tab strip and content pane, built once from the shared builder.
    private buildStrip(tabs: string[], active: string): void {
        this.stripSortable?.destroy();
        this.stripSortable = null;
        this.contentEl.empty();

        const header = this.contentEl.createDiv({ cls: 'portals-secondary-header' });
        header.toggleClass('portals-compact-tabs', this.plugin.settings.compactTabs);
        const tabContainer = header.createDiv({ cls: 'portals-split-tabs' });

        this.stripSortable = renderSideTabs(tabContainer, this.plugin, {
            tabs,
            activeTabId: active,
            rootColor: this.getRootAccentColor(),
            nameDisplay: this.plugin.settings.tabNameDisplay,
            iconPosition: this.plugin.settings.tabIconPosition,
            compact: this.plugin.settings.compactTabs,
            showTooltip: (text, el, delay) => this.mainView?.showTooltip(text, el, delay),
            hideTooltip: (delay) => this.mainView?.hideTooltip(delay),
            onSelect: (tabId) => this.switchTab(tabId),
            onReorder: (newOrder) => {
                this.plugin.settings.alternateSideTabs = newOrder;
                void this.plugin.saveData(this.plugin.settings);
            },
        });

        this.contentArea = this.contentEl.createDiv({ cls: 'portals-split-content' });
        this.applySpaceAccent();
        if (this.mainView) {
            void renderSidePanelContent(this.plugin.app, this.plugin, this.contentArea, active, this.mainView);
        }
    }

    // Mirrors the left panel: Portals style draws file/folder left borders from
    // --space-border-color, and without it the right panel fell back to the
    // accent colour even when tab colours were on.
    private applySpaceAccent(): void {
        if (!this.contentArea) return;
        const accent = this.plugin.settings.treeStyle === 'portals' ? this.getRootAccentColor() : null;
        this.contentArea.setCssProps({ '--space-border-color': accent ?? '' });
    }

    // Selecting a tab updates the strip in place; it never rebuilds the panel.
    private switchTab(tabId: string): void {
        if (tabId === this.activeTabId) return;
        this.activeTabId = tabId;
        this.plugin.settings.alternateActiveTab = tabId;
        void this.plugin.saveData(this.plugin.settings);
        this.applyActiveTab(tabId);
        void this.refreshContent();
    }

    public async refreshContent() {
        this.applySpaceAccent();
        const mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
        if (mainLeaf?.view instanceof PortalsView) {
            this.mainView = mainLeaf.view;
        }
        if (!this.mainView || !this.contentArea || !this.activeTabId) return;

        if (this.activeTabId !== 'context-notes') {
            const renderer = getContextRenderer(this.mainView);
            if (renderer) renderer.saveScroll();
        }
        // Settings-driven refreshes must also refresh the tab labels, which live
        // in the strip and are otherwise only updated on a rebuild.
        this.applyActiveTab(this.activeTabId);
        await renderSidePanelContent(
            this.plugin.app,
            this.plugin,
            this.contentArea,
            this.activeTabId,
            this.mainView
        );     
    }

    // In-place active state, so switching tabs does not rebuild the strip.
    // Mirrors what the strip builder applies, otherwise the accent colour would
    // only ever land on the tab that happened to be active at build time.
    private applyActiveTab(activeTabId: string): void {
        // Header-level look lives outside the tabs, so sync it on every refresh
        // rather than only when the strip is rebuilt.
        const compact = this.plugin.settings.compactTabs;
        const header = this.contentEl.querySelector<HTMLElement>('.portals-secondary-header');
        if (header) header.toggleClass('portals-compact-tabs', compact);

        const strip = this.contentEl.querySelector<HTMLElement>('.portals-split-tabs');
        if (!strip) return;
        strip.toggleClass('portals-compact-tabs', compact);
        // Delegated: the per-tab look must not be re-implemented here, or a
        // setting like icon position applies to one panel and not the other.
        updateSideTabs(strip, {
            activeTabId,
            rootColor: this.getRootAccentColor(),
            nameDisplay: this.plugin.settings.tabNameDisplay,
            iconPosition: this.plugin.settings.tabIconPosition,
        });
    }

    // The accent used by the side tabs: the pinned root portal's colour, when
    // tab colours are enabled.
    private getRootAccentColor(): string | null {
        if (!this.plugin.settings.pinVaultRoot || !this.plugin.settings.tabColorEnabled) return null;
        const rootSpace = this.plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
        if (!rootSpace?.color || rootSpace.color === 'transparent') return null;
        return rootSpace.color;
    }

    async onClose() {
        this.stripSortable?.destroy();
        this.stripSortable = null;
        destroySidePanelRenderer(this);
        this.contentEl.empty();
    }
}