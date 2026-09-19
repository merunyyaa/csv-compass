# Sales insights implementation plan

**Goal:** Turn a CSV export of paid sales into an explainable comparison of two equal periods, entirely in the browser.

**Approved scope:** Local questions and exact calculations, without an external AI service. Extend the existing static application and its Node.js tests; add no dependencies. Work on `feat/sales-insights`. Publication requires a separate approval.

**Design:** Three selected columns represent sale date, product and total line amount in one currency. Recognize unambiguous Russian/English headers; require manual selection otherwise. Accept real calendar dates in YYYY-MM-DD or DD.MM.YYYY and nonnegative amounts with up to two decimal places. Calculate in integer hundredths and reject unsafe totals. Compare the selected inclusive interval with the immediately preceding interval of the same length. Default to seven days ending on the latest valid sale date. Report excluded rows and optional exact duplicate removal. Do not infer causes, completeness of an export or units sold.

## 1. Calculation and evidence

- [x] Add `tests/sales.test.js`: hand-checked sums, period boundaries, missing periods, decimal precision, invalid dates/amounts, duplicate policy, mapping ambiguity and overflow.
- [x] Observe failures with `node --test tests/sales.test.js`.
- [x] Implement `src/sales.js`: `suggestSalesColumns(headers)`, `prepareSales(table, mapping, deduplicate)`, `defaultSalesPeriod(prepared)`, `compareSales(prepared, start, end)`.
- [x] Implement `src/sales-answers.js`: four supported questions, answers derived only from comparison results, and a downloadable report with methods and product aggregates.
- [x] Test literal answers and exported evidence against independently calculated fixtures.

## 2. User flow

- [x] Add integration tests for a sales demo, manual column mapping, changing dates and duplicate policy, file replacement, invalid configuration, safe text rendering and download.
- [x] Implement `src/sales-view.js`, mounted from `src/app.js`; reset it whenever the dataset changes. Editing configuration must invalidate stale conclusions until recalculated.
- [x] Extend `index.html` and `styles.css` with accessible configuration controls, comparison metrics, four question buttons, product evidence and exclusions. Preserve generic CSV inspection.
- [x] Add synthetic sales data in `src/demo.js`; preserve the original data-quality example.
- [x] Update `scripts/serve.js` allowlist and exercise all new modules over HTTP in the existing server test.

## 3. Demonstration and verification

- [x] Update README with a reproducible one-minute demo, known results, input contract, privacy and honest non-AI labeling.
- [x] Run `npm run check`, syntax checks and local HTTP checks.
- [x] Review diff and history for secrets, personal information and temporary files. Repeat the audit after staging and before committing.

Verification on 2026-09-19: 55 tests passed; ESLint and Prettier passed; `node --check` passed for all 15 JavaScript files. The running preview returned HTTP 200 for the page, stylesheet and new modules. Browser inventory was empty, so visual layout and native browser interactions remain unverified; LinkeDOM tests cover DOM behavior only. No runtime or development dependencies were added.

Prepare one local feature commit only after the staged-file audit. Publication remains pending separate approval for the exact commit and repository.
