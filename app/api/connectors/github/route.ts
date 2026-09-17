import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID
  const redirectUri = process.env.GITHUB_REDIRECT_URI
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET || !redirectUri) {
    return NextResponse.json({ configured: false, error: 'GitHub is not configured. Add GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_REDIRECT_URI.' }, { status: 503 })
  }
  const state = crypto.randomUUID()
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'repo read:org')
  url.searchParams.set('state', state)
  const response = NextResponse.redirect(url)
  response.cookies.set('cpgist_github_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' })
  return response
}
