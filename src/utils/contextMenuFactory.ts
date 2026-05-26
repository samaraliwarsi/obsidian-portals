import { Menu, TFile, TFolder, MenuItem } from 'obsidian';
import type { PortalsView } from '../view';
import type { SpaceConfig, PortalStack } from '../types';
import { IconPickerModal } from './iconPicker';
import { getContextNote, createContextNote, isContextNote } from '../renderers/contextNotes';
import { SetQuickTabNumberModal } from '../modals/quickTabNumberModal';
import { PortalsActions } from './portalsActions';
import { FrontmatterPopup } from './frontmatterPopup';
import { ColorPickerModal } from '../modals/colorModal';
import { RenamePortalModal } from '../modals/renamePortalModal';

interface MenuItemWithSubmenu extends MenuItem {
    setSubmenu(): Menu;
}

export class ContextMenuFactory {

    /**
     * File item context menu (main tree and side tabs)
     */
    static showFileMenu(view: PortalsView, file: TFile, fileEl: HTMLElement, event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle('Open in new tab')
            .setIcon('document')
            .onClick(() => view.app.workspace.getLeaf('tab').openFile(file)));

        menu.addItem(item => item
            .setTitle('Open to the right')
            .setIcon('file-symlink')
            .onClick(() => view.app.workspace.getLeaf('split', 'vertical').openFile(file)));
        
        menu.addItem(item => item
            .setTitle('Open below')
            .setIcon('file-down')
            .onClick(() => view.app.workspace.getLeaf('split', 'horizontal').openFile(file)));

