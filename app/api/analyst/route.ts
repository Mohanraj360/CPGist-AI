import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'
import { calculateGroundingScore } from '@/lib/cpg/grounding'

type OllamaResponse = { response?: string }

function getOllamaConfig() {
  const baseUrl = process.env.OLLAMA_BASE_URL?.replace(/\/$/, '')
  const model = process.env.OLLAMA_MODEL
  if (!baseUrl || !model) throw new Error('Ollama is not configured.')
  return { baseUrl, model }
}

async function generateWithOllama(prompt: string) {
  const { baseUrl, model } = getOllamaConfig()
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Ollama returned ${response.status}.`)
  const data = await response.json() as OllamaResponse
  if (!data.response?.trim()) throw new Error('Ollama returned an empty response.')
  return data.response.trim()
}

function parseModelResponse(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { answer?: unknown }
    if (typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer.trim()
  } catch {}
  return raw.trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt || prompt.length > 2000) return NextResponse.json({ error: 'Enter a question under 2,000 characters.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

    let datasetId = typeof body.datasetId === 'string' ? body.datasetId : null
    if (!datasetId) {
      const { data, error } = await supabase.from('datasets').select('id').eq('status', 'ready').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(`Unable to select a dataset: ${error.message}`)
      datasetId = data?.id ?? null
    }
    if (!datasetId) return NextResponse.json({ error: 'Select or ingest a dataset before asking the AI Analyst.' }, { status: 422 })

    const { data: dataset, error: datasetError } = await supabase.from('datasets').select('id,name,status').eq('id', datasetId).single()
    if (datasetError || !dataset) return NextResponse.json({ error: 'Selected dataset was not found or is not accessible.' }, { status: 404 })
    if (dataset.status !== 'ready') return NextResponse.json({ error: 'The selected dataset is not ready for analysis yet.' }, { status: 422 })

    const analytics = await aggregateAnalytics(supabase, datasetId)
    if (!analytics.metrics.rowCount) return NextResponse.json({ error: 'The selected dataset contains no analyzable sales facts.' }, { status: 422 })

    const evidence = JSON.stringify({
      dataset: dataset.name,
      metrics: analytics.metrics,
      periods: analytics.trend,
      categories: analytics.categories.slice(0, 20),
      brands: analytics.brands.slice(0, 20),
      retailers: analytics.retailers.slice(0, 20),
      anomalies: analytics.anomalies.slice(0, 20),
    })

    const raw = await generateWithOllama(`You are CPGist AI, an evidence-first consumer packaged goods analyst.
Use ONLY the supplied dataset evidence. Never invent values, brands, periods, sources, causal explanations, or calculations that cannot be derived from the evidence.
For ranking questions, use the supplied ranked values rather than guessing.
For calculations, use the supplied independently computed metrics and report their exact values.
If the evidence cannot answer the question, say that it cannot be determined from this dataset.
Do not claim statistical significance or causality unless the evidence provides it.
Return JSON only: {"answer":"concise answer grounded in the evidence"}.

DATASET EVIDENCE:
${evidence}

USER QUESTION:
${prompt}`)
    const answer = parseModelResponse(raw)
    if (!answer) return NextResponse.json({ error: 'The Analyst returned no answer.' }, { status: 503 })

    const accuracy = calculateGroundingScore(answer, evidence)
    const result = {
      answer,
      dataset: dataset.name,
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL ?? 'unknown',
      grounding: accuracy,
      accuracy,
      trace: ['Intent detected', 'Authorized dataset loaded', 'All dataset facts aggregated server-side', 'Evidence supplied to model', 'Dataset-verified answer accuracy calculated from independently computed evidence'],
    }

    const { data: saved, error: saveError } = await supabase.from('analyses').insert({
      dataset_id: datasetId, prompt, result, created_by: user.id,
    }).select('id').single()
    if (saveError) console.error('[analyst] save failed', saveError)

    return NextResponse.json({ ...result, datasetId, analysisId: saved?.id ?? null })
  } catch (error) {
    console.error('[analyst]', error)
    const message = error instanceof Error ? error.message : 'AI Analyst is unavailable.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
