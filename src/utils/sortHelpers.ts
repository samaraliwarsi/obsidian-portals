import { TFile } from 'obsidian';
import type { SpacesSettings } from '../settings';

export function sortFilesBySetting(
    files: TFile[], 
    settings: SpacesSettings,
    overrideSortBy?: 'name' | 'created' | 'modified',
    overrideSortOrder?: 'asc' | 'desc'
): TFile[] {
    const sortBy = overrideSortBy ?? settings.sortBy;
    const sortOrder = overrideSortOrder ?? settings.sortOrder;

    return [...files].sort((a, b) => {
        // 1. Handle Natural Alphabetical Sorting
        if (sortBy === 'name') {
            const result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            return sortOrder === 'asc' ? result : -result;
        }
        // 2. Created or Modified
        const aVal = sortBy === 'created' ? a.stat.ctime : a.stat.mtime;
        const bVal = sortBy === 'created' ? b.stat.ctime : b.stat.mtime;

        // Simple math subtraction for numbers
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
}

export function sortStringsNaturally(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}