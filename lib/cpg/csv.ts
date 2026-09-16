import { createHash } from 'node:crypto'

export type ProfiledColumn = { name: string; dataType: 'number' | 'boolean' | 'date' | 'text'; nullable: boolean; nullCount: number; distinctCount: number; minValue: string | null; maxValue: string | null }

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = [], value = '', quoted = false
  for (let i = 0; i < text.length; i++) { const char = text[i]; if (char === '"' && text[i + 1] === '"' && quoted) { value += '"'; i++; continue } if (char === '"') { quoted = !quoted; continue } if (char === ',' && !quoted) { row.push(value); value = ''; continue } if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = ''; continue } value += char }
  if (value || row.length) { row.push(value); if (row.some((cell) => cell.trim())) rows.push(row) }
  const headers = (rows.shift() ?? []).map((header, index) => header.trim() || `column_${index + 1}`)
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])))
}

export function profileRows(rows: Array<Record<string, string>>): ProfiledColumn[] {
  const headers = Object.keys(rows[0] ?? {})
  return headers.map((name) => { const values = rows.map((row) => row[name] ?? '').filter(Boolean); const numbers = values.length > 0 && values.every((value) => Number.isFinite(Number(value))); const booleans = values.length > 0 && values.every((value) => ['true','false','0','1'].includes(value.toLowerCase())); const dates = values.length > 0 && values.every((value) => !Number.isNaN(Date.parse(value))); const dataType = numbers ? 'number' : booleans ? 'boolean' : dates ? 'date' : 'text'; return { name, dataType, nullable: values.length !== rows.length, nullCount: rows.length - values.length, distinctCount: new Set(values).size, minValue: values.length ? values.toSorted()[0] : null, maxValue: values.length ? values.toSorted().at(-1) ?? null : null } })
}

export function rowHash(row: Record<string, unknown>) { return createHash('sha256').update(JSON.stringify(row)).digest('hex') }
