import { Notice } from "obsidian";
import PortalsPlugin from "../main";
import { PortalsView, VIEW_TYPE_PORTALS } from "../view";
import { getGuideUrl } from "./Proxies/urls";
import { VIEW_TYPE_ALT_SIDE_PANEL } from "../renderers/RightSideView";

export function registerAllCommands (plugin: PortalsPlugin) {
    plugin.addCommand({
        id: 'open-portal-view',
        name: 'Open explorer',
        callback: () => {
            void plugin.activateView();
        }
    });

    plugin.addCommand({
        id: 'add-portal-tab',
        name: 'Add portal tab',
        callback: () => {
            const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
            if (leaf && leaf.view instanceof PortalsView) {
                leaf.view.showAddPortalModal();
            } else {
                new Notice('Portals view must be open first for all other commands to work.');
            }
        }
    });
    plugin.addCommand({
        id: 'remove-portal-tab',
        name: 'Remove-portal-tab',
        callback: () => {
            const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
            if (leaf && leaf.view instanceof PortalsView) {
                leaf.view.showRemovePortalModal();
            } else {
                new Notice('Portals view must be open first for all other commands to work.');
            }
        }
    });

    plugin.addCommand({
        id: 'configure-side-portal',
        name: 'Configure side portal tabs',
        callback: () => {
            const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
            if (leaf && leaf.view instanceof PortalsView) {
                leaf.view.showSidePortalConfig();
            } else {
                new Notice('Portals view must be open first for all other commands to work.');
            }
        }
    });
    
    plugin.addCommand({
        id: 'reorder-portal-items',
        name: 'Reorder folders/tags',
        callback: () => {
            const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
            if (!leaf || !(leaf.view instanceof PortalsView)) {
                new Notice('Portals view must be open first for all other commands to work.');
                return;
            }
            const space = leaf.view.plugin.settings.selectedSpace;
            if (!space) return;

            if (space.type === 'folder') {
                leaf.view.reorderFolderChildren(space.path);
            } else if (space.type === 'tag') {
                leaf.view.reorderTagChildren(space.path);
            }
        }
    });

    plugin.addCommand({
        id: 'bulk-frontmatter',
        name: 'Bulk frontmatter edit',
        callback: () => {
            const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0];
            if (leaf?.view instanceof PortalsView) {
                leaf.view.showBulkFrontmatterModal();
            } else {
                new Notice('Portals view must be open first for all other commands to work.');
            }
        }
    });

    plugin.addCommand({
        id: 'open-guide',
        name: 'Open guide',
        callback: () => {
            window.open(getGuideUrl(), '_blank');
        },
    });

    plugin.addCommand({
        id: 'toggle-sections',
        name: 'Toggle sections in explorer',
        callback: () => {
            plugin.settings.enableSections = !plugin.settings.enableSections
                void plugin.saveSettings();
        },
    });

    plugin.addCommand({
        id: 'toggle-file-preview',
        name: 'Toggle file previews in explorer',
        callback: () => {
            plugin.settings.showFilePreview = !plugin.settings.showFilePreview;
            void plugin.saveSettings();
        }
    });

    plugin.addCommand({
        id: 'open-root-portal',
        name: 'Switch root vault portal tab',
        callback: () => {
            const rootSpace = plugin.settings.spaces.find(s => s.path === '/' && s.type === 'folder');
            if (rootSpace) {
                plugin.settings.selectedSpace = { path: rootSpace.path, type: rootSpace.type };
                if (rootSpace.type === 'folder' && !plugin.settings.openFolders.includes(rootSpace.path)) {
                    plugin.settings.openFolders.push(rootSpace.path);
                }
                void plugin.saveSettings();
            } else {
                new Notice ('Vault root portal is not available. Enable "pinned vault" in settings.');
            }
        }
    });

    plugin. addCommand({
        id: 'stack-all-portal-tabs',
        name: 'Stack all unstacked portal tabs',
        callback: () => {
            const unstacked = plugin.settings.spaces.filter(s => !s.stackId);
            if (unstacked.length === 0) {
                new Notice('All portals are already stacked.');
                return;
            }
            const newStackID = `stack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            plugin.settings.portalStacks.push({
                id: newStackID,
                name: 'Stack',
                collapsed: false, 
                order: plugin.settings.portalStacks.length,
                color: 'transparent',
            });
            for (const space of unstacked) {
                space.stackId = newStackID;
            }
            const view = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PORTALS)[0]?.view;
            if (view instanceof PortalsView) {
                view.rebuildTabBarOrder();
            }
            void plugin.saveSettings();
        }
    });

    plugin.addCommand({
        id: 'open-alt-side-panel',
        name: 'Open right side panel (alt side portal)',
        callback: () => {
            const rightSplit = plugin.app.workspace.rightSplit;
            if (!rightSplit) return;
            if (rightSplit.collapsed) rightSplit.expand();

            const existing = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_ALT_SIDE_PANEL);

            for (const leaf of existing) leaf.detach();

            let leaf = plugin.app.workspace.getRightLeaf(false);
            if (!leaf) leaf = plugin.app.workspace.getRightLeaf(true);
            if (!leaf) return;
            leaf.setViewState({
                type: VIEW_TYPE_ALT_SIDE_PANEL,
                active: true,
            });
            void plugin.app.workspace.revealLeaf(leaf);
        },
    });

    plugin.addCommand({
        id: 'switch-previous-portal',
        name: 'Switch to previous portal',
        callback: () => {
            const prev = plugin.settings.previousSelectedSpace;
            if (prev) {
                const current = plugin.settings.selectedSpace;
                plugin.settings.selectedSpace = prev;
                plugin.settings.previousSelectedSpace = current ? { path: current.path, type: current.type }: null;
                void plugin.saveSettings();
            } else {
                new Notice('No previous portal to switch to.');
            }
        }
    });

    for (let i = 1; i <= 10; i++) {
        plugin.addCommand({
            id: `open-portal-${i}`,
            name: `Open portal ${i}`,
            callback: () => {
                const space = plugin.settings.spaces.find(s => s.quickTabNumber === i);
                if (!space) {
                    new Notice(`No portal assigned to number ${i}.`);
                    return;
                }

                // If the portal is in a collapsed stack, expand it
                if (space.stackId) {
                    const stack = plugin.settings.portalStacks.find(s => s.id === space.stackId);
                    if (stack && stack.collapsed) {
                        stack.collapsed = false;
                    }
                }

                // Save previous selection for the switch‑previous command
                plugin.settings.previousSelectedSpace = plugin.settings.selectedSpace
                    ? { path: plugin.settings.selectedSpace.path, type: plugin.settings.selectedSpace.type }
                    : null;

                plugin.settings.selectedSpace = { path: space.path, type: space.type };
                if (space.type === 'folder' && !plugin.settings.openFolders.includes(space.path)) {
                    plugin.settings.openFolders.push(space.path);
                }
                void plugin.saveSettings();
            }
        });
    }

    const sideTabCommands: { id: string; name: string; tabId: string }[] = [
        { id: 'open-side-recent', name: 'Show recent files', tabId: 'recent' },
        { id: 'open-side-context-notes', name: 'Show context notes', tabId: 'context-notes' },
        { id: 'open-side-bookmarks', name: 'Show bookmarks', tabId: 'bookmarks' },
        { id: 'open-side-hidden', name: 'Show hidden items', tabId: 'hidden' },
        { id: 'open-side-properties', name: 'Show properties', tabId: 'properties' },
        { id: 'open-side-trash', name: 'Show trash', tabId: 'trash' },
        { id: 'open-journal', name: 'Show journal', tabId: 'journal' },
    ];
    for (const { id, name, tabId } of sideTabCommands ) {
        plugin.addCommand({
            id,
            name,
            callback: () => plugin.openSideTab(tabId),
        });
    }
}