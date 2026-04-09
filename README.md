# Portals for Obsidian

<div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
<a href="https://github.com/samaraliwarsi/obsidian-portals/releases"><img src="https://img.shields.io/github/v/release/samaraliwarsi/obsidian-portals" alt="GitHub release"></a>
<a href="https://github.com/samaraliwarsi/obsidian-portals/releases"><img src="https://img.shields.io/github/downloads/samaraliwarsi/obsidian-portals/total" alt="Downloads"></a>
<a href="https://github.com/samaraliwarsi/obsidian-portals/stargazers"><img src="https://img.shields.io/github/stars/samaraliwarsi/obsidian-portals" alt="Stars"></a>
<a href="https://github.com/samaraliwarsi/obsidian-portals/blob/main/LICENSE"><img src="https://img.shields.io/github/license/samaraliwarsi/obsidian-portals" alt="License"></a>
<a href="https://obsidian.md"><img src="https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian" alt="Obsidian Plugin"></a>
</div>

Portals enhances your Obsidian file navigation by letting you pin any folder or tag as a customizable tab, a Portal into your selected folder trees. Add icons to Tabs, background colors, gradients and rearrange them to suit your workflow.

![Portals_Main](Screenshots/Portals_Main.png)

![Portals_Side](Screenshots/Portals_Side.png)
## ✨ Features

- **Pin any folder or tag** – Turn your most‑used folders and tags into tabs at the top of the file pane.
- **Custom icons & colors** – Choose from hundreds of icons from the Phosphor set for the tabs and set any background color with an opacity slider. Option to use gradients. Control tab and file pane colors separately.
- **Styles** - Folder trees or Tag grouped lists in each portal tab can be styled with several predefined styles such. The styles available are `Default`, `Minimal`, `Boxed`, `Portals`, `Shades` & `Hues`. 
- **Tag Grouping** - Use existing tags in listed files to enabled grouped view in tag list for, delivering a better layout for tag portal tabs.
- **Subtags** - Subtags/ nested tags, eg. `Writing/Poetry`, displayed as hierarchal trees.
- **Complete context menus** – Right‑click files or folders to get the same menu as the default file explorer.
- **Foldable floating action buttons** – Quick‑create notes, folders, collapse all subfolders, and change sort order. Floating buttons are foldable on `Right Click/Long Press` for those wanting a cleaner folder pane view.
- **Native sorting** – Choose how files are sorted (by name, creation time, or modification time, ascending/descending). Your choice is saved between sessions.
- **Custom display names** - Tabs can have user defined display names without affecting folders or tabs.
- **Side Portal** - A modular, collapsable, resizable pane for new views and more ways to access content. Toggle it on in settings to find options inside. **Side Portal** has tabs containing, **Bookmarks**, **Recent Files**, **Folder Notes** and **Journal**. To use **Side Portal,** at least one tab is required to be on in settings. Side portal can be turned off on mobile to help smaller screen devices.
	- **Folder Notes** – Each folder can have an associated note (markdown file with the same name). The note can be displayed in a side panel, and folders with a note are marked with a small dot. Global toggle to enable/disable folder notes. **Folder notes** can be used without side portal as well.
	- **Recents** - Live update recent files list from across the vault. 
	- **Bookmarks** - Bookmark your favourite files or web links from Obsidian web viewer.
	- **Journal** - A viewing and marking tool for Daily Notes. Mark your favourite quotes on your daily notes to display them in **Journal**. You can also mark your daily notes files. 
- **Safe deletion** – Files are moved to Obsidian’s `.trash` folder, if such are the preferences set by user in obsidian `settings`.
- **Mobile friendly** – Responsive design that works on small screens. Tested on Android (more platforms coming).
- **Export/Import settings** – Backup your tab configuration or transfer it to another vault using json files from `Settings`.

