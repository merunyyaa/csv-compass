import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { mountApp } from "../src/app.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
function setup() {
  const { document, window } = parseHTML(html);
  const app = mountApp(document);
  return { document, window, app, el: (id) => document.getElementById(id) };
}
function csvFile(text, name = "sample.csv") {
  return new File([text], name, { type: "text/csv" });
}

test("demo button opens a working analysis from the empty state", () => {
  const { el } = setup();
  assert.equal(el("export-button").disabled, true);
  el("demo-button").click();
  assert.equal(el("results").hidden, false);
  assert.equal(el("empty-state").hidden, true);
  assert.equal(el("row-count").textContent, "18");
  assert.equal(el("duplicate-count").textContent, "2");
  assert.equal(el("export-button").disabled, false);
});

test("uploaded file produces metrics and search filters all records", async () => {
  const { app, el, window } = setup();
  await app.loadFile(csvFile("city,amount\nAstana,10\nAlmaty,\nAstana,10"));
  assert.equal(el("missing-count").textContent, "1");
  assert.equal(el("duplicate-count").textContent, "1");
  assert.equal(el("data-body").children.length, 3);
  el("search").value = "almaty";
  el("search").dispatchEvent(new window.Event("input"));
  assert.equal(el("data-body").children.length, 1);
  assert.match(el("data-body").textContent, /Almaty/);
  el("search").value = "not found";
  el("search").dispatchEvent(new window.Event("input"));
  assert.equal(el("no-matches").hidden, false);
});

test("invalid file clears stale results and prevents exporting the previous dataset", async () => {
  const { app, el } = setup();
  el("demo-button").click();
  await app.loadFile(csvFile("a,b\n1"));
  assert.equal(el("results").hidden, true);
  assert.equal(el("export-button").disabled, true);
  assert.equal(el("error").hidden, false);
  assert.match(el("error").textContent, /полей|CSV/);
});

test("HTML in values and filenames is rendered as text, including chart labels", async () => {
  const { app, el, document } = setup();
  await app.loadFile(
    csvFile("city\n<img src=x onerror=alert(1)>", "<script>evil</script>.csv"),
  );
  assert.equal(el("data-body").querySelector("img"), null);
  assert.equal(el("chart").querySelector("img"), null);
  assert.equal(document.querySelectorAll("script").length, 1);
  assert.match(el("data-body").textContent, /<img/);
});

test("pagination and subsequent file selection reset the current page", async () => {
  const { app, el } = setup();
  await app.loadFile(
    csvFile("n\n" + Array.from({ length: 30 }, (_, i) => i + 1).join("\n")),
  );
  assert.equal(el("data-body").children.length, 25);
  el("next-page").click();
  assert.equal(el("data-body").children.length, 5);
  assert.match(el("page-description").textContent, /26–30/);
  await app.loadFile(csvFile("n\n1"));
  assert.equal(el("data-body").children.length, 1);
  assert.equal(el("previous-page").disabled, true);
});

test("header-only CSV shows no-data state without an invalid percentage", async () => {
  const { app, el } = setup();
  await app.loadFile(csvFile("a,b"));
  assert.equal(el("row-count").textContent, "0");
  assert.match(el("quality-note").textContent, /нет строк/i);
  assert.equal(el("next-page").disabled, true);
});

test("invalid UTF-8 is rejected with a useful encoding error", async () => {
  const { app, el } = setup();
  await app.loadFile(new File([new Uint8Array([0xff, 0xfe, 0x00])], "bad.csv"));
  assert.equal(el("export-button").disabled, true);
  assert.match(el("error").textContent, /UTF-8/);
});

test("a late file read cannot replace a newer file selection", async () => {
  const { app, el } = setup();
  let finishRead;
  const slowFile = {
    name: "old.csv",
    size: 10,
    arrayBuffer: () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  };
  const pending = app.loadFile(slowFile);
  await app.loadFile(csvFile("n\n2\n3", "new.csv"));
  finishRead(new TextEncoder().encode("n\n1").buffer);
  await pending;
  assert.equal(el("row-count").textContent, "2");
  assert.match(el("file-description").textContent, /new.csv/);
});

test("file picker event loads the selected file and clears the picker for reuse", async () => {
  const { el, window } = setup();
  Object.defineProperty(el("file-input"), "files", {
    value: [csvFile("a\n1\n2")],
  });
  el("file-input").dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(el("row-count").textContent, "2");
  assert.equal(el("file-input").value, "");
});

test("download button produces the report for the full dataset after filtering", async () => {
  const { app, document, el, window } = setup();
  await app.loadFile(csvFile("city,amount\nAstana,10\nAlmaty,20"));
  el("search").value = "Astana";
  el("search").dispatchEvent(new window.Event("input"));
  let download;
  document.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      event.preventDefault();
      download = { url: event.target.href, filename: event.target.download };
    }
  });
  el("export-button").click();
  assert.equal(download.filename, "csv-compass-report.txt");
  const response = await fetch(download.url);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  const report = await response.text();
  assert.match(report, /Строки данных: 2/);
  assert.match(report, /Среднее: 15/);
});

