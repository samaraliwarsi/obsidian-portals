# Portals Plugin User Guide

Welcome to **Portals** – an Obsidian plugin to enhance user file navigation. This plugin enables users to pin any folder or tag as a customizable tab, a Portal into user selected folder/ tag trees. This guide covers every feature, from obvious buttons to hidden shortcuts. This guide is updated to **Version 1.1.6.**

---
## Installation

1. **Using BRAT (Beta Reviewers Auto-update Tester)**
	- Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from the Obsidian community plugins.
	- Open BRAT settings and click **Add Beta plugin**.
	- Enter the repository URL: `https://github.com/samaraliwarsi/obsidian-portals`.
	- Click **Add Plugin** – BRAT will download and enable the latest release. 

2. **Manual Installation**
	-  Download the latest release from the [releases page](https://github.com/samaraliwarsi/obsidian-portals/releases).
	- Extract the `manifest.json`, `styles.css` and `main.js` files into obsidian vault’s `.obsidian/plugins/obsidian-portals/` folder.
	- Enable the plugin in Obsidian settings.

---

>[!important] 
>fter setting the plugin up to desired customizations, please create a backup. The plugin is in active development and will go through several changes over time, it's advisable to keep a data backup. Users can do this two ways, 
> - Copy the `data.json` file at `.obsidian/Plugins/Portals` and save it at a secure location. 
> - Open `Settings → Portals`, scroll down to the **Backup/ restore** section and click on the `Export` button, save the file at a secure location. 

---
## Portal Tabs

Transform **folders** and **tags** into tabs at the top of the file pane.

1. **Adding a Portal**
	-  Open `Settings → Portals`. Scroll down to the **Portal tabs** section
	- Under **Add new portal**, click `Add`.
	- Choose **Root Folders**, **Sub Folders**, or **Tags**. 
- Select a folder or tag from the list and click `Add`. Once selected, the folder or tag will be greyed out.

> **Pin Vault Root** – enable in settings to pin obsidian vault’s root as a permanent tab on the left. Vault root will always be on the left, the setting of `Tab name display` will have no effect on it. 

2. **Reordering Tabs**
	- Drag and drop tabs with mouse (hold for a moment on touch devices).
	
3. **Active Tab Behaviour**
	 - The active tab is highlighted with a coloured bottom border. This color will be the theme accent color, or if `Tab colors` setting is enabled, match the color chosen by the user for this particular portal. 
	 - By default the active tab shows its name; users can change this in settings using `Tab name display`. Any tab names hidden using this setting will always show tooltips on mouse hover. Tooltips, as of now, are only available on desktop. 

---
## Customizations

The portal view can be customized in many ways, here we will explain each of them. 
### Replace file explorer
To make portals the default explorer when opening Obsidian, use the `Replace explorer in sidebar` setting inside the **Explorer settings** in `Settings → Portals`. This will ensure portals remains the focused view every time Obsidian reloads. The default Obsidian explorer will still be available via Obsidian tabs. 
### Colors
Each portal can have its own **icon** and **background color**. It can be applied to the tab's bottom border and/ or the entire file area, depending on user preferences.

- Go to `Settings → Portals`. 
- In the section of **Explorer Settings**, set user color preferences in `Tab colors` and `Background color type` options.
- Scroll down to **Portal tabs** section.
- Find enabled portals in the list (Root Folders, Sub Folders, or Tags).
- Click the icon displayed with the tooltip *Choose Icon*. Use the pop-up modal to choose from hundreds of icons from the embedded Phosphor icon set.
- Use the colour picker + opacity slider to set a background colour.

> The pinned vault root tab gets its own colour and a special left border showing its pinned status. 
### Tab Name Display
Users can control how tab names appear in `Tab name display` setting in the **Explorer settings**:
- Icons only – never show names; tooltip on hover.
- Show only active tab name – name appears only on the active tab.
- Show all tab names – always visible.
This setting applies to both the main tab bar and the side portal tabs.
### Compact Tree View
Compact tree view can help reduce the spacing between folders and file items. To enable, go to `Settings → Portals`, in the **Explorer settings**, find `Compact tree view`, turn it on/ off based on personal preferences. 
### Styles
Portals offers several visual styles for the file/tag tree. Choose a style in `Settings → Portals`, go to **Explorer settings** to open the dropdown options in `Styles`. The options are, 

| Style       | Description                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------- |
| **Default** | Standard Obsidian look with icons and borders.                                              |
| **Minimal** | No icons; uses `•` and `◦` for bullets, less spacing.                                       |
| **Boxed**   | Each folder has a rounded border; files have a subtle bottom border.                        |
| **Portals** | Left border accent lines on folders and files.                                              |
| **Shades**  | First‑level folders get progressively lighter gray backgrounds.                             |
| **Hues**    | First‑level folders get a rainbow gradient (cyan to pink) with opacity decreasing by index. |
### Background color type
Each portal tab can have its own color, transparency setting. The `Background color type` setting in **Explorer settings** can define if portal views have `No color`, `Solid` or `Gradient`. This setting will apply to all active tabs. 

> Note: these don't apply to side portal
### Tab colors 
Tab colors define whether the bottom border of an active tab, or the left border of the pinned tab will carry the user defined color respective to each active portal defined in **Active Tabs** section. It can be found in the **Explorer settings** inside `Settings → Portals`. 

When turned on, this setting extends into other sections as well, 
- User defined color of `Pinned vault` applies to active side portal tabs and journal buttons. 
- It applies to `Styles`, specifically to the file tree, recents and bookmarks in **Portals** style. 
### Bold Folder Names
This setting is available inside **Explorer settings** in `Settings → Portals`. It can help make the folders and tag groups stand out from the rest of the file items. 
### Active Dot
The files that are open in any editor tab show an accent color dot on the right hand side of each file. The same applies to the entire folder chain of the file open in the active editor tab. Inactive editor tabs do no show accent dot for folder chain. This is a default state and cannot be changed. Active dot also works in **Recents** in **Side Portal**.
### Extension Badge
Non-markdown files can display an extension badge. To turn this on, go to **Explorer settings** inside `Settings → Portals`, find the setting named `Show extension for non-markdown files`. The extensions are always shown on the right hand side of each file. Non-markdown files do not show `active dot` if the setting is enabled. When they're opened, the extension badge turns to accent color, serving the same purpose. 

---
## Side Portal

A collapsible, resizable panel at the bottom of Portals. To enable it, go to `Settings → Portals`, scroll down to **Side Portal** section and turn it on. In order to display the side portal, one of its views must be selected. 

**On Mobile** 
Mobile display of side portal may be affected by elements based on themes. On default obsidian, turn off the `Floating navigation` in `Appearance` settings on mobile. On other themes, depending on the CSS styling, side portal visibility on mobile may be affected. to various degrees. Users can opt to disable the **Side Portal** on mobile from settings. 

> Note: Side Portal works perfectly with [Baseline](https://github.com/aaaaalexis/obsidian-baseline) theme on mobile because the theme sends the vault selector to the top on mobile. Other themes that allow vault selector to be sent to top, on mobile, can also achieve the same. On desktop, some themes provide the option to hide the vault. That setting may visually conflict with side portal, its avoidable to turn off vault hiding. 

The tabs available to be displayed in **Side Portal** are* as described below. 
### Recent Files
- Shows the last 20 files opened in editor.
- Right‑click for context menu, Click to open.
- Updates live and shows active dot on all files open in the editor.
### Bookmarks
- Mirrors Obsidian’s built‑in bookmarks.
- Right‑click on any bookmark or group to delete.
- Supports folders (groups) and individual bookmarks (files, URLs). 

> Note: This supports display of groups already created in Obsidian bookmarks. Users must create a group in obsidian bookmarks. Once done, any file can be added to that group from Portals and will be displayed as a group in side portal bookmarks. 
### Folder Notes
A folder note is a markdown file with the **same name as the folder**, placed inside that folder. Folder notes side portal is a viewing mode for **Folder Note** feature. 
- To enable folder notes feature, go to `Settings → Portals`, scroll down to the **Folder Note** section and turn on `Enable folder notes`
- To enable Folder notes in side portal, go to `Settings → Portals`, scroll down to **Side Portal** section, press `Configure` and select the `Folder notes` tab. 

> Note: Folder notes as a feature can function without being displayed on the side portal. However, the folder note side portal tab will not display anything if the folder note feature is off. 

The folder note tab shows the folder note of the currently active portal (if it exists) and shows a notice, if it doesn't exist. 
- To create a folder note, use `Shift+Click` on any folder, or create from `Context Menu`. 
- The folders that have a folder note can be highlighted in two ways, using an accent color icon or an underline. To toggle this off, go to `Settings → Portals`, scroll down to the **Folder Note** section and choose `Folder note highlight type`
- `Cmd/Ctr+Click` on a folder to open an existing folder note in editor. If side portal tab of folder note is active, clicking anywhere inside that will also open the folder note. 
- Folder note tab view renders markdown, including embeds (up to 5 levels deep). 
- It supports [Dataview](https://github.com/blacksmithgu/obsidian-dataview) to help query the notes inside a folder. This needs the Dataview plugin, downloadable from community plugins or GitHub. 
- For users new to Dataview, some queries can be found in the file [Portals_FolderNote_Guide](https://github.com/samaraliwarsi/obsidian-portals/blob/main/templates/Portals_FolderNote_Guide.md). A quick start template is also available, [Sample_FolderNote](https://github.com/samaraliwarsi/obsidian-portals/blob/main/templates/Sample_FolderNote.md). Both files can be downloaded from GitHub. 
- Folders note tab in side portal is helped by a cache that saves the renders of last 10 used folder notes in side portal. This helps save the view scroll position and save on the need for re-rendering during tab switches. A limit of 10 is used to keep the cache size in check. 
- Users can choose if they want to see the folder note file inside a folder. To enable, go to `Settings → Portals`, scroll down to the **Folder Note** section and turn on `Show folder notes in a tree`. If `Enable folder notes` setting is off, all folder notes are displayed in file tree regardless of the other settings. 
- Note that bases preview is not supported as of now in folder notes. Bases markdown links are shown as clickable links right now, future updates will include bases preview support. 
### Journal
A dedicated side portal tab for sneak peak into daily notes. For it to work, users need to point it to their daily notes folder and select the correct date format. To do this, go to `Settings → Portals`, scroll down to the **Journal** section, set the date format used in their daily notes using `Journal date format` and select a `Journal folder`, it must be the same as daily notes folder. Users can type the path exactly or use the `Browse files` option to select from a modal.  When using the Daily Notes core plugin, and if the folder is the same as defined in core plugin settings, users can leave the `Journal folder` setting empty. 

> Note: The feature is designed to work with daily notes core plugin. While support is extended to other plugins/ methods of daily notes, the most reliable behaviour can be expected with the core plugin. 

The **Journal** side portal has two areas in display, 
#### File area
- This displays the note files inside the folder chosen in settings, or as defined by Daily Notes core plugin. It contains a button that can be toggled to display `All files`, `This month` or `This year` to filter between all the files in daily notes folder. 
- The files displayed here can be marked using `Right-Click` or `Long Press` (mobile). Marked files display a bottom border. 
#### Quotes
Quotes area is used to display snippets of text that user marks in their daily notes, in the dedicated folder as defined in settings or by daily notes plugin. The quotes are displayed using a 30 second timer and auto refresh. There are two buttons for this, 
##### Quote buttons
- **Random** – shows random quotes from all the daily notes available in the user pointed folder.
- **On this day** – shows quotes from the same day in all the months of the previous year, and on the same day and same month in previous 10 years. 
##### Marking Quotes
Quotes are extracted using a delimiter. Users must manually mark the snippets of text they wish to display, all their daily notes, using the set delimiter. The default delimiter used is ` == `.  Example: ` ==This is a quote== `. This is the same as default obsidian highlight syntax. Users can change the delimiter. To do this, go to `Settings → Portals`, scroll down to the **Journals** section and select from the dropdown list in `Quote delimiter`

> - Changes to quote delimiter, or journal folder require obsidian reload. 
> - Changes to quote delimiter will also require user to mark the files using their choice delimiter. 

---
## Custom Icons

Portals comes with Phosphor icon set embedded into the code, this works completely offline. Users can assign any Phosphor icon to:
- Individual files
- Folders
- Tag groups
### How to set/remove an icon
- Right‑click on the item → **Set custom icon** → choose an icon from the picker.
- If an icon is already set, the menu shows **Remove custom icon**.

---
## The Folder / Tag Tree differences

Folder and Tag trees exhibit certain differences. 

1. **Drag and Drop** : This is only available in folder trees and only on desktop. Drag and drop between portals is not available right now and planned for a future release. 
2. **Buttons** : Tag trees omit the `New Folder` button and display a `Tag group` button that can be used to add grouped separation to tag views based on secondary tags. 

### Important points about Folder trees
- Any folder can be added as a portal tab via `Settings → Portals`. 
- If the name of a folder that was added changes, the portal tab will not show any contents as portals are right now kept simply as direct paths. 
- For any issues faced during removing a portal that has been renamed/ deleted, use the `Clean up dead portals` options in **Maintenance and help** ad the bottom of settings page. 

### Important points about Tag trees
Tag trees can be added using the same method as folder trees via `Settings → Portals`. The view of a tag tree depends on the type of tag usage. 
- For users with **simple tags**, eg. `#Writing`, the tag trees will show a simple list of files matching their tags. 
- For users with **nested tags**, eg. `#Writing/Poetry`, the tag trees will display a folder tree style view with subtags being rendered in hierarchy.
- For users with **secondary tags**, eg. `Writing, Poetry`, the tag trees show an option to display `Tag groups` using a floating button of the same name. Toggle that button to open a modal, it lists the tags already in use alongside the main tag that forms the portal space. 
	- The word secondary is relative here. Both`Writing` and `Poetry` can be chosen to view as a portal tab and in that case the other one becomes secondary, to be opted in using `Tag groups`.
- Tag groups & nested tags/ subtags are displayed in the same file tree. Tag groups can be turned on and off, but nested tags always appear in the list, if files carry those tags. File drop downs in tag portal using # before a name are simple tags, the drop downs that appear without a # are subtags/nested tags. 
	- Nested tags or subtags cannot themselves be used as a portal space, or added as a group tag. This logic is maintained for simplicity. 
	- Files carrying subtags as well nested tags can appear at two places, in the nested dropdown as well as the tag group (if chosen). This is a viewing consistency, not a bug. 
- Tag names are linked directly to form portal tabs. If the name or spelling of a tag on a file changes, the file will not be populated in the tag view. 
---
## Renaming Portal Tabs
Portal tabs can have display name that doesn't need to match the folder or the tag name. Renaming only works in main portal tabs and not side portal. To set a **Display name*, 
- `Right-click` on an active portal, click on `Rename portal`, enter a name. 
- Display name can be reset using `Reset name`

---
## Foldable floating Action Buttons

Four buttons at the bottom‑left of the file panel (can be folded/unfolded into a single button via `Right‑Click`):

| Button                           | Icon          | Action                                                                                        |
| -------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| New Note                         | file-plus     | Create a new note in the current folder/tag space.                                            |
| New Folder (Folder portals only) | folder-plus   | Create a new subfolder.                                                                       |
| Tag groups (Tag portals only)    | funnel        | Open the **Tag groups** modal – choose which subtags appear as separate collapsible sections. |
| Sort files                       | carat-up-down | Change sorting (Name A→Z, Name Z→A, Created oldest/newest, Modified oldest/newest).           |
| Collapse/fold                    | stack         | Click to collapse all subfolders (root stays expanded). Right click to fold/ unfold icons.    |

> Collapse button has two functions: `Click` collapses the view, `Right-Click` folds/ unfolds the other 3 icons. Click to collapse works in both folded and unfolded state. 

---
## Right‑Click Context Menus

Right‑click on any file or folder in the tree to open a menu with actions:
### Files
- Open in new tab / split to the right
- Delete (moves to Obsidian trash)
- Duplicate
- Rename
- Set custom icon / Remove custom icon 
### Folders
- New note / new folder / new canvas
- Create folder note / Open folder note (if folder notes enabled)
- Delete / Duplicate / Rename
- Set custom icon / Remove custom icon
### Tag Groups (in tag portals)
- Set custom icon / Remove custom icon (applies to the entire group)

> The “Open folder note” and “Create folder note” options appear only when **Enable folder notes** is turned on in settings.

---
## Settings Overview

| Setting                                    | Description                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| **Replace file explorer**                  | Opens Portals in the left sidebar on startup.                                |
| **Compact tree view**                      | Reduces spacing to show more items.                                          |
| **Styles**                                 | Choose tree visual theme.                                                    |
| **Background color style**                 | How tab colours are applied to the file area (Gradient/Solid/None).          |
| **Tab colors**                             | Global toggle for tab border colours.                                        |
| **Bold folder names**                      | Makes folder names bold.                                                     |
| **Show extensions for non‑markdown files** | Displays a badge (e.g., `.PDF`) instead of a dot.                            |
| **Enable folder notes**                    | Master switch for all folder note features.                                  |
| **Show folder notes in file tree**         | If disabled, folder notes are hidden from the tree.                          |
| **Highlight folder notes**                 | Adds a coloured accent to folders that have a note.                          |
| **Side portal**                            | Enable/disable the bottom panel.                                             |
| **Choose side portals**                    | Select which tabs appear (Recent, Folder Notes, Bookmarks, Journal).         |
| **Disable side portal on mobile**          | Hides side portal on small screens.                                          |
| **Journal folder**                         | Folder where daily notes live.                                               |
| **Quote delimiter**                        | Symbols used to mark quotes, e.g, `double-equal(==)` or `double-asterix(**)` |
| **Pin vault root**                         | Always show the root as the first tab.                                       |
| **Backup / Restore**                       | Export/import all settings (including custom icons).                         |
| **Clean up dead portals**                  | Remove tabs for folders/tags that no longer exist.                           |
| **User Guide**                             | Opens this user guide on GitHub                                              |

---
## Troubleshooting & Tips

- **My custom icon disappeared after rename** – it should persist; if not, restart Obsidian.  
- **Journal quotes not showing** – ensure journal folder is set correctly and daily notes use the chosen delimiter.  
- **Side portal not visible** – check that `Side portal` is enabled and not disabled on mobile.  
- **Shift+Click doesn’t create folder note** – verify that folder notes are enabled in settings. 
- **Drag & drop not working on mobile** – Drag and drop is disabled on mobile for now to implement properly later on. Use context menu “Move to” instead.
- **Backup data file** - After setting the plugin up to desired customizations, please create a backup. The plugin is in active development and will go through several changes over time, it's advisable to keep a data backup. Users can do this two ways, 
	- Copy the `data.json` file at `.obsidian/Plugins/Portals` and save it at a secure location. 
	- Open `Settings → Portals`, scroll down to the **Backup/ restore** section and click on the `Export` button, save the file at a secure location. 

---
## Migration Guide
###  Important: Required for 1.1.1,  for users who are updating from any previous version (v1.1.0 or earlier)
The plugin ID has changed from `obsidian-portals` to `portals` to follow Obsidian's guidelines. User settings won't be updated automatically for this round. For users updating from an older version (1.1.0 or earlier), please follow these steps to migrate previous settings. There are two ways to do this, 
### Export/Import of json file
1. **Export** using the older version. Use the feature provided at the bottom of the settings page. Save the json file at a safe location.
2. **Unintall Portals**
3. **Reinstall** the latest version
4. **Import** using the newer version. Use the feature provided at the bottom of the settings page. Select a saved json file.

### Use Data File
1. **Close Obsidian** completely.
>2. **Navigate to vault's `.obsidian/plugins/` folder**.
>3. Find the old folder named `obsidian-portals`. Inside it, find the file `data.json` – this contains all the portal configurations.
>4. **Create a new folder** named `portals` in the same location (if it doesn't already exist).
>5. **Copy the `data.json` file** from the `obsidian-portals` folder into the new `portals` folder.
>6. (Optional) After confirming everything works, users may delete the old `obsidian-portals` folder.
>7. **Restart Obsidian** and enable the new plugin (`Portals`). User settings should now be restored.
>8. Users can prefer to start fresh – old settings will not be used automatically.

---
## Need More Help?

- Open an issue on [GitHub](https://github.com/samaraliwarsi/obsidian-portals/issues)
- Check the [README](https://github.com/samaraliwarsi/obsidian-portals) for updates

Happy navigating! 🚪✨