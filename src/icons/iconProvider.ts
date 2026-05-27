export interface IconProvider {
    // name of the pack, e.g. "Phosphor", "Lucide"
    name: string;
    // list of all available icon names (without pack prefix) 
    getIconList(): string[];
    // Draws an icon inside the given element 
    renderIcon(element: HTMLElement, iconName: string): void;
}