test("sales demo produces a hand-checked period comparison and explained declines", () => {
  const { el, document } = setup();
  assert.ok(el("sales-demo-button"));
  el("sales-demo-button").click();
  assert.equal(el("sales-results").hidden, false);
  assert.equal(el("sales-start").value, "2026-09-08");
  assert.equal(el("sales-end").value, "2026-09-14");
  assert.equal(el("sales-current").textContent.replace(/\s/g, ""), "85000,00");
  assert.equal(
    el("sales-previous").textContent.replace(/\s/g, ""),
    "100000,00",
  );
  assert.equal(el("sales-change").textContent, "−15%");
  document.querySelector('[data-sales-question="declines"]').click();
  assert.match(el("sales-answer").textContent, /Кофе/);
  assert.match(el("sales-answer").textContent.replace(/\s/g, ""), /20000,00/);
  assert.equal(el("sales-evidence").children.length, 1);
});

test("editing sales dates invalidates conclusions until recalculation and resets on a new file", async () => {
  const { el, window, app } = setup();
  assert.ok(el("sales-demo-button"));
  el("sales-demo-button").click();
  el("sales-start").value = "2026-10-01";
  el("sales-start").dispatchEvent(new window.Event("input"));
  assert.equal(el("sales-results").hidden, true);
  assert.equal(el("sales-export").disabled, true);
  el("sales-apply").click();
  assert.equal(el("sales-error").hidden, false);
  await app.loadFile(csvFile("x,y\n1,2"));
  assert.equal(el("sales-start").value, "");
  assert.equal(el("sales-results").hidden, true);
  assert.equal(el("sales-answer").textContent, "");
});

test("manual column mapping works for unfamiliar headers and duplicates are opt-in", async () => {
  const { app, el, window } = setup();
  await app.loadFile(
    csvFile("when,what,paid\n2026-09-14,A,10\n2026-09-14,A,10"),
  );
  assert.ok(el("sales-results"));
  assert.equal(el("sales-results").hidden, true);
  for (const [field, index] of [
    ["date", 0],
    ["product", 1],
    ["amount", 2],
  ]) {
    // LinkeDOM clears the select when a later option gets selected=false.
    for (const option of el(`sales-${field}`).options)
      option.removeAttribute("selected");
    el(`sales-${field}`)
      .querySelector(`option[value="${index}"]`)
      .setAttribute("selected", "");
    el(`sales-${field}`).dispatchEvent(new window.Event("change"));
  }
  el("sales-apply").click();
  assert.equal(el("sales-current").textContent, "20,00");
  el("sales-deduplicate").checked = true;
  el("sales-deduplicate").dispatchEvent(new window.Event("change"));
  assert.equal(el("sales-results").hidden, true);
  el("sales-apply").click();
  assert.equal(el("sales-current").textContent, "10,00");
});

test("sales product names remain text and all invalid rows are explained", async () => {
  const { app, el } = setup();
  await app.loadFile(
    csvFile(
      "date,product,amount\n2026-09-14,<img src=x onerror=alert(1)>,10\n2026-02-30,A,20",
    ),
  );
  assert.ok(el("sales-results"));
  assert.equal(el("sales-results").hidden, false);
  assert.equal(el("sales-evidence").querySelector("img"), null);
  assert.match(el("sales-evidence").textContent, /<img/);
  assert.match(el("sales-invalid").textContent, /2.*некорректная дата/);
});

test("sales download contains the current comparison and is unaffected by table search", async () => {
  const { el, window, document } = setup();
  assert.ok(el("sales-demo-button"));
  el("sales-demo-button").click();
  el("search").value = "не существует";
  el("search").dispatchEvent(new window.Event("input"));
  let url;
  document.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      event.preventDefault();
      url = event.target.href;
    }
  });
  el("sales-export").click();
  const report = await (await fetch(url)).text();
  assert.match(report.replace(/\s/g, ""), /85000,00/);
  assert.match(report, /2026-09-08/);
  assert.match(report, /"Кофе"/);
});

test("an entirely invalid sales file exposes row errors and disables the old report", async () => {
  const { app, el } = setup();
  el("sales-demo-button").click();
  await app.loadFile(
    csvFile("date,product,amount\n2026-02-30,A,10\n2026-09-14,B,-5"),
  );
  assert.equal(el("sales-results").hidden, true);
  assert.equal(el("sales-export").disabled, true);
  assert.equal(el("sales-error").hidden, false);
  assert.equal(el("sales-exclusions").hidden, false);
  assert.equal(el("sales-invalid").children.length, 2);
  assert.match(el("sales-error").textContent, /Нет пригодных строк/);
});