        menu.addItem(item => item
            .setTitle('Edit frontmatter')
            .setIcon('list-plus')
            .onClick(() => {
                if (view.plugin.settings.activeSplitTab === 'properties' && view.clinicRenderer) {
                    view.clinicRenderer.openFrontmatterModal([file]);
                } else {
                    new FrontmatterPopup(view.app, view.plugin, view, [file]).open()
                }
            }));

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Delete')
            .setIcon('trash')
            .setWarning(true)
            .onClick(() => PortalsActions.deleteFile(view.app, view.plugin, view, file)));

        menu.addItem(item => item
            .setTitle('Duplicate')
            .setIcon('copy')
            .onClick(() => PortalsActions.duplicateFile(view.app, view.plugin, view, file)));

        menu.addItem(item => item
            .setTitle('Rename')
            .setIcon('pencil')
            .onClick(() => PortalsActions.startRenameFile(view.app, view.plugin, view, file, fileEl)));

        menu.addItem(item => item
            .setTitle('Hide')
            .setIcon('eye-off')
            .onClick(() => view.hideItem(file.path)));

        // Icon / color options (respect tree style)
        const style = view.plugin.settings.treeStyle;
        if (style !== 'minimal' && style !== 'shades') {
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Set custom icon')
                .setIcon('image')
                .onClick(() => PortalsActions.setCustomIcon(view.app, view.plugin, view, file.path, file.name)));
            if (PortalsActions.getCustomIcon(view.plugin, file.path)) { //check
                menu.addItem(item => item
                    .setTitle('Remove custom icon')
                    .setIcon('trash')
                    .onClick(() => PortalsActions.removeCustomIcon(view.app, view.plugin, view, file.path)));
            }
        }

        menu.addSeparator();
        menu.addItem(item => item
            .setTitle('Set color')
            .setIcon('palette')
            .onClick(() => PortalsActions.setCustomColorForFile(view.app, view.plugin, view, file, fileEl)));
        if (view.plugin.settings.customColors[file.path]) {
            menu.addItem(item => item
                .setTitle('Reset folder color')
                .setIcon('undo')
                .onClick(() => PortalsActions.resetCustomColorForFile(view.app, view.plugin, view, file)));
        }

        menu.addSeparator();
        if (view.plugin.settings.selectedSpace?.type === 'folder') {
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('New folder with context')
                .setIcon('folder-input')
                .onClick(() => PortalsActions.setFileAsContextNote(view.app, view.plugin, view, file)));
        }
        view.app.workspace.trigger('file-menu', menu, file, 'file-explorer');
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Folder context menu
     */
    static showFolderMenu(view: PortalsView, folder: TFolder, summaryEl: HTMLElement, event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle('New note')
            .setIcon('document')
            .onClick(() => PortalsActions.newNoteInFolder(view.app, view.plugin, view, folder)));

        menu.addItem(item => item
            .setTitle('New folder')
            .setIcon('folder')
            .onClick(() => PortalsActions.newFolderInFolder(view.app, view.plugin, view, folder)));

        menu.addItem(item => item
            .setTitle('New canvas')
            .setIcon('layout-dashboard')
            .onClick(() => PortalsActions.newCanvasInFolder(view.app, view.plugin, view, folder)));

        if (view.plugin.settings.enableContextNotes) {
            const contextNote = folder.children.find((child): child is TFile =>
                child instanceof TFile && isContextNote(view.app, view.plugin, child, folder));
            if (contextNote) {
                menu.addItem(item => item
                    .setTitle('Open context note')
                    .setIcon('document')
                    .onClick(() => view.app.workspace.getLeaf().openFile(contextNote)));
                menu.addItem(item => item
                    .setTitle('Delete context note')
                    .setIcon('trash')
                    .setWarning(true)
                    .onClick(() => {
                        view.saveScrollWithAnchor(summaryEl);
                        void PortalsActions.deleteFile(view.app, view.plugin, view, contextNote)
                    }));
            } else {
                menu.addItem(item => item
                    .setTitle('Create context note')
                    .setIcon('plus')
                    .onClick(async () => {
                        view.saveScrollWithAnchor(summaryEl);
                        await createContextNote(view.app, view.plugin, folder);
                    }));
            }
        }
        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Reorder sub-folders')
            .setIcon('arrow-up-down')
            .onClick(() => view.reorderChildItemsFromElement(summaryEl)));
        menu.addSeparator();
        

        menu.addItem(item => item
            .setTitle('Delete')
            .setIcon('trash')
            .setWarning(true)
            .onClick(() => PortalsActions.deleteFolder(view.app, view.plugin, view, folder)));

        menu.addItem(item => item
            .setTitle('Duplicate')
            .setIcon('copy')
            .onClick(() => PortalsActions.duplicateFolder(view.app, view.plugin, view, folder)));

        menu.addItem(item => item
            .setTitle('Rename')
            .setIcon('pencil')
            .onClick(() => PortalsActions.startRenameFolder(view.app, view.plugin, view, folder, summaryEl)));

        // Hide conditional to portal forming folder
        if (folder.path !== view.plugin.settings.selectedSpace?.path) {
            menu.addItem(item => item
                .setTitle('Hide')
                .setIcon('eye-off')
                .onClick(() => view.hideItem(folder.path)));
        }

        const style = view.plugin.settings.treeStyle;
        if (style !== 'minimal' && style !== 'shades') {
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Set custom icon')
                .setIcon('image')
                .onClick(() => PortalsActions.setCustomIcon(view.app, view.plugin, view, folder.path, folder.name)));
            if (PortalsActions.getCustomIcon(view.plugin, folder.path)) { //check
                menu.addItem(item => item
                    .setTitle('Remove custom icon')
                    .setIcon('trash')
                    .onClick(() => PortalsActions.removeCustomIcon(view.app, view.plugin, view, folder.path)));
            }
        }

        const canSetColor = style !== 'shades' && style !== 'hues' && !(style === 'portals' && view.plugin.settings.tabColorEnabled);
        if (canSetColor) {
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => PortalsActions.setCustomColor(view.app, view.plugin, view, folder, summaryEl.parentElement!)));
            if (view.plugin.settings.customColors[folder.path]) {
                menu.addItem(item => item
                    .setTitle('Reset folder color')
                    .setIcon('undo')
                    .onClick(() => PortalsActions.resetCustomColor(view.app, view.plugin, view, folder)));
            }
        }

        view.app.workspace.trigger('file-menu', menu, folder, 'file-explorer');
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Portal tab context menu
     */
    static showPortalTabMenu(
        view: PortalsView,
        space: SpaceConfig,
        event: MouseEvent
    ): void {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle('Set quick tab number…')
            .setIcon('hashtag')
            .onClick(() => new SetQuickTabNumberModal(view.app, view.plugin, space, () => view.render()).open()));

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Rename portal')
            .setIcon('pencil')
            .onClick(() => view.renamePortal(space)));

        if (space.displayName) {
            menu.addItem(item => item
                .setTitle('Reset name')
                .setIcon('undo')
                .onClick(() => view.resetPortalName(space)));
        }

        menu.addItem(item => item
            .setTitle('Change icon')
            .setIcon('image')
            .onClick(() => {
                new IconPickerModal(view.app, (iconName: string) => {
                    view.saveTreeScroll();
                    space.icon = iconName;
                    void view.plugin.saveSettings().then(() => view.render());
                }).open();
            }));

        const tabColor = view.plugin.settings.tabColorEnabled;
        const panelStyle = view.plugin.settings.filePaneColorStyle;
        if (tabColor || panelStyle === 'gradient' || panelStyle === 'solid') {
            menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => {
                    const dummyEl = activeDocument.createElement('div');
                    new ColorPickerModal(view.app, view.plugin, dummyEl, (color: string) => {
                        view.saveTreeScroll();
                        space.color = color;
                        void view.plugin.saveSettings().then(() => view.render());
                    }, () => {
                        view.render();
                    }, space.color).open();
                }));
            if (space.color && space.color !== 'transparent') {
                menu.addItem(item => item
                    .setTitle('Reset color')
                    .setIcon('undo')
                    .onClick(() => {
                        view.saveTreeScroll();
                        space.color = 'transparent';
                        void view.plugin.saveSettings().then(() => view.render());
                    }));
            }
        }

        menu.addSeparator();
        menu.addItem(item => item
            .setTitle('Add to new stack')
            .setIcon('stack')
            .onClick(() => view.createNewStackWithPortal(space)));

        const otherStacks = view.plugin.settings.portalStacks.filter(s => s.id !== space.stackId);
        if (otherStacks.length > 0) {
            menu.addItem(parentItem => {
                parentItem.setTitle('Add to existing stack')
                    .setIcon('arrow-right');
                const subMenu = (parentItem as MenuItemWithSubmenu).setSubmenu();
                for (const stack of otherStacks) {
                    subMenu.addItem((subItem: MenuItem) => subItem
                        .setTitle(stack.name)
                        .onClick(() => {
                            space.stackId = stack.id;
                            view.rebuildTabBarOrder();
                            void view.plugin.saveSettings().then(() => view.render());
                        }));
                }
            });
        }

        if (space.stackId) {
            menu.addItem(item => item
                .setTitle('Remove from stack')
                .setIcon('arrow-left')
                .onClick(() => {
                    const compositeKey = `${space.type}:${space.path}`;
                    delete space.stackId;
                    if (!view.plugin.settings.tabBarOrder.includes(compositeKey)) {
                        view.plugin.settings.tabBarOrder.push(compositeKey);
                    }
                    void view.plugin.saveSettings().then(() => view.render());
                }));
        }

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Stack header context menu
     */
    static showStackHeaderMenu(
        view: PortalsView,
        stack: PortalStack,
        event: MouseEvent
    ): void {
        const menu = new Menu();

        menu.addItem(item => item
            .setTitle('Rename stack')
            .setIcon('pencil')
            .onClick(() => {
                new RenamePortalModal(view.app, stack.name, (newName: string) => {
                    stack.name = newName.trim() || 'Stack';
                    void view.plugin.saveSettings().then(() => view.render());
                }).open();
            }));

        menu.addItem(item => item
            .setTitle('Change icon')
            .setIcon('image')
            .onClick(() => {
                new IconPickerModal(view.app, (iconName: string) => {
                    stack.icon = iconName;
                    void view.plugin.saveSettings().then(() => view.render());
                }).open();
            }));

        menu.addItem(item => item
            .setTitle('Set color')
            .setIcon('palette')
            .onClick(() => {
                const dummyEl = activeDocument.createElement('div');
                new ColorPickerModal(view.app, view.plugin,  dummyEl, (color: string) => {
                    stack.color = color;
                    void view.plugin.saveSettings().then(() => view.render());
                }, () => { 
                    view.render();
                }, stack.color).open();
            }));

        if (stack.color && stack.color !== 'transparent') {
            menu.addItem(item => item
                .setTitle('Reset color')
                .setIcon('undo')
                .onClick(() => {
                    stack.color = 'transparent';
                    void view.plugin.saveSettings().then(() => view.render());
                }));
        }

        menu.addSeparator();

        menu.addItem(item => item
            .setTitle('Delete stack')
            .setIcon('trash')
            .setWarning(true)
            .onClick(() => {
                const portalsInStack = view.plugin.settings.spaces.filter(s => s.stackId === stack.id);
                portalsInStack.forEach(s => delete s.stackId);
                view.plugin.settings.portalStacks = view.plugin.settings.portalStacks.filter(s => s.id !== stack.id);
                view.plugin.settings.tabBarOrder = view.plugin.settings.tabBarOrder.filter(entry => entry !== `stack:${stack.id}`);
                void view.plugin.saveSettings().then(() => view.render());
            }));

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    // Right‑click menu for the main tag portal’s header summary (e.g. “#project”)
    static showTagContextMenu(
        view: PortalsView,
        tagName: string,
        _iconName: string,
        anchorEl: HTMLElement,
        event: MouseEvent
    ): void {
        const menu = new Menu();

        // Hide only if its not portal root
        if (tagName !== view.plugin.settings.selectedSpace?.path) {
            menu.addItem(item => item
                .setTitle('Hide')
                .setIcon('eye-off')
                .onClick(() => view.hideItem(`tag:${tagName}`))
            );
        }

        // After existing menu items, before context‑note actions
        menu.addSeparator();
        
        menu.addSeparator();
        menu.addItem(item => item
            .setTitle('Reorder groups/subtags')
            .setIcon('arrow-up-down')
            .onClick(() => view.reorderChildItemsFromElement(anchorEl)));
        

        // Context‑note actions
        if (view.plugin.settings.enableContextNotes) {
            menu.addSeparator();
            const contextNote = getContextNote(view.app, view.plugin, tagName);
            if (contextNote) {
                menu.addItem(item => item
                    .setTitle('Open context note')
                    .setIcon('document')
                    .onClick(() => view.app.workspace.getLeaf().openFile(contextNote)));
                menu.addItem(item => item
                    .setTitle('Delete context note')
                    .setIcon('trash')
                    .setWarning(true)
                    .onClick(() => {
                        view.saveScrollWithAnchor(anchorEl);
                        void PortalsActions.deleteFile(view.app, view.plugin, view, contextNote)
                    }));
            } else {
                menu.addItem(item => item
                    .setTitle('Create context note')
                    .setIcon('plus')
                    .onClick(async () => {
                        view.saveScrollWithAnchor(anchorEl);
                        await createContextNote(view.app, view.plugin, tagName);
                    }));
            }
        }

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Right‑click menu for a group tag within a tag portal (e.g. group “urgent” under #project)
     */
    static showGroupTagContextMenu(
        view: PortalsView,
        tagName: string,
        groupKey: string,
        groupTag: string,
        detailsEl: HTMLElement,
        anchorEl: HTMLElement,
        event: MouseEvent
    ): void {
        const menu = new Menu();
        const style = view.plugin.settings.treeStyle;

        // Icon option (if style allows)
        const canSetIcon = style !== 'minimal' && style !== 'shades';
        if (canSetIcon) {
            menu.addItem(item => item
                .setTitle('Set custom icon')
                .setIcon('image')
                .onClick(() => PortalsActions.setCustomIconForTagGroup(view.app, view.plugin, view, groupTag, groupKey)));
            if (PortalsActions.getCustomIcon(view.plugin, groupKey)) { // check
                menu.addItem(item => item
                    .setTitle('Remove custom icon')
                    .setIcon('trash')
                    .onClick(() => PortalsActions.removeCustomIconForTagGroup(view.app, view.plugin, view, groupKey)));
            }
        }

        // Color option (if style allows)
        const canSetColor = style !== 'shades' && style !== 'hues' &&
            !(style === 'portals' && view.plugin.settings.tabColorEnabled);
        if (canSetColor) {
            menu.addSeparator();
            const currentColor = view.plugin.settings.tagColors[groupKey];
            menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => PortalsActions.setTagColor(view.app, view.plugin, view, groupKey, detailsEl)));
            if (currentColor) {
                menu.addItem(item => item
                    .setTitle('Reset color')
                    .setIcon('undo')
                    .onClick(() => PortalsActions.resetTagColor(view.app, view.plugin, view, groupKey, detailsEl)));
            }
        }

        // Context‑note actions
        if (view.plugin.settings.enableContextNotes) {
            menu.addSeparator();
            const contextNote = getContextNote(view.app, view.plugin, groupTag);
            if (contextNote) {
                menu.addItem(item => item
                    .setTitle('Open context note')
                    .setIcon('document')
                    .onClick(() => view.app.workspace.getLeaf().openFile(contextNote)));
                menu.addItem(item => item
                    .setTitle('Delete context note')
                    .setIcon('trash')
                    .setWarning(true)
                    .onClick(() => {
                        view.saveScrollWithAnchor(anchorEl);
                        void PortalsActions.deleteFile(view.app, view.plugin, view, contextNote)
                    }));
            } else {
                menu.addItem(item => item
                    .setTitle('Create context note')
                    .setIcon('plus')
                    .onClick(async () => {
                        view.saveScrollWithAnchor(anchorEl);
                        await createContextNote(view.app, view.plugin, groupTag);
                    }));
            }
        }

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    /**
     * Right‑click menu for a subtag node (e.g. “#project/ideas”)
     */
    static showSubtagNodeContextMenu(
        view: PortalsView,
        tagName: string,
        nodeFullPath: string,
        _iconName: string,
        detailsEl: HTMLElement,
        anchorEl: HTMLElement,
        event: MouseEvent
    ): void {
        const menu = new Menu();
        const style = view.plugin.settings.treeStyle;
        const nodeKey = `tag:${tagName}/node:${nodeFullPath}`;

        // Reorder sub‑items (if there are any direct children)
        const childrenContainer = (anchorEl).parentElement?.querySelector('.folder-children');
        if (childrenContainer && childrenContainer.querySelector(':scope > .folder-details > .folder-summary')) {
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Reorder sub‑items')
                .setIcon('arrow-up-down')
                .onClick(() => view.reorderChildItemsFromElement(anchorEl)));
        }

        // Hide
        menu.addItem(item => item
            .setTitle('Hide')
            .setIcon('eye-off')
            .onClick(() => view.hideItem(nodeKey)));

        // Icon option
        const canSetIcon = style !== 'minimal' && style !== 'shades';
        if (canSetIcon) {
            menu.addItem(item => item
                .setTitle('Set custom icon')
                .setIcon('image')
                .onClick(() => PortalsActions.setCustomIconForTagGroup(view.app, view.plugin, view, nodeFullPath, nodeKey)));
            if (PortalsActions.getCustomIcon(view.plugin, nodeKey)) { // check
                menu.addItem(item => item
                    .setTitle('Remove custom icon')
                    .setIcon('trash')
                    .onClick(() => PortalsActions.removeCustomIconForTagGroup(view.app, view.plugin, view, nodeKey)));
            }
        }

        // Color option
        const canSetColor = style !== 'shades' && style !== 'hues' &&
            !(style === 'portals' && view.plugin.settings.tabColorEnabled);
        if (canSetColor) {
            menu.addSeparator();
            const currentColor = view.plugin.settings.tagColors[nodeKey];
            menu.addItem(item => item
                .setTitle('Set color')
                .setIcon('palette')
                .onClick(() => PortalsActions.setTagColor(view.app, view.plugin, view, nodeKey, detailsEl)));
            if (currentColor) {
                menu.addItem(item => item
                    .setTitle('Reset color')
                    .setIcon('undo')
                    .onClick(() => PortalsActions.resetTagColor(view.app, view.plugin, view, nodeKey, detailsEl)));
            }
        }

        // Context‑note actions
        if (view.plugin.settings.enableContextNotes) {
            menu.addSeparator();
            const contextNote = getContextNote(view.app, view.plugin, nodeFullPath);
            if (contextNote) {
                menu.addItem(item => item
                    .setTitle('Open context note')
                    .setIcon('document')
                    .onClick(() => view.app.workspace.getLeaf().openFile(contextNote)));
                menu.addItem(item => item
                    .setTitle('Delete context note')
                    .setIcon('trash')
                    .setWarning(true)
                    .onClick(() => {
                        view.saveScrollWithAnchor(anchorEl);
                        void PortalsActions.deleteFile(view.app, view.plugin, view, contextNote)
                    }));
            } else {
                menu.addItem(item => item
                    .setTitle('Create context note')
                    .setIcon('plus')
                    .onClick(async () => {
                        view.saveScrollWithAnchor(anchorEl);
                        await createContextNote(view.app, view.plugin, nodeFullPath);
                    }));
            }
        }

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }
}