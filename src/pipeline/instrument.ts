// Dev-only render instrumentation (Phase 0 of the render refactor).
//
// Off by default and effectively free when disabled: every entry point starts
// with a single boolean check and returns null. When enabled it records one
// event per completed render -- intent, caller, duration and the tree scroll
// position before/after -- into a bounded ring buffer, so the baseline numbers
// used by p0-metrics are measured rather than guessed.
//
// Enable from the Obsidian devtools console:
//
//     __portalsRender.enable()
//     __portalsRender.report()   // per-intent summary table
//     __portalsRender.jumps()    // renders that moved the tree scroll
//     __portalsRender.snapshot() // raw events
//     __portalsRender.reset()
//
// The `intent` field is a plain string on purpose: phase 0 labels events by
// surface, and phase 3 replaces that vocabulary with the five intents owned by
// src/render/renderBus.ts.

export type RenderSurface = 'view:all' | 'view:tree' | 'view:row' | 'panel:content' | 'panel:clinic';

export interface ProbeOptions {
    // Free-form label, e.g. the file path for a row update.
    detail?: string;
    // Phase 0 uses the surface id; phase 3 passes a real render intent.
    intent?: string;
    // Element searched for the scroll host, so a host that gets replaced during
    // a rebuild is re-resolved afterwards instead of measuring a detached node.
    root?: HTMLElement | null;
    // Defaults to the main tree scroller.
    scrollSelector?: string;
}

export interface RenderToken {
    intent: string;
    surface: RenderSurface;
    detail: string;
    caller: string;
    startedAt: number;
    scrollBefore: number | null;
    root: HTMLElement | null;
    scrollSelector: string;
}

export interface RenderEvent {
    seq: number;
    // Wall-clock completion time, so console captures can be lined up with
    // whatever you were doing at that moment.
    ts: number;
    intent: string;
    surface: RenderSurface;
    detail: string;
    caller: string;
    durationMs: number;
    scrollBefore: number | null;
    scrollAfter: number | null;
    /// Scroll position one frame later. Restoration is deferred to a rAF, so
    /// this is the value that distinguishes a real jump from a not-yet-restored
    /// rebuild.
    scrollAfterSettled: number | null;
    jumped: boolean;
}

export interface SurfaceSummary {
    intent: string;
    count: number;
    medianMs: number;
    p95Ms: number;
    maxMs: number;
    jumps: number;
}

const DEFAULT_SCROLL_SELECTOR = '.portals-tree-container';
const MAX_EVENTS = 500;

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function readScroll(root: HTMLElement | null, selector: string): number | null {
    if (!root) return null;
    // Panels pass their content element directly, so it may be the scroll host.
    if (root.matches(selector)) return root.scrollTop;
    const host = root.querySelector<HTMLElement>(selector);
    return host ? host.scrollTop : null;
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const high = sorted[mid] ?? 0;
    if (sorted.length % 2 === 1) return high;
    const low = sorted[mid - 1] ?? high;
    return (low + high) / 2;
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    const clamped = Math.min(sorted.length - 1, Math.max(0, index));
    return sorted[clamped] ?? 0;
}

// Stack capture only happens when instrumentation is enabled -- the same
// `new Error().stack` cost that currently runs on every row update.
function callerFromStack(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    for (const raw of stack.split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('at ')) continue;
        if (line.includes('beginRender')) continue;
        if (line.includes('RenderStats')) continue;
        const frame = line.slice(3).replace(/\(.*[/\\]([^/\\]+)/, '($1)');
        return frame.slice(0, 120);
    }
    return 'unknown';
}

class RenderStats {
    enabled = false;

    private seq = 0;
    private readonly events: RenderEvent[] = [];

    enable(): void {
        this.enabled = true;
    }

    disable(): void {
        this.enabled = false;
    }

    reset(): void {
        this.seq = 0;
        this.events.length = 0;
    }

