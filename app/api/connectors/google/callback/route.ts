import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/connectors/crypto'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieJar = await cookies()
  if (!code || !state || state !== cookieJar.get('cpgist_google_oauth_state')?.value) return NextResponse.json({ error: 'Invalid Google OAuth state.' }, { status: 400 })
  const clientId = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET, redirect = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !secret || !redirect) return NextResponse.json({ error: 'Google OAuth is not configured.' }, { status: 503 })
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }), cache: 'no-store' })
  const tokens = await tokenResponse.json()
  if (!tokenResponse.ok || !tokens.access_token) return NextResponse.json({ error: 'Google OAuth token exchange failed.', detail: tokens?.error_description ?? tokens?.error }, { status: 502 })
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  const { error } = await supabase.from('data_connections').upsert({ provider: 'google_drive', status: 'connected', metadata: { access_token: encryptSecret(tokens.access_token), refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null, expires_in: tokens.expires_in, scope: tokens.scope ?? null }, created_by: user.id }, { onConflict: 'provider,created_by' })
  if (error) return NextResponse.json({ error: 'Connection could not be saved.', detail: error.message }, { status: 503 })
  const response = NextResponse.redirect(new URL('/?connected=google', request.url)); response.cookies.delete('cpgist_google_oauth_state'); return response
}
