# CSV Compass

Approved direction: one standalone public-portfolio candidate, built from scratch.

## Scope

A Russian-language browser app opens a CSV file or a synthetic demo. It shows
row/column counts, missing cells, exact duplicate records, column profiles,
a categorical frequency chart, a searchable table, and a downloadable text report.
The app never sends uploaded data to a server or persists it in browser storage.
No AI service, account, database, or production package is required.

## Data contract

- UTF-8 CSV with a header; comma, semicolon, or tab, detected or selected manually.
- Support quoted separators, escaped quotes, CRLF, and multiline fields.
- Reject broken quoting, blank/duplicate headers, inconsistent row widths,
  invalid UTF-8, files above 5 MiB, more than 20,000 records or 100 columns.
- Skip physically empty lines. Preserve quoted empty records and rows of delimiters.
- Missing means whitespace-only. Duplicate means identical parsed cell values;
  the count excludes the first occurrence. Do not trim values for duplicate checks.
- Numeric profiles accept finite decimal values, decimal commas, and scientific
  notation. Identifiers with leading zeros stay text. Dates stay text.
- Preview pages contain 25 records; filtering searches all records.
- Reports are plain UTF-8 text and contain aggregate statistics, not cell samples.

## Architecture

Static HTML, CSS, and browser ES modules. `src/csv.js` parses and profiles data;
`src/report.js` builds report text; `src/app.js` owns UI state and rendering.
`src/main.js` mounts the application. `src/demo.js` contains synthetic records.
Node 24 or newer runs processing and DOM integration tests; development-only
ESLint, Prettier, and LinkeDOM support checks. A small localhost server serves only
explicit app assets. No production dependencies and no build step.

## Visual direction

A calm blue workspace on a pale blue-gray canvas. White working surfaces,
navy typography, cobalt actions, amber quality warnings, mint privacy indicator.
Palette: canvas #f2f5fa, surface #ffffff, ink #192c48, blue #2458d3,
amber #946000, mint #14745b. Use Segoe UI with system fallbacks; numbers use
tabular figures. Align content left. The chart and table are the main visual
objects; avoid a marketing landing page or repeated decorative cards.

Desktop: narrow upload/instructions sidebar beside the analysis workspace.
Mobile: upload section above analysis; tables scroll inside their own container.
Visible keyboard focus, semantic controls, readable empty/error states, no required
motion. Layout choice directly supports file inspection instead of generic metrics.

## Publication boundary

Local task branch only, no remote or push until the new GitHub account and exact
publication target are confirmed. No private-project code, assets, data, or history are used.
Do not claim acceptance by HackAlem or describe this deterministic app as AI.
