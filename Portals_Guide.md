# PORTALS PLUGIN USER GUIDE

Welcome to **Portals** – an Obsidian plugin to enhance user file navigation. This plugin enables users to pin any folder or tag as a customizable tab, a Portal into user selected folder/ tag trees. This guide covers every feature, from obvious buttons to hidden shortcuts. The guide is updated to **Version 1.4.1**

---
## INSTALLATION

1. **Using Community Plugins**
	- Enable community plugins: Go to Settings → Community plugins → Turn on community plugins
	- Install Portals: Click "Browse" → Search for "Portals" → Install

2. **Using BRAT (Beta Reviewers Auto-update Tester)**
	- Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from the Obsidian community plugins.
	- Open BRAT settings and click Add Beta plugin.
	- Enter the repository URL: `https://github.com/samaraliwarsi/obsidian-portals`.
	- Click Add Plugin – BRAT will download and enable the latest release. 

3. **Manual Installation**
	-  Download the latest release from the [releases page](https://github.com/samaraliwarsi/obsidian-portals/releases).
	- Extract the `manifest.json`, `styles.css` and `main.js` files into obsidian vault’s `.obsidian/plugins/portals/` folder.
	- Enable the plugin in Obsidian settings.

---
## GETTING STARTED

- Once installed, from `Community plugins`, find `Portals` and enable the plugin. 
- Open command palette `Cmd/Ctrl+P`, type and choose `Portals: Open Explorer`.
- This can also be done from the ribbon menu which will have an icon for portals after plugin is enabled. 

>After setting up plugin preferences, please create a backup. The plugin is in active development and will go through several changes over time, it's advisable to keep a data backup. Users can do this two ways:
> 	- Copy the `data.json` file at `.obsidian/plugins/portals/` and save it at a secure location. 
> 	- Open `Settings → Portals`, switch to the **Utilities tab** and click on the `Export` button, save the file at a secure location. 
> 	- Or turn on auto backups, new feature, refer to auto-backup section of this guide to understand how it works. 

>To enable full context menus with icons, turn off `Native menus` setting in Obsidian, found inside `Settings - Appearance`.

---
## ADD PORTAL TABS

Folders, tags can be added as portals in two ways,
1. **Add Portals using command palette.** - Press `Cmd/Ctrl+P` and type **Portals: Add portal tab**, this will trigger a modal to add folders or tags as Portals. Users can select multiple items using `Alt+click` and add them all in one go. 
2. **Add portals using settings**
	-  Open `Settings → Portals`. Switch over to the **Portal tabs** page. 
	- Under **Add new portal**, click `Add`.
	- Choose **Root Folders**, **Sub Folders**, or **Tags**. 
	- Select the folders or tags from the list and click `Add`. Once selected, the folder or tag will be greyed out. 
	- All active portals will be listed in settings in a collapsible list separated as Root folders, tags and subfolders.

> **Show Vault Root** – Root vault can only be added from settings. Enable in settings to show obsidian vault’s root as a tab. Vault root will always be on the left, the setting of `Tab name display` will have no effect on it. 
### Portal tab customisations 

**Reordering and context menu customizations**
- Drag and drop tabs with mouse (hold for a moment on touch devices).
- Use context menu on portal tabs to `Rename portal`, change color or icon.
 
 **Active Tab Behaviour**
- The active tab is highlighted with a coloured bottom border. This color will be the theme accent color, or if `Tab colors` setting is enabled, match the color chosen by the user for this particular portal. 
- By default the active tab shows its name; users can change this in settings using `Tab name display`. Any tab names hidden using this setting will always show tooltips on mouse hover. Tooltips, as of now, are only available on desktop. 

> Portal tab context menu will not show option to change color if `Tab colors` setting is off. Without that setting, the custom colors don't apply to tab bottom borders.
### Tab settings 

These settings are available in **Portal tabs** page of  `Settings → Portals`. 
#### Compact tabs
Compact tabs settings will reduce the spacing between tabs and the size of icons and names on tabs, stacks and side portals. 
#### Tab name display
Users can control how tab names appear in `Tab name display`. 
- Icons only – never show names; tooltip on hover.
- Show only active tab name – name appears only on the active tab.
- Show all tab names – always visible.
This setting applies to both the main tab bar and the side portal tabs.
#### Tab icon position
Choose if you want to display icons on left or right. This is relevant when `Tab name display` is not set to `Icon only`. This setting applies to both portal tabs and side portals. 
#### Tab colors
Tab colors define whether the bottom border of an active tab, or the left border of the pinned tab will carry the user defined color respective to each active portal defined in **Active Tabs** section. When turned on, this setting extends into other sections as well, specifically the defined color of `Pinned vault`,
- It applies to side portal tabs of Journal, Properties, Hidden etc. 
- It applies to `Styles`, specifically to the file tree, recents, hidden, properties and bookmarks with **Portals** style. 
#### Quick Tab Switcher
Assign a numeric shortcut (1–10) to any portal tab for rapid keyboard switching.
- `Right-click` a portal tab → **Quick switch tabs** → assign a number using the Quick switch tabs modal.
- Use command palette `Portals: Open portal <number>` or assign a hotkey (e.g., `Alt+1`) in Obsidian’s Hotkeys settings.
- Display the numeric badge on tabs: enable `Show quick tab badge` in `Settings → Portals` → **Portal tabs** page.

---
## STACK

Portal tabs can be catalogued into collapsible stacks. To create a stack, 
- `Right click` on a portal tab and select `Add to stack`. 
- This creates a stack with the same name as the portal. The name can be edited using context menu. 
- Once a stack is created more items can be added, removed from it using context menu. 
- `Delete stack` option in context menu, removes the stack and the contents appear as regular unstacked portals. 

### Stack settings
There are some settings available for stacks. To access them go to `Settings → Portals` and switch over to the **Portal tabs** page, go down to access the **Stacks** section. 
-  `Hide stack names` setting can change if the stacks appear with a name or just the icon. 
- `Stack icon position` setting can change the position of icon display on a stack from left to right.
- `Show stack count` is a dropdown that can help show number of portal tabs inside a stack. The number can be shown while closed, always or turned off using the dropdown. 
- `Colored stack icon` can have the stack icon displayed as the Obsidian accent color or custom color, if user has defined a custom color. 
- `Auto-collapse stacks` is a user setting that helps consolidate the view automatically, where one stack can collapse when another stack is opened. 

### Stack customizations

**Reordering stacks**
Stacks can be reordered by dragging with a mouse or touch. Stacks can be dragged to exchange positions with other stacks as well as unstacked portals. Portal tabs inside a stack can be rearranged inside the stack. 

> Stacks cannot be edited using drag, i.e. tabs inside the stack cannot be dragged outside, unstacked tabs outside cannot be dragged inside as of now. 

**Customizing stacks**
Stacks can have custom colors which will be used to define the border highlight and icon color, if `Colored stack icon` setting is on. Stacks can have custom names. To customize a tab, press `Right-click` on desktop or `Long press` on touch devices. Stack customizations don't depend on `Tab color` or `Background color type` settings, they can always be edited from `Right-click` context menu. Stack icon color however is affected by the `Colored stack icon` setting in **Stack** section inside the **Portals tab** page of `Settings → Portals`.

---
## EXPLORER SETTINGS

The portal view can be customized in many ways, here we will explain each of them. 
### Replace file explorer
To make portals the default explorer when opening Obsidian, use the `Replace explorer in sidebar` setting inside the **Explorer** page in `Settings → Portals`. This will ensure portals remains the focused view every time Obsidian reloads. The default Obsidian explorer will still be available via Obsidian tabs. 
### Compact tree view
Compact tree view can help reduce the spacing between folders and file items. To enable, go to `Settings → Portals`, in the **Explorer** page, find `Compact tree view`, turn it on/ off based on personal preferences. 

### Styles
Portals offers several visual styles for the file/tag tree. Choose a style in `Settings → Portals`, go to **Explorer** page to open the dropdown options in `Styles`. The options are, 

| Style       | Description                                                                                 | Custom colors application                                            |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Default** | Standard Obsidian look with icons and borders.                                              | Folder summary background color + folder children dashed left border |
| **Minimal** | No icons; uses `•` and `◦` for bullets, less spacing.                                       | Folder name + folder children dotted left border                     |
| **Boxed**   | Each folder has a rounded border; files have a subtle bottom border.                        | Border bottom + solid folder children left border                    |
| **Portals** | Left border accent lines on folders and files.                                              | Folder summary left border (if `Tab colors` setting is off)          |
| **Shades**  | First‑level folders get progressively lighter gray backgrounds.                             | None                                                                 |
| **Hues**    | First‑level folders get a rainbow gradient (cyan to pink) with opacity decreasing by index. | None                                                                 |
### Background color type
Each portal tab can have its own color, transparency setting. The `Background color type` setting in **Explorer settings** can define if portal views have `No color`, `Solid` or `Gradient`. This setting will apply to all active tabs. 

> These don't apply to side portal. 

### Bold Folder Names
This setting is available inside **Explorer** page in `Settings → Portals`. It can help make the folders and tag groups stand out from the rest of the file items. 

---
### Extension Badge
Non-markdown files can display an extension badge. To turn this on, go to **Explorer** page inside `Settings → Portals`, find the setting named `Show extension for non-markdown files`. The extensions are always shown on the right hand side of each file. Non-markdown files do not show `active dot` if the setting is enabled. When they're opened, the extension badge turns to accent color, serving the same purpose. If the setting for `Extension badge for non-markdown files` is on, the file's own extension (eg. `.pdf`) will be hidden from the filename. If the setting is off, the extension remains visible. 

---
### Quick-Add buttons
Quick-add buttons are enabled by a user setting `Quick-add icons` can be turned on in `Settings → Portals`. They allow users to create new folders or notes inside a target folder in a folder space. For tag space, only quick add new note is added, and it creates files with the tag of the space it was created in. The setting can be kept off, it can be used on `Desktop only` mode (hover to reveal), or kept active for all devices. Hover is not available on mobile, the icons are visible normally. 

---
### File Preview
Markdown files can display a content snippet below the filename in the file tree. To enable, go to `Settings → Portals` → **Explorer** page and turn on `Show file preview`. 
- Previews show file tags in folder spaces, and folders in tag spaces, if `Show file info bar` is enabled in **Explorer settings**.
- Toggle preview per file using the hover icon or via multi-select toolbar using the `Toggle preview` action. Preferences of per file collapse and expand are stored in user data.json.
- If a file has no content, no preview appears.
- Disable globally using the setting or command palette, `Portals: Toggle file previews in explorer`. Users can add it to hotkey using Obsidian settings.
---
### File & Header Tooltips
These can be enabled via `Settings → Portals` → **Explorer** page → `Show tree item tooltips`.

**File tooltips**
On desktops, when hovering over a file, a tooltip can show word count, last modified date, and full filename (if truncated by side panel width constraints).  This is limited to markdown files. Non-markdown files only display full filename (if truncated by side panel). The word count and last modified stats are limited to markdown files. 

**Header (folder/tag) tooltips**
On desktops, when hovering a folder or tag, a tooltip can show number of items inside, and the full name (if truncated by side panel width constraints). 

---
### Sections
Organise folders or tags into collapsible section breaks.  
- Enable sections via `Settings → Portals` → **Explorer** page → `Enable sections`, or using command palette `Portals: Toggle sections in explorer`.
- Use the new **Sections** floating button (appears near the sort button, if sections are enabled) to define section rules:
    - **Properties** – group by a frontmatter property. In this option, use `Right‑click` to search available properties.
    - **Extensions** – group by file extensions.
    - Create new properties to use for grouping with **Sections**.
- Each section respects the current sort order. Use hover icons on section headers to reposition sections up or down.
- Sections can display different information on each portal space, with different properties, different orders based on user choices.

---
## SIDE PORTALS

A collapsible, resizable panel at the bottom of Portals. To enable it, go to `Settings → Portals`, switch to **Side Portal** page and turn it on. In order to display the side portal, one of its views must be selected. Side portals can be reordered using drag and reorder. 

**On Mobile** 
Mobile display of side portal may be affected by elements based on themes. On default obsidian, turn off the `Floating navigation` in `Appearance` settings on mobile. On other themes, depending on the CSS styling, side portal visibility on mobile may be affected to various degrees. Users can opt to disable the **Side Portal** on mobile from settings. 

> Note: Side Portal works perfectly with [Baseline](https://github.com/aaaaalexis/obsidian-baseline) theme on mobile because the theme sends the vault selector to the top on mobile. Other themes that allow vault selector to be sent to top, on mobile, can also achieve the same. On desktop, some themes provide the option to hide the vault. That setting may visually conflict with side portal, it's better to turn off vault hiding. 

> **Commands** – Every side portal (Recent, Bookmarks, Context Notes, Journal, Hidden, Properties, Trash) has a command palette action. Use `Portals: Open <name>` to switch to that side portal. If it’s disabled, the command will enable it first.

The tabs available to be displayed in **Side Portal** are as described below. 

---
### Recent
- Shows the last 20 files opened in editor.
- Right‑click for context menu, Click to open.
- Updates live and shows active dot on all files open in the editor.
- Supports custom colors and icons for files as set by user. 

---
### Bookmarks
- Mirrors Obsidian’s built‑in bookmarks.
- Right‑click on any bookmark or group to delete.
- Supports folders (groups) and individual bookmarks (files, URLs). 

> Note: This supports display of groups already created in Obsidian bookmarks. Users must create a group in obsidian bookmarks. Once done, any file can be added to that group from Portals and will be displayed as a group in side portal bookmarks. 

---
### Context Notes

#### Overview
A context note is a markdown file with the *same name* as the folder or tag it was created from. It's placed inside the folder it was created from (if it belongs to a folder) or inside a dedicated, user defined folder (if it belongs to a tag). Context notes side portal is a viewing mode for **Context Note** feature. Please note that context notes is an expansion of the initial feature of folder notes which has changed in 1.2.0 and onwards to support both tags and folders, hence the name update. 
- To enable context notes feature, go to `Settings → Portals`, switch to the **Side Portal** page and scroll down to the **Context Note** section and turn on `Enable context notes`
- To view context notes in side portal, go to **Context notes** section in `Settings`,  press `Configure` and select the `Context notes` tab. This can also be done using command palette, `Cmd/Ctrl+P` and type *Configure side portals*, or using `Right click` on the triangular collapse button on the side portal collapsible window. 

> Context notes as a feature can function without being displayed on the side portal. However, the context note side portal tab will not display anything if the context note feature is off. 
#### Important Points
The context note tab shows the associated context note of the currently active portal, if it exists. If it doesn't exist, it shows a notice. Here are some important details about context notes feature, 
- Click anywhere inside side portal tab to open the context note in a new tab. 
- Context note tab view renders markdown, including embeds (up to 5 levels deep). 
- It supports [Dataview](https://github.com/blacksmithgu/obsidian-dataview) to help query the notes inside a folder. This needs the Dataview plugin, downloadable from community plugins or GitHub. For users new to Dataview, some queries can be found in the file [Portals_ContextNote_Queries](https://github.com/samaraliwarsi/obsidian-portals/blob/main/templates/Portals_ContextNote_Queries.md). A quick start template is also available, [Sample_ContextNote](https://github.com/samaraliwarsi/obsidian-portals/blob/main/templates/Sample_ContextNote.md). Both files can be downloaded from GitHub. 
- Context note tab in side portal is helped by a cache that saves the renders of last 20 used context notes in side portal. This helps save the view scroll position and save on the need for re-rendering during tab switches. A limit of 20 is used to keep the cache size in check. 
- Note that bases preview is not supported as of now in context notes. Bases markdown links are shown as clickable links right now, future updates will include bases preview support. 
- Note that all context notes related to tags are created automatically to have the same tag in their frontmatter. For subtags (For example `Writing/Fiction` the tag is created as `Writing--Fiction`. This tag must not be removed for it to correctly displayed in context note side portal or transferred to a different folder in case migrate folder option is chosen. 
- If context notes is disabled, the listeners, helpers, cache that help the feature are also turned off, making Portals somewhat lighter for users who don't prefer to use Context notes. 
#### Context note shortcuts
- To create a context note, use `Shift+Click` on any folder or tag, or create from `Context Menu`. If a context note already exists for the target folder, the key combo opens the context note in the current active tab. 
- `Cmd/Ctrl+Click` on a folder or a tag to open an existing context note in a new tab. 
#### Context note highlight type 
The folders & tags that have a context note can be highlighted in two ways, using an accent color icon or underline. To toggle this, go to `Settings → Portals`, switch over to **Side portal** page, scroll down to the **Context Note** section and choose `Context note highlight type`. Context note highlight of icon color is affected by `Tab colors` setting, making each portal capable of displaying a unique color as defined by user preferences. 
#### Open context notes from Icon
Context notes can also be directly opened from the icon (apart from shades and minimal style as they don't show icons). To do this, go to `Settings → Portals`, switch to **Side Portal** page, scroll down to **Context notes** section and turn on `Open context notes from icon`. 
#### Tag notes dedicated folder 
All context notes related to tags are saved in a dedicated folder called `_Tag notes` by default. Since tags aren't folder spaces, this has been opted as a storage folder for it, so as to keep the folder views clean of tag related context notes. If users decide to change this feature, it can be done from the `Tag notes folder` setting. Set your desired folder, type the name or choose from the `Browse` list. Once selected, it is important to press the red `Migrate` button to move the available tag related context notes into the new folder. 
#### Show context note in file tree 
Users can choose if they want to see the context note file inside a folder or a tag tree. To enable, turn on `Show context notes in file tree`. If `Enable context notes` setting is off, all context notes are displayed in file tree regardless of the other settings. 
#### Show closest context note

**For Folders**
When the `Show closest context note` is enabled the context note side portal will show the context note of the parent folder of the active file. If no context note exists in the parent folder, it will look one level upwards, walking up all till the portal space or root. If none exist, it will fallback to showing the portal tab's context note. 

**For Tags**
Tag portals and hierarchy is different from folders. Tags don't have a defined *Main* (a folder's main is clear using hierarchical tree), example a file can have `Writing` tag, a `Fiction` tag and a `Writing/in-progress` tag. It can be opened in a space of `Writing` as well as `Fiction` and both portal spaces can open the other tag as a `Group tag`. For this reason, defining a main for tags is tricky and depends on user configuration. For this reason, the `Show closest context note` setting for tags is implemented differently. A file open will show its nearest relative context note within the bounds of the active portal tab. When the active tab changes, and even if the file open is the same, it'll fall back to the context note of the active portal tab. Active portal tab in tag spaces is used as the hook to set context. This is a W.I.P feature which will evolve with user feedback. 

> To track what's being displayed, a status overlay option has been added to the dropdown setting to show what's being displayed.

#### New folder with context
This is a context menu option available in folder spaces. Users can trigger the creation of a folder using this setting. The new folder acquires the selected file as a context note, inherit its custom color and icon (if defined).

---
### Journal
A dedicated side portal tab for sneak peak into daily notes. For its consistent performance, users need to point it to their daily notes folder and select the correct date format. To do this, go to `Settings → Portals`, switch to the **Side portal** page, scroll to the **Journal** section, set the date format used in their daily notes using `Journal date format` and select a `Journal folder`, it must be the same as daily notes folder. Users can type the path exactly or use the `Browse folders` option to select from a modal.  When using the Daily Notes core plugin, and if the folder is the same as defined in core plugin settings, users can leave the `Journal folder` setting empty. 

> [!info]
> 1. The feature is designed to work with daily notes core plugin. While support is extended to other plugins/ methods of daily notes, the most reliable behaviour can be expected with the core plugin. 
> 2. Date format matching, is critical. While the plugin is designed to use fall back date create time, its output can be inaccurate in quotes and file sorting. Hence, if date format does not match **all markdown files** in the `Journal folder`, there are two levels of warnings 
> 	- A warning inside the journal. 
> 	- Further, if there are files that match the date but have other texts, a console debug message will be generated, highlighting the specific files that mismatch. To view it, users can go to console using `Cmd+Alt+i` on MacOS or `Ctrl+Shift+i` on Windows, and turn on verbose logging. 
> 3. Once `Journal date format` setting is applied correctly, or files are renamed to match that setting, the warnings will go away. 

The **Journal** side portal has two areas in display, 
#### File area
- This displays the note files inside the folder chosen in settings, or as defined by Daily Notes core plugin. It contains a button that can be toggled to display `All files`, `This month` or `This year` to filter between all the files in daily notes folder. 
- The files displayed here can be marked using `Right-Click` or `Long Press` (mobile). Marked files display a bottom border. 
#### Quotes
Quotes area is used to display snippets of text that user marks in their daily notes. These notes must be in the dedicated folder as defined in settings or by Daily Notes core plugin. The quotes are displayed using a 30 second timer and auto refresh. There are two buttons for this, 
##### Quote buttons
- **Random** – shows random quotes from all the daily notes available in the user pointed folder.
- **On this day** – shows quotes from the same day in all the months of the previous year, and on the same day and same month in previous 10 years. 
- **Marked files** – All quotes from marked notes appear here.
##### Marking Quotes
Quotes are extracted using a delimiter. Users must manually mark the snippets of text they wish to display, across all their daily notes using the set delimiter. The default delimiter used is ` == `.  Example: ` ==This is a quote== `. This is the same as default obsidian highlight syntax. Users can change the delimiter. To do this, go to  the **Journal** section of settings, and select from the dropdown list in `Quote delimiter`

> - Changes to quote delimiter, or journal folder require an Obsidian restart. 
> - Changes to quote delimiter will also require user to mark the files using their choice delimiter. 
##### Quote indicator 
Quote indicator can help users figure out if and which of their files carry wrong delimiters or which carry the correct delimiters, based on the user settings. It can help in situations where users decide to change their delimiters. It provides a visual feedback for what files are successfully adding to the quote system and what files are not, without opening the files. The quote indicator dropdown provides a few choices, 
- Show a quote icon on the journal cards for daily notes that have quotes being extracted successfully. 
- Show a warning on journal cards for daily notes that have quotes but with wrong delimiter, which means quotes not extracted. 
- Show both and show none. 
Users can turn this on from `Settings → Portals`, switch to **Side Portal** page, scroll down to **Journal** section and use the dropdown on `Show quote indicator on date cards`. 
##### Default tab
Choose which Journal tab opens by default (All, Random, On this day, Marked) in `Settings → Portals` → **Side Portal** page → `Journal default quote tab`.

---
### Hidden
**Hidden** is a side portal that shows a list of items (files, folders, tags) that appear in the portal view. 
- Use the context menu to hide anything. Hiding a folder/ tag will also hide its contents. However, for a hidden tag, its content file can still appear on another folder. 
- Unhide options are available inside the Hidden side portal. Side portal also shows the type of item that was originally hidden, helping categorise items incase tags and folders share the same name. 
- Tag groups cannot be hidden, the feature is not enabled on them as they can be turned off using the `Tag groups` button. 

---
### Properties
 **Properties** is a side portal to browse and sort markdown files by properties. The main features are as follows:
 
#### Dropdowns
 - The Property filter dropdown contains a list of all available frontmatter properties in markdown files of the vault. It can also display files with no front matter. 
- The Value filter dropdown can help further narrow down to sort by specific values of properties selected. Value button needs some property to be selected. 

#### Search Mode
- Both property filters have a search mode. To enable search, use `Right-click` on either dropdown buttons and type your input to reveal suggested entries from all the available ones. 

#### Preferences & options
- User preference to show the count of files queried and the option to show the value badge on files in the list. 
- Click the filtered count badge (if `Hide filtered count` is off) to open a sorting menu. Sort by property value (A→Z, Z→A) or by file count.
- This side panel supports multi-select using `Alt+click` or `Swipe-right` on mobile. For range select, use `Alt+Shift+Click`, Multi-select options are done using multi-select toolbar for portal which has the option for bulk editing front matter properties or reset colors. Future updates will have more multi-select options available here. 
- Property panel pauses updates while **Frontmatter editing** modal is open so that all updates can be bulk rendered in one go. This helps performance when editing large number of files. Once modal closes, the panel renders to show updated state.
- **Cache** - Property browser works on a cache system so it lazy-loads its data listening to actual changes in file frontmatter, file create, delete, rename etc functions. 

---
### Trash
 The trash side portal is for files and folders that are sent to Obsidian's native trash folder, the `.trash/` folder at root of your vault. Trash side portal works if the `Deleted files` setting in Obsidian is set to `Move to obsidian trash`. Users can manage trash items - delete/ restore individually or Empty all/ Restore all. An easy way to manage trash without leaving Obsidian app. 

---
## MORE FEATURES
### Custom colors for files, folders and tags

**Custom colors** apply to summary, details of folders, tag groups, subtags depending upon the chosen style, and to the text of the file items. To set a custom color, `Right-click` to open context menu, choose your color and desired opacity from the modal and save. User preferences set here will be saved in the data file. In the styles section, it is described how custom colors apply differently to each style. User set colors in one style are consistent across custom color activated styles, i.e. users can switch styles and the colors will continue as chosen. 

> [!Note] 
> - Custom colors do not apply to the `Shades` and `Hues` style as they carry their own gradients and hues which are set based on the total number of folders/ tag groups/ subtags. Context menu option for changing colors on those styles is disabled. 
> - Custom colors do not apply when the style is `Portals` and the setting `Tab colors` is turned on. Tab colors applies the color of the portal space to the folder, tag or group summaries in a space. 

---
### Custom Icons

Portals comes with both Phosphor and Lucide icon sets. Phosphor icon set is embedded into the code, Lucide icon set is called using Obsidian. Both work completely offline. Users can assign any icon to files, folders, tags, group tags, subtags, stacks and portal tabs. User preferences are saved based on library and icon name.
#### How to set/remove an icon
- `Right‑click` on the item → **Set custom icon** → choose an icon from the picker.
- If an icon is already set, the context menu shows **Remove custom icon**.

> 1. Since there are no icons in the styles `Shades` or `Minimal`, the context menu options for icon change in those are muted. This doesn't change user set preferences of icons per folder/ file/ tag group/ subtag. 
> 2. For plugin hardcoded icons, use the `Plugin icon library setting` in **Utilities** page to switch between Phosphor and Lucide. This doesn't affect custom icons for user, both sets can be used simultaneously for that. 
> 3. Icon modal contains a **Favorites** tab. Users can add to that from both libraries for quicker access to their preferred icons. 

---
### Active Dot
The files that are open in any editor tab show an accent color dot on the right hand side of each file. The same applies to the entire folder chain or tag tree chain of the file open in the active editor tab. Inactive editor tabs do not show active dot for folder or tag chain. This is a default state and cannot be changed. Active dot also works in **Recents** in **Side Portal**. Active dot's color syncs with the `Tab colors` setting, using which each portal tab can display a different color of the dot, as defined by user's portal tab colors. 

---
### Custom reordering for folders and tags
All folders, tags and their portals have a context menu option of `Reorder items`. This applies to sub-folders, subtags and group tags of the item from which the context menu was triggered. `Reorder items` triggers a modal that displays the active folders, tags, groups that exist under the header and allows them to be reordered using drag and reorder. For Portal spaces, this can be triggered directly from command palette, using `Portals: Reorder folders/tags`. The reorder settings chosen persist across the vault, i.e. edits made in `Folder/subfolder` portal space would also show the same way in edits made at `Folder/` portal space or root (`/`) portal space. 

---
### Frontmatter editing
Portals includes a frontmatter editor starting version 1.2.5. This can be used to edit the tags, properties of single files as well as bulk editing. The modal supports adding, removing existing values as well as adding  new values from directly inside the modal. Frontmatter editor has four sections with dropdown pickers, input areas etc,

#### Existing & custom properties

**Property**
This is where users can set the property. It has a dropdown to list available entries. `Right-click` on the dropdown can enable search of available properties. Below that is direct text input which can be used to enter new properties. 

**Type**
This is a toggle that is important when setting new custom properties or values. It has options to suggest the type of inputs such as `string`, `number`, `date`, `datetime`, `list`. As of now the options are the ones available in native obsidian. Type toggle updates is ignored when setting properties from the list, the save function simply applies the existing type to the file. 

**Value**
Users can select the values from the list of dropdown, search using `Right-click` for available values or create custom values using the text input area. For values to function, a property must be selected or created. In case of editing date, and datetime, the value function shows an option of `Today` which adds system date or system date and time, respectively. 

#### YAML Section

In this part users can directly apply YAML to the markdown files. Simply press `Copy from file` to load the YAML into the text area, copy it using keyboard shortcuts or context menu. Then select the file or list of files you want to apply the same YAML to, Paste the copied YAML into the text area and press `Paste to files` button. 

**Important points**
- Please note that the YAML parser supports **only flat key-value pairs and simple, one-level lists**. For nested YAML, the frontmatter editor may fail and give errors so it is ideal to use Obsidian's built-in editor for those. 
- YAML editing works through `Copy from file`, `Paste to files` buttons only. The buttons at the bottom, i.e. for `Save` and `Remove` are for properties selected through dropdown or for custom properties. 
- The `Clear all` button inside YAML section can be used to clear every frontmatter property from the files selected. 
- For individual files use the frontmatter editor from context menu. For multiple files, make sure to use the frontmatter editor from multi-select toolbar. 
 
---

### Foldable floating Action Buttons
Four buttons at the bottom‑left of the file panel (can be folded/unfolded into a single button via `Right‑Click`):

| Button                           | Icon          | Action                                                                                        |
| -------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| New Note                         | file-plus     | Create a new note in the current folder/tag space.                                            |
| New Folder (Folder portals only) | folder-plus   | Create a new subfolder.                                                                       |
| Tag groups (Tag portals only)    | funnel        | Open the **Tag groups** modal – choose which subtags appear as separate collapsible sections. |
| Sort files and folders           | caret-up-down | Change sorting (Name A→Z, Name Z→A, Created oldest/newest, Modified oldest/newest).           |
| Collapse/fold                    | stack         | Click to collapse all subfolders (root stays expanded). Right click to fold/ unfold icons.    |

> Collapse button has two functions: `Click` collapses the view, `Right-Click` folds/ unfolds the other 3 icons. Click to collapse works in both folded and unfolded state. A tooltip related to this is set to display once per session on hover, after which the collapse button shows its regular tooltip. 

> Sort button works primarily on files. Folders, over the course of sync, backup and system explorer level changes can lose the modified and created status. So the sort for folders using created, modified times may not work as reliably. 

---
### Page Preview 
Portals supports Obsidian's native page preview core plugin. If enabled, all supported files anywhere across the plugin (except in **Trash**) will show hover preview using `Cmd/Ctrl` key. In **Context notes** side portal, direct typed links are supported as of now. Page preview also supports dataview queried links in context notes side portal.  

---
### Multi-select files and folders
Multi-select is available for files, folders and tags. This feature works through a pop-out multi toolbar attached  at the bottom of the file container. All actions related to the feature will be available in the pop-out toolbar and not in context menu. 
- Use `Alt+Click` on desktop or `Swipe-right`  on touch devices to select multiple files or folders. 
- Use `Alt+Shift+Click` to select all items in a range of two items clicked on. 
- The current actions available in multi-select toolbar are `Delete`, `Move`, `Create folder using selected`, `Hide`, `Reset colors`, `Reset icons` and `Deselect`. These actions are available depending on the types of items selected using multi-select.

> Note: Context menu on multi-select still acts on the first selected file or folder.  So make sure to use actions in multi-select toolbar. 

---

### Context menu options
#### Portal Tabs/ stacks context menu actions
 - Renaming Portal tabs
 - Change Portal tab icon
 - Change portal tab color
#### Files
- Open in new tab / split to the right
- Delete (moves to Obsidian trash)
- Duplicate
- Rename
- Set custom icon / Remove custom icon 
- Set custom color / Reset custom color
#### Folders
- New note / new folder / new canvas
- Create context note / Open context note (if context notes enabled)
- Delete / Duplicate / Rename
- Set custom icon / Remove custom icon
- Set custom color / Reset custom color
- Hide
#### Tags
- Set custom icon / Remove custom icon (applies to the entire group)
- Hide
- Create context note / Open context note (if context notes enabled)
- Set custom color / Reset custom color

---
### Command palette actions
The actions available with command palette are as follows:

| Commands                        | Effect                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open explorer                   | Enables portals view. Important for loading the plugin post first install or after disabling portals view.                                           |
| Add portal tabs                 | Opens the Add portal modal, used for configuring portal tabs from folders, tabs or subfolders.                                                       |
| Remove portal tabs              | Helps remove existing portal tabs from view.                                                                                                         |
| Configure side portals          | Opens the side portal modal, used to configure side portal tabs.                                                                                     |
| Reorder folders/ tags           | Opens reorder modal to rearrange summary items (not files) on portal level. For subfolders, call the same from context menu.                         |
| Bulk frontmatter edit           | Needs at least one file selected using multi-select. Opens the frontmatter editor modal.                                                             |
| Open guide                      | Opens this guide in a web viewer page on GitHub.                                                                                                     |
| Toggle sections                 | Enables or disables sections in explorer.                                                                                                            |
| Toggle file previews            | Enables or disables file previews in explorer.                                                                                                       |
| Switch root vault portal tab    | Switches to the root folder portal (pinned root from settings), if enabled.                                                                          |
| Stack all unstacked portal tabs | Stacks all unstacked portal tabs into a new stack.                                                                                                   |
| Switch to previous portal       | Switches back to the last open portal.                                                                                                               |
| Open Portal {n}                 | Works with quick switch tabs. 10 portals can be assigned here, making it 10 commands, and called using hotkeys. Allows quick switching between tabs. |
| Open {side portal name}         | Open any side portal directly from commands. Plugin packs seven individual commands to cover all existing side portals.                              |

---
## IMPORTANT POINTS
### About Folder trees
- Any folder can be added as a portal tab via `Settings → Portals`. 
- If the name of a folder that was added changes, the portal tab will not show any contents as portals are right now kept simply as direct paths. 
- For any issues faced during removing a portal that has been renamed/ deleted, use the `Clean up dead portals` options in **Maintenance and help** at the bottom of settings page. 
-  **Drag and Drop** : This is only available in folder trees and only on desktop. Drag and drop between portals is not available right now and planned for a future release. 
### About Tag trees
Tag trees can be added using the same method as folder trees via `Settings → Portals`. The view of a tag tree depends on the type of tag usage. 
- For users with **simple tags**, eg. `#Writing`, the tag trees will show a simple list of files matching their tags. 
- For users with **nested tags**, eg. `#Writing/Poetry`, the tag trees will display a folder tree style view with subtags being rendered in hierarchy.
- For users with **secondary tags**, eg. `Writing, Poetry`, the tag trees show an option to display `Tag groups` using a floating button of the same name. Toggle that button to open a modal, it lists the tags already in use alongside the main tag that forms the portal space. 
	- The word secondary is relative here. Both`Writing` and `Poetry` can be chosen to view as a portal tab and in that case the other one becomes secondary, to be opted in using `Tag groups`.
- Tag groups & nested tags/ subtags are displayed in the same file tree. Tag groups can be turned on and off, but nested tags always appear in the list, if files carry those tags. File drop downs in tag portal using # before a name are simple tags, the drop downs that appear without a # are subtags/nested tags. 
	- Nested tags or subtags cannot themselves be used as a portal space, or added as a group tag. This logic is maintained for simplicity. 
	- Files carrying subtags as well nested tags can appear at two places, in the nested dropdown as well as the tag group (if chosen). This is a viewing consistency, not a bug. 
- Tag names are linked directly to form portal tabs. If the name or spelling of a tag on a file changes, the file will not be populated in the tag view. 
- **Buttons** : Tag trees omit the `New Folder` button and display a `Tag group` button that can be used to add grouped separation to tag views based on secondary tags. 

---
## SHORTCUTS & QUICK ACTIONS OVERVIEW

| **Shortcut**         | **Target**        | **Action**                                                                                                          |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Cmd/Ctrl+Click`     | File              | Opens a file in a new tab.                                                                                          |
| `Cmd/Ctrl+Click`     | Folder/ Tag       | Opens the context note of a folder or a tag in a new tab, if it exists.                                             |
| `Shift+Click`        | File              | Opens a file in a vertical split tab.                                                                               |
| `Shift+Click`        | Folder/ Tag       | Opens the context note of a folder or a tag in the same tab.                                                        |
| `Mouse middle-click` | File              | Opens the file in a new tab.                                                                                        |
| `Alt-click`          | File/ Folder/ Tag | Toggles multi-select on, renders the multi-select toolbar.                                                          |
| `Alt+Shift+click`    | File/ Folder/ Tag | Selects all items between the range of two mouse clicks, toggles multi-select on, renders the multi-select toolbar. |
| `Swipe-right`        | File/ Folder/ Tag | Mobile devices. Toggles multi-select on or off, renders the multi-select toolbar.                                   |
| `Cmd/Ctrl+Hover`     | File              | Page preview, if Obsidian core plugin Page Preview is on.                                                           |

---
## SETTINGS OVERVIEW

###### Explorer > EXPLORER PAGE

| Setting                                | Description                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Replace file explorer                  | Opens Portals in the left sidebar on startup.                                                                        |
| Compact tree view                      | Reduces spacing to show more items.                                                                                  |
| Styles                                 | Choose tree visual theme.                                                                                            |
| Background color style                 | How tab colours are applied to the file area (Gradient/Solid/None).                                                  |
| Bold folder names                      | Makes folder names bold.                                                                                             |
| Show extensions for non‑markdown files | Displays a badge (e.g., `.PDF`) instead of a dot.                                                                    |
| Quick add icons                        | Choose how to display quick add icons on folder/ tag summaries in file tree.                                         |
| Show file tooltips                     | Shows file tooltips of word count, last modified and file name, if truncated.                                        |
| Show file preview                      | Shows a snippet of text under the file name. The snippet is the file content post frontmatter.                       |
| Show file info bar                     | Tied to file preview. Shows file tags in folder portals under preview and folders in tag portals under file preview. |
| Enable Sections                        | Show sections within each folder or tag to help sort and categorise files using user customizable sections.          |
###### Portal tabs > Portal tabs page

| Setting                   | Description                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Compact tabs              | Reduce padding, margin, sizes on portal tabs & side portal                                             |
| Tab name display          | Choose how to display item name on portal                                                              |
| Tab icon position         | Choose the position of icon on named portal tabs                                                       |
| Show quick tab badge      | Shows a badge to denote an assigned number for quick switching tabs using commands or hotkeys.         |
| Tab colors                | Global toggle for tab border colours, side portal colors, icon dots, context note highlights and more. |
| Pin vault root            | Always show the root as the first tab.                                                                 |
| Pin root vault appearance | Style setting for pin root vault portal.                                                               |
| Add new portal            | Opens a modal to add new folder/ tag portals using available data.                                     |
| Categorised portal list   | Shows a list of all folders, tags, subfolders being used as portals.                                   |
###### Stacks > portal tabs page

| Setting              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| Hide stack names     | Hides the names on stack tabs in portal header.          |
| Stack icon positions | Choose the position of icon on named stacks              |
| Show stack count     | Shows total number of items in a stack.                  |
| Colored stack icon   | Highlights stack with app accent or user defined colors. |
| Auto collapse stacks | Stacks will auto collapse when another stack is opened.  |

###### Side Portal > side portal page

| Setting                       | Description                                                           |
| ----------------------------- | --------------------------------------------------------------------- |
| Side portal                   | Enable/disable the bottom panel.                                      |
| Choose side portals           | Select which tabs appear (Recent, Context Notes, Bookmarks, Journal). |
| Disable side portal on mobile | Hides side portal on small screens.                                   |
###### Context Notes > side portal page

| Setting                         | Description                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Enable context notes            | Master switch for all context note features.                                                        |
| Tag Notes folder                | Dedicated folder for tag notes.                                                                     |
| Show context notes in file tree | If disabled, context notes are hidden from the tree.                                                |
| Context note highlight type     | Choose how to highlight headers that have context notes.                                            |
| Open context notes from icon    | Use the setting to open context note directly from header icon.                                     |
| Show closest context notes      | Context note side portal shows context notes based on the active file instead of the active portal. |
###### Journal > side portal page

| Setting                       | Description                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Journal date format           | Choose the date format used in daily notes folder on note title names.              |
| Journal folder                | Folder where daily notes live.                                                      |
| Quote delimiter               | Symbols used to mark quotes, e.g, `double-equal(==)` or `double-asterisk(**)`       |
| Quote indicator on date cards | Shows an indicator on journal date cards for status of quote extraction.            |
| Journal default quote tab     | Helps change the default opening tab of journal. System default is **Random** tab.  |
###### Properties > side portal page

| Setting             | Description                                              |
| ------------------- | -------------------------------------------------------- |
| Show current value  | Show property value on listed files after sorting.       |
| Hide filtered count | Hide the count of total filtered items before file list. |
###### utilities > utilities page

| Setting             | Description                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Plugin icon library | Switch plugin hardcoded icons between lucide and phosphor library. Does not affect custom icons |

###### Backup/ Restore  > utilities page

| Setting            | Description                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Export settings    | Exports json file of user data. Shows an option to choose location on desktop. On mobile, saves to vault root. |
| Import settings    | Imports json file of user data                                                                                 |
| Auto backups       | Helps auto backup data on Obsidian reload. Can be changed per device using the cloud icon.                     |
| Auto backup folder | Folder where auto backups are stored (default: vault root).                                                    |
###### maintenance and help > utilities page

| Settings              | Description                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| Clean up dead portals | Remove tabs for folders/tags that no longer exist. Hard reset for dead items. |
| User Guide            | Opens this user guide on GitHub                                               |
| Release notes         | Opens release notes on GitHub                                                 |

---
## Troubleshooting & Tips

- **My custom icon disappeared after rename** – it should persist; if not, restart Obsidian.  
- **Journal quotes not showing** – ensure journal folder is set correctly and daily notes use the chosen delimiter.  
- **Side portal not visible** – check that `Side portal` is enabled and not disabled on mobile.  
- **Shift+Click doesn’t create context note** – verify that context notes are enabled in settings. 
- **Drag & drop not working on mobile** – Drag and drop is disabled on mobile for now to implement properly later on. Use context menu “Move to” instead.
- **Backup data file** - After setting the plugin up to desired customizations, please create a backup. The plugin is in active development and will go through several changes over time, it's advisable to keep a data backup. Users can do this two ways:
	- Copy the `data.json` file at `.obsidian/plugins/portals` and save it at a secure location. 
	- Open `Settings → Portals`,  switch to **Utilities** page, scroll down to the **Backup/ restore** section and click on the `Export` button, save the file at a secure location. 
- **Auto backups**, saves a data backup with obsidian reloads. Important points related to auto backups,
	- Saves by default at vault root, can be configured to user defined folder
	- Saves 3 copies named by system date and time. 
	- Test feature - per device sync. A new cloud icon is added next to this setting. For those who switch devices quickly, this feature has a potential to cause conflicts as it saves 100ms after full obsidian reload. Using the cloud icon, users can disable the creation process on certain devices. The setting being on is still synced, only the creation process stops. This should help prevent multiple file creations with obsidian reloads on multiple devices. The files created by one device would sync anyway since they're inside the vault. 

---
## Migration Guide
###  Important: Required for 1.1.1,  for users who are updating from any previous version (v1.1.0 or earlier)
The plugin ID has changed from `obsidian-portals` to `portals` to follow Obsidian's guidelines. User settings won't be updated automatically for this round. For users updating from an older version (1.1.0 or earlier), please follow these steps to migrate previous settings. There are two ways to do this, 
### Export/Import of json file
1. **Export** using the older version. Use the feature provided at the bottom of the settings page. Save the json file at a safe location.
2. **Uninstall Portals**
3. **Reinstall** the latest version
4. **Import** using the newer version. Use the feature provided at the bottom of the settings page. Select a saved json file.
### Use Data File
1. **Close Obsidian** completely.
2. **Navigate to vault's `.obsidian/plugins/` folder**.
3. Find the old folder named `obsidian-portals`. Inside it, find the file `data.json` – this contains all the portal configurations.
4. **Create a new folder** named `portals` in the same location (if it doesn't already exist).
5. **Copy the `data.json` file** from the `obsidian-portals` folder into the new `portals` folder.
6. (Optional) After confirming everything works, users may delete the old `obsidian-portals` folder.
7. **Restart Obsidian** and enable the new plugin (`Portals`). User settings should now be restored.
8. Users can prefer to start fresh – old settings will not be used automatically.

---
## Need More Help?

- Open an issue on [GitHub](https://github.com/samaraliwarsi/obsidian-portals/issues)
- Check the [README](https://github.com/samaraliwarsi/obsidian-portals) for updates

Happy navigating! 🚪✨