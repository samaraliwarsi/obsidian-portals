import Sortable from 'sortablejs';
import { Platform } from 'obsidian';
import type PortalsPlugin from '../main';

export const SIDE_TAB_ICONS: Record<string, string> = {
    recent: 'clock-counter-clockwise',
    'context-notes': 'note',
    bookmarks: 'bookmark',
    journal: 'calendar-heart',
    hidden: 'eye-slash',
    properties: 'list-dashes',
    trash: 'trash',
    reminders: 'bell',
};

export function sideTabLabel(tabId: string): string {
    return tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-', ' ');
}

export interface SideTabLook {
    activeTabId: string;
    rootColor: string | null;
    nameDisplay: 'none' | 'activeOnly' | 'all';
    iconPosition: 'left' | 'right';
}

export interface SideTabOptions extends SideTabLook {
    tabs: string[];
    compact: boolean;
    showTooltip: (text: string, el: HTMLElement, delay: number) => void;
    hideTooltip: (delay: number) => void;
    onSelect: (tabId: string) => void;
    onReorder: (tabs: string[]) => void;
}

// Everything a side tab looks like, in one place. Both panels call this, so a
// tab-related setting cannot apply to one side and not the other.
function applyTabLook(tab: HTMLElement, look: SideTabLook): void {
    const isActive = tab.dataset.tabId === look.activeTabId;
    tab.toggleClass('is-active', isActive);
    tab.setCssProps({ '--split-tab-active-color': isActive && look.rootColor ? look.rootColor : '' });

    if (look.nameDisplay !== 'none') {
        if (look.iconPosition === 'left') tab.setAttribute('tab-icon-position', 'left');
        else tab.removeAttribute('tab-icon-position');
    }

    const label = tab.querySelector('span.tab-label');
    if (label instanceof HTMLElement) {
        const show = look.nameDisplay === 'all' || (look.nameDisplay === 'activeOnly' && isActive);
        label.toggleClass('hide', !show);
    }
}

export function updateSideTabs(container: HTMLElement, look: SideTabLook): void {
    container.querySelectorAll<HTMLElement>('.portals-split-tab').forEach(tab => applyTabLook(tab, look));
}

export function renderSideTabs(container: HTMLElement, plugin: PortalsPlugin, options: SideTabOptions): Sortable | null {
    container.empty();
    container.toggleClass('portals-compact-tabs', options.compact);

    for (const tabId of options.tabs) {
        const tabBtn = container.createDiv({ cls: 'portals-split-tab' });
        tabBtn.dataset.tabId = tabId;

        const label = tabBtn.createSpan({ cls: 'tab-label' });
        label.textContent = sideTabLabel(tabId);

        const iconSpan = tabBtn.createSpan({ cls: 'portals-tab-icon' });
        plugin.renderPluginIcon(iconSpan, SIDE_TAB_ICONS[tabId] ?? 'file');

        applyTabLook(tabBtn, options);

        if (!Platform.isMobile) {
            tabBtn.addEventListener('mouseenter', () => {
                const span = tabBtn.querySelector('span.tab-label');
                if (span instanceof HTMLElement && span.hasClass('hide')) {
                    options.showTooltip(sideTabLabel(tabId), tabBtn, 300);
                }
            });
            tabBtn.addEventListener('mouseleave', () => options.hideTooltip(100));
        }

        tabBtn.addEventListener('click', () => options.onSelect(tabId));
    }

    const active = container.querySelector<HTMLElement>('.portals-split-tab.is-active');
    if (active) {
        window.setTimeout(() => active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' }), 0);
    }

    if (options.tabs.length <= 1) return null;
    return new Sortable(container, {
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
            const order: string[] = [];
            container.querySelectorAll<HTMLElement>('.portals-split-tab').forEach(el => {
                if (el.dataset.tabId) order.push(el.dataset.tabId);
            });
            options.onReorder(order);
        },
    });
}
