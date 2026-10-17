/**
 * Parses a YYYY-MM-DD string into a Date object in the user's LOCAL timezone.
 * This prevents the common bug where "2026-10-18" is interpreted as UTC midnight,
 * which might show up as October 17th for users in negative UTC offsets.
 */
export function parseLocalDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    
    // Handle strings like "2026-10-18"
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = Number(parts[0]);
        const month = Number(parts[1]) - 1;
        const day = Number(parts[2]);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            return new Date(year, month, day);
        }
    }
    
    // Fallback for other valid date formats (like ISO strings with time)
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns the difference in days between two dates, ignoring time.
 */
export function getDaysDifference(targetDate: Date, baseDate: Date = new Date()): number {
    const t = new Date(targetDate);
    t.setHours(0, 0, 0, 0);
    
    const b = new Date(baseDate);
    b.setHours(0, 0, 0, 0);
    
    const diffTime = t.getTime() - b.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats a Date object into a YYYY-MM-DD string using local time.
 * Avoids the UTC shift bug of toISOString().
 */
export function formatLocalDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}