> For a detailed guide, go to [Portals guide](https://github.com/samaraliwarsi/obsidian-portals/blob/main/Portals_Guide.md)

> [!Note]
> Please make sure to backup your data file after a full setup of your preferences, color & icon choices. You can backup by copying the file `.obsidian/Plugins/Portals/data.json` to safe location. You can also export the same via `Settings` and later import it. Make sure to backup before any plugin updates for safe measure. 

## ⚙️ Installation

### Using BRAT (Beta Reviewers Auto-update Tester)

1. Install the **BRAT** plugin from the Obsidian community plugins (if you haven’t already).
2. Open BRAT settings and click **Add Beta plugin**.
3. Enter the repository URL: `https://github.com/samaraliwarsi/obsidian-portals`.
4. Click **Add Plugin** – BRAT will download and enable the latest release.
### Manual installation

1. Download the latest release from the [releases page](https://github.com/samaraliwarsi/obsidian-portals/releases).
2. Extract the files into your vault’s `.obsidian/plugins/obsidian-portals/` folder.
3. Enable the plugin in Obsidian settings.
## 🚀 Usage

### Creating a tab

- First installation - use Ribbon menu to enable **Portals** view.
- Open **Settings → Portals**.
- Under **Folders**, **Sub-folders** or **Tags**, toggle on any folder/tag you want to appear as a tab. 
- Optionally, click **Choose icon** to pick an icon from the Phosphor library, and use the color picker + opacity slider to set a background color. 
- You can also pin the entire vault as a Portal Tab – it stays pinned to the left of the tab bar.
### Managing tabs

- Drag tabs left/right to reorder.
- The active tab is highlighted and shows the folder/tag name. This can be changed from settings to display name on all. 
- Hover over an inactive tab to see a tooltip with its name.
- For **Side Portal** choose the tabs you want in settings.
- **Side Portal** can be turned off for mobile devices.
- Set custom display name for any tab.
### Folder Notes

- Each folder can have an associated **folder note** – a markdown file with the same name as the folder (case‑insensitive).
- Use the folder’s context menu to **Create folder note** or press `Shift+Click` to quick create. 
- Use the folder’s context menu to **Open folder note** or press `Cmd/Ctrl+Click` to open a folder note in editor.. 
- The **Folder Notes** side portal (bottom of the file pane) displays the content of the folder note for the currently active portal.
- **Folder Notes** in side portal have a cache for performance improvements. This can accommodate 10 tabs with folder notes. Any further tabs will also support folder notes but the cache is valid for the most recent 10 used. 
- An accent color highlight is used to show folders that have a folder note (including the root). This can be changed to underline or turned off from settings.
- Clickable markdown links in folder notes side portal tab. 
- Settings let you globally enable/disable folder notes and control whether they appear in the file tree.
### Journal
- A dedicated side portal tab for sneak peak into daily notes. 
- File area displays daily notes inside the selected folder for daily notes. 
- Quotes area displays text snippets from previous notes based on `Random` or `On this day` logic. Text snippets have to manually marked by user using settings chosen delimiter. 
### Floating action buttons

Four collapsible floating buttons appear at the bottom‑left of the file panel. They can be folded, unfolded using the Right-Click or Long press on mobile. The collapse button works even in the folded state with Left-Click/ Tap on mobile. The four buttons are, 
- **New note** – creates an untitled note in the current folder tab.
- **New folder** – creates a new folder in the current folder tab.
- **Sort** – opens a menu to change the sort order (Name A→Z / Z→A, Created oldest/newest, Modified oldest/newest). The choice is saved.
- **Collapse all** – collapses all subfolders while keeping the current tab’s root folder expanded.
### Drag & drop

- Drag files onto folders to move them. This is not supported only on desktop. Use context menu 'Move to' to move files/ folders between portals on other devices.
### Accessibility

- Recent Files, Bookmarks to improve file access.
- Journal provides a sneak peak into the Daily Notes. Journal is designed to work with the core Daily Notes plugin and may not work with community Daily Notes plugins that work outside of core plugin system. Journal supports date formats of DD-MM-YYYY and MM-DD-YYYY. 
- Replace the file explorer using settings to make **Portals** the default explorer every time you start Obsidian. Default explorer is still available using obsidian tab header.
- Active files that are open in editor tabs show an accent coloured dot next to them in file/ tag tree and **Recents** on the right side. Same applies to the entire folder chain of the file open in the active tab of the editor. 

### Personalisation

- Use custom icons for any file or folder of your choices. The user saved icon preferences are logged into the data file at `.obsidian/Plugins/Portals`. Users can also export the same using settings `Export` button at the end of the list. 
- Colors chosen for each tab can be use to highlight the tab as well as the background of the file tree of that portal tab. With `Shades` style, the background can be used to color the folder gradations in 1st level folders of each portal tab. 
- Compact Tree is available for users with large vaults or for those who wish for a packed file/ tag tree appearance. Compact view works with all available styles. 
- Bold folder names can be turned on from settings to further add a visual differentiator between files and folders/ tab groups. 
- Non-markdown files can show a extension badge at the right hand side for visual separation. This can be turned on from settings.
- Six predesigned styles to display folder, tag trees. Choose your favourite style based on your theme and design choices.

## ⚙️ Settings Overview

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

## 🧑‍💻 Development

Clone the repository, install dependencies, and build:

```bash

git clone https://github.com/samaraliwarsi/obsidian-portals.git

cd obsidian-portals

npm install

npm run build

```

The built `main.js` and `styles.css` will be in the root folder. Copy them into your test vault’s `.obsidian/plugins/obsidian-portals/` directory.
## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---