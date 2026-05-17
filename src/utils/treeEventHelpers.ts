import { TFile, TFolder, Notice, Platform } from 'obsidian';
import type { PortalsView } from '../view';
import { handleContextNoteCreation, getContextNote } from '../renderers/contextNotes';

export class TreeEventHelpers {

    static attachTouchSwipeSelection(
        el: HTMLElement,
        key: string,
        view: PortalsView
    ): void {
        let touchStartPos: { x: number; y: number } | null = null;
        let isSwiping = false;

        el.addEventListener('touchstart', (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch) {
                touchStartPos = { x: touch.clientX, y: touch.clientY };
                isSwiping = false;
            }
        }, { passive: true });

        el.addEventListener('touchmove', (e: TouchEvent) => {
            if (!touchStartPos) return;
            const touch = e.touches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStartPos.x;
            const deltaY = touch.clientY - touchStartPos.y;
            if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaY) < 20) {
                isSwiping = true;
                el.addClass('swipe-active');
            }
        }, { passive: true });

        el.addEventListener('touchend', (e: TouchEvent) => {
            if (!touchStartPos) {
                if (isSwiping) el.removeClass('swipe-active');
                touchStartPos = null; isSwiping = false; return;
            }
            const changedTouch = e.changedTouches[0];
            if (changedTouch && isSwiping) {
                const deltaX = changedTouch.clientX - touchStartPos.x;
                const deltaY = changedTouch.clientY - touchStartPos.y;
                if (deltaX > 30 && Math.abs(deltaY) < 30) {
                    if (view.selectedItems.has(key)) {
                        view.selectedItems.delete(key);
                        el.removeClass('is-selected');
                    } else {
                        view.selectedItems.add(key);
                        el.addClass('is-selected');
                    }
                    view.updateMultiSelectToolbar();
                }
            }
            if (isSwiping) el.removeClass('swipe-active');
            touchStartPos = null; isSwiping = false;
        });

        el.addEventListener('touchcancel', () => {
            if (isSwiping) el.removeClass('swipe-active');
            touchStartPos = null; isSwiping = false;
        });
    }

    static attachContextNoteKeyboardActions(
        el: HTMLElement,
        target: TFolder | string,
        view: PortalsView,
        anchorEl?: HTMLElement
    ): void {
        el.addEventListener('click', (e: MouseEvent) => {
            if (e.shiftKey && !e.altKey && view.plugin.settings.enableContextNotes) {
                e.preventDefault();
                e.stopPropagation();
                view.saveScrollWithAnchor(anchorEl || el);
                void handleContextNoteCreation(view.app, view.plugin, target);
                return;
            }
            if ((e.metaKey || e.ctrlKey) && view.plugin.settings.enableContextNotes) {
                e.preventDefault();
                e.stopPropagation();
                const note = getContextNote(view.app, view.plugin, target);
                if (note) {
                    void view.app.workspace.getLeaf('tab').openFile(note);
                } else {
                    new Notice('No context note for this item');
                }
                return;
            }
        });
    }

    // Handles both normal click (open file) and alt‑click (multi‑select)
    static attachFileClickHandler(fileEl: HTMLElement, file: TFile, view: PortalsView): void {
        fileEl.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            if (e.altKey) {
                e.preventDefault();
                const key = file.path;
                if (e.shiftKey && view.rangeSelectionAnchor) {
                    // Alt+Shift range selector
                    view.selectRange(view.rangeSelectionAnchor, key);
                } else {
                    if (view.selectedItems.has(file.path)) {
                        view.selectedItems.delete(file.path);
                        fileEl.removeClass('is-selected');
                        view.rangeSelectionAnchor = null;
                    } else {
                        view.selectedItems.add(file.path);
                        fileEl.addClass('is-selected');
                        view.rangeSelectionAnchor = key;
                    }
                }
            } else if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                void view.app.workspace.getLeaf('tab').openFile(file);
            } else if (e.shiftKey) {
                e.preventDefault();
                void view.app.workspace.getLeaf('split').openFile(file);
            } else {
                void view.app.workspace.getLeaf().openFile(file);
            }
            view.updateMultiSelectToolbar();
        });
    }

    static attachMultiSelectClick(el: HTMLElement, key: string, view: PortalsView): void {
        el.addEventListener('click', (e: MouseEvent) => {
            if (e.altKey) {
                e.preventDefault();
                e.stopPropagation();

                if (e.shiftKey && view.rangeSelectionAnchor) {
                    // range selection
                    view.selectRange(view.rangeSelectionAnchor, key);
                } else {
                    // single toggle 
                    if (view.selectedItems.has(key)) {
                        view.selectedItems.delete(key);
                        el.removeClass('is-selected');
                        view.rangeSelectionAnchor = null;
                    } else {
                        view.selectedItems.add(key);
                        el.addClass('is-selected');
                        view.rangeSelectionAnchor = key;
                    }
                }
                view.updateMultiSelectToolbar();
            }
        });
    }

    static attachDragStart(
        el: HTMLElement,
        path: string
    ): void {
        if (!Platform.isMobile) {
            el.draggable = true;
            el.addEventListener('dragstart', (e: DragEvent) => {
                e.dataTransfer?.setData('text/plain', path);
            });
        }
    }
    
    static attachIconContextNoteOpener(
        iconSpan: HTMLElement,
        target: TFolder | string,
        view: PortalsView
    ): void {
        if (!view.plugin.settings.enableContextNotes || !view.plugin.settings.contextNoteIconClick) return;
        iconSpan.classList.add('context-notes-icon-open');
        const handler = async (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const note = getContextNote(view.app, view.plugin, target);
            if (note) {
                await view.app.workspace.getLeaf().openFile(note);
            } else {
                new Notice('No context note exists for this item. Shift+Click to create.');
            }
        };
        const wrappedHandler = (e: Event) => { void handler(e); };
        iconSpan.addEventListener('click', wrappedHandler);
        iconSpan.addEventListener('touchstart', wrappedHandler, { passive: false });
    }

    static attachFolderSummaryListeners(
        summary: HTMLElement,
        folder: TFolder,
        view: PortalsView
    ): void {
        TreeEventHelpers.attachTouchSwipeSelection(summary, folder.path, view);
        TreeEventHelpers.attachContextNoteKeyboardActions(summary, folder, view, summary);
        TreeEventHelpers.attachMultiSelectClick(summary, folder.path, view);
        TreeEventHelpers.attachDragStart(summary, folder.path);
    }

    static attachTagNodeListeners(
        summary: HTMLElement,
        nodeKey: string,
        tagPath: string,
        view: PortalsView
    ): void {
        TreeEventHelpers.attachTouchSwipeSelection(summary, nodeKey, view);
        TreeEventHelpers.attachContextNoteKeyboardActions(summary, tagPath, view, summary);
        TreeEventHelpers.attachMultiSelectClick(summary, nodeKey, view);
    }

    static attachMainTagListeners(
        summary: HTMLElement,
        tagName: string,
        view: PortalsView
    ): void {
        const key = `tag:${tagName}`;
        TreeEventHelpers.attachTouchSwipeSelection(summary, key, view);
        TreeEventHelpers.attachContextNoteKeyboardActions(summary, tagName, view, summary);
        TreeEventHelpers.attachMultiSelectClick(summary, key, view);
    }

    static attachMiddleClickListener(fileEl: HTMLElement, file: TFile, view: PortalsView): void {
        fileEl.addEventListener('mouseup', (e: MouseEvent) => {
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                view.openFileInNewTab(file);
            }
        });
    }

    static attachFileItemListeners(
        fileEl: HTMLElement,
        file: TFile,
        view: PortalsView
    ): void {
        TreeEventHelpers.attachTouchSwipeSelection(fileEl, file.path, view);
        TreeEventHelpers.attachDragStart(fileEl, file.path);
        TreeEventHelpers.attachFileClickHandler(fileEl, file, view);
        TreeEventHelpers.attachMiddleClickListener(fileEl, file, view);
    }
}