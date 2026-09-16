import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function escapeCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const datasetId = typeof body?.datasetId === 'string' ? body.datasetId : ''
  const rows: Record<string, unknown>[] = Array.isArray(body?.rows)
    ? body.rows.filter((row: unknown): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    : []
  if (!datasetId || !rows.length) return NextResponse.json({ error: 'datasetId and report rows are required.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { data: dataset } = await supabase.from('datasets').select('id').eq('id', datasetId).single()
  if (!dataset) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })

  const columns: string[] = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const csv = [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((row) => row.map(escapeCell).join(',')).join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cpgist-export.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
