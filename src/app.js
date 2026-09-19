import { parseCSV, analyzeCSV, MAX_BYTES } from "./csv.js";
import { buildReport } from "./report.js";
import { DEMO_CSV, SALES_DEMO_CSV } from "./demo.js";
import { mountSales } from "./sales-view.js";

const PAGE_SIZE = 25;
const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});
const format = (number) => numberFormat.format(number);

export function mountApp(document) {
  const el = (id) => document.getElementById(id);
  const sales = mountSales(document);
  let dataset = null;
  let source = null;
  let page = 0;
  let readSequence = 0;

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function clearResults() {
    sales.reset();
    dataset = null;
    page = 0;
    el("results").hidden = true;
    el("empty-state").hidden = false;
    el("export-button").disabled = true;
    el("error").hidden = true;
    el("error").textContent = "";
    el("search").value = "";
    for (const id of [
      "data-body",
      "data-head",
      "profiles-body",
      "chart",
      "chart-column",
    ]) {
      el(id).replaceChildren();
    }
    el("file-description").textContent = "Начните с файла или откройте пример";
  }

  function showError(message) {
    el("error").textContent = message;
    el("error").hidden = false;
    el("status").textContent = "";
  }

  function renderChart() {
    if (!dataset) return;
    const index = Number(el("chart-column").value || 0);
    const column = dataset.analysis.columns[index];
    el("chart").replaceChildren();
    for (const { value, count } of column.topValues) {
      const item = node("li");
      const heading = node("div", undefined, "chart-row-heading");
      const label = node("span", value, "chart-label");
      label.title = value;
      heading.append(label, node("strong", format(count)));
      const bar = node("meter");
      bar.setAttribute("min", "0");
      bar.setAttribute("max", String(dataset.analysis.rowCount));
      bar.setAttribute("value", String(count));
      bar.setAttribute(
        "aria-label",
        `${value}: ${count} из ${dataset.analysis.rowCount} строк`,
      );
      item.append(heading, bar);
      el("chart").append(item);
    }
    el("chart-note").textContent = column.unique
      ? `Показано ${column.topValues.length} из ${format(column.unique)} уникальных значений. Пропуски не включены.`
      : "В этом столбце пока нет заполненных ячеек.";
  }

  function renderTable() {
    if (!dataset) return;
    const query = el("search").value.trim().toLocaleLowerCase("ru");
    const filtered = dataset.table.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        row.some((cell) => cell.toLocaleLowerCase("ru").includes(query)),
      );
    const start = page * PAGE_SIZE;
    const records = filtered.slice(start, start + PAGE_SIZE);
    const duplicates = new Set(dataset.analysis.duplicateIndexes);
    el("data-body").replaceChildren();
    for (const { row, index } of records) {
      const tr = node("tr");
      const rowNumber = node("th", format(index + 1));
      rowNumber.setAttribute("scope", "row");
      if (duplicates.has(index)) {
        tr.classList.add("duplicate-row");
        rowNumber.append(node("span", "повтор", "duplicate-label"));
      }
      tr.append(rowNumber);
      for (const value of row) {
        const empty = value.trim() === "";
        const cell = node(
          "td",
          empty ? "пусто" : value,
          empty ? "missing-cell" : "",
        );
        cell.title = empty ? "Пустая ячейка" : value;
        tr.append(cell);
      }
      el("data-body").append(tr);
    }
    el("no-matches").hidden = records.length > 0;
    el("no-matches").textContent = dataset.table.rows.length
      ? "Совпадений нет. Попробуйте другой запрос."
      : "В файле есть заголовки, но нет строк данных.";
    el("page-description").textContent = filtered.length
      ? `${format(start + 1)}–${format(Math.min(start + PAGE_SIZE, filtered.length))} из ${format(filtered.length)} строк`
      : "0 строк";
    el("previous-page").disabled = page === 0;
    el("next-page").disabled = start + PAGE_SIZE >= filtered.length;
  }

  function renderAnalysis() {
    const { table, analysis, filename, demo } = dataset;
    el("empty-state").hidden = true;
    el("results").hidden = false;
    el("export-button").disabled = false;
    const separatorName =
      table.delimiter === "\t" ? "табуляция" : table.delimiter;
    el("file-description").textContent =
      `${demo ? "Пример: " : ""}${filename} · разделитель «${separatorName}»`;
    for (const [id, count] of [
      ["row-count", analysis.rowCount],
      ["column-count", analysis.columnCount],
      ["missing-count", analysis.missingCount],
      ["duplicate-count", analysis.duplicateCount],
    ]) {
      el(id).textContent = format(count);
    }
    el("completeness").textContent = `${format(analysis.completeness)}%`;
    el("quality-progress").setAttribute("value", String(analysis.completeness));
    el("quality-note").textContent = analysis.rowCount
      ? "Доля заполненных ячеек во всём файле."
      : "В файле нет строк данных.";
    el("missing-note").textContent = analysis.missingCount
      ? `Проверьте пустые ячейки: ${format(analysis.missingCount)}.`
      : "Пустых ячеек не найдено.";
    el("duplicate-note").textContent = analysis.duplicateCount
      ? `Найдены повторные строки: ${format(analysis.duplicateCount)}.`
      : "Повторяющихся строк нет.";

    const preferred = Math.max(
      0,
      analysis.columns.findIndex(
        (column) =>
          column.type === "text" && column.unique > 1 && column.unique <= 12,
      ),
    );
    analysis.columns.forEach((column, index) => {
      const option = node("option", column.name);
      option.value = String(index);
      if (index === preferred) option.setAttribute("selected", "");
      el("chart-column").append(option);
      const row = node("tr");
      const title = node("th", column.name);
      title.setAttribute("scope", "row");
      row.append(title);
      const type = { number: "Числа", text: "Текст", empty: "Нет данных" }[
        column.type
      ];
      for (const value of [
        type,
        format(column.unique),
        format(column.missing),
        column.type === "number" ? format(column.min) : "—",
        column.type === "number" ? format(column.max) : "—",
        column.type === "number" ? format(column.mean) : "—",
      ])
        row.append(node("td", value));
      el("profiles-body").append(row);
    });
    const head = node("tr");
    for (const name of ["Строка", ...table.headers]) {
      const cell = node("th", name);
      cell.setAttribute("scope", "col");
      head.append(cell);
    }
    el("data-head").append(head);
    renderChart();
    renderTable();
    el("status").textContent =
      `Анализ завершён: ${format(analysis.rowCount)} строк, ${format(analysis.columnCount)} столбцов.`;
  }

  function analyzeSource() {
    clearResults();
    if (!source) return;
    try {
      const selection = el("delimiter").value || "auto";
      const table = parseCSV(
        source.text,
        selection === "tab" ? "\t" : selection,
      );
      dataset = {
        table,
        analysis: analyzeCSV(table),
        filename: source.filename,
        demo: source.demo,
      };
      renderAnalysis();
      sales.setDataset(dataset);
    } catch (error) {
      clearResults();
      showError(error.message);
    }
  }

  async function loadFile(file) {
    if (!file) return;
    const sequence = ++readSequence;
    source = null;
    clearResults();
    el("status").textContent = "Читаем файл…";
    try {
      if (file.size > MAX_BYTES)
        throw new Error(
          "Максимальный размер файла — 5 МиБ. Выберите файл поменьше.",
        );
      const bytes = await file.arrayBuffer();
      if (sequence !== readSequence) return;
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(
          "Не удалось прочитать UTF-8. В Excel сохраните файл как «CSV UTF-8» и откройте его снова.",
        );
      }
      source = { text, filename: file.name, demo: false };
      analyzeSource();
    } catch (error) {
      if (sequence === readSequence)
        showError(`Не удалось открыть файл. ${error.message}`);
    }
  }

  function loadDemo(text = DEMO_CSV, filename = "demo-orders.csv") {
    readSequence++;
    source = { text, filename, demo: true };
    const automatic = el("delimiter").querySelector('option[value="auto"]');
    for (const option of el("delimiter").options)
      option.selected = option === automatic;
    analyzeSource();
  }

  el("demo-button").addEventListener("click", () => loadDemo());
  const loadSalesDemo = () => loadDemo(SALES_DEMO_CSV, "demo-sales.csv");
  el("sales-demo-button").addEventListener("click", loadSalesDemo);
  el("empty-demo-button").addEventListener("click", loadSalesDemo);
  el("file-input").addEventListener("change", (event) => {
    void loadFile(event.target.files[0]);
    event.target.value = "";
  });
  el("delimiter").addEventListener("change", analyzeSource);
  el("chart-column").addEventListener("change", renderChart);
  el("search").addEventListener("input", () => {
    page = 0;
    renderTable();
  });
  el("previous-page").addEventListener("click", () => {
    if (page > 0) page--;
    renderTable();
  });
  el("next-page").addEventListener("click", () => {
    if (!el("next-page").disabled) page++;
    renderTable();
  });
  for (const eventName of ["dragenter", "dragover"]) {
    el("drop-zone").addEventListener(eventName, (event) => {
      event.preventDefault();
      el("drop-zone").classList.add("dragging");
    });
  }
  el("drop-zone").addEventListener("dragleave", () =>
    el("drop-zone").classList.remove("dragging"),
  );
  el("drop-zone").addEventListener("drop", (event) => {
    event.preventDefault();
    el("drop-zone").classList.remove("dragging");
    void loadFile(event.dataTransfer.files[0]);
  });
  el("export-button").addEventListener("click", () => {
    if (!dataset) return;
    const report = buildReport(
      dataset.table,
      dataset.analysis,
      dataset.filename,
    );
    const url = URL.createObjectURL(
      new Blob([report], { type: "text/plain;charset=utf-8" }),
    );
    const link = node("a");
    link.href = url;
    link.download = "csv-compass-report.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el("status").textContent = "Отчёт подготовлен для скачивания.";
  });
  return { loadFile };
}
