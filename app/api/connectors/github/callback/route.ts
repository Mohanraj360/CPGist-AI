import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/connectors/crypto'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const c = await cookies()
  if (!code || !state || state !== c.get('cpgist_github_oauth_state')?.value) return NextResponse.json({ error: 'Invalid GitHub OAuth state.' }, { status: 400 })
  const clientId = process.env.GITHUB_CLIENT_ID, secret = process.env.GITHUB_CLIENT_SECRET, redirect = process.env.GITHUB_REDIRECT_URI
  if (!clientId || !secret || !redirect) return NextResponse.json({ error: 'GitHub OAuth is not configured.' }, { status: 503 })
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, redirect_uri: redirect }), cache: 'no-store' })
  const tokens = await tokenResponse.json()
  if (!tokenResponse.ok || !tokens.access_token) return NextResponse.json({ error: 'GitHub OAuth token exchange failed.', detail: tokens?.error_description ?? tokens?.error }, { status: 502 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  const { error } = await supabase.from('data_connections').upsert({ provider: 'github', status: 'connected', metadata: { access_token: encryptSecret(tokens.access_token), scope: tokens.scope ?? null, token_type: tokens.token_type ?? 'bearer' }, created_by: user.id }, { onConflict: 'provider,created_by' })
  if (error) return NextResponse.json({ error: 'GitHub connection could not be saved.', detail: error.message }, { status: 503 })
  const response = NextResponse.redirect(new URL('/?connected=github', request.url))
  response.cookies.delete('cpgist_github_oauth_state')
  return response
}
