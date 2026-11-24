# Settings → surface matrix

Every setting that changes what is on screen, what it should invalidate, and
whether it currently applies immediately. Use this as the test list.

Status: `ok` = verified, `?` = untested, `L` = left only, `R` = right only.

## Portal tab bar

| Setting | Should invalidate | Now | Status |
|---|---|---|---|
| `spaces` add/remove | `all` | full rebuild | ok |
| `tabBarOrder` | `chrome` | full rebuild | ok |
| `portalStacks` add/remove/collapse | `chrome` | full rebuild | ok |
| `tabNameDisplay` | `chrome` | full rebuild | ok |
| `tabColorEnabled` | `chrome` | full rebuild | ok |
| `tabIconPosition` | `chrome` | full rebuild | ok |
| `stackIconPosition` | `chrome` | full rebuild | ok |
| `hideStackNames` | `chrome` | full rebuild | ok |
| `showStackCount` | `chrome` | full rebuild | ok |
| `stackIconAccent` | `chrome` | full rebuild | ok |
| `stackAutoCollapse` | none (behaviour only) | - | ? |
| `compactTabs` | `chrome` | full rebuild | ok |
| `showQuickTabNumbersOnTabs` | `chrome` | full rebuild | ? |
| `customIcons` for a tab/stack | `chrome` | `refreshTabBarVisuals` | ok |
| `customColors` for a tab/stack | `chrome` | `refreshTabBarVisuals` | ok |

## Side tab strips (left + right)

| Setting | Should invalidate | Left | Right |
|---|---|---|---|
| `tabNameDisplay` | `panel` | ok | ok (fixed) |
| `tabColorEnabled` + root colour | `panel` | ok | ok (fixed) |
| `tabIconPosition` | `panel` | ok | **missing** |
| `compactTabs` | `panel` | ok | ok |
| `iconLibrary` | `panel` | ok | ok |
| `splitViewTabs` / `alternateSideTabs` | `panel` | ok | ok |
| `activeSplitTab` / `alternateActiveTab` | `panel` | ok | ok |
| `reminderTabNotification` | `panel` (badge) | ok | ok |

## Tree

| Setting | Should invalidate | Now | Status |
|---|---|---|---|
| `treeStyle` | `all` (row classes + heights) | full rebuild | ok |
| `compactTree`, `boldFolderNames` | `all` | full rebuild | ok |
| `sortBy`, `sortOrder` | `tree:structure` | full rebuild | ? |
| `hiddenItems` | `tree:structure` | `all` | ok |
| `showFilePreview`, `previewExcludedFiles` | `tree:structure` | `all` | ? |
| `showFileInfoBar` | `tree:structure` | `all` | ? |
| `showTaskProgress` | `tree:appearance` | `all` + manual refresh | ok |
| `showFileExtensionsNonMD` | `tree:appearance` | `all` | ? |
| `showTreeItemToolTips` | none (listeners on next build) | - | ? |
| `quickAddIcon` | `tree:structure` | `all` | ? |
| `enableContextNotes`, `showContextNotesInTree` | `tree:structure` | `all` | ? |
| `contextNoteHighlightStyle` | `tree:appearance` | `all` | ? |
| `customIcons`, `customColors`, `tagColors` | `tree:appearance` | `all` | ok |
| `appearanceRules` | `tree:appearance` | `all` | ? |
| `enableSections`, `sectionCriterion`, `sectionPropertyName` | `tree:structure` | `all` | ? |
| `autoCollapseTree` | none (listener) | - | ? |
| `reminderTreeIndicator` | `tree:appearance` | `all` | ? |

## Side panel shell and content

| Setting | Should invalidate | Now | Status |
|---|---|---|---|
| `sidePanelEnabled` | `all` | full rebuild | ok |
| `secondaryPanelCollapsed`, `secondaryPanelHeight` | none (inline) | inline | ok |
| `floatingButtonsCollapsed` | `tree:structure` | `all` | ? |
| `clinicState` (properties panel) | `panel` | panel rebuild | ? |
| `reminder*` display settings | `panel` | bus `panel` | ok |
| `journal*` settings | `panel` | bus `panel` | ok |
| `dateDisplayFormat` | `panel` + `tree:appearance` | `all` | ? |

## Test protocol

1. Restart Obsidian (so the setting is read fresh at build time).
2. Change one setting at a time.
3. Check each surface in the rows above, without switching tabs first.
4. Record: applied immediately / applied after a rebuild / not applied.
5. Any `?` that fails becomes a row in the phase 5 intent table.

Until the strip unification lands, treat every right-strip row as suspect:
that strip is still a separate implementation.