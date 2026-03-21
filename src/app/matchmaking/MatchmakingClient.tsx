'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function MatchmakingClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode      = (searchParams.get('mode') as '1v1' | '4p') ?? '1v1'
  const supabase  = createClient()

  const [profile, setProfile]     = useState<Profile | null>(null)
  const [waitTime, setWaitTime]   = useState(0)
  const [status, setStatus]       = useState<'searching' | 'found'>('searching')
  const intervalRef               = useRef<NodeJS.Timeout | null>(null)
  const matchCheckRef             = useRef<NodeJS.Timeout | null>(null)
  const mounted                   = useRef(true)
  const waitTimeRef               = useRef(0)
  const queueEnteredAt            = useRef(new Date().toISOString())

  const maxPlayers = mode === '4p' ? 4 : 2

  useEffect(() => {
    mounted.current = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mounted.current) setProfile(p)

      // Use server-side joined_at to avoid client/server clock-skew
      const { data: queueRow } = await supabase.from('matchmaking_queue').upsert({
        profile_id: user.id, mode, game_type: 'competitive',
        elo: mode === '1v1' ? (p?.elo_1v1 ?? p?.elo ?? 0) : (p?.elo_4p ?? p?.elo ?? 0),
      }, { onConflict: 'profile_id' }).select('joined_at').single()
      queueEnteredAt.current = queueRow?.joined_at ?? new Date().toISOString()

      matchCheckRef.current = setInterval(() => checkForMatch(user.id), 2000)
    }

    intervalRef.current = setInterval(() => {
      if (mounted.current) setWaitTime(t => { waitTimeRef.current = t + 1; return t + 1 })
    }, 1000)

    init()
    return () => {
      mounted.current = false
      if (intervalRef.current)   clearInterval(intervalRef.current)
      if (matchCheckRef.current) clearInterval(matchCheckRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkForMatch = async (userId: string) => {
    // Look for active games created AFTER we joined the queue (use inner join, not UUID ordering)
    const { data: activeGame } = await supabase
      .from('games')
      .select('id, status, created_at, game_players!inner(profile_id)')
      .eq('status', 'active')
      .eq('game_players.profile_id', userId)
      .gte('created_at', queueEnteredAt.current)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (activeGame) {
      if (matchCheckRef.current) clearInterval(matchCheckRef.current)
      await supabase.from('matchmaking_queue').delete().eq('profile_id', userId)
      if (mounted.current) setStatus('found')
      setTimeout(() => router.push(`/game/${activeGame.id}`), 800)
      return
    }

    const fullMode = `competitive_${mode}` as const
    const { data: allQueue } = await supabase
      .from('matchmaking_queue')
      .select('*, profiles(id,elo,elo_1v1,elo_4p)')
      .eq('mode', mode)
      .eq('game_type', 'competitive')
      .order('joined_at')
      .limit(50)

    if (!allQueue || allQueue.length < maxPlayers) return

    const me = allQueue.find(q => q.profile_id === userId)
    if (!me) return

    // ELO range matching — widens over time
    const myElo = me.elo ?? 0
    const eloRange = 200 + Math.floor(waitTimeRef.current / 30) * 100
    let queue = allQueue.filter(q => {
      const qElo = q.elo ?? 0
      return Math.abs(qElo - myElo) <= eloRange
    })

    if (queue.length < maxPlayers) return
    if (!queue.find(q => q.profile_id === userId)) return

    const matchedQueue = queue.slice(0, maxPlayers)
    if (!matchedQueue.find(q => q.profile_id === userId)) return

    // Only the first person in the matched set creates the game
    if (matchedQueue[0].profile_id !== userId) return

    if (mounted.current) setStatus('found')

    const { data: game } = await supabase.from('games').insert({
      mode: fullMode,
      max_players: maxPlayers,
      status: 'active',
    }).select().single()
    if (!game) return

    const symbols = ['X', 'O', 'W', 'M']
    for (let i = 0; i < matchedQueue.length; i++) {
      await supabase.from('game_players').insert({
        game_id: game.id,
        profile_id: matchedQueue[i].profile_id,
        symbol: symbols[i],
        player_index: i,
        elo_before: matchedQueue[i].elo ?? 0,
      })
      await supabase.from('matchmaking_queue').delete().eq('profile_id', matchedQueue[i].profile_id)
    }

    if (matchCheckRef.current) clearInterval(matchCheckRef.current)
    setTimeout(() => router.push(`/game/${game.id}`), 800)
  }

  const cancelMatchmaking = async () => {
    if (profile) {
      await supabase.from('matchmaking_queue').delete().eq('profile_id', profile.id)
    }
    router.push('/')
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const myElo = profile
    ? (mode === '1v1' ? (profile.elo_1v1 ?? profile.elo ?? 0) : (profile.elo_4p ?? profile.elo ?? 0))
    : 1200
  const eloRange = 200 + Math.floor(waitTime / 30) * 100

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={cancelMatchmaking} className="btn-ghost text-sm">← Lobby</button>
        <div className="text-center">
          <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
          <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
        </div>
        <div className="w-16" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="card w-full max-w-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-bold text-white">
              {status === 'found' ? 'Match found!' : 'Searching for players…'}
            </h2>
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'found' ? 'bg-neon-green' : 'bg-neon-cyan animate-pulse'}`} />
          </div>

          <div className="flex gap-2 mb-5">
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              ⚔️ Ranked
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {mode === '4p' ? '4-Player' : '1v1'}
            </span>
          </div>

          <div className="flex gap-2 mb-5">
            {Array.from({ length: maxPlayers }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-14 rounded-xl border flex flex-col items-center justify-center gap-1"
                style={{
                  borderColor: i === 0 ? '#00f5ff40' : '#ffffff10',
                  background: i === 0 ? '#00f5ff08' : 'transparent',
                }}
              >
                <span className="text-lg font-black" style={{ color: i === 0 ? '#00f5ff' : '#1e293b' }}>
                  {i === 0 ? (profile?.username?.[0]?.toUpperCase() ?? '?') : '?'}
                </span>
                <span className="text-xs" style={{ color: i === 0 ? '#00f5ff60' : '#1e293b' }}>
                  {i === 0 ? 'You' : '···'}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 mb-6 text-center">
            <p className="text-slate-500 text-sm font-mono">{formatTime(waitTime)}</p>
            {profile && (
              <p className="text-slate-600 text-xs">
                ELO range: {myElo - eloRange} – {myElo + eloRange}
                <span className="text-slate-700 ml-1">(widens every 30s)</span>
              </p>
            )}
          </div>

          {status === 'searching' && (
            <div className="flex justify-center gap-1.5 mb-6">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-neon-cyan/40 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
          )}

          <button
            onClick={cancelMatchmaking}
            className="btn-ghost w-full text-sm text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
            disabled={status === 'found'}
          >
            {status === 'found' ? '✓ Match found — loading…' : '✕ Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
