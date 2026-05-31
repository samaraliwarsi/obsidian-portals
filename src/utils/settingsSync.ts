import { Setting } from "obsidian";

// Helper you can place in a shared utils file
export function localStorageToggle(
    containerEl: HTMLElement,
    key: string,
    defaultValue: boolean,
    name: string,
    description: string,
    onChanged?: (value: boolean) => void
): void {
    const stored = localStorage.getItem(key);
    const current = stored === null ? defaultValue : stored === 'true';

    new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addToggle(toggle => toggle
            .setValue(current)
            .onChange(value => {
                localStorage.setItem(key, String(value));
                onChanged?.(value);
            }));
}