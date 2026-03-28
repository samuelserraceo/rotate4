'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { createBoard } from '@/lib/game/board'

const SYM_COLOR: Record<string, string> = {
  X: '#00f5ff',
  O: '#a855f7',
  W: '#22c55e',
  M: '#f59e0b',
}
const SYMBOLS = ['X', 'O', 'W', 'M']
const STALE_MS = 90_000

export default function MatchmakingClient() {
  const router    = useRouter()
  const params    = useSearchParams()
  const mode      = (params.get('mode') as '1v1' | '3p' | '4p') ?? '1v1'
  const supabase  = createClient()

  const [profile, setProfile]     = useState<Profile | null>(null)
  const [waitSecs, setWaitSecs]   = useState(0)
  const [phase, setPhase]         = useState<'searching' | 'found'>('searching')
  const [opponents, setOpponents] = useState<{ username: string; symbol: string }[]>([])
  const [countdown, setCountdown] = useState<number | null>(null)

  const tickRef      = useRef<NodeJS.Timeout | null>(null)
  const pollRef      = useRef<NodeJS.Timeout | null>(null)
  const cdRef        = useRef<NodeJS.Timeout | null>(null)
  const mountedRef   = useRef(true)
  const enteredAtRef = useRef('')
  const userIdRef    = useRef<string | null>(null)
  const gameIdRef    = useRef<string | null>(null)
  const creatingRef  = useRef(false)

  const maxPlayers = mode === '4p' ? 4 : mode === '3p' ? 3 : 2
  const modeLabel  = mode === '4p' ? '4-Player' : mode === '3p' ? '3-Player' : '1v1'

  function beginCountdown(gId: string, found: { username: string; symbol: string }[]) {
    if (gameIdRef.current) return
    gameIdRef.current = gId
    setOpponents(found)
    setPhase('found')
    setCountdown(5)
    let n = 5
    cdRef.current = setInterval(() => {
      n -= 1
      if (mountedRef.current) setCountdown(n)
      if (n <= 0) {
        clearInterval(cdRef.current!)
        if (mountedRef.current) router.push(`/game/${gId}`)
      }
    }, 1000)
  }

  useEffect(() => {
    mountedRef.current = true

    async function start() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      userIdRef.current = user.id

      const { data: p } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      if (mountedRef.current && p) setProfile(p as Profile)

      const elo = mode === '1v1' ? ((p as any)?.elo_1v1 ?? 1200)
               : mode === '3p'  ? ((p as any)?.elo_3p  ?? 1200)
               :                  ((p as any)?.elo_4p  ?? 1200)

      const { data: row } = await supabase
        .from('matchmaking_queue')
        .upsert(
          { profile_id: user.id, mode, game_type: 'competitive', elo },
          { onConflict: 'profile_id' },
        )
        .select('joined_at')
        .single()
      enteredAtRef.current = row?.joined_at ?? new Date().toISOString()

      pollRef.current = setInterval(() => poll(user.id), 2000)
    }

    tickRef.current = setInterval(() => {
      if (mountedRef.current) setWaitSecs(s => s + 1)
    }, 1000)

    start()

    return () => {
      mountedRef.current = false
      if (tickRef.current)  clearInterval(tickRef.current)
      if (pollRef.current)  clearInterval(pollRef.current)
      if (cdRef.current)    clearInterval(cdRef.current)
      if (userIdRef.current && !gameIdRef.current) {
        supabase.from('matchmaking_queue')
          .delete().eq('profile_id', userIdRef.current).then(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function poll(userId: string) {
    // STEP 1: Check if already placed in an active game created after we joined the queue.
    // We fetch ALL game_players entries for this user, then query games directly.
    // We do NOT use .order('id').limit(1) because game_players.id is a UUID (random,
    // not time-ordered) â ordering by UUID would return a random old completed game,
    // causing Player 2 to never detect the new game and get stuck searching forever.
    const { data: gpRows } = await supabase
      .from('game_players')
      .select('game_id')
      .eq('profile_id', userId)

    if (gpRows?.length) {
      const gameIds = gpRows.map(r => r.game_id)
      const { data: activeGame } = await supabase
        .from('games')
        .select('id, status, created_at')
        .in('id', gameIds)
        .eq('status', 'active')
        .gte('created_at', enteredAtRef.current)
        .limit(1)
        .maybeSingle()

      if (activeGame?.id) {
        if (pollRef.current) clearInterval(pollRef.current)
        await supabase.from('matchmaking_queue').delete().eq('profile_id', userId)
        const { data: allGps } = await supabase
          .from('game_players')
          .select('symbol, profiles(username)')
          .eq('game_id', activeGame.id)
          .order('player_index')
        const found = (allGps ?? []).map((r, i) => ({
          username: (r.profiles as any)?.username ?? '?',
          symbol: r.symbol ?? SYMBOLS[i],
        }))
        if (mountedRef.current) beginCountdown(activeGame.id, found)
        return
      }
    }

    // STEP 2: Fetch queue
    const { data: queue } = await supabase
      .from('matchmaking_queue')
      .select('profile_id, elo, joined_at, profiles(username, elo_1v1, elo_3p, elo_4p)')
      .eq('mode', mode)
      .eq('game_type', 'competitive')
      .order('joined_at', { ascending: true })
      .limit(30)

    if (!queue) return

    // STEP 3: Filter ghost entries (inactive for >STALE_MS)
    const cutoff = new Date(Date.now() - STALE_MS).toISOString()
    const fresh  = queue.filter(q => q.joined_at > cutoff)

    if (fresh.length < maxPlayers) return

    // STEP 4: Only the oldest player (first in sorted queue) creates the game
    if (fresh[0].profile_id !== userId) return
    if (creatingRef.current) return
    creatingRef.current = true
    if (pollRef.current) clearInterval(pollRef.current)

    const matched  = fresh.slice(0, maxPlayers)
    const fullMode = `competitive_${mode}` as const

    // STEP 5: Create game row (board size: 9 for 1v1, 11 for 3P, 13 for 4P)
    const boardSize = mode === '4p' ? 13 : mode === '3p' ? 11 : 9
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({ mode: fullMode, max_players: maxPlayers, status: 'active', board_state: createBoard(boardSize) })
      .select('id')
      .single()

    if (gameErr || !game) {
      creatingRef.current = false
      pollRef.current = setInterval(() => poll(userId), 2000)
      return
    }

    // STEP 6: Insert all players in one atomic batch
    const playersList: { username: string; symbol: string }[] = []
    const rows = matched.map((qp, i) => {
      const prof = qp.profiles as {
        username?: string; elo_1v1?: number; elo_3p?: number; elo_4p?: number
      } | null
      const eloBefore = mode === '1v1' ? (prof?.elo_1v1 ?? qp.elo ?? 1200)
                      : mode === '3p'  ? (prof?.elo_3p  ?? qp.elo ?? 1200)
                      :                  (prof?.elo_4p  ?? qp.elo ?? 1200)
      playersList.push({ username: prof?.username ?? '?', symbol: SYMBOLS[i] })
      return {
        game_id:      game.id,
        profile_id:   qp.profile_id,
        symbol:       SYMBOLS[i],
        player_index: i,
        elo_before:   eloBefore,
      }
    })

    const { error: insertErr } = await supabase.from('game_players').insert(rows)
    if (insertErr) {
      await supabase.from('games').delete().eq('id', game.id)
      creatingRef.current = false
      pollRef.current = setInterval(() => poll(userId), 2000)
      return
    }

    // STEP 7: Batch-remove matched players from queue
    await supabase.from('matchmaking_queue')
      .delete().in('profile_id', matched.map(q => q.profile_id))

    if (mountedRef.current) beginCountdown(game.id, playersList)
  }

  async function cancel() {
    gameIdRef.current = 'cancelled'
    if (userIdRef.current) {
      await supabase.from('matchmaking_queue').delete().eq('profile_id', userIdRef.current)
    }
    router.push('/')
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={cancel} className="btn-ghost text-sm">{'\u2190'} Lobby</button>
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
              {phase === 'found'
                ? countdown !== null && countdown > 0
                  ? `Match found! Starting in ${countdown}\u2026`
                  : 'Match found! Loading\u2026'
                : 'Searching for players\u2026'}
            </h2>
            <div className={[
              'w-2.5 h-2.5 rounded-full animate-pulse',
              phase === 'found' ? 'bg-neon-green' : 'bg-neon-cyan',
            ].join(' ')} />
          </div>

          <div className="flex gap-2 mb-5">
            {['\u2694\uFE0F Ranked', modeLabel].map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
                {t}
              </span>
            ))}
          </div>

          <div className="flex gap-2 mb-5">
            {Array.from({ length: maxPlayers }, (_, i) => {
              const isMe   = i === 0
              const opp    = opponents[i]
              const filled = isMe || !!opp
              const sym    = opp?.symbol ?? SYMBOLS[i]
              const col    = SYM_COLOR[sym] ?? '#00f5ff'
              const label  = isMe ? (profile?.username ?? 'You') : (opp?.username ?? null)
              return (
                <div
                  key={i}
                  className="flex-1 h-16 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-500"
                  style={{
                    borderColor: filled ? `${col}50` : '#ffffff10',
                    background:  filled ? `${col}0a` : 'transparent',
                  }}
                >
                  <span className="text-lg font-black" style={{ color: filled ? col : '#1e293b' }}>
                    {filled ? sym : '?'}
                  </span>
                  <span
                    className="text-xs truncate max-w-full px-1 text-center"
                    style={{ color: filled ? `${col}80` : '#1e293b' }}
                  >
                    {filled ? (isMe ? 'You' : (label ?? '\u00b7\u00b7\u00b7')) : '\u00b7\u00b7\u00b7'}
                  </span>
                </div>
              )
            })}
          </div>

          {phase === 'found' && countdown !== null && (
            <div className="mb-5">
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${Math.max(0, (countdown / 5) * 100)}%`,
                    background: 'linear-gradient(90deg,#22c55e40,#22c55e)',
                  }}
                />
              </div>
            </div>
          )}

          <div className="mb-6 text-center">
            <p className="text-slate-500 text-sm font-mono">{fmt(waitSecs)}</p>
            {phase === 'searching' && (
              <p className="text-slate-600 text-xs mt-1">
                Any ELO welcome {'\u2014'} first {maxPlayers} in queue matched
              </p>
            )}
          </div>

          {phase === 'searching' && (
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
            onClick={cancel}
            className="btn-ghost w-full text-sm text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
            disabled={phase === 'found'}
          >
            {phase === 'found' ? '\u2713 Match found' : '\u2715 Cancel'}
          </button>

        </div>
      </div>
    </div>
  )
}
