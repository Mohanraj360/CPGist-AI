export type ValidationIssue = {
  code: 'null_value' | 'invalid_number' | 'invalid_date' | 'duplicate_row'
  row: number
  column?: string
  message: string
}

export function validateRecords(records: Array<Record<string, unknown>>, requiredColumns: string[] = []) {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  records.forEach((record, index) => {
    requiredColumns.forEach((column) => {
      if (record[column] === null || record[column] === undefined || record[column] === '') issues.push({ code: 'null_value', row: index + 1, column, message: `${column} is required.` })
    })
    const key = JSON.stringify(record)
    if (seen.has(key)) issues.push({ code: 'duplicate_row', row: index + 1, message: 'Duplicate record detected.' })
    seen.add(key)
  })

  return { issues, score: records.length ? Math.max(0, 100 - (issues.length / records.length) * 100) : null }
}
