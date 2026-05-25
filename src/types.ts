export interface SpaceConfig {
    path: string;
    type: 'folder' | 'tag';
    icon: string;
    color: string;
    groupTags?: string[];
    displayName?: string;
    stackId?: string;
    quickTabNumber?: number; // 1-10 or undefined
}

export interface PortalStack {
    id: string;
    name: string;
    icon?: string;
    color: string;
    collapsed: boolean;
    order?: number;
}

export interface InternalPluginsWithBookmarks {
    getPluginById(id: 'bookmarks'): InternalBookmarksPlugin | undefined;
}

export interface BookmarkItem {
    title?: string;
    path?: string;
    url?: string;
    type?: string;
    id?: string;
    children?: BookmarkItem[];
}

export interface InternalBookmarksPlugin {
    enabled: boolean;
    instance?: {
        on: (event: string, callback: () => void) => void;
        off: (event: string, ref: unknown) => void;
        items?: BookmarkItem[];
        removeItem?: (item: BookmarkItem) => void;
        delete?: (item: BookmarkItem) => void;
        deleteItem?: (id: string) => void;
    };
}

export interface PublicBookmarksAPI {
    getBookmarks(): BookmarkItem[];
    remove?(id: string): void;
    items?: BookmarkItem[];
}