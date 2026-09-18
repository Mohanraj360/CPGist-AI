import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ user: user ? { id: user.id, email: user.email, user_metadata: user.user_metadata } : null })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const configured = !message.includes('Supabase server configuration')
    return NextResponse.json({ user: null, configured, error: configured ? 'Authentication is unavailable.' : 'Supabase server configuration is missing. Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to the deployment environment.' }, { status: 503 })
  }
}
