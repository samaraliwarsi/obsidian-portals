# Render harness (design, not yet built)

A plan for turning the manual regression matrix into something that runs itself. Written
down so it can be picked up cold later.

## Goal

Run the behaviour scenarios from `render-regression-matrix.md` without clicking: invoke
the same functions the UI invokes, then assert on the numbers the recorder already
produces.

```
B1 create a note    -> exactly 1 view:tree, 0 view:all, 0 jumps
A3 foreign tag       -> 0 view:tree
rename 13 children   -> panel:clinic renders 1 time, not 13
```

## Non-goals

- **No AI.** The assertions are numeric. A model would add non-determinism to a
  measurement task. AI belongs after a failure, summarising a diff — not in the loop.
- **No click simulation.** Gestures (drag, hover, popover placement) stay manual. They
  are the fragile part of any UI automation and the part a human judges better.
- **No mobile.** Desktop only.

## Where it runs

| Option | Description | Cost |
|---|---|---|
| **A. In-process** (recommended) | a dev-only command inside the plugin | a day |
| B. CDP | launch Obsidian with `--remote-debugging-port=9222`, drive from Node | +a day |
| C. Playwright | simulate clicks in the Electron window | avoided |

Start with A. Add B only when unattended runs are wanted. Obsidian has no CLI; the
debug port is the only external door.

## Fixtures

```
dev/harness/fixtures/vault/
  folder-a/one.md          tag #life, remind_at, 3 tasks (1 done)
  folder-a/two.md          no tags, no frontmatter
  folder-b/three.md        tag #life/writing
  folder-b/many/…          100 notes, for the tag-portal timing scenario
  _Tag notes/…             a context note
  board.canvas  view.base  for the embed scenarios
```

Committed, never edited by a run: the runner copies it to `os.tmpdir()` so runs are
repeatable and the repo stays clean.

## Scenario interface

```ts
interface Scenario {
    id: string;                                  // 'B1'
    title: string;
    setup(app: App, plugin: PortalsPlugin, view: PortalsView): Promise<void>;
    run(app: App, plugin: PortalsPlugin, view: PortalsView): Promise<void>;
    expect(report: SurfaceSummary[], events: RenderEvent[]): string[];   // failures
}
```

`setup` places the world: open a portal, scroll the tree to a known offset, expand a
folder. `run` calls the same functions the UI calls — `PortalsActions.deleteFile`,
`plugin.saveSettings('tree:structure')`, `view.renderBus.invalidate(...)` — never DOM
clicks. `expect` returns human-readable failures; empty means pass.

## Runner

```
for each scenario:
    copy fixtures -> temp vault
    recorder.reset(); recorder.enable()
    await scenario.setup()
    await scenario.run()
    await plugin.renderBus.idle()      // see Prerequisites
    const { report, events } = recorder.snapshot()
    failures = scenario.expect(report, events)
    write <out>/<id>.json
print PASS/FAIL and write summary.json
```

## Prerequisites

1. **`RenderBus.idle(): Promise<void>`** — resolves when the queue is empty and one
   frame has been drawn. Fixed sleeps are flaky: the bus defers per intent and while a
   view is busy.
2. **A recorder handle in dev** — the harness reads `renderStats` directly rather than
   through `__portalsRender`; only `dev/instrument.ts` needs to be in place
   (`npm run probe:on`).
3. **A disposable vault** — the temp copy, plus a way to point Obsidian at it in
   option B.

## Entry point

```ts
// dev only: never registered in a release build
if (process.env.PORTALS_HARNESS) {
    this.addCommand({
        id: 'run-render-harness',
        name: 'Run render harness',
        callback: () => runHarness(this),
    });
}
```

## External driver (option B)

```
node scripts/run-harness.mjs
  1. copy fixture vault to a temp dir
  2. spawn Obsidian --remote-debugging-port=9222 with that vault
  3. connect over CDP, poll until the plugin is enabled
  4. executeCommandById('portals:run-render-harness')
  5. poll for window.__portalsHarnessDone, read the JSON
  6. exit 1 if any scenario failed
```

Roughly 150 lines, and the piece most likely to break on an Obsidian update.

## Assertions worth writing first

Each of these was a real bug found by hand; a harness would have caught them
immediately.

| Scenario | Assertion |
|---|---|
| Rename a folder with 13 descendants | `panel:clinic` renders === 1 |
| Hide an item | `view:tree` === 1 and `view:all` === 0 |
| Change section criterion | exactly one intent, never `tree:structure` **and** `all` |
| Switch portal | `view:tree` === 1, `view:all` === 0, jumps === 0 |
| Change one file's colour | `view:row` === 1, `view:all` === 0 |
| Typing in an open folder portal | no `view:tree` |

## Unit tests (cheaper, do first)

Pure logic needs no vault and no Obsidian process; a mocked `obsidian` module and
`node:test` are enough.

- `renderBus`: 13 invalidations coalesce to 1 dispatch; `afterMs`; `isBusy()` deferral
- `sortHelpers`: comparator order
- `taskParser`: `2/5`, all-complete, none
- `fileItemFactory.countWords`: compare against the four real files used in testing
- `sectionsRenderer` grouping and empty-section filtering

Half a day, runs in seconds, and would have caught several bugs from the render
refactor outright.

## Effort

| Piece | Estimate |
|---|---|
| Fixtures + runner + first six assertions | 1 day |
| `RenderBus.idle()` | 1 hour |
| CDP driver + wiring | 1 day |
| Unit tests | half a day |

## Open questions

- Should the runner reset the vault between scenarios (slower, truer) or reuse one and
  undo its own changes (faster, riskier)?
- Do captures get compared against a stored baseline (regression on timings) or only
  structural assertions (intent counts, jumps)? Timings vary with machine and vault
  size; counts do not.
