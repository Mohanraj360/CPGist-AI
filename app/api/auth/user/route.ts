import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ user: user ? { id: user.id, email: user.email, user_metadata: user.user_metadata } : null })
  } catch (error) {
    const configured = !(error instanceof Error && error.message.includes('Supabase public configuration'))
    return NextResponse.json({ user: null, configured, error: configured ? 'Authentication is unavailable.' : 'Supabase URL and publishable/anon key are required in the deployment environment.' }, { status: 503 })
  }
}
