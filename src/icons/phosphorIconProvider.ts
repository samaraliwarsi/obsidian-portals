// src/icons/PhosphorIconProvider.ts
import { iconNames } from './iconMap';
import { LUCIDE_TO_PHOSPHOR } from './iconMappings';
import { IconProvider } from './iconProvider';

export class PhosphorIconProvider implements IconProvider {
    name = 'Phosphor';
    
    getIconList(): string[] {
        return iconNames;
    }
    
    renderIcon(element: HTMLElement, iconName: string): void {
        let resolved = iconName;
        if (!iconNames.includes(resolved)) {
            const mapped = LUCIDE_TO_PHOSPHOR[iconName];
            if (mapped && iconNames.includes(mapped)) {
                resolved = mapped;
            } else {
                resolved = 'question';
            }
        }
        element.empty();
        element.createEl('i', { cls: `ph ph-${resolved}` });
    }
}