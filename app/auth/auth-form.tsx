'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, KeyRound, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

const copy = {
  login: { eyebrow: 'WELCOME BACK', title: 'Return to the signal.', body: 'Sign in to your CPGist intelligence workspace.', submit: 'Sign in', alternate: 'Create an account', alternateHref: '/signup' },
  signup: { eyebrow: 'START WITH SIGNAL', title: 'Build your intelligence layer.', body: 'Create a workspace for sharper CPG decisions.', submit: 'Create account', alternate: 'Already have an account?', alternateHref: '/login' },
  forgot: { eyebrow: 'ACCOUNT RECOVERY', title: 'Reset your access.', body: 'We will send a secure recovery link to your inbox.', submit: 'Send recovery link', alternate: 'Back to sign in', alternateHref: '/login' },
  reset: { eyebrow: 'NEW PASSWORD', title: 'Secure your workspace.', body: 'Choose a new password for your CPGist account.', submit: 'Update password', alternate: 'Back to sign in', alternateHref: '/login' },
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const current = copy[mode]

  useEffect(() => {
    if (mode !== 'reset' || !supabase) return
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
    })
  }, [mode, router, supabase])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (mode === 'reset' && password !== confirm) return setError('Passwords do not match.')
    if (password && password.length < 8) return setError('Use at least 8 characters for your password.')
    if (!supabase) {
      setError('Authentication is not configured for this deployment.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/')
        router.refresh()
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback` },
        })
        if (error) throw error
        setNotice('Check your inbox to confirm your email, then return here to sign in.')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` })
        if (error) throw error
        setNotice('If an account matches that email, a recovery link is on its way.')
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setNotice('Password updated. Redirecting to your workspace.')
        window.setTimeout(() => router.replace('/'), 900)
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.toLowerCase() : ''
      setError(message.includes('invalid login') || message.includes('credentials') ? 'Invalid email or password.' : message.includes('rate') ? 'Too many attempts. Please try again shortly.' : message.includes('confirm') ? 'Please confirm your email before signing in.' : 'We could not complete that request. Please try again.')
    } finally { setLoading(false) }
  }

  return <main className="auth-shell"><section className="auth-visual"><div className="auth-brand"><span className="brand-mark"><Sparkles /></span><strong>CPGist</strong><span>AI intelligence</span></div><div className="auth-visual-copy"><div className="eyebrow">CONSUMER INTELLIGENCE, GROUNDED</div><h1>Make the next decision<br /><em>feel obvious.</em></h1><p>One intelligence layer for the data, signals, and stories moving your category forward.</p><div className="auth-signal"><span><i /> LIVE SIGNAL</span><strong>Workspace data</strong><small>Metrics appear after ingestion</small></div></div></section><section className="auth-panel"><div className="auth-card"><div className="auth-heading"><div className="auth-icon"><LockKeyhole /></div><div className="eyebrow">{current.eyebrow}</div><h2>{current.title}</h2><p>{current.body}</p></div>{notice ? <div className="auth-notice"><CheckCircle2 />{notice}</div> : <form onSubmit={submit} className="auth-form">{mode !== 'reset' && <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required /></label>}{mode !== 'forgot' && <label>{mode === 'reset' ? 'New password' : 'Password'}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>}{mode === 'reset' && <label>Confirm new password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" required /></label>}{error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" disabled={loading}>{loading ? 'Working…' : current.submit}<ArrowRight /></button>{mode === 'login' && <button type="button" className="auth-link-button" onClick={() => router.push('/forgot-password')}><KeyRound /> Forgot your password?</button>}</form>}<div className="auth-footer"><span>{current.alternate}</span><a href={current.alternateHref}>{mode === 'signup' ? 'Sign in' : mode === 'login' ? 'Create account' : 'Continue'}</a></div></div><small className="auth-legal">By continuing, you agree to the CPGist terms and privacy policy.</small></section></main>
}
