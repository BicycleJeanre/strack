# STrack product brief

## Goal

Build a polished Sudoku application in the FTrack/GTrack product family. It must be hosted publicly with GitHub Pages, installable as a progressive web app, and remain useful offline with a bundled selection of puzzles across multiple difficulty levels.

The interaction target is functional parity with the strongest parts of Sudoku Exchange, implemented independently and presented with STrack's own design:

- normal digit entry;
- separate corner/Snyder marks and centre/candidate notation;
- multiple cell colours, including multi-cell selection;
- logical, explanatory hints rather than unexplained answer reveals;
- a progressive technique-training curriculum that separates learning, pattern recognition, and deduction;
- automatic candidate display and clean-up options;
- matching-digit and peer highlighting;
- undo/redo;
- timer with a disable option;
- saved progress and resume;
- light, dark, and system themes;
- keyboard, mouse, and touch support;
- responsive portrait and landscape layouts;
- puzzle entry/import, uniqueness validation, and shareable puzzle links.

## Product and visual conventions

Inspect FTrack and GTrack before implementation. Match their disciplined spacing, compact controls, clear hierarchy, rounded panels, charcoal/cyan visual family, responsive behavior, contextual help, empty/error/loading states, and user-facing documentation conventions. Do not transplant finance or training navigation into a puzzle app; the Sudoku board must remain the visual centre of gravity.

Use the GTrack technical pattern unless implementation evidence supports a better equivalent:

- Vite + TypeScript;
- static GitHub Pages build with a configurable base path;
- installable manifest and versioned service worker;
- device-first persistence;
- deterministic unit tests plus Chromium and WebKit Playwright coverage;
- manual production deployment workflow after checks pass.

The original first-release scope excluded cloud accounts. Before production deployment, the product owner extended the release to include optional Firebase email/password accounts and private cross-device puzzle-session synchronization. Offline play still must not depend on sign-in or a server: every edit saves to IndexedDB first, and the bundled catalogue, solver, hints, preferences, help, and active progress remain available offline.

## Puzzle supply and provenance

Do not make gameplay depend on a live third-party API. Use a versioned static catalogue that is bundled into the production build and can later be refreshed from a reviewed GitHub-hosted catalogue.

Recommended source order:

1. Sudoku Exchange's public puzzle-bank repository. Its maintainers state that its QQWing-generated puzzles are not copyright-encumbered and may be used and shared for any purpose. The puzzles are already rated with SukakuExplainer.
2. Original puzzles generated with QQWing and rated during catalogue preparation with a pinned SukakuExplainer version.
3. The CC0 `synnwang/sudoku_dataset_difficulty` dataset as a research or validation source. Its human-player metrics are useful supplementary evidence but are not SE ratings and must not be labelled as such.

Record at least: stable puzzle ID, 81-character givens, solution, source/provenance, source URL or generator version, licence/provenance note, SE numeric rating, rating engine/version, named difficulty band, and catalogue version. Validate uniqueness and the stored solution during the build.

Bundle a meaningful starter catalogue rather than only two or three boards: target at least 20 puzzles in each of four bands for release, while keeping the app shell small enough for reliable offline installation. A user should be able to explicitly download or cache larger packs later.

## Difficulty model

There is no single governing official Sudoku difficulty scale. Use Sudoku Explainer/SukakuExplainer ratings because they are a recognised, reproducible convention and are also used by Sudoku Exchange.

Display the numeric value as `SE 2.8`, with an information affordance explaining that the value represents the hardest logical technique required on the engine's selected solve path. Also provide friendly labels using the same thresholds as Sudoku Exchange unless product testing gives a compelling reason to change them:

| Label | SE rating |
| --- | ---: |
| Easy | `< 1.5` |
| Medium | `1.5–2.4` |
| Hard | `2.5–4.9` |
| Diabolical | `≥ 5.0` |

Always show the exact SE value in puzzle details and filters. Never imply the friendly bands are universal or official.

## Hint engine

Hints must be progressive and educational:

1. identify the relevant cells/units/candidates visually;
2. name the technique;
3. explain the deduction in plain language;
4. offer a second action to apply the elimination or value;
5. reveal a solution value only through an explicit fallback action.

