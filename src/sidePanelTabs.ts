// src/sidePanelTabs.ts
import Sortable from 'sortablejs';
import type PortalsPlugin from './main';
import type { PortalsView } from './view';
import { Platform } from 'obsidian';
import { renderSidePanelContent } from './renderers/sidePanelContent';

/** Icons used for side‑portal tabs (same as in the main view) */
const SIDE_TAB_ICONS: Record<string, string> = {
    recent: 'clock-counter-clockwise',
    'context-notes': 'note',
    bookmarks: 'bookmark',
    journal: 'calendar-heart',
    hidden: 'eye-slash',
    properties: 'list-dashes',
    trash: 'trash',
};

/** Map of container → Sortable instance (so callers can destroy them later) */
export const sideTabSortables = new WeakMap<HTMLElement, Sortable>();

export function renderSidePanel(
    container: HTMLElement,
    plugin: PortalsPlugin,
    view: PortalsView,
    tabs: string[],
    activeTabId: string,
    onTabsUpdate: (newTabs: string[], newActive: string) => void
): void {
    const app = plugin.app;
    container.empty();

    // Clean up any existing Sortable for this container
    const oldSortable = sideTabSortables.get(container);
    if (oldSortable) {
        oldSortable.destroy();
        sideTabSortables.delete(container);
    }

    if (!tabs.length) {
        container.createEl('p', {
            text: 'No tabs configured. Use the “Choose side portals” command to add tabs.',
        });
        return;
    }

    // Header area with tabs
    const secondaryHeader = container.createDiv({ cls: 'portals-secondary-header' });
    secondaryHeader.toggleClass('portals-compact-tabs', plugin.settings.compactTabs);

    const tabContainer = secondaryHeader.createDiv({ cls: 'portals-split-tabs' });
    tabContainer.toggleClass('portals-compact-tabs', plugin.settings.compactTabs);

    // Root accent color (for active tab underline)
    let rootColor: string | undefined;
    if (plugin.settings.pinVaultRoot && plugin.settings.tabColorEnabled) {
        const rootSpace = plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
        if (rootSpace?.color && rootSpace.color !== 'transparent') {
            rootColor = rootSpace.color;
        }
    }

    // Build each tab button
    tabs.forEach(tabId => {
        const tabBtn = tabContainer.createDiv({ cls: 'portals-split-tab' });
        tabBtn.dataset.tabId = tabId;

        const iconSpan = tabBtn.createSpan({ cls: 'portals-tab-icon' });
        iconSpan.createEl('i', { cls: `ph ph-${SIDE_TAB_ICONS[tabId] || 'file'}` });

        const span = tabBtn.createSpan({ cls: 'tab-label' });
        span.textContent = tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-', ' ');
        span.addClass('hide');

        const isActive = tabId === activeTabId;
        if (isActive) {
            tabBtn.addClass('is-active');
            if (rootColor) {
                tabBtn.style.setProperty('--split-tab-active-color', rootColor);
            }
        }

        // Tab name visibility according to setting
        if (
            plugin.settings.tabNameDisplay === 'all' ||
            (plugin.settings.tabNameDisplay === 'activeOnly' && isActive)
        ) {
            span.removeClass('hide');
        }

        // Tooltip when name is hidden
        if (!Platform.isMobile) {
            const displayName =
                tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-', ' ');
            if (span.hasClass('hide')) {
                tabBtn.addEventListener('mouseenter', () => {
                    view.showTooltip(displayName, tabBtn, 300, 'right');
                });
                tabBtn.addEventListener('mouseleave', () => {
                    view.hideTooltip(100);
                });
            }
        }

        // Click handler – switch active tab
        tabBtn.addEventListener('click', () => {
            if (activeTabId !== tabId) {
                onTabsUpdate(tabs, tabId);
            }
        });
    });

    // Scroll the active tab into view
    const activeSplitTab = tabContainer.querySelector('.portals-split-tab.is-active');
    if (activeSplitTab) {
        window.setTimeout(() => {
            activeSplitTab.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }, 0);
    }

    // Make tabs reorderable via Sortable
    const sideTabSortable = new Sortable(tabContainer, {
        animation: 150,
        delay: 400,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        scrollSensitivity: 30,
        direction: 'horizontal',
        draggable: '.portals-split-tab',
        swapThreshold: 0.5,
        invertSwap: true,
        fallbackClass: 'portals-sortable-fallback',
        onEnd: () => {
            const newOrder: string[] = [];
            tabContainer.querySelectorAll('.portals-split-tab').forEach(el => {
                const id = (el as HTMLElement).dataset.tabId;
                if (id) newOrder.push(id);
            });
            if (JSON.stringify(newOrder) !== JSON.stringify(tabs)) {
                onTabsUpdate(newOrder, activeTabId);   // keep same active tab
            }
        },
    });

    // Store for later cleanup
    sideTabSortables.set(container, sideTabSortable);

    // Content area
    const contentArea = container.createDiv({ cls: 'portals-split-content' });

    // Apply root border color if using 'portals' tree style
    if (plugin.settings.treeStyle === 'portals' && rootColor) {
        contentArea.style.setProperty('--space-border-color', rootColor);
    } else {
        contentArea.style.removeProperty('--space-border-color');
    }

    // Render the content for the active tab (delegate to the main view)
    void renderSidePanelContent(app, plugin, contentArea, activeTabId, view);
}