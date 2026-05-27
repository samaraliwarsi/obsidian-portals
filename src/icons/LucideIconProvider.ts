// src/icon-providers/LucideIconProvider.ts
import { getIconIds, setIcon } from 'obsidian';
import { IconProvider } from './iconProvider';
import { PHOSPHOR_TO_LUCIDE } from './iconMappings';

export class LucideIconProvider implements IconProvider {
    name = 'lucide';
    private iconCache: string[] | null = null;

    /**
     * Returns a sorted array of Lucide icon names (without the 'lucide-' prefix).
     * Uses Obsidian's internal icon registry – fully offline.
     */
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
        element.addClass('lu');
        const mapped = PHOSPHOR_TO_LUCIDE[iconName] || iconName;
        const lucideName = `lucide-${mapped}`;
        const available = getIconIds();
        const finalName = available.includes(lucideName) ? lucideName: 'lucide-help-circle';
        setIcon(element, finalName);
    }
}