The first release must support at least the techniques necessary for its bundled Easy, Medium, and Hard puzzles. Do not include a puzzle in an advertised band if the local hint engine cannot explain a complete logical path through it. More advanced SE-rated puzzles may be labelled as unsupported for full hints until the relevant techniques exist.

## Core screens and flows

- Home: resume active puzzle, open deterministic daily or weekly challenges for every difficulty, choose a new puzzle by band/SE range, enter training, open a puzzle string/link, and view recent completions. Challenge periods use UTC/ISO-week keys, work from the bundled offline catalogue, and resume the same local or synced game.
- Training: a curriculum hub with interactive family filters and a lesson player spanning singles, intersections, subsets, fish, single-digit patterns, wings, coloring, chains, uniqueness, ALS, and forcing logic. Lessons use bundled puzzle positions where the local hint engine can derive them and focused original candidate diagrams for advanced patterns, then progress through Learn, Find, Deduce, and Complete.
- Puzzle player: grid, number pad, normal/corner/centre modes, colour palette, undo/redo, timer, hint, settings, pause, and completion state.
- Puzzle library: filters for difficulty, completion, source, and rating; accessible compact cards; deterministic random choice.
- Import/share: accept common 81-character formats with `0` or `.` blanks, validate shape and uniqueness, and generate a URL-safe share link without uploading the puzzle.
- Settings/help: theme, highlight and candidate preferences, timer, mistake behavior, notation explanation, keyboard shortcuts, SE explanation, data controls, and offline status.

## Local data and privacy

- Save preferences, technique-training progress, puzzle history, active boards, elapsed time, notes, colours, undo history, and catalogue version locally.
- Support JSON export/import with validation and non-destructive conflict handling.
- Provide clear reset actions scoped to the current puzzle, history, or all local data.
- Make it explicit that browser storage can be cleared or evicted and that export is the backup mechanism in version 1.
- No analytics, ads, or network calls are required for core play.
- Optional signed-in sync stores each user's games, settings, and training progress only under owner-protected Firestore paths and reconciles by the newest saved version.

## Acceptance criteria for the first implementation task

- The app runs locally and builds for the `/strack/` GitHub Pages base path.
- It is installable and relaunches offline with the app shell, help, current progress, and bundled puzzle catalogue available.
- At least 80 uniquely solvable, redistributable puzzles are bundled across four documented SE bands.
- Every puzzle exposes provenance, exact SE rating, rating engine/version, and friendly label.
- Normal digits, corner marks, centre marks, colours, multi-cell selection, undo/redo, automatic candidates, highlighting, timer, save/resume, light/dark/system theme, and keyboard/touch flows work.
- Hints name and explain logical techniques and visually mark the relevant evidence.
- Training teaches every technique currently supported by the local hint engine plus the documented advanced curriculum through interactive pattern and deduction exercises, works offline, and retains progress across signed-in devices.
- Daily and weekly challenge cards expose all four difficulty bands, remain stable for their UTC period, work offline, and resume existing cross-device sessions.
- Imported puzzles are validated and can be shared entirely client-side.
- Responsive behavior is verified for a narrow phone viewport and desktop; controls remain usable in portrait and landscape.
- Accessibility tests cover focus, names, contrast, non-colour cues, reduced motion, and keyboard-only completion of essential flows.
- Unit, build, Chromium, WebKit, offline-restart, and base-path tests pass.
- `README.md`, user guide, puzzle provenance documentation, and GitHub Pages workflow are complete.

## Research references

- Sudoku Exchange player source and feature reference: <https://github.com/grantm/sudoku-web-app> (AGPL-3.0; do not copy without deliberate licence compatibility).
- Sudoku Exchange product behavior: <https://sudokuexchange.com/>.
- Sudoku Exchange puzzle-bank provenance and difficulty thresholds: <https://sudokuexchange.com/puzzle-bank/>.
- Sudoku Exchange public puzzle bank: <https://github.com/grantm/sudoku-exchange-puzzle-bank>.
- QQWing generator: <https://github.com/stephenostermiller/qqwing>.
- SukakuExplainer rating engine and documentation: <https://github.com/SudokuMonster/SukakuExplainer>.
- CC0 human difficulty dataset: <https://github.com/synnwang/sudoku_dataset_difficulty>.
