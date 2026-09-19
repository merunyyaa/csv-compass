export function buildReport(table, analysis, filename) {
  const lines = [
    "CSV Compass — отчёт о данных",
    `Файл: ${JSON.stringify(filename)}`,
    `Разделитель: ${JSON.stringify(table.delimiter)}`,
    `Строки данных: ${analysis.rowCount}`,
    `Столбцы: ${analysis.columnCount}`,
    `Пустые ячейки: ${analysis.missingCount}`,
    `Дубликаты строк: ${analysis.duplicateCount}`,
    `Заполненность: ${analysis.completeness.toFixed(2)}%`,
    "",
    "Профили столбцов",
  ];
  const types = { text: "текст", number: "число", empty: "нет данных" };
  for (const column of analysis.columns) {
    lines.push(
      "",
      JSON.stringify(column.name),
      `Тип: ${types[column.type]}`,
      `Уникальных непустых значений: ${column.unique}`,
      `Пропуски: ${column.missing}`,
    );
    if (column.type === "number") {
      lines.push(
        `Минимум: ${column.min}`,
        `Максимум: ${column.max}`,
        `Среднее: ${column.mean}`,
      );
    }
  }
  lines.push(
    "",
    "Методика",
    "Пропуск: пустая ячейка или ячейка из пробелов.",
    "Дубликат: точное повторение всех ячеек строки после первого вхождения.",
    "Заполненность: доля непустых ячеек; не оценка достоверности.",
    "Обработаны все записи, независимо от поиска и страницы просмотра.",
    "Отчёт содержит имя файла, заголовки и агрегаты; примеры ячеек не включены.",
  );
  return lines.join("\n") + "\n";
}
