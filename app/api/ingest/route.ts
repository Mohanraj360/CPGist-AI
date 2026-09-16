import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { parseCsv, profileRows, rowHash } from '@/lib/cpg/csv'
import { validateRecords } from '@/lib/cpg/validation'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server database credentials are not configured.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function numberValue(value: string | undefined) { const number = Number(value); return value && Number.isFinite(number) ? number : null }
function booleanValue(value: string | undefined) { if (!value) return null; if (['true','1','yes','y'].includes(value.toLowerCase())) return true; if (['false','0','no','n'].includes(value.toLowerCase())) return false; return null }
function findColumn(columns: string[], names: string[]) { return columns.find((column) => names.includes(column.toLowerCase().replace(/[^a-z0-9]/g, ''))) }

export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in is required to ingest a dataset.' }, { status: 401 })
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ error: 'Upload a CSV file.' }, { status: 400 })
    const content = await file.text()
    const rows = parseCsv(content)
    if (!rows.length) return NextResponse.json({ error: 'The CSV contains no data rows.' }, { status: 422 })
    const columns = Object.keys(rows[0])
    const validation = validateRecords(rows, [])
    const profile = profileRows(rows)
    const db = adminClient()
    const datasetName = String(form.get('name') || file.name.replace(/\.csv$/i, ''))
    const { data: dataset, error: datasetError } = await db.from('datasets').insert({ name: datasetName, source: 'GitHub Syndicate', status: 'profiling', row_count: rows.length, created_by: user.id }).select('id').single()
    if (datasetError || !dataset) throw datasetError ?? new Error('Dataset could not be created.')
    const datasetId = dataset.id as string
    const checksum = createHash('sha256').update(content).digest('hex')
    await db.from('dataset_files').insert({ dataset_id: datasetId, file_name: file.name, byte_size: file.size, checksum })
    await db.from('dataset_columns').insert(profile.map((column, ordinal) => ({ dataset_id: datasetId, ...column, ordinal, min_value: column.minValue, max_value: column.maxValue })))
    const { data: job, error: jobError } = await db.from('ingestion_jobs').insert({ dataset_id: datasetId, status: 'running', started_at: new Date().toISOString() }).select('id').single()
    if (jobError || !job) throw jobError ?? new Error('Ingestion job could not be created.')
    const salesRows = rows.map((row) => ({ dataset_id: datasetId, period: row[findColumn(columns, ['period','date','month','week']) ?? ''] || null, category: row[findColumn(columns, ['category','department']) ?? ''] || null, sales: numberValue(row[findColumn(columns, ['sales','revenue','value']) ?? '']), units: numberValue(row[findColumn(columns, ['units','volume','quantity']) ?? '']), distribution: numberValue(row[findColumn(columns, ['distribution','dist']) ?? '']), price: numberValue(row[findColumn(columns, ['price','unitprice']) ?? '']), on_promo: booleanValue(row[findColumn(columns, ['onpromo','promo','promotion']) ?? '']), row_hash: rowHash(row) }))
    for (let start = 0; start < salesRows.length; start += 1000) { const { error } = await db.from('sales_facts').upsert(salesRows.slice(start, start + 1000), { onConflict: 'dataset_id,row_hash', ignoreDuplicates: true }); if (error) throw error }
    await db.from('validation_results').insert(validation.issues.slice(0, 500).map((issue) => ({ dataset_id: datasetId, severity: issue.code === 'duplicate_row' ? 'warning' : 'error', code: issue.code, message: issue.message, row_number: issue.row, column_name: issue.column })))
    await db.from('ingestion_jobs').update({ status: 'completed', rows_seen: rows.length, rows_inserted: salesRows.length - validation.issues.filter((issue) => issue.code === 'duplicate_row').length, rows_rejected: validation.issues.length, completed_at: new Date().toISOString() }).eq('id', job.id)
    await db.from('datasets').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', datasetId)
    return NextResponse.json({ datasetId, jobId: job.id, rowCount: rows.length, validation: { issueCount: validation.issues.length, score: validation.score }, columns: profile })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ingestion failed.' }, { status: 500 }) }
}
