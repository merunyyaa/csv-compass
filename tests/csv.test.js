import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, analyzeCSV } from "../src/csv.js";

test("quoted separators, escaped quotes, and multiline fields are preserved", () => {
  assert.deepEqual(parseCSV('name,note\r\n"A, B","say ""hi""\r\nnext"\r\n'), {
    headers: ["name", "note"],
    rows: [["A, B", 'say "hi"\r\nnext']],
    delimiter: ",",
  });
});

test("BOM and semicolon exports support decimal commas without splitting them", () => {
  const table = parseCSV("\uFEFFcity;amount\r\nAstana;12,5\r\nAlmaty;7,5");
  assert.equal(table.delimiter, ";");
  assert.deepEqual(table.headers, ["city", "amount"]);
  assert.deepEqual(table.rows, [
    ["Astana", "12,5"],
    ["Almaty", "7,5"],
  ]);
  assert.equal(analyzeCSV(table).columns[1].mean, 10);
});

test("tab-separated and single-column files are supported", () => {
  assert.equal(parseCSV("city\tcount\nAstana\t3").delimiter, "\t");
  assert.deepEqual(parseCSV("city\nAstana\nAlmaty").rows, [
    ["Astana"],
    ["Almaty"],
  ]);
});

test("manual delimiter choice handles ambiguous headers", () => {
  assert.deepEqual(parseCSV("last, first;count\nA;2", ";").headers, [
    "last, first",
    "count",
  ]);
});

test("empty physical lines are skipped but explicit empty records are counted", () => {
  assert.deepEqual(parseCSV('a,b\n\n,\n"",\n').rows, [
    ["", ""],
    ["", ""],
  ]);
  assert.deepEqual(parseCSV('a\n""\n').rows, [[""]]);
});

test("missing cells and duplicate records use distinct, documented definitions", () => {
  const summary = analyzeCSV(
    parseCSV("city,amount\nAstana,10\nAlmaty,\nAstana,10"),
  );
  assert.equal(summary.rowCount, 3);
  assert.equal(summary.columnCount, 2);
  assert.equal(summary.missingCount, 1);
  assert.equal(summary.duplicateCount, 1);
  assert.deepEqual(summary.duplicateIndexes, [2]);
  assert.equal(summary.completeness, (100 * 5) / 6);
  assert.equal(summary.columns[1].type, "number");
  assert.equal(summary.columns[1].mean, 10);
  assert.equal(summary.columns[0].unique, 2);
});

test("duplicates preserve whitespace, case, and cell boundaries", () => {
  const summary = analyzeCSV(parseCSV('a,b\nA,1\n A,1\na,1\n"a,b",c\na,"b,c"'));
  assert.equal(summary.duplicateCount, 0);
});

test("whitespace-only cells are missing and identifier zeros stay text", () => {
  const summary = analyzeCSV(
    parseCSV("id,value,empty\n001,-2,  \n002,6,\n003,2,"),
  );
  assert.equal(summary.columns[0].type, "text");
  assert.equal(summary.columns[1].min, -2);
  assert.equal(summary.columns[1].max, 6);
  assert.equal(summary.columns[1].mean, 2);
  assert.equal(summary.columns[2].type, "empty");
  assert.equal(summary.missingCount, 3);
});

test("mixed types and nonfinite numeric strings remain text", () => {
  assert.equal(analyzeCSV(parseCSV("a\n10\nunknown")).columns[0].type, "text");
  assert.equal(analyzeCSV(parseCSV("a\n1e999")).columns[0].type, "text");
  assert.equal(analyzeCSV(parseCSV("a\n2e2\n-10")).columns[0].mean, 95);
});

test("frequency profiles use stable first-seen ordering to break ties", () => {
  const column = analyzeCSV(parseCSV("a\nAstana\nAlmaty\nAstana\nShymkent"))
    .columns[0];
  assert.deepEqual(column.topValues, [
    { value: "Astana", count: 2 },
    { value: "Almaty", count: 1 },
    { value: "Shymkent", count: 1 },
  ]);
});

test("header-only files produce a finite empty summary", () => {
  const summary = analyzeCSV(parseCSV("a,b\n"));
  assert.equal(summary.rowCount, 0);
  assert.equal(summary.completeness, 100);
  assert.equal(summary.columns[0].type, "empty");
});

for (const [name, csv] of [
  ["empty file", ""],
  ["blank header", "a,\n1,2"],
  ["duplicate headers", "a,a\n1,2"],
  ["short row", "a,b\n1"],
  ["long row", "a,b\n1,2,3"],
  ["unclosed quote", 'a\n"broken'],
  ["quote inside unquoted field", 'a\nab"cd'],
  ["trailing text after closing quote", 'a\n"ab"cd'],
  ["binary input", "a\nx\u0000"],
]) {
  test(`rejects ${name} instead of silently changing data`, () => {
    assert.throws(() => parseCSV(csv), /CSV|заголов|строк|кавыч|пуст|символ/i);
  });
}

test("limits reject oversized input before producing a partial analysis", () => {
  assert.throws(
    () => parseCSV("a\n" + "x".repeat(5 * 1024 * 1024)),
    /5|размер/i,
  );
  assert.throws(() => parseCSV("a\n" + "x\n".repeat(20001)), /20|строк/i);
  assert.throws(
    () => parseCSV(Array.from({ length: 101 }, (_, i) => `c${i}`).join(",")),
    /100|столб/i,
  );
  assert.throws(() => parseCSV("a\n1", "|"), /разделител/i);
});
