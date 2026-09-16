import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !(process.env.GOOGLE_CLIENT_SECRET || process.env.secret) || !redirectUri) {
    return NextResponse.json({ configured: false, error: 'Google Drive is not configured. Add OAuth credentials and a redirect URI to enable it.' }, { status: 503 })
  }
  const state = crypto.randomUUID()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly')
  url.searchParams.set('state', state)
  const response = NextResponse.redirect(url)
  response.cookies.set('cpgist_google_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' })
  return response
}
