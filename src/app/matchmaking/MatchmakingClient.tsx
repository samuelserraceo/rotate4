'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

const TIERS = [
  { name: 'Bronze', min: 0, max: 2000 },
  { name: 'Silver', min: 2000, max: 3500 },
  { name: 'Gold', min: 3500, max: 5000 },
  { name: 'Diamond', min: 5000, max: 7000 },
  { name: 'Emerald', min: 7000, max: 10000 },
  { name: 'Champion', min: 10000, max: Infinity },
]

function getTierIndex(elo: number): number {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (elo >= TIERS[i].min) return i
  }
  return 0
}

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
  const profileRef                = useRef<Profile | null>(null)

  const maxPlayers = mode === '4p' ? 4 : 2
  useEffect(() => {
    mounted.current = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mounted.current) { setProfile(p); profileRef.current = p }

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
      // Clean up queue entry on unmount so stale entries don't block others
      const p = profileRef.current
      if (p) {
        supabase.from('matchmaking_queue').delete().eq('profile_id', p.id).then(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const checkForMatch = async (userId: string) => {
    // Purge stale queue entries older than 2 minutes (ghost players who disconnected)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    await supabase.from('matchmaking_queue')
      .delete()
      .lt('joined_at', staleThreshold)
      .neq('profile_id', userId)

    // Look for active games created AFTER we joined the queue
    const { data: activeGame } = await supabase
      .from('games')
      .select('id, status, created_at, game_players!inner(profile_id)')
      .eq('status', 'active')
      .eq('game_players.profile_id', userId)
      .gte('created_at', queueEnteredAt.current)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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

    // ELO range matching — widens over time (200 base + 100 every 15s)
    const myElo = me.elo ?? 0
    const eloRange = 200 + Math.floor(waitTimeRef.current / 15) * 100

    let queue = allQueue.filter(q => {
      const qElo = q.elo ?? 0
      return Math.abs(qElo - myElo) <= eloRange
    })

    if (queue.length < maxPlayers) return
    if (!queue.find(q => q.profile_id === userId)) return

    const matchedQueue = queue.slice(0, maxPlayers)
    if (!matchedQueue.find(q => q.profile_id === userId)) return
    // Only the first person in the matched set creates the game
    // BUT if we've waited 10+ seconds, allow second player to also attempt
    // This prevents deadlock when first player disconnects between checks
    const isFirst = matchedQueue[0].profile_id === userId
    const canTakeover = waitTimeRef.current >= 10

    if (!isFirst && !canTakeover) return

    // Double-check: if not first, verify first player is still in queue
    if (!isFirst) {
      const { data: firstStillQueued } = await supabase
        .from('matchmaking_queue')
        .select('profile_id')
        .eq('profile_id', matchedQueue[0].profile_id)
        .maybeSingle()

      // Check if we already have an active game before creating a new one
      const { data: existingGame } = await supabase
        .from('games')
        .select('id, game_players!inner(profile_id)')
        .eq('status', 'active')
        .eq('game_players.profile_id', userId)
        .gte('created_at', queueEnteredAt.current)
        .maybeSingle()

      if (existingGame) {
        if (matchCheckRef.current) clearInterval(matchCheckRef.current)
        await supabase.from('matchmaking_queue').delete().eq('profile_id', userId)
        if (mounted.current) setStatus('found')
        setTimeout(() => router.push(`/game/${existingGame.id}`), 800)
        return
      }

      // If first player left queue but no game exists, take over
      if (!firstStillQueued) {
        // First player vanished without creating a game
      } else {
        // First player is still in queue, give them more time
        return
      }
    }

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
  const eloRange = 200 + Math.floor(waitTime / 15) * 100
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={cancelMatchmaking} className="btn-ghost text-sm">{'\u2190'} Lobby</button>
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
              {status === 'found' ? 'Match found!' : 'Searching for players\u2026'}
            </h2>
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'found' ? 'bg-neon-green' : 'bg-neon-cyan animate-pulse'}`} />
          </div>

          <div className="flex gap-2 mb-5">
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {'\u2694\uFE0F'} Ranked
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
                  {i === 0 ? 'You' : '\u00B7\u00B7\u00B7'}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 mb-6 text-center">
            <p className="text-slate-500 text-sm font-mono">{formatTime(waitTime)}</p>
            {profile && (
              <p className="text-slate-600 text-xs">
                ELO range: {Math.max(0, myElo - eloRange)} {'\u2013'} {myElo + eloRange}
                <span className="text-slate-700 ml-1">(widens every 15s)</span>
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
            {status === 'found' ? '\u2713 Match found \u2014 loading\u2026' : '\u2715 Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
