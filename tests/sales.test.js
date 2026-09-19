import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../src/csv.js";
import {
  suggestSalesColumns,
  prepareSales,
  defaultSalesPeriod,
  compareSales,
} from "../src/sales.js";

const mapping = { date: 0, product: 1, amount: 2 };
const sample = () =>
  prepareSales(
    parseCSV(`Дата,Товар,Сумма
2026-09-01,Чай,100
2026-09-07,Чай,100
2026-09-07,Кофе,100
2026-09-08,Чай,50
2026-09-14,Кофе,150
2026-09-14,Какао,25
2026-09-15,Чай,999`),
    mapping,
  );

test("equal adjacent periods include both boundaries and exclude later sales", () => {
  const report = compareSales(sample(), "2026-09-08", "2026-09-14");
  assert.equal(report.previous.start, "2026-09-01");
  assert.equal(report.previous.end, "2026-09-07");
  assert.equal(report.days, 7);
  assert.equal(report.previous.cents, 30000);
  assert.equal(report.current.cents, 22500);
  assert.equal(report.current.count, 3);
  assert.equal(report.deltaCents, -7500);
  assert.equal(report.changePercent, -25);
  assert.equal(report.outsideCount, 1);
  assert.deepEqual(
    report.products.find((p) => p.product === "Чай"),
    {
      product: "Чай",
      previousCents: 20000,
      currentCents: 5000,
      previousCount: 2,
      currentCount: 1,
      deltaCents: -15000,
      changePercent: -75,
    },
  );
  assert.equal(
    report.products.find((p) => p.product === "Какао").changePercent,
    null,
  );
});

test("default seven-day interval is anchored to the latest valid sale, not today", () => {
  assert.deepEqual(defaultSalesPeriod(sample()), {
    start: "2026-09-09",
    end: "2026-09-15",
  });
});

test("decimal amounts add exactly in hundredths and Russian dates are supported", () => {
  const table = parseCSV(
    "Дата;Товар;Сумма\n01.03.2024;A;0,10\n01.03.2024;A;0,20\n29.02.2024;A;0,15",
  );
  const report = compareSales(
    prepareSales(table, mapping),
    "2024-03-01",
    "2024-03-01",
  );
  assert.equal(report.previous.start, "2024-02-29");
  assert.equal(report.current.cents, 30);
  assert.equal(report.previous.cents, 15);
  assert.equal(report.changePercent, 100);
});

test("invalid sales are disclosed by original data row and never silently coerced", () => {
  const table = parseCSV(`date,product,amount
2026-02-29,A,10
2026-09-01,A,1e3
2026-09-01,A,-10
2026-09-01,A,1.234
2026-09-01, ,10
2026-09-01,A,
2026-09-01,A,0
2026-09-02,A,90071992547410`);
  const result = prepareSales(table, mapping);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(
    result.invalid.map((r) => r.rowNumber),
    [1, 2, 3, 4, 5, 6, 8],
  );
  assert.ok(result.invalid.every((r) => r.reasons.length > 0));
  assert.deepEqual(defaultSalesPeriod(result), {
    start: "2026-08-26",
    end: "2026-09-01",
  });
});

test("exact duplicate removal is explicit and preserves distinct transactions", () => {
  const table = parseCSV(
    "date,product,amount,id\n2026-09-01,A,10,1\n2026-09-01,A,10,1\n2026-09-01,A,10,2",
  );
  assert.equal(prepareSales(table, mapping).rows.length, 3);
  const unique = prepareSales(table, mapping, true);
  assert.equal(unique.rows.length, 2);
  assert.equal(unique.excludedDuplicates, 1);
  assert.equal(unique.duplicateCount, 1);
});

test("header suggestions do not guess ambiguous fields and invalid mappings fail", () => {
  assert.deepEqual(
    suggestSalesColumns([" date ", "Product", "total"]),
    mapping,
  );
  assert.equal(
    suggestSalesColumns(["date", "product", "amount", "Сумма"]).amount,
    -1,
  );
  assert.equal(suggestSalesColumns(["n"]).date, -1);
  const table = parseCSV("date,product,amount\n2026-09-01,A,10");
  for (const fields of [
    { date: -1, product: 1, amount: 2 },
    { date: 0, product: 0, amount: 2 },
    { date: 0, product: 1, amount: 3 },
  ]) {
    assert.throws(() => prepareSales(table, fields), /столбц/i);
  }
});

test("zero baseline does not invent a percent and empty periods remain explicit", () => {
  const result = compareSales(sample(), "2026-09-01", "2026-09-07");
  assert.equal(result.changePercent, null);
  assert.equal(result.previous.count, 0);
  const empty = compareSales(sample(), "2026-10-01", "2026-10-07");
  assert.equal(empty.current.count, 0);
  assert.equal(empty.products.length, 0);
});

test("invalid, reversed, oversized intervals and missing usable rows are rejected", () => {
  for (const [start, end] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-09-10", "2026-09-01"],
    ["2025-01-01", "2026-09-01"],
    ["", "2026-09-01"],
  ]) {
    assert.throws(() => compareSales(sample(), start, end), /дат|период|дн/i);
  }
  assert.throws(
    () => defaultSalesPeriod(prepareSales(parseCSV("d,p,a"), mapping)),
    /строк/i,
  );
});

test("unsafe aggregated amounts fail instead of returning rounded totals", () => {
  const data = prepareSales(
    parseCSV(
      "date,product,amount\n2026-09-01,A,50000000000000\n2026-09-01,B,50000000000000",
    ),
    mapping,
  );
  assert.throws(
    () => compareSales(data, "2026-09-01", "2026-09-01"),
    /точност|слишком/i,
  );
});
