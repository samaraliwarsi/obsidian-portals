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
| Pipeline | `src/pipeline/renderBus.ts`, `rows.ts`, `probe.ts` | no DOM knowledge except rows |
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
3. If it only touches the tree, add a row to `SETTING_INTENT` in `settings.ts` —
   but only after its capture in `settings-render-matrix.md` passes (invariant 7).
   Otherwise it defaults to `all`, and that is fine.

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
4. **The recorder is dev-only.** `npm run probe:on` copies `dev/instrument.ts`
   over the stub in `src/pipeline/probe.ts`; `npm run probe:off` restores it.
   Never commit the recorder into `src/`.
5. **Read per-portal state inside the handler.** Floating buttons, menus and
   popovers are built in `renderFullScope` and now *survive* a portal switch,
   because switching is a tree-only render. Anything captured at build time
   (`settings.selectedSpace`, `spaceSectionPrefs[<portal key>]`) goes stale and
   fails quietly: the write succeeds, the UI shows the old value. Resolve it when
   the menu opens.
6. **A state class must not fight `display`.** `.file-item-preview-hidden`
   `{ display: none }` loses to a later equal-specificity rule such as
   `.portals-task-preview { display: flex }`. Use `setPreviewVisibility()` in
   `Rows` — it applies the class *and* `show()`/`hide()`, so intent survives the
   cascade. Any future rule that sets `display` on a hideable child reintroduces
   this bug.
7. **Only verified settings join `SETTING_INTENT`.** A narrow intent that misses
   a surface leaves it stale (see `enableContextNotes`: the tree is right, the
   context-notes panel is not). Add a row only after its capture in
   `settings-render-matrix.md` passes; the default `all` is wrong only by being
   slow.

## Failure modes seen in practice

| Symptom | Cause | Fix |
|---|---|---|
| UI correct after restart, stale until then | value captured at build, no rebuild on switch | read inside the handler |
| Element stays visible despite the hidden class | later equal-specificity `display` rule | class **and** `show()`/`hide()` |
| Toggle works for some elements only | element created after the toggle, state captured earlier | re-read state when async work lands |
| Panel shows a partial list after a bulk edit | cache built at load, not rebuilt | rebuild cache + refresh panel after the mutation |
| Command still callable after its setting is off | removed via the raw command manager, left in the plugin list | `plugin.removeCommand(id)` |

## Debugging

The recorder is **dev-only**. It lives in `dev/instrument.ts` because its console
logging is lint-flagged; `src/pipeline/probe.ts` is a no-op stub with the same
exports so the shipped plugin stays clean.

```bash
npm run probe:on     # copy the recorder over the stub
npm run build        # or: npm run dev, while working
```

Then in the developer console (Obsidian: `Ctrl/Cmd+Shift+I`):

```js
__portalsRender.enable()
__portalsRender.report()      // intent / count / median / p95 / jumps
__portalsRender.jumps()       // only renders where the read row moved
__portalsRender.snapshot()    // raw events
__portalsRender.snapshot().filter(e => e.intent.startsWith('intent:'))  // who asked
__portalsRender.reset()
__portalsRender.disable()
```

When finished:

```bash
npm run probe:off    # restore the stub from git
```

`probe:off` does `git checkout HEAD -- src/pipeline/probe.ts`, so the stub must
be committed for it to work — and you must not commit *while* the recorder is in
place, or `HEAD` will hold the recorder and `probe:off` will restore that.

Each render event carries: the surface, the intent that triggered it, the caller,
the duration, and whether the row the reader was watching moved (`jumped`,
`anchorDelta`).

> **Do not delete `src/pipeline/probe.ts`.** It is imported by `view.ts`,
> `renderBus.ts`, `sidePanelContent.ts` and `frontmatterClinic.ts`. A missing
> module makes TypeScript treat every binding as `any`: `tsc` fails with
> "cannot find module", and the linter reports *unsafe call of an error or any
> typed value* on every probe line — blaming the call sites instead of the
> missing file.

## Regression tools

| Document                            | Use                                   |
| ----------------------------------- | ------------------------------------- |
| `docs/render-regression-matrix.md`  | 22 behaviour scenarios, pass criteria |
| `docs/render-capture-cheatsheet.md` | exact `capture()` call per scenario   |
| `docs/settings-render-matrix.md`    | setting -> surface -> expected intent |
| `docs/architecture.canvas`          | zoomable map of the module graph      |

## Known limits

- A 100-file tag portal rebuilds in 50-70ms; `setTimeout` long-task warnings
  from Obsidian reflect real work, not a leak.
- `chrome` still maps to a full rebuild; splitting the tab bar out of
  `renderFullScope()` is the next optimisation.
- Journal / trash / hidden do not restore panel scroll (accepted: rare visits,
  or a horizontal scroller).