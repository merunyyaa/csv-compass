import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../src/csv.js";
import { prepareSales, compareSales } from "../src/sales.js";
import {
  answerSales,
  buildSalesReport,
  formatAmount,
} from "../src/sales-answers.js";

const mapping = { date: 0, product: 1, amount: 2 };
const report = () =>
  compareSales(
    prepareSales(
      parseCSV(`date,product,amount
2026-09-01,Tea,100
2026-09-07,Tea,100
2026-09-07,Coffee,100
2026-09-08,Tea,50
2026-09-14,Coffee,150
2026-09-14,Cocoa,25
2026-02-30,Coffee,1000`),
      mapping,
    ),
    "2026-09-08",
    "2026-09-14",
  );

test("revenue answer exposes exact totals and a verifiable percent", () => {
  const answer = answerSales(report(), "revenue");
  assert.match(answer.text, /225,00/);
  assert.match(answer.text, /300,00/);
  assert.match(answer.text, /−25%/);
  assert.match(answer.method, /предыдущ/);
});

test("the maximum accepted amount preserves every hundredth in calculations and output", () => {
  const result = compareSales(
    prepareSales(
      parseCSV("date,product,amount\n2026-09-14,A,90071992547409.91"),
      mapping,
    ),
    "2026-09-14",
    "2026-09-14",
  );
  assert.equal(result.current.cents, 9007199254740991);
  assert.equal(
    formatAmount(result.current.cents).replace(/\s/g, ""),
    "90071992547409,91",
  );
});
test("decline answers are ranked by absolute lost revenue with no invented cause", () => {
  const answer = answerSales(report(), "declines");
  assert.equal(answer.evidence.length, 1);
  assert.equal(answer.evidence[0].product, "Tea");
  assert.match(answer.text, /150,00/);
  assert.match(answer.method, /причин/i);
});
test("leaders use revenue rather than frequency and quality discloses invalid rows", () => {
  assert.equal(answerSales(report(), "leaders").evidence[0].product, "Coffee");
  assert.match(answerSales(report(), "quality").text, /1/);
  assert.match(answerSales(report(), "quality").method, /строк/i);
  assert.throws(() => answerSales(report(), "predict"), /вопрос/i);
});
test("empty prior period is described as missing observations without a growth claim", () => {
  const currentOnly = compareSales(
    prepareSales(parseCSV("d,p,a\n2026-09-14,A,10"), mapping),
    "2026-09-14",
    "2026-09-14",
  );
  const answer = answerSales(currentOnly, "revenue");
  assert.match(answer.text, /нет.*строк/i);
  assert.doesNotMatch(answer.text, /Infinity|NaN|100%/);
});
test("downloaded report preserves periods, mapping, totals and escaped product names", () => {
  const text = buildSalesReport(report(), {
    filename: "demo\n.csv",
    headers: ["date", "product", "amount"],
    mapping,
  });
  assert.match(text, /2026-09-01.*2026-09-07/);
  assert.match(text, /2026-09-08.*2026-09-14/);
  assert.match(text, /225,00/);
  assert.match(text, /"Tea".*200,00.*50,00/);
  assert.match(text, /demo\\n.csv/);
  assert.match(text, /7.*некорректная дата/);
  assert.match(text, /"date"/);
});
