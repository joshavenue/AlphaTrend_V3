export type CsvRecord = {
  sourceRowNumber: number;
  values: Record<string, string>;
};

function parseCsvRows(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";

      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);

    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row);
    }
  }

  if (inQuotes) {
    throw new Error("CSV parse failed: unclosed quoted field.");
  }

  return rows;
}

export function parseCsv(source: string): CsvRecord[] {
  const rows = parseCsvRows(source);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());

  return rows.slice(1).map((row, rowIndex) => {
    const values: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      values[header] = (row[columnIndex] ?? "").trim();
    });

    return {
      sourceRowNumber: rowIndex + 2,
      values,
    };
  });
}

export function splitSemicolonList(value: string) {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
