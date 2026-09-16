import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const tenant = process.env.MICROSOFT_TENANT_ID
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  if (!clientId || !process.env.MICROSOFT_CLIENT_SECRET || !tenant || !redirectUri) {
    return NextResponse.json({ configured: false, error: 'Microsoft Graph is not configured. Add OAuth credentials and a redirect URI to enable it.' }, { status: 503 })
  }
  const state = crypto.randomUUID()
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', 'openid profile email offline_access User.Read Files.Read.All Sites.Read.All')
  url.searchParams.set('state', state)
  const response = NextResponse.redirect(url)
  response.cookies.set('cpgist_microsoft_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' })
  return response
}
