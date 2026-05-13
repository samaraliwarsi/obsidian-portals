export interface SpaceConfig {
    path: string;
    type: 'folder' | 'tag';
    icon: string;
    color: string;
    groupTags?: string[];
    displayName?: string;
    stackId?: string;
}

export interface PortalStack {
    id: string;
    name: string;
    icon?: string;
    color: string;
    collapsed: boolean;
    order?: number;
}

export interface CachedMetadataWithFrontmatter {
    frontmatter?: {
        tags?: unknown;
    };
}

export interface metadataCacheWithGetTags {
    getTags(): Record< string, number>;
}
