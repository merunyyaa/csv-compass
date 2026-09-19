import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, analyzeCSV } from "../src/csv.js";
import { buildReport } from "../src/report.js";

test("report exports hand-checked statistics without exposing cell samples", () => {
  const table = parseCSV(
    "city,amount\nPrivateCity,10\nElsewhere,\nPrivateCity,10",
  );
  const report = buildReport(table, analyzeCSV(table), "sample.csv");
  assert.match(report, /Строки данных: 3/);
  assert.match(report, /Столбцы: 2/);
  assert.match(report, /Пустые ячейки: 1/);
  assert.match(report, /Дубликаты строк: 1/);
  assert.match(report, /Среднее: 10/);
  assert.doesNotMatch(report, /PrivateCity|Elsewhere/);
});

test("report escapes line breaks in untrusted filenames and headers", () => {
  const table = parseCSV('"a\nFake: 200"\n1');
  const report = buildReport(table, analyzeCSV(table), "file\nRows: 999");
  assert.doesNotMatch(report, /\nFake:|\nRows:/);
  assert.match(report, /file\\nRows: 999/);
});
