import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookies) { cookies.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options) }) } } })
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const publicRoute = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password') || pathname.startsWith('/auth') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')
  if (!user && !publicRoute) return NextResponse.redirect(new URL('/login', request.url))
  if (user && (pathname === '/login' || pathname === '/signup')) return NextResponse.redirect(new URL('/', request.url))
  return response
}
