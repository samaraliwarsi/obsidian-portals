import { TFile } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { recordRender } from './probe';

// What changed, not what to draw. Callers declare the change and the bus
// decides which surface is stale.
export type RenderIntent = 'tree:structure' | 'tree:appearance' | 'chrome' | 'panel' | 'all';

export interface InvalidateOptions {
    // Side panel to rebuild, for 'panel'. Two tabs can be queued at once.
    tabId?: string;
    // Rows to patch in place, for 'tree:appearance'. Omit to patch every row.
    files?: string[];
    // Quiet period before running, overriding the intent default.
    afterMs?: number;
    // Keep the scroll target the caller already set instead of capturing one.
    skipScrollSave?: boolean;
    // Free-form note for debugging.
    reason?: string;
}

interface QueueEntry {
    intent: RenderIntent;
    options: InvalidateOptions;
    dueAt: number;
}

const DELAY_MS: Record<RenderIntent, number> = {
    'tree:appearance': 80,
    'tree:structure': 120,
    chrome: 120,
    panel: 150,
    all: 120,
};

export class RenderBus {
    private queue = new Map<string, QueueEntry>();
    private timer: number | null = null;
    private dispatching = false;

    constructor(private readonly plugin: PortalsPlugin) {}

    // Queue a change. Repeated calls for the same target collapse into one
    // entry and push its deadline out, which is the trailing debounce the
    // per-handler timers used to implement.
    invalidate(intent: RenderIntent, options: InvalidateOptions = {}): void {
        const key = intent === 'panel' ? `panel:${options.tabId ?? ''}` : intent;
        const previous = this.queue.get(key);
        const merged = previous ? { ...previous.options, ...options } : options;
        const delay = merged.afterMs ?? DELAY_MS[intent];
        this.queue.set(key, { intent, options: merged, dueAt: Date.now() + delay });
        // Record who asked, because the render stack only shows the view.
        recordRender(`intent:${intent}`, options.tabId ?? options.reason ?? '');
        this.arm();
    }

    // Drop everything queued. Used when the last view closes.
    cancel(): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        this.queue.clear();
    }

    // Run every entry whose deadline has passed. Entries with a longer quiet
    // period stay queued, so a slow intent never holds back a fast one.
    flush(): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.queue.size === 0 || this.dispatching) return;

        // Rebuilding while the user is renaming or dragging would destroy the
        // node they are interacting with, so keep the batch and retry.
        if (this.isBusy()) {
            this.arm();
            return;
        }

        const now = Date.now();
        const due = [...this.queue.entries()].filter(([, entry]) => entry.dueAt <= now);
        if (due.length === 0) {
            this.arm();
            return;
        }
        for (const [key] of due) this.queue.delete(key);

        this.dispatching = true;
        try {
            for (const [, entry] of due) this.run(entry.intent, entry.options);
        } finally {
            this.dispatching = false;
        }
        if (this.queue.size > 0) this.arm();
    }

    private arm(): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        if (this.queue.size === 0) {
            this.timer = null;
            return;
        }
        let earliest = Number.POSITIVE_INFINITY;
        for (const entry of this.queue.values()) earliest = Math.min(earliest, entry.dueAt);
        const wait = Math.max(0, earliest - Date.now());
        this.timer = window.setTimeout(() => {
            this.timer = null;
            this.flush();
        }, wait);
    }

    private isBusy(): boolean {
        return this.plugin.getPortalsViews().some(view => view.isBusy());
    }

    private run(intent: RenderIntent, options: InvalidateOptions): void {
        const views = this.plugin.getPortalsViews();
        switch (intent) {
            case 'all':
            case 'chrome':
                for (const view of views) view.saveTreeScroll();
                for (const view of views) view.render('all');
                // rebuildAltSidePanels also refreshes the content pane.
                this.plugin.rebuildAltSidePanels();
                break;
            case 'tree:structure':
                for (const view of views) {
                    if (!options.skipScrollSave) view.saveTreeScroll();
                    view.render('tree');
                }
                break;
            case 'tree:appearance':
                this.patchRows(views, options.files);
                break;
            case 'panel':
                if (options.tabId) {
                    this.plugin.refreshSidePortal(options.tabId);
                    this.plugin.refreshAltRightPanelContent(options.tabId);
                }
                break;
        }
    }

    private patchRows(views: PortalsView[], paths?: string[]): void {
        if (!paths || paths.length === 0) {
            for (const view of views) view.refreshFileAppearances();
            return;
        }
        for (const view of views) {
            for (const path of paths) {
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) view.updateFileElement(file);
            }
        }
    }
}
