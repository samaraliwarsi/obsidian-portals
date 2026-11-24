# Portals render regression matrix

## code
```js
(() => {
  const api = globalThis.__portalsRender;

  if (!api) {
    console.warn(
      "Portals recorder not found.\n" +
      "The running plugin predates src/render/instrument.ts.\n" +
      "Fix: npm run build → copy main.js to your vault plugin folder → reload Obsidian → paste this again."
    );
    return;
  }

  const store = (window.__portalsBaseline = window.__portalsBaseline || []);

  // Record one scenario: resets, waits, prints the table, saves the result.
  window.capture = function (label, seconds) {
    const secs = seconds || 10;
    api.reset();
    api.enable();
    console.log('[Portals] Recording "' + label + '" for ' + secs + 's — do the thing now.');
    setTimeout(function () {
      const rows = api.report();
      store.push({ label: label, seconds: secs, rows: rows, at: new Date().toISOString() });
      api.disable();
      console.log('[Portals] Saved "' + label + '". ' + store.length + ' capture(s) stored.');
    }, secs * 1000);
  };

  // Show only the redraws that moved the list.
  window.jumps = function () {
    const rows = api.jumps();
    if (rows.length === 0) {
      console.log("[Portals] No scroll jumps recorded.");
      return;
    }
    console.table(rows.map(function (r) {
      return {
        when: new Date(r.ts).toLocaleTimeString(),
        kind: r.intent,
        where: r.detail || "-",
        asked_by: r.caller,
        from: r.scrollBefore,
        to: r.scrollAfter,
        moved_by: Math.abs(r.scrollAfter - r.scrollBefore)
      };
    }));
  };

  // Copy everything to the clipboard so you can send me the numbers.
  window.dump = function () {
    const text = JSON.stringify(store, null, 2);
    if (typeof copy === "function") {
      copy(text);
      console.log("[Portals] Copied " + store.length + " capture(s) to the clipboard.");
    } else {
      console.log(text);
    }
  };

  console.log(
    "%cPortals recorder ready",
    "font-weight:bold",
    "\n  capture('typing', 10)      record a scenario for 10 seconds" +
    "\n  __portalsRender.report()   show the table right now" +
    "\n  jumps()                    list redraws that moved the list" +
    "\n  dump()                     copy all captures to the clipboard"
  );
})();
```

Phase 0 artifact for the render refactor. Run it before a phase and after it, and
compare against the baseline numbers at the bottom of this file.

There is no automated test runner in this repo, so this matrix *is* the test.

## How to run

1. `npm run build`, copy `main.js` to the vault plugin folder, reload Obsidian.
2. Open the developer console (Ctrl/Cmd+Shift+I) and paste the recorder helper.
3. For each row: reset, do the steps, then read `report()` and `jumps()`.
4. Fill in Pass / Fail and any notes in the results table.

One-line capture, 15 seconds:

    capture("A2 tag typing", 15)

## Reading the output

| Column | Meaning |
|---|---|
| `intent` | `view:all` full rebuild, `view:tree` tree only, `view:row` one row patched, `panel:*` side panel, `view:all:noop` rebuild requested but skipped |
| `count` | how many happened during the capture |
| `medianMs` / `p95Ms` / `maxMs` | how long they took |
| `jumps` | redraws where the row you were *looking at* (the first visible row) moved by more than 1px. A changed scroll offset on its own is **not** a jump |

## What counts as a pass

- The item you were reading must stay where it is on screen.
- Delete and rename need a right-click, so the target row has to be visible. To test
  the anchor being destroyed, target the **first visible** row. To test survival,
  target a row near the bottom edge.
- The scrollbar thumb moving is **not** a failure. When content height changes the
  thumb must move; what matters is that the item under your eyes does not.
- Rows marked *expected movement* must move. Everything else must not.

## A - Typing and background changes

| #   | Scenario                                     | Capture code                                                  | Do this                                               | Pass looks like                                                        |
| --- | -------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| A1  | Plain typing                                 | Capture("A1-Typing in a note that belongs to an open portal") | Type 20s in a note that belongs to the open portal    | No `view:tree`; list still; no red errors                              |
| A2  | Typing a tag of the open portal              |                                                               | In a tag portal, type its `#tag` into a note          | 1 `view:tree` max; scroll unchanged; list returns exactly where it was |
| A3  | Typing a tag of a *different* portal         |                                                               | Type a `#tag` that does not belong to the open portal | 0 `view:tree`                                                          |
| A4  | Frontmatter edit, properties panel open      |                                                               | Change a property                                     | `panel:clinic` only; tree scroll untouched                             |
| A5  | Frontmatter edit matching an appearance rule |                                                               | Change a property that drives a colour/icon rule      | `view:row` patches only; 0 `view:tree`                                 |
| A6  | Two windows / split view                     |                                                               | Type in one leaf while another Portals view is open   | Each view patches independently; no rebuild storm                      |

