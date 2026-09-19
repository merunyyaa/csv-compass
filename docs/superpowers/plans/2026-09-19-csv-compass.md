# CSV Compass Implementation Plan

**Goal:** A working standalone CSV explorer ready for local review and later publication.

**Architecture:** Static browser app with isolated pure parsing/analysis functions.
No runtime package or server API. A local development server binds to loopback.

**Tech Stack:** JavaScript ES modules, HTML, CSS, Node test runner, ESLint, Prettier, LinkeDOM.

**Spec:** `docs/superpowers/specs/2026-09-19-csv-compass-design.md`

## Global constraints

- No production dependencies; Node >=24 for development.
- UTF-8 only; 5 MiB, 20,000 records, 100 columns.
- Russian interface; synthetic demo only; no private-project materials.
- No remote, account changes, external publication, or push without target approval.

## Task 1: CSV analysis

- [x] Add `tests/csv.test.js`: quoted fields, BOM/CRLF, delimiter detection,
      missing cells, exact duplicates, numeric profiles, malformed input, limits.
- [x] Run `node --test tests/csv.test.js` and observe failing behavior.
- [x] Implement `parseCSV(text, delimiter = 'auto')` returning `{headers, rows, delimiter}`
      and `analyzeCSV(table)` returning counts, duplicate indexes, column profiles.
- [x] Run the same tests until all pass; preserve parsed strings.

Hand-checked fixture: `city,amount\nAstana,10\nAlmaty,\nAstana,10` must have
3 rows, 2 columns, 1 missing cell, 1 duplicate, and numeric amount mean 10.

## Task 2: Interface and report

- [x] Add report and DOM integration tests before implementation: demo loads,
      uploaded CSV replaces data, invalid input clears export, search filters records,
      page navigation works, HTML-like cell content remains literal text.
- [x] Implement `buildReport(table, analysis, filename)` in `src/report.js`.
- [x] Build `index.html`, `styles.css`, `src/app.js`, `src/main.js`, `src/demo.js`.
      `mountApp(document)` returns the file-loading function used by UI integration.
- [x] Show top eight nonempty values for a selected column with counts; no hidden
      aggregation or inference. Plain-text export includes filename and aggregate stats.
- [x] Verify UI behavior with LinkeDOM and attempt a real-browser review if available.
      Ten DOM tests pass, including actual download content. CUA reported no browsers;
      visual browser review remains outstanding and is not claimed as completed.

## Task 3: Delivery and checks

- [x] Add loopback-only development server with an explicit asset allowlist;
      test serving assets, HEAD, 404, method rejection, and private-file rejection.
- [x] Write README with launch/check commands, limits, algorithms, demo walkthrough,
      privacy behavior, AI-assisted development disclosure, and pending publication.
- [x] Run `npm run format`, `npm run check`, and syntax checks for all JavaScript.
      Result: 34 tests pass, ESLint and Prettier pass, 11 JavaScript syntax checks pass.
- [x] Review complete new-file diff, index, branch history, and file names for secrets,
      private data, temporary artifacts, scope, and personal Git identity before any commit.
- [x] Prepare local preview at `http://127.0.0.1:4173`; the server returns HTTP 200.
- [ ] Complete publication after target approval and authentication to the intended account.
