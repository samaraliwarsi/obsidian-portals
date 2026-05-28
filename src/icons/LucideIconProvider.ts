// src/icons/LucideIconProvider.ts
import { getIconIds, setIcon } from 'obsidian';
import { IconProvider } from './iconProvider';
import { PHOSPHOR_TO_LUCIDE } from './iconMappings';

export class LucideIconProvider implements IconProvider {
    name = 'lucide';
    private iconCache: string[] | null = null;

    // Returns a sorted array of Lucide names (without 'lucide-' prefix).
    // Uses Obsidian's internal icon registry.
    getIconList(): string[] {
        if (!this.iconCache) {
            this.iconCache = getIconIds()
                .filter((id) => id.startsWith('lucide-'))
                .map((id) => id.replace('lucide-', ''))
                .sort();
        }
        return this.iconCache;
    }

    /**
     * Renders a Lucide icon inside a given HTML element.
     * @param element - The container to render the icon into.
     * @param iconName - The icon name without the 'lucide-' prefix (e.g., 'folder').
     */
    renderIcon(element: HTMLElement, iconName: string): void {
        const available = getIconIds();
        let lucideId = `lucide-${iconName}`;
        if (!available.includes(lucideId)) {
            const mapped = PHOSPHOR_TO_LUCIDE[iconName];
            if (mapped) {
                lucideId = `lucide-${mapped}`;
            }
            if (!available.includes(lucideId)) {
                lucideId = 'lucide-help-circle';
            }
        }
        //element.addClass('lu');
        setIcon(element, lucideId);
    }
}