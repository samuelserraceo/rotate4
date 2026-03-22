'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

const SYMBOL_COLORS: Record<string, string> = {
  X: '#00f5ff', O: '#a855f7', W: '#22c55e', M: '#f59e0b',
}
const SYMBOLS = ['X', 'O', 'W', 'M']

export default function MatchmakingClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = (searchParams.get('mode') as '1v1' | '3p' | '4p') ?? '1v1'
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [waitTime, setWaitTime] = useState(0)
  const [status, setStatus] = useState<'searching' | 'found'>('searching')
  const [foundPlayers, setFoundPlayers] = useState<{ username: string; symbol: string }[]>([])
  const [countdown, setCountdown] = useState<number | null>(null)

  const intervalRef    = useRef<NodeJS.Timeout | null>(null)
  const matchCheckRef  = useRef<NodeJS.Timeout | null>(null)
  const countdownRef   = useRef<NodeJS.Timeout | null>(null)
  const mounted        = useRef(true)
  const queueEnteredAt = useRef(new Date().toISOString())
  const gameIdRef      = useRef<string | null>(null)
  const userIdRef      = useRef<string | null>(null)

  const maxPlayers = mode === '4p' ? 4 : mode === '3p' ? 3 : 2
  const modeLabel  = mode === '4p' ? '4-Player' : mode === '3p' ? '3-Player' : '1v1'

  const startCountdown = (gId: string, players: { username: string; symbol: string }[]) => {
    if (gameIdRef.current) return // already found
    gameIdRef.current = gId
    setFoundPlayers(players)
    setStatus('found')
    setCountdown(5)

    let count = 5
    countdownRef.current = setInterval(() => {
      count -= 1
      if (mounted.current) setCountdown(count)
      if (count <= 0) {
        clearInterval(countdownRef.current!)
        if (mounted.current) router.push(`/game/${gId}`)
      }
    }, 1000)
  }

  useEffect(() => {
    mounted.current = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      userIdRef.current = user.id

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mounted.current) setProfile(p)

      const elo = mode === '1v1'
        ? (p?.elo_1v1 ?? p?.elo ?? 1200)
        : mode === '3p'
        ? ((p as any)?.elo_3p ?? p?.elo ?? 1200)
        : (p?.elo_4p ?? p?.elo ?? 1200)

      const { data: queueRow } = await supabase
        .from('matchmaking_queue')
        .upsert({ profile_id: user.id, mode, game_type: 'competitive', elo }, { onConflict: 'profile_id' })
        .select('joined_at').single()
      queueEnteredAt.current = queueRow?.joined_at ?? new Date().toISOString()

      matchCheckRef.current = setInterval(() => checkForMatch(user.id), 2000)
    }

    intervalRef.current = setInterval(() => {
      if (mounted.current) setWaitTime(t => t + 1)
    }, 1000)

    init()

    return () => {
      mounted.current = false
      if (intervalRef.current)   clearInterval(intervalRef.current)
      if (matchCheckRef.current) clearInterval(matchCheckRef.current)
      if (countdownRef.current)  clearInterval(countdownRef.current)
      if (userIdRef.current && !gameIdRef.current) {
        supabase.from('matchmaking_queue').delete().eq('profile_id', userIdRef.current).then(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkForMatch = async (userId: string) => {
    // First: check if already placed in a game (other player created it)
    const { data: myGamePlayer } = await supabase
      .from('game_players')
      .select('game_id, games(id, status, mode, created_at)')
      .eq('profile_id', userId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    const gameData = myGamePlayer?.games as { id: string; status: string; mode: string; created_at: string } | undefined
    if (myGamePlayer && gameData?.status === 'active' && gameData?.created_at >= queueEnteredAt.current) {
      if (matchCheckRef.current) clearInterval(matchCheckRef.current)
      await supabase.from('matchmaking_queue').delete().eq('profile_id', userId)

      const { data: gamePlayers } = await supabase
        .from('game_players')
        .select('symbol, profiles(username)')
        .eq('game_id', myGamePlayer.game_id)
        .order('player_index')

      const players = (gamePlayers ?? []).map((gp, i) => ({
        username: (gp.profiles as any)?.username ?? '?',
        symbol: gp.symbol ?? SYMBOLS[i],
      }))
      if (mounted.current) startCountdown(myGamePlayer.game_id, players)
      return
    }

    // Second: try to create a match from queue (no ELO restrictions)
    const { data: allQueue } = await supabase
      .from('matchmaking_queue')
      .select('*, profiles(id, username, elo, elo_1v1, elo_4p)')
      .eq('mode', mode)
      .eq('game_type', 'competitive')
      .order('joined_at')
      .limit(50)

    if (!allQueue || allQueue.length < maxPlayers) return
    const me = allQueue.find(q => q.profile_id === userId)
    if (!me) return

    // Simple: take the first N players — no ELO filter
    const matchedQueue = allQueue.slice(0, maxPlayers)
    if (!matchedQueue.find(q => q.profile_id === userId)) return

    // Only the OLDEST player in matched set creates the game
    if (matchedQueue[0].profile_id !== userId) return

    if (matchCheckRef.current) clearInterval(matchCheckRef.current)

    const fullMode = `competitive_${mode}` as const
    const { data: game } = await supabase.from('games').insert({
      mode: fullMode, max_players: maxPlayers, status: 'active',
    }).select().single()
    if (!game) { matchCheckRef.current = setInterval(() => checkForMatch(userId), 2000); return }

    const playersList: { username: string; symbol: string }[] = []
    for (let i = 0; i < matchedQueue.length; i++) {
      await supabase.from('game_players').insert({
        game_id: game.id, profile_id: matchedQueue[i].profile_id,
        symbol: SYMBOLS[i], player_index: i, elo_before: matchedQueue[i].elo ?? 0,
      })
      await supabase.from('matchmaking_queue').delete().eq('profile_id', matchedQueue[i].profile_id)
      playersList.push({
        username: (matchedQueue[i].profiles as any)?.username ?? '?',
        symbol: SYMBOLS[i],
      })
    }
    if (mounted.current) startCountdown(game.id, playersList)
  }

  const cancelMatchmaking = async () => {
    if (userIdRef.current) {
      gameIdRef.current = 'cancelled'
      await supabase.from('matchmaking_queue').delete().eq('profile_id', userIdRef.current)
    }
    router.push('/')
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
          {/* Title */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-bold text-white">
              {status === 'found'
                ? countdown !== null && countdown > 0
                  ? `Match found! Starting in ${countdown}…`
                  : 'Match found! Loading…'
                : 'Searching for players…'}
            </h2>
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'found' ? 'bg-neon-green animate-pulse' : 'bg-neon-cyan animate-pulse'}`} />
          </div>

          {/* Mode badges */}
          <div className="flex gap-2 mb-5">
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              \u2694\uFE0F Ranked
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {modeLabel}
            </span>
          </div>

          {/* Player slots */}
          <div className="flex gap-2 mb-5">
            {Array.from({ length: maxPlayers }, (_, i) => {
              const fp = foundPlayers[i]
              const isMe = i === 0
              const isFilled = isMe || !!fp
              const sym = fp?.symbol ?? SYMBOLS[i]
              const color = SYMBOL_COLORS[sym] ?? '#00f5ff'
              const name = fp?.username ?? (isMe ? (profile?.username ?? '?') : null)

              return (
                <div
                  key={i}
                  className="flex-1 h-16 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-500"
                  style={{
                    borderColor: isFilled ? `${color}50` : '#ffffff10',
                    background: isFilled ? `${color}0a` : 'transparent',
                  }}
                >
                  <span className="text-lg font-black" style={{ color: isFilled ? color : '#1e293b' }}>
                    {isFilled ? sym : '?'}
                  </span>
                  <span
                    className="text-xs truncate max-w-full px-1 text-center"
                    style={{ color: isFilled ? `${color}80` : '#1e293b' }}
                  >
                    {isFilled ? (isMe ? 'You' : (name ?? '···')) : '···'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Countdown bar */}
          {status === 'found' && countdown !== null && (
            <div className="mb-5">
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${Math.max(0, (countdown / 5) * 100)}%`,
                    background: 'linear-gradient(90deg, #22c55e60, #22c55e)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Timer */}
          <div className="mb-6 text-center">
            <p className="text-slate-500 text-sm font-mono">{formatTime(waitTime)}</p>
            {status === 'searching' && (
              <p className="text-slate-600 text-xs mt-1">
                Any ELO welcome — first {maxPlayers} in queue matched
              </p>
            )}
          </div>

          {/* Pulse dots while searching */}
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
            {status === 'found' ? '\u2713 Match found' : '\u2715 Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
