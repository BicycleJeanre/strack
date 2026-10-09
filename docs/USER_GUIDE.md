# STrack user guide

## Start and resume

The home screen offers a deterministic daily choice in each difficulty band and keeps recent games on this device. If a puzzle is in progress, **Resume puzzle** returns to it. The library filters all 80 bundled puzzles by friendly band, exact SE range, and local progress.

Every bundled puzzle works offline after the first successful production load. The status above the home title says whether the browser is online; it does not affect core play.

## Enter digits, notes, and colours

Select a cell, choose an entry mode, then choose a number:

- **Digit** enters an answer.
- **Corner** stores short Snyder-style marks in the top-left corner, using the warm note colour. The marks stay on one line until they need to wrap.
- **Centre** stores a cool-coloured candidate list in the middle. It also wraps only when necessary and is cleared when the cell receives an answer.
- **Colour** applies one of six cell shades. Each coloured cell also has a bordered dot, so the state is not conveyed by colour alone.

Turn on **Multi-select** to add or remove individual cells from the selection. On a keyboard, Shift + arrow extends the selection; Shift-, Ctrl-, or Command-click also adds or removes a cell. An entry or clear action applies to every selected editable cell.

Given cells cannot be changed. If **Clean notes after entry** is on, entering a final digit removes it from corner and centre notes in peer cells.

Entering a final digit clears both corner and centre notes from that cell, because both note types describe an unanswered cell.

When several cells are selected, entering a digit from normal **Digit** mode defaults to corner notation across those cells. Explicit **Corner** and **Centre** modes keep their usual behavior.

Multi-cell notes use one selection-wide toggle: if any selected cell is missing the digit, STrack adds it to every selected cell. A second press removes it from every selected cell only once all of them contain it. Mixed selections therefore converge instead of swapping notes between cells.

**Calculate all candidates** removes corner notes and writes the candidates currently allowed by each empty editable cell's row, column, box, and recorded eliminations as centre notes. The entire calculation is one undoable action.

The number buttons use a 3×3 keypad. The most recently entered digit stays active and highlights matching placed values in the grid. Note digits are enlarged on phone screens. Matching corner, centre, and automatic candidate notes keep their original warm or cool text color and become slightly larger and bold, without a circle or background treatment. Turn on **Highlight values** to deselect cells and make keypad digits toggle independently, allowing several values to be highlighted together without changing the puzzle. Clicking blank space outside the grid and buttons clears the cell selection, highlight mode, and every active value highlight.

On a phone in portrait orientation, the player removes the redundant page heading and tightens its spacing so the board and complete number keypad remain available in the initial screen. Secondary selection and candidate tools continue below and can be reached by scrolling.

Solving the final cell triggers a short board pulse, animated completion banner, confetti, and a gentle vibration on supported devices. Reduced-motion preferences shorten these effects to an effectively static confirmation.

Once all nine instances of a digit are placed, its number-pad button turns grey. Clearing or undoing one of those values restores the button immediately; the grey state is informational and does not block note entry or corrections.

Given and entered values share the normal cell background. The separate peer shade identifies the selected cell's row, column, and box without implying that filled cells have a special state.

Peer shading is contextual: it appears only when the selected cell contains a placed value. Selecting an empty cell or a notes-only cell leaves its row, column, and box unshaded.

The puzzle board automatically expands when more screen width and height are available. It remains square and height-aware on desktop, tablet, phone, and short landscape screens so the grid grows without forcing the puzzle controls off-screen.

## Recent and completed puzzles

The home screen separates unfinished games under **Recent puzzles** from solved games under **Completed puzzles**. Each card has a delete control. Deletion removes the saved values, notes, colours, undo history, and elapsed time; while signed in, it also propagates through the private Firestore session to your other devices.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Arrow keys | Move the active cell |
| Shift + arrow | Extend the selection |
| 1–9 | Enter in the current mode |
| Backspace, Delete, or 0 | Clear in the current mode |
| N / C / M / V | Digit / corner / centre / colour mode |
| Ctrl/Command + Z | Undo |
| Ctrl/Command + Y or Command + Shift + Z | Redo |

## Hints

**Hint** is intentionally progressive:

1. STrack highlights the evidence and target cells.
2. It names the technique and explains the deduction in plain language.
3. **Show answer** exposes the exact placement or elimination without changing the grid.
4. **Apply deduction** places the forced value or records candidate eliminations.

You can **Dismiss hint** without applying it. Each puzzle keeps a private hint notebook; open **Previous hints** to review earlier explanations and reveal their answers again.

Release 1 supports naked and hidden singles, locked candidates, naked pairs, naked triples, and row-based X-Wing eliminations. Every bundled Easy, Medium, and Hard puzzle is automatically verified to have a complete path through this local technique set. Diabolical boards are playable and rated, but can require advanced techniques; their cards say that full hints may be unavailable.

## Ratings

`SE 2.8` is a SukakuExplainer rating. It represents the hardest logical technique used on that engine's selected solve path. It is a useful reproducible convention, not a universal or official Sudoku scale.

| Friendly label | SE value |
| --- | ---: |
| Easy | below 1.5 |
| Medium | 1.5–2.4 |
| Hard | 2.5–4.9 |
| Diabolical | 5.0 and above |

Open a puzzle's information button to see its exact rating, engine, upstream rating-version disclosure, source, licence, and catalogue version.

## Import and share

Open **Open** in the header and paste exactly 81 cells, using `1`–`9` for givens and `0` or `.` for blanks. Whitespace and common separators are ignored. STrack checks shape, conflicting givens, whether a solution exists, and whether it is unique.

Validation happens on the device. A copied share link stores only the givens in the `p` URL parameter. Imported puzzles are labelled **Unrated** because STrack does not pretend its uniqueness solver is an SE rating engine.

## Preferences, progress, and backups

Settings include system/light/dark theme, timer visibility, automatic candidates, note cleanup, peer highlights, matching-digit highlights, and optional mistake cues. Mistakes receive an outline and `!` marker in addition to colour.

The top-right **Settings & help** button is a toggle. Select it again to close the menu and return to the screen you opened it from, including an active puzzle.

STrack saves edits to IndexedDB on this device before attempting cloud synchronization. JSON backup import validates the file, adds missing game IDs, preserves existing games, and imports preferences. Reset actions are separately scoped to the current puzzle, completed history, or all local data.

### Continue between a PC and phone

Open **Settings & help → Cross-device sessions** and create an email/password account. Sign in with the same email on another device. STrack synchronizes each puzzle's entries, notes, colours, undo/redo state, elapsed time, completion state, active puzzle, and preferences through private owner-only Firestore documents.

Each edit remains usable offline. When connectivity returns, each puzzle reconciles by its newest saved version; a newer cloud puzzle is never overwritten by an older device copy. A sync status appears in the desktop header and account panel. Signing out does not delete device data. Local reset actions do not delete cloud copies.

Browser storage can be cleared or evicted by the browser or operating system. Cloud sync is continuity, not an archival backup. Download JSON backups periodically, especially before clearing browser data.

## Install and use offline

On a supported browser, install STrack from the browser's install or Add to Home Screen action after the first online production load. The versioned service worker caches the app shell, styles, help content, solver, and 80-puzzle catalogue. Current progress and preferences remain in IndexedDB; signed-in sessions synchronize when a connection is available.

Development mode does not register a service worker; use the production build or the published HTTPS site for installation checks.
