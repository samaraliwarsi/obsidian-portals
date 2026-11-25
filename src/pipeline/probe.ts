// Instrumentation stub.
//
// The recorder lives in dev/instrument.ts and is deliberately kept out of src/
// so its console logging never contributes lint warnings to the shipped plugin.
// To profile:
//
//     npm run probe:on     # copies dev/instrument.ts over this file
//     npm run probe:off    # restores this stub from git
//
// This file must always exist, even when unused: the call sites import it, and a
// missing module degrades every binding to 'any' (tsc fails, and the linter
// reports unsafe-call on every probe line).

export type RenderSurface = 'view:all' | 'view:tree' | 'view:row' | 'panel:content' | 'panel:clinic';

export interface ProbeOptions {
    detail?: string;
    intent?: string;
    root?: HTMLElement | null;
    scrollSelector?: string;
}

// Inert placeholder so call sites type-check without the recorder.
export interface RenderToken {
    readonly instrumented: false;
}

export function beginRender(_surface: RenderSurface, _options?: ProbeOptions): RenderToken | null {
    return null;
}

export function endRender(_token: RenderToken | null): void {
    // no-op
}

export function recordRender(_intent: string, _detail?: string): void {
    // no-op
}
