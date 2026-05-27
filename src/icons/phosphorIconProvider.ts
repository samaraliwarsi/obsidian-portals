// src/icon-providers/PhosphorIconProvider.ts
import { iconNames } from '../utils/iconMap'; // your current list
import { IconProvider } from './iconProvider';
//import { setIcon } from 'obsidian'; // you might not use this for Phosphor

export class PhosphorIconProvider implements IconProvider {
    name = 'Phosphor';
    
    getIconList(): string[] {
        return iconNames; // the sorted array you already have
    }
    
    renderIcon(element: HTMLElement, iconName: string): void {
        // Create an <i> element with the Phosphor classes
        const i = document.createElement('i');
        i.className = `ph ph-${iconName}`;
        i.setCssProps({ color: 'inherit' });
        element.empty();  // optional: clear previous content
        element.appendChild(i);
    }
}