    begin(surface: RenderSurface, options: ProbeOptions = {}): RenderToken | null {
        if (!this.enabled) return null;
        const root = options.root ?? null;
        const scrollSelector = options.scrollSelector ?? DEFAULT_SCROLL_SELECTOR;
        return {
            intent: options.intent ?? surface,
            surface,
            detail: options.detail ?? '',
            caller: callerFromStack(),
            startedAt: performance.now(),
            scrollBefore: readScroll(root, scrollSelector),
            root,
            scrollSelector,
        };
    }

    end(token: RenderToken | null): void {
        if (!token) return;
        const scrollAfter = readScroll(token.root, token.scrollSelector);
        const jumped = token.scrollBefore !== null
            && scrollAfter !== null
            && Math.abs(scrollAfter - token.scrollBefore) > 1;

        this.seq += 1;
        const event: RenderEvent = {
            seq: this.seq,
            ts: Date.now(),
            intent: token.intent,
            surface: token.surface,
            detail: token.detail,
            caller: token.caller,
            durationMs: round(performance.now() - token.startedAt),
            scrollBefore: token.scrollBefore,
            scrollAfter,
            scrollAfterSettled: null,
            jumped,
        };
        this.events.push(event);
        if (this.events.length > MAX_EVENTS) this.events.shift();

        // The view restores scroll inside requestAnimationFrame, so the read
        // above still sees the pre-restore position. Re-check one frame later.
        if (token.scrollBefore !== null) {
            window.requestAnimationFrame(() => {
                const settled = readScroll(token.root, token.scrollSelector);
                if (settled === null) return;
                event.scrollAfterSettled = settled;
                event.jumped = Math.abs(settled - (token.scrollBefore ?? 0)) > 1;
            });
        }
    }

    // Zero-duration event for a render that was *requested* but did nothing
    // (e.g. the settings-hash guard swallowing a rebuild). Quantifying these is
    // the core evidence for the phase 3 intent work.
    record(intent: string, detail = ''): void {
        if (!this.enabled) return;
        this.seq += 1;
        this.events.push({
            seq: this.seq,
            ts: Date.now(),
            intent,
            surface: 'view:all',
            detail,
            caller: callerFromStack(),
            durationMs: 0,
            scrollBefore: null,
            scrollAfter: null,
            scrollAfterSettled: null,
            jumped: false,
        });
        if (this.events.length > MAX_EVENTS) this.events.shift();
    }

    snapshot(): RenderEvent[] {
        return [...this.events];
    }

    jumps(): RenderEvent[] {
        return this.events.filter(event => event.jumped);
    }

    summary(): SurfaceSummary[] {
        const groups = new Map<string, RenderEvent[]>();
        for (const event of this.events) {
            const bucket = groups.get(event.intent);
            if (bucket) bucket.push(event);
            else groups.set(event.intent, [event]);
        }

        const rows: SurfaceSummary[] = [];
        for (const [intent, bucket] of groups) {
            const durations = bucket.map(event => event.durationMs);
            rows.push({
                intent,
                count: bucket.length,
                medianMs: round(median(durations)),
                p95Ms: round(percentile(durations, 95)),
                maxMs: round(Math.max(...durations)),
                jumps: bucket.filter(event => event.jumped).length,
            });
        }
        return rows.sort((a, b) => b.count - a.count);
    }

    report(): SurfaceSummary[] {
        const rows = this.summary();
        console.table(rows);
        console.info(`[Portals] ${this.events.length} render event(s) in buffer.`);
        return rows;
    }
}

export const renderStats = new RenderStats();

export function beginRender(surface: RenderSurface, options?: ProbeOptions): RenderToken | null {
    return renderStats.begin(surface, options);
}

export function endRender(token: RenderToken | null): void {
    renderStats.end(token);
}

export function recordRender(intent: string, detail?: string): void {
    renderStats.record(intent, detail);
}

// Console handle. Kept out of the plugin API surface on purpose.
const debugGlobal = globalThis as unknown as { __portalsRender?: RenderStats };
debugGlobal.__portalsRender = renderStats;
