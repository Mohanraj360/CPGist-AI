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
      const { data } = await supabase.from('datasets').select('id').eq('status', 'ready').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      datasetId = data?.id ?? null
    }
    if (!datasetId) return NextResponse.json({ error: 'Select or ingest a dataset before asking the AI Analyst.' }, { status: 422 })

    const { data: dataset } = await supabase.from('datasets').select('id,name').eq('id', datasetId).single()
    if (!dataset) return NextResponse.json({ error: 'Selected dataset was not found.' }, { status: 404 })

    const analytics = await aggregateAnalytics(supabase, datasetId)
    const evidence = JSON.stringify({
      dataset: dataset.name,
      metrics: analytics.metrics,
      periods: analytics.trend,
      categories: analytics.categories.slice(0, 20),
      brands: analytics.brands.slice(0, 20),
      retailers: analytics.retailers.slice(0, 20),
      anomalies: analytics.anomalies.slice(0, 20),
    })

    const raw = await generateWithOllama(`You are CPGist AI, a grounded consumer packaged goods analyst.
Use ONLY the supplied dataset evidence. Do not invent values, brands, periods, sources, or causal explanations.
If the evidence cannot answer a question, explicitly say that it cannot be determined from this dataset.
Do not claim statistical significance unless the evidence provides it.
Return JSON only: {"answer":"concise answer with exact values from evidence where relevant"}.

DATASET EVIDENCE:
${evidence}

USER QUESTION:
${prompt}`)
    const answer = parseModelResponse(raw)
    const grounding = calculateGroundingScore(answer, evidence)

    const result = {
      answer,
      dataset: dataset.name,
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL ?? 'unknown',
      grounding,
      trace: ['Intent detected', 'Authorized dataset loaded', 'All dataset facts aggregated server-side', 'Evidence supplied to model', 'Response grounding measured deterministically'],
    }

    const { data: saved } = await supabase.from('analyses').insert({
      dataset_id: datasetId, prompt, result, created_by: user.id,
    }).select('id').single()

    return NextResponse.json({ ...result, datasetId, analysisId: saved?.id ?? null })
  } catch (error) {
    console.error('[analyst]', error)
    const message = error instanceof Error && error.message !== 'Ollama is not configured.'
      ? error.message
      : 'AI Analyst is unavailable. Check OLLAMA_BASE_URL and OLLAMA_MODEL.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
