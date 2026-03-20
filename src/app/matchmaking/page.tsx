'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function MatchmakingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode      = searchParams.get('mode') as '1v1' | '4p' ?? '1v1'
  const gameType  = searchParams.get('type') as 'casual' | 'competitive' ?? 'casual'
  const supabase  = createClient()

  const [profile, setProfile]     = useState<Profile | null>(null)
  const [waitTime, setWaitTime]   = useState(0)
  const [status, setStatus]       = useState('Searching for players…')
  const intervalRef               = useRef<NodeJS.Timeout | null>(null)
  const matchCheckRef             = useRef<NodeJS.Timeout | null>(null)
  const mounted                   = useRef(true)
  const waitTimeRef               = useRef(0)

  const maxPlayers = mode === '4p' ? 4 : 2

  useEffect(() => {
    mounted.current = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mounted.current) setProfile(p)

      // Ensure in queue
      await supabase.from('matchmaking_queue').upsert({
        profile_id: user.id, mode, game_type: gameType, elo: p?.elo ?? 1200,
      })

      // Poll for a match every 2 seconds
      matchCheckRef.current = setInterval(() => checkForMatch(user.id), 2000)
    }

    // Wait time counter
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
    // Check if I've been added to a game (someone else matched us)
    const { data: myGamePlayer } = await supabase
      .from('game_players')
      .select('game_id, games(status, mode)')
      .eq('profile_id', userId)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (myGamePlayer && (myGamePlayer.games as { status: string; mode: string })?.status !== 'completed') {
      if (matchCheckRef.current) clearInterval(matchCheckRef.current)
      await supabase.from('matchmaking_queue').delete().eq('profile_id', userId)
      router.push(`/game/${myGamePlayer.game_id}`)
      return
    }

    // Try to create a match
    const fullMode = `${gameType}_${mode}` as const
    const { data: allQueue } = await supabase
      .from('matchmaking_queue')
      .select('*, profiles(id,elo)')
      .eq('mode', mode)
      .eq('game_type', gameType)
      .order('joined_at')
      .limit(50)

    if (!allQueue || allQueue.length < maxPlayers) return

    const me = allQueue.find(q => q.profile_id === userId)
    if (!me) return

    // For competitive, filter by ELO range (±200 base, +100 per 30s of waiting)
    let queue = allQueue
    if (gameType === 'competitive') {
      const myElo = (me.profiles as Profile)?.elo ?? me.elo ?? 1200
      const eloRange = 200 + Math.floor(waitTimeRef.current / 30) * 100
      queue = allQueue.filter(q => {
        const qElo = (q.profiles as Profile)?.elo ?? q.elo ?? 1200
        return Math.abs(qElo - myElo) <= eloRange
      })
    }

    if (queue.length < maxPlayers) return
    if (!queue.find(q => q.profile_id === userId)) return

    // Slice to exact needed count, oldest waiters first
    const matchedQueue = queue.slice(0, maxPlayers)
    if (!matchedQueue.find(q => q.profile_id === userId)) return

    // We have enough players — create game (first in queue is host)
    if (matchedQueue[0].profile_id !== userId) return // let first player create

    if (mounted.current) setStatus('Match found! Creating game…')

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
        elo_before: (matchedQueue[i].profiles as Profile)?.elo ?? 1200,
      })
      await supabase.from('matchmaking_queue').delete().eq('profile_id', matchedQueue[i].profile_id)
    }

    if (matchCheckRef.current) clearInterval(matchCheckRef.current)
    router.push(`/game/${game.id}`)
  }

  const cancelMatchmaking = async () => {
    if (profile) {
      await supabase.from('matchmaking_queue').delete().eq('profile_id', profile.id)
    }
    router.push('/')
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan/4 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-purple/4 rounded-full blur-3xl pointer-events-none" />

      <div className="card w-full max-w-sm text-center">
        {/* Animated radar rings */}
        <div className="relative flex items-center justify-center mb-8 h-24">
          <div className="absolute w-20 h-20 rounded-full border border-neon-cyan/20 animate-ping" />
          <div className="absolute w-14 h-14 rounded-full border border-neon-cyan/40 animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-neon-cyan/20 border border-neon-cyan flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-neon-cyan animate-pulse" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-white mb-1">{status}</h2>
        <p className="text-slate-500 text-sm mb-1">
          {gameType === 'competitive' ? '⚔️ Ranked' : '🎮 Casual'} · {mode.toUpperCase()}
        </p>
        {gameType === 'competitive' && profile && (
          <p className="text-slate-600 text-xs mb-1">
            ELO range: {(profile.elo ?? 1200) - (200 + Math.floor(waitTime / 30) * 100)} – {(profile.elo ?? 1200) + (200 + Math.floor(waitTime / 30) * 100)}
          </p>
        )}
        <p className="text-slate-600 text-xs mb-6">Wait time: {formatTime(waitTime)}</p>

        {/* Player slots */}
        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: maxPlayers }, (_, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded-lg border flex items-center justify-center text-sm font-bold"
              style={{
                borderColor: i === 0 ? '#00f5ff60' : '#ffffff15',
                color: i === 0 ? '#00f5ff' : '#334155',
                background: i === 0 ? '#00f5ff10' : 'transparent',
              }}
            >
              {i === 0 ? (profile?.username?.[0]?.toUpperCase() ?? '?') : '?'}
            </div>
          ))}
        </div>

        <button onClick={cancelMatchmaking} className="btn-ghost w-full text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}
