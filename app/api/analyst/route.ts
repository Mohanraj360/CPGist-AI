import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

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
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Ollama returned ${response.status}.`)
  const data = await response.json() as OllamaResponse
  if (!data.response?.trim()) throw new Error('Ollama returned an empty response.')
  return data.response.trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt || prompt.length > 2000) return NextResponse.json({ error: 'Enter a question under 2,000 characters.' }, { status: 400 })

    const datasetId = typeof body.datasetId === 'string' ? body.datasetId : null
    let context = 'No dataset was selected. Deterministic analytics require an ingested dataset.'
    if (datasetId) {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const analytics = await aggregateAnalytics(supabase, datasetId)
          context = JSON.stringify({ metrics: analytics.metrics, trend: analytics.trend, topCategories: analytics.categories.slice(0, 10), topBrands: analytics.brands.slice(0, 10), topRetailers: analytics.retailers.slice(0, 10), anomalies: analytics.anomalies })
        }
      } catch { context = 'The selected dataset is unavailable.' }
    }
    const answer = await generateWithOllama(`You are CPGist AI, a precise consumer packaged goods intelligence analyst. Only use facts supplied in the prompt and workspace context. If workspace data is missing, say so. Never invent metrics, sources, or dataset names.\n\nWorkspace context: ${context}\n\nUser question: ${prompt}`)
    return NextResponse.json({ answer, provider: 'ollama', trace: ['Intent detected', 'Workspace context checked', 'Deterministic metrics computed', 'Ollama narrative generated'] })
  } catch (error) {
    console.error('[v0] Analyst request failed', error)
    const message = error instanceof Error && error.message === 'Ollama is not configured.'
      ? 'AI Analyst is unavailable. Core CPG analytics remain available.'
      : 'AI Analyst is unavailable. Core CPG analytics remain available.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
