import { ButtonComponent } from 'obsidian';

/**
 * Turns a button into a per‑device toggle stored in localStorage.
 * @param btn          – the ButtonComponent from settings.addButton(...)
 * @param localStorageKey – key under which the on/off state is stored (defaults to the backup toggle)
 * @param onToggle     – optional callback when the user clicks (receives the new boolean state)
 */
export function makeSyncButton(
    btn: ButtonComponent,
    localStorageKey: string = 'portals-backup-device-enabled',
    onToggle?: (enabled: boolean) => void
): void {
    const stored = localStorage.getItem(localStorageKey);
    const initial = stored === null ? true : stored === 'true';

    btn.setIcon(initial ? 'cloud-check' : 'cloud-off');
    btn.setTooltip(initial ? 'Backup is on for this device' : 'Backup is off for this device');
    btn.buttonEl.addClass('portals-cloud-toggle');
    btn.buttonEl.addClass('portals-reset-btn');

    btn.onClick(() => {
        const current = localStorage.getItem(localStorageKey) !== 'false';
        const next = !current;
        localStorage.setItem(localStorageKey, String(next));
        btn.setIcon(next ? 'cloud-check' : 'cloud-off');
        btn.setTooltip(next ? 'Backup is on for this device' : 'Backup is off for this device');
        onToggle?.(next);
    });
}