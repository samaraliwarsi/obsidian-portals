// src/utils/tagHelpers.ts

export function getFrontmatterTags(cache: { frontmatter?: { tags?: unknown } } | null): string[] {
    const raw = cache?.frontmatter?.tags;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string');
    if (typeof raw === 'string') return [raw];
    return [];
}
