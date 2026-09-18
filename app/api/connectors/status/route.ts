import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    connectors: {
      googleDrive: { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), callbackConfigured: Boolean(process.env.GOOGLE_REDIRECT_URI) },
      microsoftGraph: { configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID), callbackConfigured: Boolean(process.env.MICROSOFT_REDIRECT_URI) },
      github: { configured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET), callbackConfigured: Boolean(process.env.GITHUB_REDIRECT_URI) },
      groq: { configured: Boolean(process.env.GROQ_API_KEY?.trim()), model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
      connectorEncryption: { configured: Boolean(process.env.CONNECTOR_ENCRYPTION_KEY) },
    },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (body?.provider === 'groq') {
    const configured = Boolean(process.env.GROQ_API_KEY?.trim())
    return NextResponse.json({ ok: configured, provider: 'groq', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', error: configured ? undefined : 'Groq is not configured.' }, { status: configured ? 200 : 503 })
  }
  return NextResponse.json({ error: 'Choose a supported connection test.' }, { status: 400 })
}
