import { TFile, App } from 'obsidian';
import type PortalsPlugin from '../main';
import type { PortalsView } from '../view';
import { FileItemFactory } from './fileItemFactory';

type SectionKey = string;   // e.g. '.md', 'propValue'

interface Section {
    key: SectionKey;
    label: string;          // display text for the section
    files: TFile[];
}

function getFrontmatterProperty(frontmatter: unknown, key: string): unknown {
    if (frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter)) {
        return (frontmatter as Record<string, unknown>)[key];
    }
    return undefined;
}

export class SectionRenderer {
    static renderSections(
        app: App,
        plugin: PortalsPlugin,
        view: PortalsView,
        files: TFile[],
        parentPath: string,
        container: HTMLElement,
        openFiles: Set<string>,
        afterCreate?: (fileEl: HTMLElement) => void
    ): boolean {
        // Respect the global toggle
        if (!plugin.settings.enableSections) return false;

        // Build sections based on the active criterion
        const sections = this.buildSections(app, plugin, files);
        if (sections.length <= 1) return false;   // nothing to section

        // Restore saved order (if any)
        const orderKey = this.getOrderKey(plugin, parentPath);
        const savedOrder = plugin.settings.sectionOrders[orderKey] ?? plugin.settings.sectionOrders[parentPath];
        if (savedOrder) {
            sections.sort((a, b) => {
                const ai = savedOrder.indexOf(a.key);
                const bi = savedOrder.indexOf(b.key);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
            });
        }

        // Render each section
        for (const section of sections) {
            this.renderSection(
                app, plugin, view, section, sections,
                parentPath, container, openFiles, afterCreate
            );
        }

        return true;
    }

    // --------Group files into sections---------------------------------------

    private static buildSections(
        app: App,
        plugin: PortalsPlugin,
        files: TFile[]
    ): Section[] {
        const space = plugin.settings.selectedSpace;
        const compositeKey = space ? `${space.type}:${space.path}` : null;
        const prefs = compositeKey ? plugin.settings.spaceSectionPrefs[compositeKey] : undefined;

        const criterion = prefs?.criterion ?? plugin.settings.sectionCriterion;
        const propName = prefs?.propertyName ?? plugin.settings.sectionPropertyName;

        // --- By file extension ---
        if (criterion === 'extension') {
            const map = new Map<string, TFile[]>();
            for (const f of files) {
                const ext = f.extension || 'none';
                if (!map.has(ext)) map.set(ext, []);
                map.get(ext)!.push(f);
            }
            return Array.from(map.entries()).map(([key, fileList]) => ({
                key,
                label: `.${key === 'md' ? 'md (Markdown)' : key.toUpperCase()}`,
                files: this.sortFiles(plugin, fileList),
            }));
        }

        // --- By frontmatter property ---
        if (criterion === 'property') {
            const map = new Map<string, TFile[]>();
            for (const f of files) {
                const cache = app.metadataCache.getFileCache(f);
                const fm = cache?.frontmatter;
                const val = getFrontmatterProperty(fm, propName);
                let key: string;
                if (val === undefined || val === null) {
                    key = 'none';
                } else if (Array.isArray(val)) {
                    key = val.join(', ');
                } else {
                    key = String(val);
                }
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(f);
            }
            return Array.from(map.entries()).map(([key, fileList]) => ({
                key,
                label: key === 'none' ? 'No value' : key,
                files: this.sortFiles(plugin, fileList),
            }));
        }
        // Fallback – no sections
        return [];
    }

    // ---------Internal sort (respects plugin’s current sortBy / sortOrder)-------------------------

    private static sortFiles(plugin: PortalsPlugin, files: TFile[]): TFile[] {
        const sorted = [...files];
        const { sortBy, sortOrder } = plugin.settings;
        sorted.sort((a, b) => {
            let aVal: string | number;
            let bVal: string | number;
            switch (sortBy) {
                case 'name': aVal = a.name; bVal = b.name; break;
                case 'created': aVal = a.stat.ctime; bVal = b.stat.ctime; break;
                case 'modified': aVal = a.stat.mtime; bVal = b.stat.mtime; break;
                default: aVal = a.name; bVal = b.name;
            }
            if (sortOrder === 'asc') return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0);
            else return (aVal > bVal ? -1 : aVal < bVal ? 1 : 0);
        });
        return sorted;
    }

    // --------------Render a single section--------------------------------

    private static renderSection(
        app: App,
        plugin: PortalsPlugin,
        view: PortalsView,
        section: Section,
        sections: Section[],
        parentPath: string,
        container: HTMLElement,
        openFiles: Set<string>,
        afterCreate?: (fileEl: HTMLElement) => void
    ) {
        const index = sections.indexOf(section);

        // ------ Separator line with label + arrows ------
        const sepDiv = container.createDiv({ cls: 'portals-section-separator' });
        sepDiv.createSpan({ cls: 'portals-section-label', text: section.label });
        const arrowsSpan = sepDiv.createSpan({ cls: 'portals-section-arrows' });
        arrowsSpan.createEl('i', {
            cls: 'ph ph-caret-up',
            attr: { 'data-index': String(index) },
        });
        arrowsSpan.createEl('i', {
            cls: 'ph ph-caret-down',
            attr: { 'data-index': String(index) },
        });

        // Click to reorder
        arrowsSpan.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.classList.contains('ph-caret-up') &&
                !target.classList.contains('ph-caret-down')) return;

            const dir = target.classList.contains('ph-caret-up') ? -1 : 1;
            const newIndex = index + dir;
            if (newIndex < 0 || newIndex >= sections.length) return;

            // Swap sections (TS might complain about undefined, but the indices are valid)
            const a = sections[index]!;
            const b = sections[newIndex]!;
            sections[index] = b;
            sections[newIndex] = a;

            // Save new order
            this.saveSectionOrder(plugin, parentPath, sections);

            // Re‑render the whole tree
            view.renderContent();
        });

        // ------ File items ------
        for (const file of section.files) {
            if (plugin.settings.hiddenItems[file.path]) continue;
            const fileEl = FileItemFactory.createFileItem(app, plugin, view, file, container, openFiles);
            afterCreate?.(fileEl);
        }
    }

    // ---------Persist section order---------------------------------------

    private static saveSectionOrder(
        plugin: PortalsPlugin,
        parentPath: string,
        sections: Section[]
    ) {
        const order = sections.map(s => s.key);
        const orderKey = this.getOrderKey(plugin, parentPath);
        plugin.settings.sectionOrders[orderKey] = order;
        void plugin.saveSettings();
    }

    private static getOrderKey(plugin: PortalsPlugin, parentPath: string): string {
        const space = plugin.settings.selectedSpace;
        if (!space) return parentPath;
        return `${space.type}:${space.path}/${parentPath}`;
    }
}