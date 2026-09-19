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
