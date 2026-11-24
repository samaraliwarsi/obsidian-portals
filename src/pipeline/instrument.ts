// Instrumentation stub.
//
// The real recorder lives in dev/instrument.ts and is deliberately kept out of
// src/ so it never contributes lint warnings to the shipped plugin. Copy it over
// this file while profiling, then restore the stub:
//
//     cp dev/instrument.ts src/pipeline/instrument.ts
//
// Every entry point is a no-op here, so the call sites stay in place and cost
// one function call when disabled.

export type RenderSurface = 'view:all' | 'view:tree' | 'view:row' | 'panel:content' | 'panel:clinic';

export interface ProbeOptions {
    detail?: string;
    intent?: string;
    root?: HTMLElement | null;
    scrollSelector?: string;
}

// Both are inert placeholders so call sites type-check without the recorder.
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
