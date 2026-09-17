import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    connectors: {
      googleDrive: { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), callbackConfigured: Boolean(process.env.GOOGLE_REDIRECT_URI) },
      microsoftGraph: { configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID), callbackConfigured: Boolean(process.env.MICROSOFT_REDIRECT_URI) },
      github: { configured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET), callbackConfigured: Boolean(process.env.GITHUB_REDIRECT_URI) },
      ollama: { configured: Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL) },
      connectorEncryption: { configured: Boolean(process.env.CONNECTOR_ENCRYPTION_KEY) },
    },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (body?.provider === 'ollama') {
    const baseUrl = process.env.OLLAMA_BASE_URL
    if (!baseUrl || !process.env.OLLAMA_MODEL) return NextResponse.json({ ok: false, error: 'Ollama is not configured.' }, { status: 503 })
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return NextResponse.json({ ok: false, error: `Ollama responded with ${response.status}.` }, { status: 502 })
      const models = Array.isArray(data?.models) ? data.models.map((m: { name?: string }) => m.name).filter(Boolean) : []
      const modelReady = models.includes(process.env.OLLAMA_MODEL)
      return NextResponse.json({ ok: modelReady, model: process.env.OLLAMA_MODEL, models, error: modelReady ? undefined : `Model ${process.env.OLLAMA_MODEL} is not installed in Ollama.` }, { status: modelReady ? 200 : 503 })
    } catch { return NextResponse.json({ ok: false, error: 'Ollama is unavailable.' }, { status: 503 }) }
  }
  return NextResponse.json({ error: 'Choose a supported connection test.' }, { status: 400 })
}
