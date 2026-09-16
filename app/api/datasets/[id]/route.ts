import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
    const [dataset, columns, validation, preview] = await Promise.all([
      supabase.from('datasets').select('id,name,source,status,row_count,created_at,updated_at').eq('id', id).single(),
      supabase.from('dataset_columns').select('name,data_type,ordinal,nullable,null_count,distinct_count,min_value,max_value').eq('dataset_id', id).order('ordinal'),
      supabase.from('validation_results').select('severity,code,message,row_number,column_name').eq('dataset_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('sales_facts').select('period,category,sales,units,distribution,price,on_promo').eq('dataset_id', id).order('period', { ascending: false }).limit(25),
    ])
    if (dataset.error) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })
    return NextResponse.json({ dataset: dataset.data, columns: columns.data ?? [], validation: validation.data ?? [], preview: preview.data ?? [] })
  } catch { return NextResponse.json({ error: 'Dataset storage is not available yet.' }, { status: 503 }) }
}