## B - File and folder operations

| # | Scenario | Do this | Pass looks like |
|---|---|---|---|
| B1 | Create a note | New note in the current folder | 1 `view:tree`; new row appears; scroll kept |
| B2 | Delete a file below the viewport | Delete a row you are not looking at | 1 `view:tree`; scroll kept |
| B3 | Delete the row you are reading | Right-click > Delete on the **first visible** row | Falls back to the nearest surviving ancestor; never scrolls to the top |
| B4 | Rename a row below the fold | Rename a row near the **bottom edge**, so the anchor (first visible row) survives | Anchor does not move. The renamed row itself may move, because the list re-sorts |
| B5 | Rename a collapsed folder above the viewport | Rename it via the file explorer | Scroll kept |
| B6 | Drag a file into another folder | Drag a row onto a folder row | Row moves; scroll kept |
| B7 | Hide an item | Context menu > Hide | Row disappears; scroll kept; remaining rows do not shuffle |

## C - Settings changes

| # | Scenario | Do this | Pass looks like |
|---|---|---|---|
| C1 | Toggle compact tree | Settings > Compact tree | Anchor kept; heights change (thumb moves - fine) |
| C2 | Change sort order | Settings > Sort | Anchor item stays put if still visible |
| C3 | Change tree style | Settings > Tree style | Anchor kept |
| C4 | Toggle file previews | Settings > File preview | Anchor kept; previews may grow rows above |
| C5 | Change one file's colour or icon | Right-click > Colour | 1 `view:row`; no rebuild; no movement |
| C6 | Change tab name display | Settings > Tab names | Tab bar updates; tree untouched |

## D - Navigation (movement here is intended)

| # | Scenario | Do this | Expected |
|---|---|---|---|
| D1 | Switch portal tab | Click another portal | Jumps to that portal's last scroll position - expected movement |
| D2 | Collapse all | Floating button > collapse | Collapses to the top - expected movement |

## E - Side panels

| # | Scenario | Do this | Pass looks like |
|---|---|---|---|
| E1 | Switch side tab | Click Recent / Trash / Properties | `panel:content` for the new tab; tree untouched |
| E2 | Edit a note, Context Notes open | Edit the note the panel shows | Panel re-renders; tree untouched; panel scroll kept |
| E3 | Edit a reminder property | Change the reminder date | Reminders panel updates once; tree untouched |

## F - Outside our control (record, do not fix)

| # | Scenario | What happens |
|---|---|---|
| F1 | Drag the splitter | Container height changes; browser adjusts scroll |
| F2 | Resize the sidebar | Same |

## Baseline (27 captures, 2026-11-24)

| intent | rebuilds | jumps | worst |
|---|---|---|---|
| `view:all` | 10 | 8 | 62.6 ms |
| `view:tree` | 17 | 7 | 79.5 ms |
| `view:row` | 61 | 0 | 25.6 ms |
| `panel:content` | 98 | 0 | 152 ms |
| `panel:clinic` | 33 | 0 | 53.5 ms |
| `view:all:noop` | 5 | 0 | - |

Captures that registered jumps: B1, B2, B3, B4, B7, C1, C3, C4, C6, D1.

Two readings from this run:

- Jumps appear only on rebuilds (`view:all`, `view:tree`), never on row patches
  or panel renders.
- Side panels rebuild far more often than the tree (98 vs 27) and cost more at
  the tail (152 ms), but are invisible to the jump counter because they scroll
  in a different element.

> Caveat: the jump counts here are inflated. Scroll restoration runs inside a
> `requestAnimationFrame`, but the recorder sampled `scrollTop` synchronously, so a
> rebuild that was about to be restored could still register as a jump. From
> phase 1 the recorder samples one frame later (`scrollAfterSettled`). Treat the
> jumps column above as an upper bound, not a count of visible jumps.

Static counts from the audit: 135 render/refresh call sites, 11 row builders,
6 debounce policies, 4 render mechanisms across 58 files.

## Results

| Date | Phase | A | B | C | D | E | Notes |
|---|---|---|---|---|---|---|---|
| | before | | | | | | |