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

const contextRenderers = new WeakMap<PortalsView | AltSidePanelView, ContextNotesRenderer>();

export function getContextRenderer(view: PortalsView): ContextNotesRenderer | undefined {
    return contextRenderers.get(view);
}

export function destroContextRenderer(view: PortalsView): void {
    const renderer = contextRenderers.get(view);
    if (renderer) {
        renderer.destroy();
        contextRenderers.delete(view);
    }
}

export async function renderSidePanelContent(
    app: App,
    plugin: PortalsPlugin,
    contentEl: HTMLElement,
    tabId: string,
    mainView: PortalsView | null,
): Promise<void> {
    contentEl.empty();
    contentEl.className = 'portals-split-content';

    if (tabId !== 'context-notes' && tabId !== 'journal') {
        contentEl.addClass(`portals-tree-style-${plugin.settings.treeStyle}`);
    }

    if (tabId === 'recent') {
        const renderer = new RecentFilesRenderer(app, plugin, mainView!);
        renderer.setContainer(contentEl);
        renderer.render();
    } else if (tabId === 'context-notes') {
        if (!plugin.settings.enableContextNotes) {
            contentEl.createEl('p', { text: 'Context notes are disabled.' });
            return;
        }
        if (!mainView) return;

        const existing = contextRenderers.get(mainView);
        if (existing) {
            existing.saveScroll();
        }

        let renderer = contextRenderers.get(mainView);
        if (!renderer) {
            renderer = new ContextNotesRenderer(app, plugin, mainView, contentEl, new Map());
            contextRenderers.set(mainView, renderer);
        } else {
            renderer.setContainer(contentEl);
        }
        await renderer.render();
    } else if (tabId === 'bookmarks') {
        // BookmarksRenderer expects (app, plugin, view, refreshCallback)
        const refresh = () => {
            // Re-render the content area of the right panel on demand
            void renderSidePanelContent(app, plugin, contentEl, tabId, mainView);
        };
        const bmRenderer = new BookmarksRenderer(app, plugin, mainView!, refresh);
        bmRenderer.setContainer(contentEl);
        bmRenderer.render();
    } else if (tabId === 'journal') {
        // JournalRenderer only needs (app, plugin, container)
        const journalContainer = contentEl.createDiv();
        const journalRenderer = new JournalRenderer(app, plugin, journalContainer, mainView!);
        await journalRenderer.render();
    } else if (tabId === 'hidden') {
        const hiddenRenderer = new HiddenItemsRenderer(app, plugin, mainView!);
        hiddenRenderer.setContainer(contentEl);
        hiddenRenderer.render();
    } else if (tabId === 'properties') {
        contentEl.addClass('portals-frontmatter-clinic');
        const clinicRenderer = new FrontmatterClinicRenderer(app, plugin, contentEl, mainView!);
        await clinicRenderer.render();
    } else if (tabId === 'trash') {
        contentEl.addClass('portals-trash-tab');
        const trashRenderer = new TrashRenderer(app, plugin, contentEl, mainView!);
        await trashRenderer.render();
    }
    return;
}