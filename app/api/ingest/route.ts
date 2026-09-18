import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClient as createAdminClient } from '@supabase/supabase-js'
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
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function numberValue(value: string | undefined) {
  if (value === undefined || value.trim() === '') return null
  const number = Number(value.replace(/[$,%\s]/g, ''))
  return Number.isFinite(number) ? number : null
}

function booleanValue(value: string | undefined) {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return null
}

function normalizeColumn(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findColumn(columns: string[], names: string[]) {
  const wanted = new Set(names.map(normalizeColumn))
  return columns.find((column) => wanted.has(normalizeColumn(column)))
}

function normalizeDate(value: string | undefined) {
  if (!value?.trim()) return null
  const raw = value.trim()
  const direct = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
  if (direct) return direct
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

async function upsertDimension(
  db: ReturnType<typeof adminClient>,
  table: 'brands' | 'retailers' | 'products',
  datasetId: string,
  names: string[],
) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  if (!unique.length) return new Map<string, string>()
  const { data: existing, error: readError } = await db.from(table).select('id,name').eq('dataset_id', datasetId)
  if (readError) throw readError
  const byName = new Map((existing ?? []).map((row) => [String(row.name).trim().toLowerCase(), String(row.id)]))
  const missing = unique.filter((name) => !byName.has(name.toLowerCase()))
  if (missing.length) {
    const { data, error } = await db.from(table).insert(missing.map((name) => ({ dataset_id: datasetId, name }))).select('id,name')
    if (error) throw error
    for (const row of data ?? []) byName.set(String(row.name).trim().toLowerCase(), String(row.id))
  }
  return byName
}

export async function POST(request: Request) {
  let datasetId: string | null = null
  let jobId: string | null = null
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in is required to ingest a dataset.' }, { status: 401 })

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'Upload a Syndicate ZIP package.' }, { status: 400 })
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const requiredFiles = ['sales_facts.csv', 'products.csv', 'brands.csv', 'retailers.csv', 'brand_relationships.csv', 'signal_notes.csv', 'competitor_signals.csv']
    const entries = new Map<string, JSZip.JSZipObject>()
    Object.values(zip.files).forEach((entry) => {
      if (entry.dir) return
      const name = entry.name.split('/').pop()?.toLowerCase()
      if (name) entries.set(name, entry)
    })
    const missing = requiredFiles.filter((name) => !entries.has(name))
    if (missing.length) return NextResponse.json({ error: 'Syndicate package is missing required files.', missing, detected: requiredFiles.filter((name) => entries.has(name)) }, { status: 422 })

    const salesEntry = entries.get('sales_facts.csv')
    if (!salesEntry) return NextResponse.json({ error: 'sales_facts.csv is required.' }, { status: 422 })
    const content = await salesEntry.async('string')
    const rows = parseCsv(content)
    if (!rows.length) return NextResponse.json({ error: 'sales_facts.csv contains no data rows.' }, { status: 422 })

    const columns = Object.keys(rows[0])
    const salesColumn = findColumn(columns, ['sales', 'revenue', 'value', 'net sales'])
    const unitsColumn = findColumn(columns, ['units', 'volume', 'quantity'])
    if (!salesColumn && !unitsColumn) {
      return NextResponse.json({ error: 'The CSV must contain at least one measure column: sales/revenue/value or units/volume/quantity.' }, { status: 422 })
    }

    const validation = validateRecords(rows, [])
    const profile = profileRows(rows)
    const db = adminClient()
    const datasetName = String(form.get('name') || file.name.replace(/\.csv$/i, '')).trim() || 'Imported dataset'

    const { data: dataset, error: datasetError } = await db
      .from('datasets')
      .insert({ name: datasetName, source: String(form.get('source') || 'CSV upload'), status: 'profiling', row_count: rows.length, created_by: user.id })
      .select('id')
      .single()
    if (datasetError || !dataset) throw datasetError ?? new Error('Dataset could not be created.')
    datasetId = String(dataset.id)

    const checksum = createHash('sha256').update(content).digest('hex')
    const { error: fileError } = await db.from('dataset_files').insert({
      dataset_id: datasetId, file_name: file.name, byte_size: file.size, checksum,
    })
    if (fileError) throw fileError

    const { error: columnError } = await db.from('dataset_columns').insert(
      profile.map((column, ordinal) => ({
        dataset_id: datasetId, name: column.name, data_type: column.dataType, ordinal,
        nullable: column.nullable, null_count: column.nullCount, distinct_count: column.distinctCount,
        min_value: column.minValue, max_value: column.maxValue,
      })),
    )
    if (columnError) throw columnError

    const { data: job, error: jobError } = await db
      .from('ingestion_jobs')
      .insert({ dataset_id: datasetId, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single()
    if (jobError || !job) throw jobError ?? new Error('Ingestion job could not be created.')
    jobId = String(job.id)

    const brandColumn = findColumn(columns, ['brand', 'brand name', 'brand_name', 'manufacturer'])
    const retailerColumn = findColumn(columns, ['retailer', 'retailer name', 'retailer_name', 'channel', 'account'])
    const productColumn = findColumn(columns, ['product', 'product name', 'product_name', 'sku', 'item'])
    const categoryColumn = findColumn(columns, ['category', 'department'])
    const periodColumn = findColumn(columns, ['period', 'date', 'month', 'week', 'time'])
    const distributionColumn = findColumn(columns, ['distribution', 'dist', 'numeric distribution', 'weighted distribution'])
    const priceColumn = findColumn(columns, ['price', 'unit price', 'unitprice'])
    const promoColumn = findColumn(columns, ['on promo', 'onpromo', 'promo', 'promotion'])

    const brandNames = brandColumn ? rows.map((row) => row[brandColumn] ?? '') : []
    const retailerNames = retailerColumn ? rows.map((row) => row[retailerColumn] ?? '') : []
    const productNames = productColumn ? rows.map((row) => row[productColumn] ?? '') : []
    const [brandMap, retailerMap, productMap] = await Promise.all([
      upsertDimension(db, 'brands', datasetId, brandNames),
      upsertDimension(db, 'retailers', datasetId, retailerNames),
      upsertDimension(db, 'products', datasetId, productNames),
    ])

    const salesRows = rows.map((row) => {
      const brandName = brandColumn ? (row[brandColumn] ?? '').trim() : ''
      const retailerName = retailerColumn ? (row[retailerColumn] ?? '').trim() : ''
      const productName = productColumn ? (row[productColumn] ?? '').trim() : ''
      return {
        dataset_id: datasetId,
        period: normalizeDate(periodColumn ? row[periodColumn] : undefined),
        product_id: productMap.get(productName.toLowerCase()) ?? null,
        brand_id: brandMap.get(brandName.toLowerCase()) ?? null,
        retailer_id: retailerMap.get(retailerName.toLowerCase()) ?? null,
        category: categoryColumn ? (row[categoryColumn] ?? '').trim() || null : null,
        sales: numberValue(salesColumn ? row[salesColumn] : undefined),
        units: numberValue(unitsColumn ? row[unitsColumn] : undefined),
        distribution: numberValue(distributionColumn ? row[distributionColumn] : undefined),
        price: numberValue(priceColumn ? row[priceColumn] : undefined),
        on_promo: booleanValue(promoColumn ? row[promoColumn] : undefined),
        row_hash: rowHash(row),
      }
    })

    for (let start = 0; start < salesRows.length; start += 1000) {
      const { error } = await db.from('sales_facts').upsert(
        salesRows.slice(start, start + 1000),
        { onConflict: 'dataset_id,row_hash', ignoreDuplicates: true },
      )
      if (error) throw error
    }

    const validationRows = validation.issues.slice(0, 500).map((issue) => ({
      dataset_id: datasetId,
      severity: issue.code === 'duplicate_row' ? 'warning' : 'error',
      code: issue.code,
      message: issue.message,
      row_number: issue.row,
      column_name: issue.column,
    }))
    if (validationRows.length) {
      const { error } = await db.from('validation_results').insert(validationRows)
      if (error) throw error
    }

    const insertedCount = salesRows.length - validation.issues.filter((issue) => issue.code === 'duplicate_row').length
    const qualityScore = validation.score
    await db.from('ingestion_jobs').update({
      status: 'completed', rows_seen: rows.length, rows_inserted: insertedCount,
      rows_rejected: validation.issues.filter((issue) => issue.code !== 'duplicate_row').length,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    await db.from('datasets').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', datasetId)

    return NextResponse.json({
      datasetId, jobId, rowCount: rows.length,
      validation: { issueCount: validation.issues.length, score: qualityScore },
      dimensions: { brands: brandMap.size, retailers: retailerMap.size, products: productMap.size },
      columns: profile,
    })
  } catch (error) {
    console.error('[ingest]', error)
    if (datasetId) {
      try {
        const db = adminClient()
        if (jobId) await db.from('ingestion_jobs').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Ingestion failed.', completed_at: new Date().toISOString() }).eq('id', jobId)
        await db.from('datasets').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', datasetId)
      } catch {}
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Ingestion failed.' }, { status: 500 })
  }
}
