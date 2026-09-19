import {
  suggestSalesColumns,
  prepareSales,
  defaultSalesPeriod,
  compareSales,
} from "./sales.js";
import {
  SALES_QUESTIONS,
  answerSales,
  buildSalesReport,
  formatAmount,
  formatChange,
} from "./sales-answers.js";

export function mountSales(document) {
  const el = (id) => document.getElementById(id);
  let dataset = null;
  let comparison = null;
  let mapping = null;
  let question = "revenue";

  function node(tag, text) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function invalidate() {
    comparison = null;
    el("sales-results").hidden = true;
    el("sales-export").disabled = true;
    el("sales-error").hidden = true;
    el("sales-answer").textContent = "";
    el("sales-method").textContent = "";
    el("sales-evidence").replaceChildren();
    el("sales-invalid").replaceChildren();
    el("sales-exclusions").hidden = true;
    el("sales-hint").textContent =
      "Проверьте столбцы и даты, затем нажмите «Рассчитать».";
  }

  function reset() {
    dataset = null;
    mapping = null;
    question = "revenue";
    invalidate();
    el("sales-start").value = "";
    el("sales-end").value = "";
    el("sales-deduplicate").checked = false;
    for (const field of ["date", "product", "amount"])
      el(`sales-${field}`).replaceChildren();
  }

  function renderAnswer() {
    if (!comparison) return;
    const answer = answerSales(comparison, question);
    el("sales-answer-title").textContent = answer.title;
    el("sales-answer").textContent = answer.text;
    el("sales-method").textContent = answer.method;
    for (const button of el("sales-questions").children) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.salesQuestion === question),
      );
    }
    el("sales-evidence").replaceChildren();
    for (const product of answer.evidence) {
      const row = node("tr");
      const name = node("th", product.product);
      name.setAttribute("scope", "row");
      row.append(name);
      for (const value of [
        formatAmount(product.previousCents),
        formatAmount(product.currentCents),
        formatAmount(product.deltaCents),
        formatChange(product.changePercent),
        `${product.previousCount} → ${product.currentCount}`,
      ]) {
        row.append(node("td", value));
      }
      el("sales-evidence").append(row);
    }
    el("sales-evidence-region").hidden = answer.evidence.length === 0;
    el("sales-evidence-note").textContent =
      `Показано товаров: ${answer.evidence.length} из ${comparison.products.length}. Полная таблица — в отчёте. Денежные единицы исходного файла.`;
  }

  function renderInvalid(prepared) {
    el("sales-exclusions").hidden = prepared.invalid.length === 0;
    el("sales-invalid").replaceChildren();
    for (const row of prepared.invalid.slice(0, 100))
      el("sales-invalid").append(
        node("li", `Строка ${row.rowNumber}: ${row.reasons.join(", ")}.`),
      );
    el("sales-invalid-count").textContent =
      `Некорректные строки: ${prepared.invalid.length}. Показаны первые ${Math.min(100, prepared.invalid.length)}; номера соответствуют таблице ниже.`;
  }

  function calculate() {
    if (!dataset) return;
    invalidate();
    try {
      mapping = Object.fromEntries(
        ["date", "product", "amount"].map((field) => [
          field,
          Number(el(`sales-${field}`).value ?? -1),
        ]),
      );
      const prepared = prepareSales(
        dataset.table,
        mapping,
        el("sales-deduplicate").checked,
      );
      renderInvalid(prepared);
      if (!el("sales-start").value && !el("sales-end").value) {
        const period = defaultSalesPeriod(prepared);
        el("sales-start").value = period.start;
        el("sales-end").value = period.end;
      }
      if (!prepared.rows.length)
        throw new Error("Нет пригодных строк продаж. Проверьте ошибки ниже.");
      comparison = compareSales(
        prepared,
        el("sales-start").value,
        el("sales-end").value,
      );
      el("sales-current").textContent = formatAmount(comparison.current.cents);
      el("sales-previous").textContent = formatAmount(
        comparison.previous.cents,
      );
      el("sales-change").textContent = formatChange(comparison.changePercent);
      el("sales-delta").textContent =
        `Разница: ${formatAmount(comparison.deltaCents)}`;
      el("sales-current-period").textContent =
        `${comparison.current.start} — ${comparison.current.end}`;
      el("sales-previous-period").textContent =
        `${comparison.previous.start} — ${comparison.previous.end}`;
      el("sales-hint").textContent =
        `По ${comparison.days} дн. в периоде. Учтено строк: ${comparison.previous.count} → ${comparison.current.count}. Некорректных: ${comparison.invalid.length}; исключено повторов: ${comparison.excludedDuplicates}; вне периодов: ${comparison.outsideCount}. Точных повторов в файле: ${comparison.duplicateCount}.`;
      el("sales-results").hidden = false;
      el("sales-export").disabled = false;
      renderAnswer();
    } catch (error) {
      comparison = null;
      el("sales-error").textContent = error.message;
      el("sales-error").hidden = false;
    }
  }

  function setDataset(nextDataset) {
    reset();
    dataset = nextDataset;
    const suggested = suggestSalesColumns(dataset.table.headers);
    for (const field of ["date", "product", "amount"]) {
      const choices = [
        { value: -1, label: "Выберите столбец" },
        ...dataset.table.headers.map((label, value) => ({ label, value })),
      ];
      for (const choice of choices) {
        const option = node("option", choice.label);
        option.value = String(choice.value);
        if (choice.value === suggested[field])
          option.setAttribute("selected", "");
        el(`sales-${field}`).append(option);
      }
    }
    if (Object.values(suggested).every((index) => index >= 0)) calculate();
  }

  for (const item of SALES_QUESTIONS) {
    const button = node("button", item.label);
    button.type = "button";
    button.className = "sales-question";
    button.dataset.salesQuestion = item.id;
    button.setAttribute("aria-pressed", String(item.id === question));
    button.addEventListener("click", () => {
      question = item.id;
      renderAnswer();
    });
    el("sales-questions").append(button);
  }
  for (const field of ["date", "product", "amount", "deduplicate"])
    el(`sales-${field}`).addEventListener("change", invalidate);
  for (const field of ["start", "end"]) {
    el(`sales-${field}`).addEventListener("input", invalidate);
    el(`sales-${field}`).addEventListener("change", invalidate);
  }
  el("sales-apply").addEventListener("click", calculate);
  el("sales-export").addEventListener("click", () => {
    if (!comparison) return;
    const text = buildSalesReport(comparison, {
      filename: dataset.filename,
      headers: dataset.table.headers,
      mapping,
    });
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = node("a");
    link.href = url;
    link.download = "csv-compass-sales.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { setDataset, reset };
}
