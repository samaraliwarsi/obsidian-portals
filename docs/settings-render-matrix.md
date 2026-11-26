# Settings → surface matrix

Every setting that changes what is on screen: what it should invalidate, what it
does now, and the exact console call to verify it. Run the capture, change the
setting, read `report()`.

Status: `ok` verified · `wired` verified through a narrow intent · `?` untested ·
`gap` known limitation.

## Portal tab bar

| Setting | Capture command | Should invalidate | Observed | Status |
|---|---|---|---|---|
| `spaces` add/remove | `capture("S-add-portal", 10)` | `all` | full rebuild | ok |
| `tabBarOrder` | `capture("S-reorder-portal-tabs", 10)` | `chrome` | full rebuild | ok |
| `portalStacks` add/remove/collapse | `capture("S-stack-collapse", 10)` | `chrome` | full rebuild | ok |
| `tabNameDisplay` | `capture("S-tab-name-display", 10)` | `chrome` | full rebuild | ok |
| `tabColorEnabled` | `capture("S-tab-colors", 10)` | `chrome` | full rebuild | ok |
| `tabIconPosition` | `capture("S-tab-icon-position", 10)` | `chrome` | full rebuild | ok |
| `stackIconPosition` | `capture("S-stack-icon-position", 10)` | `chrome` | full rebuild | ? inferred |
| `hideStackNames` | `capture("S-hide-stack-names", 10)` | `chrome` | full rebuild | ? inferred |
| `showStackCount` | `capture("S-stack-count", 10)` | `chrome` | full rebuild | ? inferred |
| `stackIconAccent` | `capture("S-stack-accent", 10)` | `chrome` | full rebuild | ? inferred |
| `stackAutoCollapse` | `capture("S-stack-auto-collapse", 10)` | none (behaviour) | full rebuild | ok |
| `compactTabs` | `capture("S-compact-tabs", 10)` | `chrome` | full rebuild | ? partial |
| `showQuickTabNumbersOnTabs` | `capture("S-quick-tab-badge", 10)` | `chrome` | full rebuild | ok |
| `customIcons` tab/stack | `capture("S-custom-icon", 10)` | `chrome` | `refreshTabBarVisuals` | ok |
| `customColors` tab/stack | `capture("S-custom-color", 10)` | `chrome` | `refreshTabBarVisuals` | ok |

## Side tab strips (left and right)

| Setting | Capture command | Should invalidate | Observed | Status |
|---|---|---|---|---|
| `tabNameDisplay` | `capture("S-side-tab-names", 10)` | `panel` | in-place update | ok |
| `tabColorEnabled` + root colour | `capture("S-side-tab-accent", 10)` | `panel` | in-place update | ok |
| `tabIconPosition` | `capture("S-side-tab-icon-position", 10)` | `panel` | in-place update | ok |
| `compactTabs` | `capture("S-side-compact", 10)` | `panel` | in-place update | ok |
| `iconLibrary` | `capture("S-side-icon-library", 10)` | `panel` | rebuild on next open | ? inferred |
| `splitViewTabs` / `alternateSideTabs` | `capture("S-side-tab-order", 10)` | `panel` | strip rebuild | ok |
| `activeSplitTab` / `alternateActiveTab` | `capture("S-side-tab-switch", 10)` | `panel` | content only | ok |
| `reminderTabNotification` | `capture("S-reminder-badge", 10)` | `panel` (badge) | badge update | ok |

## Tree

| Setting | Capture command | Should invalidate | Observed | Status |
|---|---|---|---|---|
| `treeStyle` | `capture("S-tree-style", 10)` | `all` | `view:all` | ok |
| `compactTree` | `capture("S-compact-tree", 10)` | `all` | `view:all` | ok |
| `boldFolderNames` | `capture("S-bold-folders", 10)` | `all` | `view:all` | ? inferred |
| `sortBy`, `sortOrder` | `capture("S-sort", 10)` | `tree:structure` | `intent:tree:structure` | wired |
| `hiddenItems` | `capture("S-hide-item", 10)` | `tree:structure` | `intent:tree:structure` | wired |
| `showFilePreview` | `capture("S-file-preview", 10)` | `tree:structure` | `intent:tree:structure` | wired |
| `showFileInfoBar` | `capture("S-info-bar", 10)` | `tree:structure` | `intent:tree:structure` | wired |
| `showTaskProgress` | `capture("S-task-progress", 10)` | `tree:appearance` | `view:row` patches | wired |
| `enableFileExtensionNonMD` | `capture("S-extension-badge", 10)` | `all` | `view:all` | ok |
| `showTreeItemToolTips` | `capture("S-item-tooltips", 10)` | none until next build | `view:all` | ok |
| `quickAddIcon` | `capture("S-quick-add", 10)` | `all` | `view:all` | ok |
| `enableContextNotes` | `capture("S-context-notes", 10)` | `all` | `view:all` | ok |
| `showContextNotesInTree` | `capture("S-context-in-tree", 10)` | `all` | `view:all` | ok |
| `contextNoteHighlightStyle` | `capture("S-highlight-style", 10)` | `all` | `view:all` | ok |
| `customIcons`, `customColors`, `tagColors` (files) | `capture("S-file-appearance", 10)` | `tree:appearance` | `view:row` only | ok |
| `appearanceRules` | `capture("S-appearance-rules", 10)` | `tree:appearance` | `view:row` ×32 | ok |
| `enableSections`, `sectionCriterion`, `sectionPropertyName` | `capture("S-sections", 10)` | `tree:structure` | `view:all` / `view:tree` | ok |
| `autoCollapseTree` | `capture("S-auto-collapse", 10)` | none (listener) | `view:all` | ok |
| `reminderTreeIndicator` | `capture("S-reminder-indicator", 10)` | `all` | `view:all` | ok |

## Side panel shell and content

| Setting | Capture command | Should invalidate | Observed | Status |
|---|---|---|---|---|
| `sidePanelEnabled` | `capture("S-side-portals-off", 10)` | `all` | left collapses, right closes | ok |
| `secondaryPanelCollapsed` / `Height` | `capture("S-panel-size", 10)` | none (inline) | inline, no render | ok |
| `floatingButtonsCollapsed` | `capture("S-floating-collapsed", 10)` | `tree:structure` | `view:all` | ok |
| `clinicState` (filters, views, grouping) | `capture("S-clinic-state", 10)` | `panel` | `panel:clinic` only | ok |
| reminder display settings | `capture("S-reminder-panel", 10)` | `panel` | `intent:panel` | ok |
| journal settings | `capture("S-journal-panel", 10)` | `panel` | `intent:panel` | ok |
| `dateDisplayFormat` | `capture("S-date-format", 10)` | `panel` + tooltips | `view:all` | ok |

## How to run a row

```js
__portalsRender.enable()   // needs the dev recorder; see render-regression-matrix.md
capture("S-sort", 10)      // then change the setting while it records
__portalsRender.report()
```

Restart between rows that are read only at build time (icon library, tree style),
otherwise you cannot tell "applied immediately" from "applied on next rebuild".

## Known gaps

- `tabIconPosition` has no effect in icon-only mode by design: there is no label
  to reorder around.
- Settings that change row structure still need `view:all` or `view:tree`;
  `updateFileElement` only patches appearance and previews.
