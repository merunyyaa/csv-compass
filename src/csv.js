export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20000;
const MAX_COLUMNS = 100;
const DELIMITERS = [",", ";", "\t"];

function detectDelimiter(text) {
  const counts = new Map(DELIMITERS.map((value) => [value, 0]));
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (counts.has(char)) counts.set(char, counts.get(char) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCSV(input, delimiter = "auto") {
  if (typeof input !== "string") throw new Error("CSV должен содержать текст.");
  if (
    input.length > MAX_BYTES ||
    new TextEncoder().encode(input).length > MAX_BYTES
  ) {
    throw new Error("Максимальный размер файла — 5 МиБ.");
  }
  const text = input.replace(/^\uFEFF/, "").replace(/^[\r\n]+/, "");
  if (!text.trim())
    throw new Error("CSV пуст. Выберите файл с заголовками и данными.");
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      throw new Error("CSV содержит недопустимые управляющие символы.");
    }
  }
  if (delimiter === "auto") delimiter = detectDelimiter(text);
  if (!DELIMITERS.includes(delimiter))
    throw new Error("Выберите допустимый разделитель.");

  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let touched = false;

  function endField() {
    row.push(field);
    if (row.length > MAX_COLUMNS)
      throw new Error("CSV может содержать не более 100 столбцов.");
    field = "";
    closedQuote = false;
  }

  function endRow() {
    if (touched) {
      endField();
      if (records.length && row.length !== records[0].length) {
        throw new Error(
          `В записи ${records.length + 1} — ${row.length} полей, ожидается ${records[0].length}. Проверьте разделитель CSV.`,
        );
      }
      records.push(row);
      if (records.length > MAX_ROWS + 1)
        throw new Error("Максимум — 20 000 строк данных.");
    }
    row = [];
    field = "";
    touched = false;
    closedQuote = false;
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else field += char;
    } else if (char === delimiter) {
      touched = true;
      endField();
    } else if (char === "\r" || char === "\n") {
      endRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"' && !field && !closedQuote) {
      quoted = true;
      touched = true;
    } else {
      if (closedQuote || char === '"') {
        throw new Error(
          `Некорректные кавычки в записи ${records.length + 1}. Внутри ячейки используйте двойные кавычки.`,
        );
      }
      field += char;
      touched = true;
    }
  }
  if (quoted)
    throw new Error("В CSV не закрыты кавычки. Проверьте последнюю запись.");
  endRow();

  const headers = records[0].map((value) => value.trim());
  if (headers.some((value) => !value))
    throw new Error("Каждый столбец должен иметь непустой заголовок.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Заголовки столбцов должны быть уникальными.");
  return { headers, rows: records.slice(1), delimiter };
}

function numericValue(raw) {
  const value = raw.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value))
    return null;
  if (/^[+-]?0\d/.test(value)) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function analyzeCSV({ headers, rows }) {
  const seen = new Set();
  const duplicateIndexes = [];
  rows.forEach((row, index) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicateIndexes.push(index);
    else seen.add(key);
  });

  const columns = headers.map((name, index) => {
    const values = rows
      .map((row) => row[index])
      .filter((value) => value.trim() !== "");
    const frequencies = new Map();
    for (const value of values)
      frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
    const numbers = values.map(numericValue);
    const isNumeric =
      numbers.length > 0 && numbers.every((value) => value !== null);
    const column = {
      name,
      type: values.length === 0 ? "empty" : isNumeric ? "number" : "text",
      missing: rows.length - values.length,
      unique: frequencies.size,
      topValues: [...frequencies]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([value, count]) => ({ value, count })),
    };
    if (isNumeric) {
      column.min = Math.min(...numbers);
      column.max = Math.max(...numbers);
      const scale = Math.max(Math.abs(column.min), Math.abs(column.max));
      column.mean =
        scale === 0
          ? 0
          : scale *
            (numbers.reduce((sum, value) => sum + value / scale, 0) /
              numbers.length);
    }
    return column;
  });
  const missingCount = columns.reduce((sum, column) => sum + column.missing, 0);
  const cellCount = rows.length * headers.length;
  return {
    rowCount: rows.length,
    columnCount: headers.length,
    missingCount,
    duplicateCount: duplicateIndexes.length,
    duplicateIndexes,
    completeness: cellCount
      ? (100 * (cellCount - missingCount)) / cellCount
      : 100,
    columns,
  };
}
