# Portals — rendering architecture

Written after the render refactor. If you are an agent or a future maintainer
touching UI code, read this before adding a feature: most "obvious" places to
put a render call are wrong now.

## The shape of it

```
  Obsidian events ──┐
  user actions ─────┼──> RenderBus.invalidate(intent) ──> one of five intents
  settings changes ─┘         │
                              ├─ 'all'            -> PortalsView.render('all')
                              ├─ 'tree:structure' -> PortalsView.render('tree')
                              ├─ 'tree:appearance'-> patch rows in place
                              ├─ 'chrome'         -> full rebuild (placeholder)
                              └─ 'panel'          -> side panel rebuild
                                        │
                              Rows / panel factories draw the DOM
```

Nobody calls `view.render()` from a handler any more. Handlers declare **what
changed**; the bus decides when and what to redraw.

## Layers

| Layer | Files | Rule |
|---|---|---|
| Entry | `src/main.ts`, `src/view.ts` | translate events into intents; never render directly |
| Pipeline | `src/pipeline/renderBus.ts`, `rows.ts`, `instrument.ts` | no DOM knowledge except rows |
| Surfaces | `src/view.ts` (View methods), `src/trees/*`, `src/renderers/*` | draw only what they were asked to draw |
| Data | `src/settings.ts`, `src/types.ts`, `src/utils/*` | no rendering |

## Pipeline contracts

### RenderBus (`src/pipeline/renderBus.ts`)

```ts
invalidate(intent, { tabId?, files?, afterMs?, skipScrollSave?, reason? })
flush()   // run due work now (used for interactive clicks)
cancel()  // drop the queue (view closed)
```

Five intents, each with its own quiet period. Entries carry a `dueAt`, so a slow
intent (journal, 2s) never holds back a fast one (tree, 120ms). The bus defers
while any view reports `isBusy()` — that is, while renaming or dragging.

### Rows (`src/pipeline/rows.ts`)

```ts
Rows.file(ctx, file, container)            // the one file row
Rows.branch(ctx, parent, spec)             // folder | tag | group row trio
// -> { details, summary, children, icon }
```

`RowCtx` = `{ app, plugin, view, openFiles }`. A folder, a tag and a tag group
are the same DOM object; that is why there is one builder, not three.

### Panels (`src/renderers/sidePanelContent.ts`)

```ts
interface PanelRenderer { render(); destroy(); saveScroll?(); }
PANELS: Record<tabId, (env) => PanelRenderer | null>
```

Adding a panel = one factory entry. Lifecycle, scroll and teardown come free.
Context notes and journal keep their own caches; they are excluded from the
generic panel-scroll capture on purpose.

## Recipes

### Add a new row kind
1. Extend `BranchSpec` if it needs a new attribute.
2. Use `Rows.branch` from the tree renderer.
3. Never build `details/summary` markup anywhere else.

### Add a render trigger
```ts
this.renderBus.invalidate('tree:structure', { reason: 'what changed' });
```
Pick the narrowest intent that repaints correctly. `reason` shows up in the
recorder and is how the next person diagnoses it.

### Add a setting
1. Add it to `SpacesSettings` and the default object.
2. Add the control in `settingDefinitions.ts`.
3. If it only touches the tree, add a row to `SETTING_INTENT` in `settings.ts`;
   otherwise it defaults to `all` and that is fine.

### Add an interactive action
1. Mutate settings/data.
2. `saveData` (not `saveSettings`) if the change does not need a render.
3. Emit one intent. For a click, call `flush()` after invalidating so the
   response is immediate instead of waiting out the quiet period.

## Invariants (breaking these reintroduces the old behaviour)

1. **No eager renders.** If you find yourself writing `view.render()`, you want
   an intent instead. `saveSettings()` defaults to `all`; pass a narrower one.
2. **One scroll owner per surface.** Tree: anchor + per-space cache (view.ts).
   Panels: per-tab capture in `sidePanelContent.ts`. Notes: their own cache.
3. **Deferral, not racing.** Rebuilds must not run while `view.isBusy()`.
4. **The recorder is dev-only.** `dev/instrument.ts`, copied over the stub in
   `src/pipeline/instrument.ts` to profile. Never ship it in `src/`.

## Debugging

```js
// swap the recorder in first
cp dev/instrument.ts src/pipeline/instrument.ts   // then build
__portalsRender.enable()
__portalsRender.report()
__portalsRender.snapshot().filter(e => e.intent.startsWith('intent:'))
```

Each render event carries: intent, caller, duration, and whether the row the
reader was watching moved (`jumped`, `anchorDelta`).

## Regression tools

| Document | Use |
|---|---|
| `docs/render-regression-matrix.md` | 22 behaviour scenarios, pass criteria |
| `docs/render-capture-cheatsheet.md` | exact `capture()` call per scenario |
| `docs/settings-render-matrix.md` | setting -> surface -> expected intent |
| `docs/architecture.canvas` | zoomable map of the module graph |

## Known limits

- A 100-file tag portal rebuilds in 50-70ms; `setTimeout` long-task warnings
  from Obsidian reflect real work, not a leak.
- `chrome` still maps to a full rebuild; splitting the tab bar out of
  `renderFullScope()` is the next optimisation.
- Journal / trash / hidden do not restore panel scroll (accepted: rare visits,
  or a horizontal scroller).