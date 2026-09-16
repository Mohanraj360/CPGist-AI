import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const workflowId = typeof body?.workflowId === 'string' ? body.workflowId : ''
  const datasetId = typeof body?.datasetId === 'string' ? body.datasetId : ''
  if (!workflowId) return NextResponse.json({ error: 'workflowId is required.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

  const { data: workflow, error: workflowError } = await supabase.from('workflows').select('id,definition').eq('id', workflowId).single()
  if (workflowError || !workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 })

  const { data: run, error: runError } = await supabase.from('workflow_runs').insert({
    workflow_id: workflow.id,
    status: 'running',
    detail: { startedBy: user.id, datasetId: datasetId || null, steps: workflow.definition },
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (runError || !run) return NextResponse.json({ error: 'Unable to start workflow.' }, { status: 503 })

  try {
    const result = datasetId ? await aggregateAnalytics(supabase, datasetId) : null
    const detail = { datasetId: datasetId || null, completedSteps: datasetId ? ['validate', 'analyze'] : [], resultSummary: result ? { rows: result.metrics.rowCount, sales: result.metrics.sales, anomalies: result.anomalies.length } : null }
    await supabase.from('workflow_runs').update({ status: 'completed', detail, completed_at: new Date().toISOString() }).eq('id', run.id)
    return NextResponse.json({ run: { id: run.id, status: 'completed', detail } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow failed.'
    await supabase.from('workflow_runs').update({ status: 'failed', detail: { error: message }, completed_at: new Date().toISOString() }).eq('id', run.id)
    return NextResponse.json({ error: message, runId: run.id }, { status: 500 })
  }
}
