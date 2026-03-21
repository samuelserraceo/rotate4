'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'

export default function LoginClient() {
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const handleGoogleLogin = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-purple/5 rounded-full blur-3xl pointer-events-none" />
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold text-neon-cyan text-glow-cyan tracking-wider mb-2">
          ROTATE<span className="text-neon-purple text-glow-purple">4</span>
        </h1>
        <p className="text-slate-400 text-sm tracking-widest uppercase">
          The Gravity Flip Game
        </p>
        <div className="neon-line mt-6 w-48 mx-auto" />
      </div>
      <div className="card w-full max-w-sm border-neon-cyan/10">
        <h2 className="text-xl font-semibold text-center text-slate-200 mb-1">
          Welcome
        </h2>
        <p className="text-slate-500 text-sm text-center mb-6">
          Sign in with your Google account to play
        </p>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm text-center mb-4">
            Authentication failed. Please try again.
          </div>
        )}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 hover:bg-gray-100 font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Spinner />
          ) : (
            <GoogleIcon />
          )}
          {loading ? 'Connecting…' : 'Continue with Google'}
        </button>
        <p className="text-slate-600 text-xs text-center mt-4">
          By signing in you agree to play fair and have fun.
        </p>
      </div>
      <div className="mt-12 flex gap-2 opacity-30">
        {['X', 'O', 'W', 'M'].map((s, i) => (
          <div
            key={s}
            className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg font-bold"
            style={{
              borderColor: ['#00f5ff','#a855f7','#10b981','#f59e0b'][i] + '60',
              color: ['#00f5ff','#a855f7','#10b981','#f59e0b'][i],
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 19.001 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.021 35.596 44 30.138 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}
