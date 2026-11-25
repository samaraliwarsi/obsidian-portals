// One Escape handler for every layer we own. Without this, a modal and a popover
// it spawned both react to Escape, closing two things at once.
export interface OverlayLayer {
    close(): void;
}

const layers: OverlayLayer[] = [];
let bound = false;

function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const top = layers[layers.length - 1];
    if (!top) return;
    e.preventDefault();
    // stopImmediatePropagation, not stopPropagation: the popovers also bind their
    // own Escape handlers on activeDocument, and a plain stop would let those run
    // and close a second layer in the same keypress.
    e.stopImmediatePropagation();
    try {
        top.close();
    } catch (err) {
        // A layer that fails to close must not swallow Escape permanently, or the
        // key would stop working everywhere until reload.
        console.error('[Portals] overlay layer failed to close', err);
        overlayStack.remove(top);
    }
}

export const overlayStack = {
    push(layer: OverlayLayer): void {
        if (layers.includes(layer)) return;
        layers.push(layer);
        if (!bound) {
            bound = true;
            activeDocument.addEventListener('keydown', onKeyDown);
        }
    },
    remove(layer: OverlayLayer): void {
        const index = layers.indexOf(layer);
        if (index !== -1) layers.splice(index, 1);
    },
    depth(): number {
        return layers.length;
    },
};
