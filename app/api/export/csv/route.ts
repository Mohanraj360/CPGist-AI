import { NextResponse } from 'next/server'

function escapeCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const rows: Record<string, unknown>[] = Array.isArray(body?.rows)
    ? body.rows.filter((row: unknown): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    : []
  if (!rows.length) return NextResponse.json({ error: 'No report rows are available to export.' }, { status: 400 })
  const columns: string[] = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const csv = [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(escapeCell).join(',')).join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cpgist-export.csv"', 'Cache-Control': 'no-store' } })
}
