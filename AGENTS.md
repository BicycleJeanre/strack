# STrack Agent Instructions

## Product source of truth

- Read `docs/PRODUCT_BRIEF.md` before planning or implementing product work.
- Keep `README.md` and user-facing help aligned with implemented behavior.
- Treat `/Users/jay/gr/gtrack` as the primary reference for repository layout, Vite/TypeScript PWA conventions, GitHub Pages deployment, offline verification, responsive behavior, and automated testing.
- Treat `/Users/jay/gr/ftrack` and `/Users/jay/gr/gtrack` as visual-family references. Reuse their formatting language and interaction quality, not domain-specific screens or copied code.

## Licensing and puzzle provenance

- Do not copy code from `grantm/sudoku-web-app` unless the repository is deliberately relicensed compatibly with AGPL-3.0 and the implications are documented. Feature parity is a product reference, not permission to copy implementation.
- Every bundled or remotely fetched puzzle must have documented provenance and redistribution terms.
- Prefer the copyright-unencumbered Sudoku Exchange puzzle bank, original QQWing-generated puzzles, or clearly compatible licensed datasets.
- Store the rating engine and version with each puzzle. Display `SE` beside numeric ratings so difficulty is not presented as a universal official standard.

## Engineering defaults

- Build an original Vite + TypeScript installable PWA, deployable from `/strack/` on GitHub Pages.
- The core solver, hint engine, puzzle pack, saved progress, preferences, and help must work offline.
- Prefer IndexedDB for durable application state and a versioned service-worker cache for static assets and bundled puzzle catalogues.
- Use semantic HTML, accessible names, visible focus, keyboard parity, reduced-motion support, and colour-independent state cues.
- Add unit tests for puzzle validation, candidates, logical techniques, ratings metadata, persistence, import/export, and undo/redo; add Playwright coverage for desktop, mobile, offline restart, theme, notation, colour, hints, and GitHub Pages base paths.

## Git workflow

- Follow the global git-worktree routing skill before file-changing work.
- Use `main` as the protected release branch. Develop substantial changes on focused `codex/*` branches and merge through reviewed pull requests.
- Never commit credentials, private puzzle collections, or generated browser artifacts.

