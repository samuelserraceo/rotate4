'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validateUsername } from '@/lib/profanity'

export default function OnboardingPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const validationError = validateUsername(username)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // Check username availability
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim())
      .single()

    if (existing) {
      setError('That username is already taken. Try another.')
      setLoading(false)
      return
    }

    // Get the default skin
    const { data: defaultSkin } = await supabase
      .from('skins')
      .select('id')
      .eq('is_default', true)
      .single()

    // Create profile
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: username.trim(),
      email: user.email,
      equipped_skin_id: defaultSkin?.id ?? null,
    })

    if (insertError) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    // Give them the default skin
    if (defaultSkin) {
      await supabase.from('owned_skins').insert({
        profile_id: user.id,
        skin_id: defaultSkin.id,
      })
    }

    router.push('/')
  }

  const usernameError = username.length > 0 ? validateUsername(username) : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/3 w-72 h-72 bg-neon-purple/5 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center mb-10">
        <h1 className="text-5xl font-bold text-neon-cyan text-glow-cyan tracking-wider mb-1">
          ROTATE<span className="text-neon-purple text-glow-purple">4</span>
        </h1>
        <p className="text-slate-500 text-sm tracking-widest uppercase">Choose your name</p>
      </div>

      <div className="card w-full max-w-sm border-neon-purple/10">
        <h2 className="text-xl font-semibold text-slate-200 mb-1">Almost there!</h2>
        <p className="text-slate-500 text-sm mb-6">
          Pick a username. It&apos;s how other players will see you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">
              Username
            </label>
            <input
              className="input"
              type="text"
              placeholder="e.g. StarPlayer99"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(null) }}
              maxLength={20}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
            />
            {/* Live validation hint */}
            {username.length > 0 && (
              <p className={`text-xs mt-1.5 ${usernameError ? 'text-red-400' : 'text-neon-green'}`}>
                {usernameError ?? '✓ Looks good!'}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !!usernameError || username.length < 3}
            className="btn-primary w-full py-3"
          >
            {loading ? 'Creating account…' : 'Enter the Arena →'}
          </button>
        </form>

        <div className="mt-4 text-xs text-slate-600 space-y-1">
          <p>• 3–20 characters</p>
          <p>• Letters, numbers, and underscores only</p>
          <p>• Must start with a letter</p>
        </div>
      </div>
    </div>
  )
}
