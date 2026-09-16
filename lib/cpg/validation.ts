export type ValidationIssue = {
  code: 'null_value' | 'invalid_number' | 'invalid_date' | 'duplicate_row'
  row: number
  column?: string
  message: string
}

export function validateRecords(records: Array<Record<string, unknown>>, requiredColumns: string[] = []) {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  const columns = Object.keys(records[0] ?? {})

  records.forEach((record, index) => {
    requiredColumns.forEach((column) => {
      if (record[column] === null || record[column] === undefined || record[column] === '') {
        issues.push({ code: 'null_value', row: index + 1, column, message: `${column} is required.` })
      }
    })
    for (const column of columns) {
      const value = String(record[column] ?? '').trim()
      const normalized = column.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!value) continue
      if (['sales','revenue','value','units','volume','quantity','distribution','dist','price','unitprice'].includes(normalized)) {
        const numeric = Number(value.replace(/[$,%\s]/g, ''))
        if (!Number.isFinite(numeric)) issues.push({ code: 'invalid_number', row: index + 1, column, message: `${column} contains a non-numeric value.` })
      }
      if (['period','date','month','week'].includes(normalized) && Number.isNaN(Date.parse(value))) {
        issues.push({ code: 'invalid_date', row: index + 1, column, message: `${column} contains an invalid date.` })
      }
    }
    const key = JSON.stringify(record)
    if (seen.has(key)) issues.push({ code: 'duplicate_row', row: index + 1, message: 'Duplicate record detected.' })
    seen.add(key)
  })

  const weightedPenalty = records.length ? (
    issues.filter(i => i.code !== 'duplicate_row').length * 1 +
    issues.filter(i => i.code === 'duplicate_row').length * 0.5
  ) / records.length * 100 : 0
  return { issues, score: records.length ? Math.max(0, Math.round((100 - weightedPenalty) * 10) / 10) : null }
}
