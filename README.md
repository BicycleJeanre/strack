# STrack

STrack is an offline-first Sudoku PWA in the FTrack/GTrack product family. It combines a focused responsive puzzle desk with transparent Sudoku Explainer ratings, separate notation systems, progressive logical hints, and device-local privacy.

The production build is designed for `https://bicyclejeanre.github.io/strack/` and has no runtime server, account, analytics, ad, or third-party puzzle API dependency.

## Release 1

- 80 public-domain, uniquely solvable puzzles: 20 each in Easy, Medium, Hard, and Diabolical.
- Exact `SE` ratings, friendly bands, stable source IDs, catalogue version, and provenance visible for every bundled puzzle.
- Normal digits, separate corner/Snyder and centre/candidate marks, six cell colours, and additive multi-cell selection.
- Mouse, touch, and keyboard parity, including arrows, Shift-selection, number entry, notation shortcuts, and undo/redo.
- Progressive hints that identify evidence, name and explain the technique, then wait for a separate apply action. Easy, Medium, and Hard have verified complete local hint paths; Diabolical puzzles disclose that advanced hints may be partial.
- Automatic candidates, peer and matching-digit highlights, candidate cleanup, optional mistake cues, pause, optional timer, and light/dark/system themes.
- IndexedDB save/resume, recent completions, non-destructive JSON backup import, and scoped reset controls.
- Local puzzle import with shape, conflict, solution, and uniqueness checks plus URL-only sharing.
- Installable manifest and versioned app-shell cache. The app shell, help, solver, current progress, preferences, and full bundled catalogue relaunch offline.
- Responsive phone, desktop, portrait, and landscape layouts with visible focus, semantic names, reduced-motion support, and colour-independent status cues.

See [the user guide](docs/USER_GUIDE.md) and [puzzle provenance](docs/PUZZLE_PROVENANCE.md) for details.

## Run locally

Use Node 24 LTS (minimum 22.12):

```sh
npm ci
npm run dev
```

Development mode intentionally does not register a service worker. Verify install/offline behavior against a production build:

```sh
npm run build
npm run preview
```

## Verification

```sh
npm run catalogue:check
npm run test:unit
npm test
npm run test:base-path
```

`npm test` builds a relative-path production bundle and runs Chromium and WebKit, including a server-stop/reload check against the real service worker. `npm run test:base-path` separately proves that the deployable bundle uses `/strack/` for GitHub Pages assets and includes the offline shell.

The unit suite covers parsing, validation, uniqueness, solving, candidates, complete hint paths, ratings metadata, entry modes, undo/redo, IndexedDB persistence, and non-destructive backup handling. Browser coverage exercises desktop and narrow/landscape layouts, notation, colours, multi-select, keyboard controls, themes, help, import/share, offline progress, catalogue access, and provenance.

Before relying on a release on a real phone, smoke-test installation from HTTPS, airplane-mode launch, touch selection, rotation, OS theme changes, and backup restore. Desktop WebKit does not replace a physical iPhone check.

## Deployment

`.github/workflows/check.yml` runs catalogue, unit, production build, Chromium, WebKit, offline-restart, and base-path checks for pull requests and `main` pushes.

`.github/workflows/deploy.yml` is manual. It builds with `BASE_PATH=/strack/`, uploads `dist/`, and deploys through GitHub Pages. In repository settings, select **GitHub Actions** as the Pages source.

## Local data and privacy

STrack stores preferences, active boards, elapsed time, notation, colours, undo history, and completions in IndexedDB. Imports merge only missing game IDs and never replace an existing game. Browser storage can be cleared or evicted; a downloaded JSON export is the version 1 backup mechanism.

Share links contain the 81-character givens in the URL and do not upload a puzzle. Imported puzzles are solved and validated locally, labelled `Unrated`, and never assigned a fabricated SE value.

## Project references

- Product requirements: [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md)
- User behavior: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Catalogue source, licence, ratings, and refresh procedure: [docs/PUZZLE_PROVENANCE.md](docs/PUZZLE_PROVENANCE.md)
