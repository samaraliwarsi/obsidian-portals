import { App } from 'obsidian';
import PortalsPlugin from '../main';
import { PortalsView } from '../view';
import { FrontmatterClinicRenderer } from '../renderers/frontmatterClinic';
import { RecentFilesRenderer } from '../renderers/recentFiles';
import { HiddenItemsRenderer } from '../renderers/hiddenItems';
import { BookmarksRenderer } from '../renderers/bookmarksRenderer';
import { JournalRenderer } from '../renderers/journalView';
import { ContextNotesRenderer } from '../renderers/contextNotes';
import { TrashRenderer } from '../renderers/trashRenderer';
import { AltSidePanelView } from './RightSideView';
import { RemindersRenderer } from './remindersRenderer';
import { beginRender, endRender } from '../pipeline/instrument';

// Every side panel implements this. destroy() must release anything that would
// outlive the DOM: timers, intervals, listeners.
export interface PanelRenderer {
    render(): void | Promise<void>;
    destroy(): void;
    saveScroll?(): void;
}

interface PanelEnv {
    app: App;
    plugin: PortalsPlugin;
    view: PortalsView;
    contentEl: HTMLElement;
}

// A panel that holds no state and no timers only needs the container emptied,
// which the dispatcher already does.
const stateless = (render: () => void | Promise<void>): PanelRenderer => ({
    render,
    destroy: () => { /* nothing to release */ },
});

const journalRenderers = new WeakMap<PortalsView | AltSidePanelView, JournalRenderer>();
const contextRenderers = new WeakMap<PortalsView | AltSidePanelView, ContextNotesRenderer>();
const activeSidePanelRenderers = new WeakMap<HTMLElement, PanelRenderer>();

export function getContextRenderer(view: PortalsView): ContextNotesRenderer | undefined {
    return contextRenderers.get(view);
}

export function getJournalRenderer(view: PortalsView | AltSidePanelView): JournalRenderer | undefined {
    return journalRenderers.get(view);
}

export function destroContextRenderer(view: PortalsView): void {
    const renderer = contextRenderers.get(view);
    if (renderer) {
        renderer.destroy();
        contextRenderers.delete(view);
    }
}

export function destroySidePanelRenderer(view: PortalsView | AltSidePanelView): void {
    const splitContent = view.containerEl.querySelector('.portals-split-content');
    if (splitContent instanceof HTMLElement) {
        const renderer = activeSidePanelRenderers.get(splitContent);
        renderer?.destroy();
        activeSidePanelRenderers.delete(splitContent);
    }
    const journal = journalRenderers.get(view);
    if (journal) {
        journal.destroy();
        journalRenderers.delete(view);
    }
}

type PanelFactory = (env: PanelEnv) => PanelRenderer | null;

// One entry per side-panel tab. Adding a panel is a single factory here;
// lifecycle, scroll and teardown come for free.
const PANELS: Record<string, PanelFactory> = {
    recent: (env) => {
        const renderer = new RecentFilesRenderer(env.app, env.plugin, env.view);
        renderer.setContainer(env.contentEl);
        return stateless(() => renderer.render());
    },

    'context-notes': (env) => {
        if (!env.plugin.settings.enableContextNotes) {
            env.contentEl.createEl('p', { text: 'Context notes are disabled.' });
            return null;
        }
        const existing = contextRenderers.get(env.view);
        if (existing) existing.saveScroll();
        let renderer = existing;
        if (!renderer) {
            renderer = new ContextNotesRenderer(env.app, env.plugin, env.view, env.contentEl, new Map());
            contextRenderers.set(env.view, renderer);
        } else {
            renderer.setContainer(env.contentEl);
        }
        const notes = renderer;
        return {
            render: () => notes.render(),
            // Kept alive across tab switches; the vault listeners are shared.
            destroy: () => { /* nothing to release */ },
            saveScroll: () => notes.saveScroll(),
        };
    },

    bookmarks: (env) => {
        const refresh = () => {
            void renderSidePanelContent(env.app, env.plugin, env.contentEl, 'bookmarks', env.view);
        };
        const renderer = new BookmarksRenderer(env.app, env.plugin, env.view, refresh);
        renderer.setContainer(env.contentEl);
        return stateless(() => renderer.render());
    },

    journal: (env) => {
        const container = env.contentEl.createDiv();
        const renderer = new JournalRenderer(env.app, env.plugin, container, env.view);
        journalRenderers.set(env.view, renderer);
        return {
            render: () => renderer.render(),
            destroy: () => renderer.destroy(),
        };
    },

    hidden: (env) => {
        const renderer = new HiddenItemsRenderer(env.app, env.plugin, env.view);
        renderer.setContainer(env.contentEl);
        return stateless(() => renderer.render());
    },

    properties: (env) => {
        env.contentEl.addClass('portals-frontmatter-clinic');
        const renderer = new FrontmatterClinicRenderer(env.app, env.plugin, env.contentEl, env.view);
        return {
            render: () => renderer.render(),
            destroy: () => renderer.destroy(),
        };
    },

    trash: (env) => {
        env.contentEl.addClass('portals-trash-tab');
        const renderer = new TrashRenderer(env.app, env.plugin, env.contentEl, env.view);
        return {
            render: () => renderer.render(),
            destroy: () => renderer.destroy(),
        };
    },

    reminders: (env) => {
        env.contentEl.addClass('portals-reminders-tab');
        const renderer = new RemindersRenderer(env.app, env.plugin, env.view);
        renderer.setContainer(env.contentEl);
        return stateless(() => renderer.render());
    },
};

async function renderPanelContent(
    app: App,
    plugin: PortalsPlugin,
    contentEl: HTMLElement,
    tabId: string,
    mainView: PortalsView | null,
): Promise<void> {
    const previous = activeSidePanelRenderers.get(contentEl);
    if (previous) {
        previous.destroy();
        activeSidePanelRenderers.delete(contentEl);
    }

    contentEl.empty();
    contentEl.className = 'portals-split-content';

    if (tabId !== 'context-notes' && tabId !== 'journal') {
        contentEl.addClass(`portals-tree-style-${plugin.settings.treeStyle}`);
    }

    if (!mainView) return;
    const factory = PANELS[tabId];
    if (!factory) return;

    const panel = factory({ app, plugin, view: mainView, contentEl });
    if (!panel) return;
    activeSidePanelRenderers.set(contentEl, panel);
    await panel.render();
}

export async function renderSidePanelContent(
    app: App,
    plugin: PortalsPlugin,
    contentEl: HTMLElement,
    tabId: string,
    mainView: PortalsView | null,
): Promise<void> {
    const probe = beginRender('panel:content', {
        detail: tabId,
        root: contentEl,
        scrollSelector: '.portals-split-content',
    });
    try {
        await renderPanelContent(app, plugin, contentEl, tabId, mainView);
    } finally {
        endRender(probe);
    }
}
