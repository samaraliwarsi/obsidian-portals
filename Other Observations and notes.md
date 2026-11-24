### Observations outside specific testing
- One Portals with many files ~100+ tying can induce flickers, specially when we type a tag of that portal space. This hasn't yet happened in folder spaces. 
- Reminders panel's fresh start always happens empty even though there is an overdue reminder
- Midway through the Phase-1 i found console warnings of setTimeout or something taking 55ms which is not too long but it something that has never happened with Portals throughout it's lifetime. So whatever method is being used (i have't peeked at the changed code yet) is leaving trace in verbose, fine if its on purpose. 
- `getPluginInstance()` and `setPluginInstance` in plugininstance.ts These were some really desperate measures by me long back when i was lazy to property type required plugin into a file. If you think they are brittle, cast them properly, like most of the other patterns. If it's fine and stable, continue. 
- storageProxy.ts is wrongly named for a file doing `getLocalTime` and `setLocalTime` functions. 

### Other console Issues on verbose 
**An interactive element was found with `<summary>` element. These element will not consistently be accessible to people navigating by keyboard or using assistive technology.** 
My comment - We are not worried about that but i'm a little concerned if we are violating the obsidian guidelines or general electron guidelines, fine if it's the latter. The list of elements grows with portal switches. 

### Obsidian lint
This is the most important and often leaves a lot of cleaning up to do later on so better to follow from the start, as much as possible. Obsidian has strict guidelines based on which it rates plugins on a score of 100. The code shared with you at the start was 100/100. Some of the guidelines 
#### 1. No unused assignments
Eg - `const xyz` and not using xyz later on
#### 2. No usage of `style` for inline, 
element.style.height`, use `element.setCssProps` or `element.setCssStyles

#### 3. No unnecessary assertions when they do not change the type of the expression.
Eg,
```ts
if (library === 'phosphor' || library === 'lucide' || library === 'emoji') {
                const provider = this.getProviderForLibrary(library as 'phosphor' | 'lucide' | 'emoji');
```

#### 4. Unsafe assignment of an `error` or `any` typed value
Eg, 
```ts
this.rules = JSON.parse(JSON.stringify(plugin.settings.appearanceRules || []));
```
```ts
const fm = this.app.metadataCache.getFileCache(file)?.frontmatter; 
        if (fm && this.settings.appearanceRules) {
            for (const rule of this.settings.appearanceRules) {
                const rawVal = fm[rule.property]
```
For the resolution of above one, look at types.ts in our codebase. The error was in the const fm line. it was resolved using, 
```ts
const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
```
 You will find many examples of this usage in code, eg, 
 ```ts
 for (const f of this.app.vault.getMarkdownFiles()) {
		const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(f)?.frontmatter;
	const raw = fm?.[prop];
	if (raw) this.reminderDates.set(f.path, String(raw));
	}
 ```

Similarly other strict types and interfaces have been defined in types.ts, specifically when they call for internalPlugins like Bookmarks, see how it's used in the original code base, follow the pattern. Eg, 

```ts
// Public API if available
        // @ts-expect-error - bookmarks is not in public App type
        const publicBookmarks = this.app.bookmarks as unknown as PublicBookmarksAPI | undefined;
        if (publicBookmarks) {
            if (typeof publicBookmarks.getBookmarks === 'function') {
                items = publicBookmarks.getBookmarks();
                usePublic = true;
            } else if (Array.isArray(publicBookmarks.items)) {
                items = publicBookmarks.items;
                usePublic = true;
            }
        }

        // internal API fallback 
        if (!usePublic || items.length === 0) {
            // @ts-expect-error - accessing internal plugin API
            const internalPlugins = this.app.internalPlugins as unknown as InternalPluginsWithBookmarks | undefined;
            const bookmarksPlugin = internalPlugins?.getPluginById('bookmarks');
            if (!bookmarksPlugin?.enabled || !bookmarksPlugin.instance) {
                contentEl.createEl('p', {
                    text: 'The bookmarks core plugin is not enabled. Settings → core plugins.'
                });
                return;
            }
```

### Some usage guides
- Use `window.setTimeout()` instead of `setTimeout()` for popout window compatibility.
- Use `ActiveDocument.body` instead of `document.body`. This one depends actually. Just that obsidian's panes are moveable by the user so the lint forces it. 
- No direct http links. That's why we have urls.ts