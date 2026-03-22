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

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const mounted = useRef(true)
  const queueEnteredAt = useRef('')
  const userIdRef = useRef<string | null>(null)
  const gameIdRef = useRef<string | null>(null)
  const creatingRef = useRef(false)

  const maxPlayers = mode === '4p' ? 4 : mode === '3p' ? 3 : 2
  const modeLabel = mode === '4p' ? '4-Player' : mode === '3p' ? '3-Player' : '1v1'

  function startCountdown(gId: string, players: { username: string; symbol: string }[]) {
    if (gameIdRef.current) return
    gameIdRef.current = gId
    setFoundPlayers(players)
    setStatus('found')
    setCountdown(5)
    let c = 5
    countdownRef.current = setInterval(() => {
      c -= 1
      if (mounted.current) setCountdown(c)
      if (c <= 0) {
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

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (mounted.current && p) setProfile(p)

      const elo = mode === '1v1'
        ? (p?.elo_1v1 ?? 1200)
        : mode === '3p'
          ? (p?.elo_3p ?? 1200)
          : (p?.elo_4p ?? 1200)

      const { data: qRow } = await supabase
        .from('matchmaking_queue')
        .upsert(
          { profile_id: user.id, mode, game_type: 'competitive', elo },
          { onConflict: 'profile_id' }
        )
        .select('joined_at')
        .single()
      queueEnteredAt.current = qRow?.joined_at ?? new Date().toISOString()

      pollRef.current = setInterval(() => checkForMatch(user.id), 2000)
    }

    timerRef.current = setInterval(() => {
      if (mounted.current) setWaitTime(t => t + 1)
    }, 1000)

    init()

    return () => {
      mounted.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (userIdRef.current && !gameIdRef.current) {
        supabase.from('matchmaking_queue').delete().eq('profile_id', userIdRef.current).then(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkForMatch(userId: string) {
    // Step 1: Am I already placed in a game by someone else?
    const { data: myEntry } = await supabase
      .from('game_players')
      .select('game_id, games!inner(id, status, mode, created_at)')
      .eq('profile_id', userId)
      .eq('games.status', 'active')
      .gte('games.created_at', queueEnteredAt.current)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (myEntry) {
      if (pollRef.current) clearInterval(pollRef.current)
      await supabase.from('matchmaking_queue').delete().eq('profile_id', userId)
      const { data: gps } = await supabase
        .from('game_players')
        .select('symbol, profiles(username)')
        .eq('game_id', myEntry.game_id)
        .order('player_index')
      const players = (gps ?? []).map((g, i) => ({
        username: (g.profiles as any)?.username ?? '?',
        symbol: g.symbol ?? SYMBOLS[i],
      }))
      if (mounted.current) startCountdown(myEntry.game_id, players)
      return
    }

    // Step 2: Read queue — oldest first
    const { data: queue } = await supabase
      .from('matchmaking_queue')
      .select('profile_id, elo, joined_at, profiles(id, username, elo_1v1, elo_3p, elo_4p)')
      .eq('mode', mode)
      .eq('game_type', 'competitive')
      .order('joined_at', { ascending: true })
      .limit(20)

    if (!queue || queue.length < maxPlayers) return

    // Step 3: Only the oldest creates
    if (queue[0].profile_id !== userId) return
    if (creatingRef.current) return
    creatingRef.current = true
    if (pollRef.current) clearInterval(pollRef.current)

    const matched = queue.slice(0, maxPlayers)
    const fullMode = `competitive_${mode}` as const

    // Step 4: Create game
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({ mode: fullMode, max_players: maxPlayers, status: 'active' })
      .select()
      .single()

    if (gameErr || !game) {
      creatingRef.current = false
      pollRef.current = setInterval(() => checkForMatch(userId), 2000)
      return
    }

    // Step 5: Batch insert all players at once
    const playersList: { username: string; symbol: string }[] = []
    const rows = matched.map((qp, i) => {
      const prof = qp.profiles as { username?: string; elo_1v1?: number; elo_3p?: number; elo_4p?: number } | null
      const eloBefore = mode === '1v1'
        ? (prof?.elo_1v1 ?? qp.elo ?? 1200)
        : mode === '3p'
          ? (prof?.elo_3p ?? qp.elo ?? 1200)
          : (prof?.elo_4p ?? qp.elo ?? 1200)
      playersList.push({ username: prof?.username ?? '?', symbol: SYMBOLS[i] })
      return {
        game_id: game.id,
        profile_id: qp.profile_id,
        symbol: SYMBOLS[i],
        player_index: i,
        elo_before: eloBefore,
      }
    })

    const { error: insertErr } = await supabase.from('game_players').insert(rows)
    if (insertErr) {
      await supabase.from('games').delete().eq('id', game.id)
      creatingRef.current = false
      pollRef.current = setInterval(() => checkForMatch(userId), 2000)
      return
    }

    // Step 6: Remove matched players from queue
    await supabase.from('matchmaking_queue').delete().in('profile_id', matched.map(q => q.profile_id))

    if (mounted.current) startCountdown(game.id, playersList)
  }

  async function cancelMatchmaking() {
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
              {status === 'found'
                ? countdown !== null && countdown > 0
                  ? `Match found! Starting in ${countdown}\u2026`
                  : 'Match found! Loading\u2026'
                : 'Searching for players\u2026'}
            </h2>
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${status === 'found' ? 'bg-neon-green' : 'bg-neon-cyan'}`} />
          </div>

          <div className="flex gap-2 mb-5">
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
              {'\u2694\uFE0F'} Ranked
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
                    {isFilled ? (isMe ? 'You' : (name ?? '\u00B7\u00B7\u00B7')) : '\u00B7\u00B7\u00B7'}
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
            <p className="text-slate-500 text-sm font-mono">{fmt(waitTime)}</p>
            {status === 'searching' && (
              <p className="text-slate-600 text-xs mt-1">
                Any ELO welcome {'\u2014'} first {maxPlayers} in queue matched
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
            {status === 'found' ? '\u2713 Match found' : '\u2715 Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
        }
