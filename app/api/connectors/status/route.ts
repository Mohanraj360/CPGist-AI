import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    connectors: {
      googleDrive: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && (process.env.GOOGLE_CLIENT_SECRET || process.env.secret)),
        callbackConfigured: Boolean(process.env.GOOGLE_REDIRECT_URI),
      },
      microsoftGraph: {
        configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID),
        callbackConfigured: Boolean(process.env.MICROSOFT_REDIRECT_URI),
      },
      ollama: {
        configured: Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL),
      },
      agentReach: {
        configured: Boolean(process.env.AGENT_REACH_BASE_URL && process.env.AGENT_REACH_API_KEY),
      },
      connectorEncryption: {
        configured: Boolean(process.env.CONNECTOR_ENCRYPTION_KEY),
      },
    },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const provider = body?.provider
  if (provider !== 'ollama') return NextResponse.json({ error: 'Connection tests are only available for configured providers.' }, { status: 400 })
  const baseUrl = process.env.OLLAMA_BASE_URL
  if (!baseUrl || !process.env.OLLAMA_MODEL) return NextResponse.json({ ok: false, error: 'Ollama is not configured.' }, { status: 503 })
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (!response.ok) return NextResponse.json({ ok: false, error: 'Ollama responded with an error.' }, { status: 502 })
    const data = await response.json()
    const models = Array.isArray(data?.models) ? data.models.map((model: { name?: string }) => model.name).filter(Boolean) : []
    return NextResponse.json({ ok: true, model: process.env.OLLAMA_MODEL, models })
  } catch {
    return NextResponse.json({ ok: false, error: 'Ollama is unavailable. Core CPG analytics remain available.' }, { status: 503 })
  }
}
