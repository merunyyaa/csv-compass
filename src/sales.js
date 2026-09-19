const DAY = 86400000;
const aliases = {
  date: [
    "дата",
    "дата заказа",
    "дата продажи",
    "date",
    "order date",
    "sale date",
  ],
  product: ["товар", "продукт", "наименование", "product", "item"],
  amount: ["сумма", "выручка", "сумма строки", "amount", "revenue", "total"],
};

function dateDay(value) {
  const text = value.trim();
  let parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) {
    const local = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
    if (local) parts = [local[0], local[3], local[2], local[1]];
  }
  if (!parts) return null;
  const [, year, month, day] = parts.map(Number);
  if (year < 1900 || year > 9999) return null;
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return time / DAY;
}

const isoDate = (day) => new Date(day * DAY).toISOString().slice(0, 10);

function amountCents(value) {
  const parts = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!parts) return null;
  const cents =
    Number(parts[1]) * 100 + Number((parts[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function addAmount(left, right) {
  const total = left + right;
  if (!Number.isSafeInteger(total))
    throw new Error(
      "Сумма слишком велика для точного расчёта. Уменьшите период или размер выгрузки.",
    );
  return total;
}

export function suggestSalesColumns(headers) {
  return Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => {
      const matches = headers.flatMap((header, index) =>
        names.includes(header.trim().toLocaleLowerCase("ru")) ? [index] : [],
      );
      return [field, matches.length === 1 ? matches[0] : -1];
    }),
  );
}

export function prepareSales(table, mapping, deduplicate = false) {
  const indexes = [mapping.date, mapping.product, mapping.amount];
  if (
    indexes.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= table.headers.length,
    ) ||
    new Set(indexes).size !== 3
  ) {
    throw new Error("Выберите три разных столбца: дату, товар и сумму строки.");
  }
  const result = {
    rows: [],
    invalid: [],
    duplicateCount: 0,
    excludedDuplicates: 0,
    sourceCount: table.rows.length,
    deduplicate,
  };
  const seen = new Set();
  table.rows.forEach((row, index) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      result.duplicateCount++;
      if (deduplicate) {
        result.excludedDuplicates++;
        return;
      }
    }
    seen.add(key);
    const day = dateDay(row[mapping.date]);
    const cents = amountCents(row[mapping.amount]);
    const product = row[mapping.product].trim();
    const reasons = [];
    if (day === null) reasons.push("некорректная дата");
    if (cents === null) reasons.push("некорректная сумма");
    if (!product) reasons.push("не указан товар");
    if (reasons.length) result.invalid.push({ rowNumber: index + 1, reasons });
    else result.rows.push({ rowNumber: index + 1, day, cents, product });
  });
  return result;
}

export function defaultSalesPeriod(prepared) {
  if (!prepared.rows.length)
    throw new Error(
      "Нет пригодных строк продаж. Проверьте выбранные столбцы, даты и суммы.",
    );
  const end = Math.max(...prepared.rows.map((row) => row.day));
  return { start: isoDate(end - 6), end: isoDate(end) };
}

export function compareSales(prepared, start, end) {
  const first = dateDay(start);
  const last = dateDay(end);
  const days = last - first + 1;
  if (
    first === null ||
    last === null ||
    days < 1 ||
    days > 366 ||
    dateDay(isoDate(first - days)) === null
  ) {
    throw new Error(
      "Выберите корректные даты: период от 1 до 366 дней, начало не позже конца.",
    );
  }
  const previousFirst = first - days;
  const previous = {
    start: isoDate(previousFirst),
    end: isoDate(first - 1),
    cents: 0,
    count: 0,
  };
  const current = {
    start: isoDate(first),
    end: isoDate(last),
    cents: 0,
    count: 0,
  };
  const products = new Map();
  let outsideCount = 0;
  for (const row of prepared.rows) {
    if (row.day < previousFirst || row.day > last) {
      outsideCount++;
      continue;
    }
    const period = row.day >= first ? "current" : "previous";
    const total = period === "current" ? current : previous;
    total.cents = addAmount(total.cents, row.cents);
    total.count++;
    if (!products.has(row.product))
      products.set(row.product, {
        product: row.product,
        previousCents: 0,
        currentCents: 0,
        previousCount: 0,
        currentCount: 0,
      });
    const product = products.get(row.product);
    product[`${period}Cents`] = addAmount(product[`${period}Cents`], row.cents);
    product[`${period}Count`]++;
  }
  const deltaCents = current.cents - previous.cents;
  return {
    days,
    previous,
    current,
    deltaCents,
    changePercent: previous.cents ? (deltaCents / previous.cents) * 100 : null,
    outsideCount,
    invalid: prepared.invalid,
    duplicateCount: prepared.duplicateCount,
    excludedDuplicates: prepared.excludedDuplicates,
    sourceCount: prepared.sourceCount,
    deduplicate: prepared.deduplicate,
    products: [...products.values()]
      .map((product) => ({
        ...product,
        deltaCents: product.currentCents - product.previousCents,
        changePercent: product.previousCents
          ? ((product.currentCents - product.previousCents) /
              product.previousCents) *
            100
          : null,
      }))
      .sort(
        (a, b) =>
          b.currentCents - a.currentCents ||
          a.product.localeCompare(b.product, "ru"),
      ),
  };
}
