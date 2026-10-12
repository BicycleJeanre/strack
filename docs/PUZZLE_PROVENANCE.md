# Puzzle catalogue provenance

## Release catalogue

STrack release 1 bundles 80 puzzles in `src/data/puzzles.json`: 20 Easy, 20 Medium, 20 Hard, and 20 Diabolical. The file is part of the production JavaScript and service-worker cache, so play never depends on a live puzzle API.

Each record contains a stable bank ID, givens, locally computed solution, source, commit-pinned URL, provenance, public-domain licence note, exact SE rating, rating engine/version disclosure, friendly label, catalogue version, and local-hint coverage status.

## Source and licence

The source is the [Sudoku Exchange Puzzle Bank](https://github.com/grantm/sudoku-exchange-puzzle-bank), pinned at commit `d8c8ebaee0c08c412cfba96af1923dfa61c83317` (2023-09-23).

The source repository states that its puzzles were generated with QQWing, every puzzle has a unique solution, and the dataset is dedicated to the public domain under an Unlicense-style dedication.

The STrack interface and integration are independently implemented. No source code from `grantm/sudoku-web-app` is included. STrack is licensed AGPL-3.0-or-later and vendors the separate GPL-3.0-or-later HoDoKu TypeScript engine at commit `e5b01c91b9dca647a5cf276d69f311a1517c7fcb`; its source, licence, and notices are preserved under `vendor/hodoku-ts/`.

## Rating disclosure

The source bank states that puzzles were graded with SukakuExplainer, but it does not publish the exact engine build used for the stored ratings. STrack therefore records:

- `ratingEngine`: `SukakuExplainer`
- `ratingVersion`: `Upstream engine build not disclosed; bank snapshot d8c8eba`

This is explicit rather than inventing a version. The pinned snapshot makes the imported rating dataset reproducible. Puzzle details display both fields and the exact `SE` value.

The friendly bands match the source bank: Easy `< 1.5`, Medium `1.5–2.4`, Hard `2.5–4.9`, and Diabolical `≥ 5.0`. These thresholds are a product convention, not a universal standard.

## Selection and validation

`scripts/build-catalogue.mjs` reads the four upstream text files from a local clone selected with `SUDOKU_BANK` (default `/private/tmp/strack-puzzle-bank`), computes a solution independently, and writes the bundled JSON. Hard release puzzles are drawn from the lower part of the source band (`SE ≤ 3.2`). One SE 3.2 board retained from the original release selection is explicitly excluded and replaced by the next pinned-bank record.

`scripts/check-catalogue.mjs` checks metadata, ID uniqueness, digit shape, solution/given agreement, and at least 20 puzzles per band. The unit suite checks representative full paths, while the release audit runs the HoDoKu path generator over all 80 puzzles. The 2026-10-12 audit verified complete paths for all 60 Easy, Medium, and Hard puzzles and 10 of the 20 Diabolical puzzles.

Each record's `fullHints` value reflects that audit. The ten Diabolical puzzles whose solve paths exceed the enabled logical technique set retain `fullHints: false`; the library and help disclose the limitation. The other ten are marked for complete local hints.

## Refresh procedure

1. Clone or update the upstream bank and review licence/provenance changes.
2. Update the pinned commit and catalogue version in `scripts/build-catalogue.mjs`.
3. Run `SUDOKU_BANK=/path/to/bank npm run catalogue:build`.
4. Run `npm run catalogue:check` and `npm run test:unit`.
5. Run the full-catalogue HoDoKu path audit and update `fullHints` from the result. Resolve unexpected regressions before release and never mislabel unsupported puzzles.
6. Run the complete build and browser suite before review.

Do not use private collections or puzzles whose redistribution terms are unknown.
