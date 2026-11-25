# Render capture cheatsheet

Every scenario from `render-regression-matrix.md` with the exact console call,
so a run is copy/paste rather than recall. Paste the helper block from
`render-regression-matrix.md` first (it defines `capture`, `jumps`, `dump`).

## Before a run

```js
__portalsRender.enable()
__portalsRender.reset()
```

One capture resets the buffer at its start, so scenarios do not bleed into each other.

## Scenarios

| ID | Scenario | Capture command | Do this | Pass looks like |
|---|---|---|---|---|
| A1 | Plain typing | `capture("A1-Typing in a note that belongs to an open portal", 15)` | Type 20s in a note in the open portal | `intent:tree:appearance`; at most one `view:tree`; list still |
| A2 | Tag of the open portal | `capture("A2-In a tag portal, type its #tag into a note", 15)` | In a tag portal, type its `#tag` | One `view:tree` after you stop; scroll unchanged |
| A3 | Tag of a different portal | `capture("A3-Typing a tag of a *different* portal", 15)` | Type a `#tag` that does not belong | 0 `view:tree` |
| A4 | Frontmatter edit, properties open | `capture("A4-Frontmatter edit, properties panel open", 15)` | Change a property | `panel:clinic` only; tree scroll untouched |
| A5 | Frontmatter matches an appearance rule | `capture("A5-Frontmatter edit matching an appearance rule", 15)` | Change a property driving a colour/icon rule | `view:row` patches; no `view:all` |
| A6 | Two windows | `capture("A6-Two windows / split view", 15)` | Type in one leaf with another open | Each view patches independently |
| B1 | Create a note | `capture("B1-Create a note", 15)` | New note in the current folder | Intent coalesced; one `view:tree` ~20-30ms |
| B2 | Delete below the fold | `capture("B2-Delete a file below the viewport", 15)` | Delete a row you are not reading | One `view:tree`; scroll kept |
| B3 | Delete the row you are reading | `capture("B3-Delete the row you are reading", 15)` | Right-click > Delete on the first visible row | Falls to nearest surviving row; never top |
| B4 | Rename near the bottom | `capture("B4-Rename a file near the viewport bottom", 15)` | Rename a row near the bottom edge | Anchor does not move |
| B5 | Rename a collapsed folder above | `capture("B5-Rename a collapsed folder above the viewport", 15)` | Rename via the file explorer | Scroll kept |
| B6 | Drag into a folder | `capture("B6-Drag a file into another folder", 15)` | Drag a row onto a folder row | One `view:tree`; scroll kept |
| B7 | Hide / unhide | `capture("B7-Hide an item", 15)` | Context menu > Hide, then unhide | One `view:tree` per action, no `view:all` |
| C1 | Compact tree | `capture("C1-Toggle compact tree", 10)` | Toggle the setting | `view:all`; heights change; anchor held |
| C2 | Sort order | `capture("C2-Change sort order", 10)` | Change sort | `view:tree` only |
| C3 | Tree style | `capture("C3-Change tree style", 10)` | Change tree style | `view:all`; anchor held |
| C4 | File previews | `capture("C4-Toggle file previews", 10)` | Toggle previews | `view:row` patches, one `view:tree` |
| C5 | Colour and icon | `capture("C5-Change one file's colour and icon", 10)` | Right-click > colour, then icon | `view:row` only; no `view:all` |
| C6 | Tab name display | `capture("C6-Change tab name display", 10)` | Change the setting | Both strips update immediately |
| D1 | Switch portal | `capture("D1-Switch portal tab", 10)` | Click another portal | `view:tree` only, ~20-65ms; starts where you left |
| D3 | Collapse all | `capture("D3-collapse all", 10)` | Floating button > collapse | One `view:tree` |
| E1 | Switch side tab | `capture("E1-Switch side tab", 10)` | Click a side tab | `panel:content` only; strip does not flicker |
| E2 | Edit with context notes open | `capture("E2-Edit a note, context notes open", 15)` | Edit the note shown | Panel only; tree untouched |
| E3 | Edit a reminder property | `capture("E3-Edit a reminder property", 15)` | Change a reminder date | `view:row`; panel updates once |

## After a run

```js
__portalsRender.report()                 // intent / count / median / p95 / max / jumps
__portalsRender.jumps()                  // only renders where the read row moved
__portalsRender.snapshot()               // raw events, includes intent: markers and callers
dump()                                   // copy everything to the clipboard
```

## Reading a result

| Field | Meaning |
|---|---|
| `intent:*` | what asked for a render, with the reason string and the caller |
| `view:tree` | a tree-only rebuild — the normal cost of a real content change |
| `view:all` | a full rebuild — should only follow structural or chrome changes |
| `view:row` | a single row patched in place — the cheap path |
| `panel:*` | a side panel rebuilt |
| `jumps` | the row you were reading moved more than 1px |

## Notes

- The full recorder lives in `dev/instrument.ts` and is not part of `src/`, so it
  cannot affect the plugin's lint score. To profile: `npm run probe:on`, build,
  test, then `npm run probe:off` (before committing).
- Without the recorder, `__portalsRender` does not exist and every capture call
  is a no-op.