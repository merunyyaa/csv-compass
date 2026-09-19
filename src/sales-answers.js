const integerFormat = new Intl.NumberFormat("ru-RU");
const percentFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

export function formatAmount(cents) {
  const value = BigInt(Math.abs(cents));
  return `${cents < 0 ? "−" : ""}${integerFormat.format(value / 100n)},${String(value % 100n).padStart(2, "0")}`;
}

export function formatChange(percent) {
  return percent === null
    ? "Нет базы для %"
    : `${percent < 0 ? "−" : percent > 0 ? "+" : ""}${percentFormat.format(Math.abs(percent))}%`;
}

export const SALES_QUESTIONS = [
  { id: "revenue", label: "Как изменилась выручка?" },
  { id: "declines", label: "Какие товары просели?" },
  { id: "leaders", label: "Что приносит больше выручки?" },
  { id: "quality", label: "Какие строки не учтены?" },
];

export function answerSales(report, question) {
  const definition = SALES_QUESTIONS.find((item) => item.id === question);
  if (!definition) throw new Error("Выберите один из доступных вопросов.");
  let text;
  let method;
  let evidence = report.products.slice(0, 10);
  const { current, previous } = report;
  if (question === "revenue") {
    text = `Сумма продаж: ${formatAmount(current.cents)} за выбранный период и ${formatAmount(previous.cents)} за предыдущий. Разница: ${formatAmount(report.deltaCents)}.`;
    text +=
      report.changePercent === null
        ? " В предыдущем периоде сумма равна нулю: процент изменения не определён."
        : ` Изменение: ${formatChange(report.changePercent)}.`;
    if (!previous.count)
      text += " В предыдущем периоде нет пригодных строк продаж.";
    if (!current.count)
      text += " В выбранном периоде нет пригодных строк продаж.";
    method =
      "Суммируем суммы строк. Изменение = (текущая сумма − предыдущая) / предыдущая × 100%. Дни без записей дают 0 в расчёте; полноту выгрузки нужно проверить отдельно.";
  } else if (question === "declines") {
    evidence =
      current.count && previous.count
        ? report.products
            .filter((product) => product.deltaCents < 0)
            .sort((a, b) => a.deltaCents - b.deltaCents)
            .slice(0, 5)
        : [];
    text =
      !current.count || !previous.count
        ? "Для сравнения товаров нужны пригодные строки в обоих периодах."
        : evidence.length
          ? `Самое большое снижение суммы продаж: ${JSON.stringify(evidence[0].product)} — на ${formatAmount(-evidence[0].deltaCents)} (${formatChange(evidence[0].changePercent)}).`
          : "Снижения суммы продаж по товарам в этих периодах не найдено.";
    method =
      "Сравниваем выручку каждого товара, а не количество единиц. Показываем до пяти наибольших снижений в денежных единицах. Расчёт не устанавливает причину снижения; отсутствие строк товара не доказывает отсутствие продаж.";
  } else if (question === "leaders") {
    evidence = report.products
      .filter((product) => product.currentCount > 0)
      .slice(0, 5);
    text = evidence.length
      ? `Больше всего выручки в выбранном периоде: ${JSON.stringify(evidence[0].product)} — ${formatAmount(evidence[0].currentCents)}.`
      : "В выбранном периоде нет пригодных строк продаж.";
    method =
      "До пяти товаров по сумме продаж в текущем периоде. Это выручка, не прибыль: расходы, себестоимость и количество единиц не анализируются.";
  } else {
    evidence = [];
    text = `Всего строк: ${report.sourceCount}. Некорректных: ${report.invalid.length}. Исключено точных повторов: ${report.excludedDuplicates}. Вне двух периодов: ${report.outsideCount}. В сравнении: ${previous.count + current.count}.`;
    method =
      "Номера некорректных строк соответствуют исходной таблице без заголовка. Повторы исключаются только по выбранной настройке. Корректная строка ещё не подтверждает полноту и достоверность выгрузки.";
  }
  return { title: definition.label, text, method, evidence };
}

export function buildSalesReport(report, { filename, headers, mapping }) {
  const lines = [
    "CSV Compass — сравнение продаж",
    `Файл: ${JSON.stringify(filename)}`,
    "Локальные расчёты по правилам. AI не используется.",
    `Столбцы: дата ${JSON.stringify(headers[mapping.date])}; товар ${JSON.stringify(headers[mapping.product])}; сумма строки ${JSON.stringify(headers[mapping.amount])}.`,
    `Предыдущий период: ${report.previous.start} — ${report.previous.end}`,
    `Текущий период: ${report.current.start} — ${report.current.end}`,
    `Дней в каждом периоде: ${report.days}`,
    `Исключать точные повторы: ${report.deduplicate ? "да" : "нет"}`,
    "Денежные единицы исходного файла; предполагается одна валюта и только оплаченные продажи. Возвраты и отрицательные суммы не поддерживаются.",
  ];
  for (const question of SALES_QUESTIONS) {
    const answer = answerSales(report, question.id);
    lines.push("", answer.title, answer.text, answer.method);
  }
  lines.push(
    "",
    "Все товары: предыдущая сумма → текущая сумма; разница; изменение; строки прежде → сейчас",
  );
  for (const product of report.products) {
    lines.push(
      `${JSON.stringify(product.product)}: ${formatAmount(product.previousCents)} → ${formatAmount(product.currentCents)}; ${formatAmount(product.deltaCents)}; ${formatChange(product.changePercent)}; ${product.previousCount} → ${product.currentCount}`,
    );
  }
  lines.push("", "Некорректные строки (нумерация данных без заголовка)");
  for (const invalid of report.invalid)
    lines.push(`${invalid.rowNumber}: ${invalid.reasons.join(", ")}`);
  if (!report.invalid.length) lines.push("Нет.");
  lines.push(
    "",
    "Суммы считаются в целых сотых без округления исходных значений; проценты округлены до одного знака. Отчёт содержит названия товаров, имя файла и агрегаты: проверьте его перед передачей.",
  );
  return lines.join("\n") + "\n";
}
