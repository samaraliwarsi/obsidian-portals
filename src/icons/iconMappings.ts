// src/icons/icon-mapping.ts

function invertMapping(map: Record<string, string>): Record<string, string> {
    const reversed: Record<string, string> = {};
    for (const [key, value] of Object.entries(map)) {
        reversed[value] = key;
    }
    return reversed;
}


export const PHOSPHOR_TO_LUCIDE: Record<string, string> = {
    'arrow-square-out': 'arrow-up-right-from-square',
    'eye-slash': 'eye-off',
    'plus-minus': 'diff',
    'dots-six-vertical': 'grip-vertical',
    'funnel-simple': 'list-filter',
    'warning-circle': 'circle-alert',
    'quotes': 'quote',
    'dice-three': 'dice-3',
    'calendar-star': 'square-star',
    'arrow-counter-clockwise': 'rotate-ccw',
    'stack': 'layers',
    'stack-simple': 'layers-2',
    'caret-circle-up-down': 'chevrons-up-down',
    'folder-simple-plus': 'folder-plus',
    'note': 'sticky-note',
    'list-dashes': 'list',
    'clock-counter-clockwise': 'clock-fading',
    'tag-simple': 'tags',
    'folder-simple' : 'folder-closed',
}

export const LUCIDE_TO_PHOSPHOR: Record<string, string> = invertMapping(PHOSPHOR_TO_LUCIDE);
