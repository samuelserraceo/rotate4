'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

const SYMBOL_COLORS: Record<string, string> = {
  X: '#00f5ff',
  O: '#a855f7',
  W: '#22c55e',
  M: '#f59e0b',
}

const SYMBOLS = ['X', 'O', 'W', 'M']
const STALE_MS = 2 * 60 * 1000 // 2 minutes — filter ghost entries

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

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const matchCheckRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const mounted = useRef(true)
  const queueEnteredAt = useRef(new Date().toISOString())
  const userIdRef = useRef<string | null>(null)
  const gameIdRef = useRef<string | null>(null)
  const creatingRef = useRef(false) // prevents double-create on same client

  const maxPlayers = mode === '4p' ? 4 : mode === '3p' ? 3 : 2
  const modeLabel = mode === '4p' ? '4-Player' : mode === '3p' ? '3-Player' : '1v1'

  const startCountdown = (gId: string, players: { username: string; symbol: string }[]) => {
    if (gameIdRef.current) return
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
          ? (p?.elo_3p ?? p?.elo ?? 1200)
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
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (matchCheckRef.current) clearInterval(matchCheckRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (userIdRef.current && !gameIdRef.current) {
        supabase.from('matchmaking_queue').delete().eq('profile_id', userIdRef.current).then(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkForMatch = async (userId: string) => {
    // Step 1: Already placed in a game by another player?
    const { data: myGamePlayer } = await supabase
      .from('game_players')
      .select('game_id, games(id, status, created_at)')
      .eq('profile_id', userId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    const gameData = myGamePlayer?.games as { id: string; status: string; created_at: string } | undefined
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

    // Step 2: Fetch queue
    const { data: allQueue } = await supabase
      .from('matchmaking_queue')
      .select('*, profiles(id, username, elo, elo_1v1, elo_3p, elo_4p)')
      .eq('mode', mode)
      .eq('game_type', 'competitive')
      .order('joined_at')
      .limit(50)

    if (!allQueue) return

    // Step 3: Filter ghost entries older than 2 minutes
    const staleThreshold = new Date(Date.now() - STALE_MS).toISOString()
    const freshQueue = allQueue.filter(q => q.joined_at > staleThreshold)

    if (freshQueue.length < maxPlayers) return

    const me = freshQueue.find(q => q.profile_id === userId)
    if (!me) return

    const matchedQueue = freshQueue.slice(0, maxPlayers)
    if (!matchedQueue.find(q => q.profile_id === userId)) return

    // ONLY the oldest player in the matched set creates the game — no exceptions, no takeover.
    // This prevents the race condition where two players simultaneously create duplicate games.
    if (matchedQueue[0].profile_id !== userId) return

    // Guard: prevent this client from creating twice if the interval fires again before we finish
    if (creatingRef.current) return
    creatingRef.current = true

    if (matchCheckRef.current) clearInterval(matchCheckRef.current)

    // Step 4: Create the game
    const fullMode = `competitive_${mode}` as const
    const { data: game, error: gameError } = await supabase.from('games').insert({
      mode: fullMode,
      max_players: maxPlayers,
      status: 'active',
    }).select().single()

    if (gameError || !game) {
      creatingRef.current = false
      matchCheckRef.current = setInterval(() => checkForMatch(userId), 2000)
      return
    }

    // Step 5: Build all game_players rows and insert as a SINGLE BATCH (atomic)
    const rows = matchedQueue.map((qp, i) => {
      const prof = qp.profiles as { elo_1v1?: number; elo_3p?: number; elo_4p?: number; elo?: number } | null
      const eloBefore = mode === '1v1'
        ? (prof?.elo_1v1 ?? qp.elo ?? 1200)
        : mode === '3p'
          ? (prof?.elo_3p ?? qp.elo ?? 1200)
          : (prof?.elo_4p ?? qp.elo ?? 1200)
      return {
        game_id: game.id,
        profile_id: qp.profile_id,
        symbol: SYMBOLS[i],
        player_index: i,
        elo_before: eloBefore,
      }
    })

    const { error: insertError } = await supabase.from('game_players').insert(rows)

    if (insertError) {
      // Rollback — clean up the orphaned game and re-enter the queue
      await supabase.from('games').delete().eq('id', game.id)
      creatingRef.current = false
      matchCheckRef.current = setInterval(() => checkForMatch(userId), 2000)
      return
    }

    // Step 6: Remove ALL matched players from queue in one call
    const matchedIds = matchedQueue.map(q => q.profile_id)
    await supabase.from('matchmaking_queue').delete().in('profile_id', matchedIds)

    const playersList = matchedQueue.map((qp, i) => ({
      username: (qp.profiles as any)?.username ?? '?',
      symbol: SYMBOLS[i],
    }))

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
        <button onClick={cancelMatchmaking} className="btn-ghost text-sm">{String.fromCharCode(8592)} Lobby</button>
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
              {status === 'found'
                ? countdown !== null && countdown > 0
                  ? `Match found! Starting in ${countdown}…`
                  : 'Match found! Loading…'
                : 'Searching for players…'}
            </h2>
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'found' ? 'bg-neon-green animate-pulse' : 'bg-neon-cyan animate-pulse'}`} />
          </div>

          <div className="flex gap-2 mb-5">
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {String.fromCharCode(9876)+String.fromCharCode(65039)} Ranked
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {modeLabel}
            </span>
          </div>

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
                  <span className="text-xs truncate max-w-full px-1 text-center" style={{ color: isFilled ? `${color}80` : '#1e293b' }}>
                    {isFilled ? (isMe ? 'You' : (name ?? '···')) : '···'}
                  </span>
                </div>
              )
            })}
          </div>

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

          <div className="mb-6 text-center">
            <p className="text-slate-500 text-sm font-mono">{formatTime(waitTime)}</p>
            {status === 'searching' && (
              <p className="text-slate-600 text-xs mt-1">
                Any ELO welcome — first {maxPlayers} in queue matched
              </p>
            )}
          </div>

          {status === 'searching' && (
            <div className="flex justify-center gap-1.5 mb-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-neon-cyan/40 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
          )}

          <button
            onClick={cancelMatchmaking}
            className="btn-ghost w-full text-sm text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
            disabled={status === 'found'}
          >
            {status === 'found' ? '✓ Match found' : '✕ Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
        }
