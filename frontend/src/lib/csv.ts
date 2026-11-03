// CSV as spreadsheets export it: comma, semicolon or tab separators, quoted fields, CRLF or LF line ends.

const separators = [';', ',', '\t'] as const

/** The separator used most often in the first line, outside quotes; a comma when none is found. */
function detectSeparator(source: string): string {
  const counts = new Map<string, number>(separators.map((separator) => [separator, 0]))
  let quoted = false
  for (const char of source) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) break
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1)
  }
  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!
  return count > 0 ? best : ','
}

/** Rows of cells; blank lines are dropped. A quote only opens a field when it starts it. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '')
  const separator = detectSeparator(source)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let fieldStarted = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    if (quoted) {
      if (char !== '"') field += char
      else if (source[index + 1] === '"') {
        field += '"'
        index++
      } else quoted = false
    } else if (char === '"' && !fieldStarted) {
      quoted = true
      fieldStarted = true
    } else if (char === separator) {
      row.push(field)
      field = ''
      fieldStarted = false
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      fieldStarted = false
    } else {
      field += char
      fieldStarted = true
    }
  }
  if (fieldStarted || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** Semicolons and a byte order mark, as spreadsheets expect in French locales. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const quote = (cell: string) => (/[";,\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)
  return `﻿${rows.map((cells) => cells.map(quote).join(';')).join('\r\n')}\r\n`
}

/** UTF-8 when the bytes are valid UTF-8, otherwise Windows-1252, the usual encoding of spreadsheet exports. */
export function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
