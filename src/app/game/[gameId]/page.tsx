'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GameBoard from '@/components/game/Board'
import WinModal from '@/components/game/WinModal'
import type { Game, GamePlayer, Profile, PlayerSymbol, Board } from '@/types'
import { SYMBOL_COLORS, COIN_REWARDS } from '@/types'
import { dropPiece, rotateBoard, checkWin, isBoardFull, createBoard } from '@/lib/game/board'
import { calculate1v1Elo, calculate4pElo } from '@/lib/game/elo'

type PlayerWithProfile = GamePlayer & { profiles?: Profile }

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [game, setGame]               = useState<Game | null>(null)
  const [players, setPlayers]         = useState<PlayerWithProfile[]>([])
  const [myProfile, setMyProfile]     = useState<Profile | null>(null)
  const [mySymbol, setMySymbol]       = useState<PlayerSymbol | null>(null)
  const [board, setBoard]             = useState<Board>(createBoard())
  const [currentTurn, setCurrentTurn] = useState(0)
  const [isRotating, setIsRotating]   = useState(false)
  const [winState, setWinState]       = useState<{
    winner: PlayerSymbol | null
    winnerUsername: string
    isMe: boolean
    coinsEarned: number
    eloChange?: number
    isDraw?: boolean
  } | null>(null)
  const [winningCells, setWinningCells] = useState<[number, number][] | null>(null)
  const [loading, setLoading]          = useState(true)
  const [error, setError]              = useState<string | null>(null)
  const [rotationCount, setRotationCount] = useState(0)

  const processingMove = useRef(false)

  // ── Load game and subscribe ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      if (mounted) setMyProfile(profile)

      const { data: gameData } = await supabase
        .from('games').select('*').eq('id', gameId).single()
      if (!gameData) { setError('Game not found.'); setLoading(false); return }
      if (mounted) {
        setGame(gameData)
        setBoard(gameData.board_state ?? createBoard())
        setCurrentTurn(gameData.current_turn_index ?? 0)
        setRotationCount(gameData.rotation_count ?? 0)
      }

      const { data: playersData } = await supabase
        .from('game_players')
        .select('*, profiles(*)')
        .eq('game_id', gameId)
        .order('player_index')
      if (mounted && playersData) {
        setPlayers(playersData as PlayerWithProfile[])
        const me = playersData.find((p: GamePlayer) => p.profile_id === user.id)
        if (me) setMySymbol(me.symbol as PlayerSymbol)
      }

      if (mounted) setLoading(false)
    }

    init()

    // Subscribe to game changes
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      }, (payload) => {
        const g = payload.new as Game
        if (!mounted) return
        setBoard(g.board_state ?? createBoard())
        setCurrentTurn(g.current_turn_index ?? 0)
        setRotationCount(prev => {
          if (g.rotation_count > prev) {
            setIsRotating(true)
            setTimeout(() => setIsRotating(false), 600)
          }
          return g.rotation_count
        })
        if (g.status === 'completed' && g.winner_id) {
          handleGameEnd(g)
        }
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // ── Handle game end ─────────────────────────────────────────────────────────
  const handleGameEnd = useCallback(async (finishedGame: Game) => {
    if (!myProfile || winState) return

    const { data: gamePlayers } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_id', gameId)
    if (!gamePlayers) return

    const me = gamePlayers.find((p: GamePlayer) => p.profile_id === myProfile.id)
    const coinsEarned = me?.coins_earned ?? 0
    const eloChange = me?.elo_change

    const winnerPlayer = players.find(p => p.profile_id === finishedGame.winner_id)
    const winnerSym = winnerPlayer?.symbol as PlayerSymbol ?? null

    setWinState({
      winner: winnerSym,
      winnerUsername: winnerPlayer?.profiles?.username ?? 'Unknown',
      isMe: finishedGame.winner_id === myProfile.id,
      coinsEarned,
      eloChange,
    })
  }, [myProfile, players, winState, gameId, supabase])

  // ── Make a move ─────────────────────────────────────────────────────────────
  const handleColumnClick = useCallback(async (col: number) => {
    if (!myProfile || !mySymbol || !game || processingMove.current) return
    if (game.status !== 'active') return
    if (players[currentTurn]?.profile_id !== myProfile.id) return

    processingMove.current = true

    const result = dropPiece(board, col, mySymbol)
    if (!result.isValid) {
      processingMove.current = false
      return
    }

    let finalBoard = result.newBoard
    let newRotationCount = rotationCount
    let causedRotation = result.causedRotation

    // Check win before potential rotation
    const winBefore = checkWin(finalBoard, mySymbol)
    if (winBefore.hasWon) {
      setWinningCells(winBefore.winningCells ?? null)
      await finalizeGame(finalBoard, myProfile.id, newRotationCount, result.rowLanded, col, causedRotation, true)
      processingMove.current = false
      return
    }

    // Rotation
    if (causedRotation) {
      newRotationCount += 1
      setIsRotating(true)
      await new Promise(r => setTimeout(r, 600))
      finalBoard = rotateBoard(finalBoard)
      setIsRotating(false)

      // Check win after rotation too
      const winAfter = checkWin(finalBoard, mySymbol)
      if (winAfter.hasWon) {
        setWinningCells(winAfter.winningCells ?? null)
        await finalizeGame(finalBoard, myProfile.id, newRotationCount, result.rowLanded, col, causedRotation, true)
        processingMove.current = false
        return
      }
    }

    // Check draw
    const draw = isBoardFull(finalBoard)

    // Advance turn
    const nextTurn = (currentTurn + 1) % players.length

    // Save move to DB
    await supabase.from('game_moves').insert({
      game_id: gameId,
      profile_id: myProfile.id,
      move_number: (await supabase.from('game_moves').select('id', { count: 'exact' }).eq('game_id', gameId)).count ?? 0,
      column_index: col,
      row_landed: result.rowLanded,
      caused_rotation: causedRotation,
      board_state_after: finalBoard,
    })

    // Update game state
    await supabase.from('games').update({
      board_state: finalBoard,
      current_turn_index: nextTurn,
      rotation_count: newRotationCount,
      status: draw ? 'completed' : 'active',
    }).eq('id', gameId)

    if (draw) {
      await distributeRewards(null) // draw
    }

    processingMove.current = false
  }, [board, myProfile, mySymbol, game, players, currentTurn, rotationCount, gameId, supabase])

  // ── Finalize game (someone won) ─────────────────────────────────────────────
  const finalizeGame = useCallback(async (
    finalBoard: Board,
    winnerId: string,
    rotCount: number,
    rowLanded: number,
    col: number,
    causedRot: boolean,
    isWin: boolean
  ) => {
    await supabase.from('games').update({
      board_state: finalBoard,
      status: 'completed',
      winner_id: isWin ? winnerId : null,
      completed_at: new Date().toISOString(),
      rotation_count: rotCount,
    }).eq('id', gameId)

    await distributeRewards(isWin ? winnerId : null)
  }, [gameId, supabase])

  // ── Distribute rewards ──────────────────────────────────────────────────────
  const distributeRewards = useCallback(async (winnerId: string | null) => {
    if (!game) return
    const isComp = game.mode.startsWith('competitive')
    const is1v1  = game.mode.endsWith('1v1')

    // Fetch fresh profiles for ELO
    const profileIds = players.map(p => p.profile_id)
    const { data: freshProfiles } = await supabase
      .from('profiles').select('*').in('id', profileIds)
    if (!freshProfiles) return

    const profileMap = Object.fromEntries(freshProfiles.map((p: Profile) => [p.id, p]))

    if (isComp && is1v1 && winnerId && players.length === 2) {
      const winnerPlayer = players.find(p => p.profile_id === winnerId)!
      const loserPlayer  = players.find(p => p.profile_id !== winnerId)!
      const wP = profileMap[winnerPlayer.profile_id]
      const lP = profileMap[loserPlayer.profile_id]

      const [newWElo, newLElo, wChange, lChange] = calculate1v1Elo(
        wP.elo, lP.elo, wP.games_played, lP.games_played
      )
      const coins = COIN_REWARDS.competitive_1v1

      // Update winner
      await supabase.from('profiles').update({
        elo: newWElo, coins: wP.coins + coins.win,
        games_played: wP.games_played + 1, games_won: wP.games_won + 1,
      }).eq('id', wP.id)
      await supabase.from('game_players').update({ elo_before: wP.elo, elo_after: newWElo, elo_change: wChange, coins_earned: coins.win, placement: 1 }).eq('game_id', gameId).eq('profile_id', wP.id)

      // Update loser
      await supabase.from('profiles').update({
        elo: newLElo, coins: lP.coins + coins.loss,
        games_played: lP.games_played + 1,
      }).eq('id', lP.id)
      await supabase.from('game_players').update({ elo_before: lP.elo, elo_after: newLElo, elo_change: lChange, coins_earned: coins.loss, placement: 2 }).eq('game_id', gameId).eq('profile_id', lP.id)

    } else if (!isComp && is1v1) {
      const coins = COIN_REWARDS.casual_1v1
      for (const pl of players) {
        const isWin = pl.profile_id === winnerId
        const p = profileMap[pl.profile_id]
        const earned = isWin ? coins.win : coins.loss
        await supabase.from('profiles').update({
          coins: p.coins + earned,
          games_played: p.games_played + 1,
          games_won: isWin ? p.games_won + 1 : p.games_won,
        }).eq('id', p.id)
        await supabase.from('game_players').update({ coins_earned: earned, placement: isWin ? 1 : 2 }).eq('game_id', gameId).eq('profile_id', p.id)
      }
    }
    // 4p modes would follow similar patterns — simplified here
  }, [game, players, gameId, supabase])

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen message={error} />

  const currentPlayer = players[currentTurn]
  const currentSymbol = currentPlayer?.symbol as PlayerSymbol ?? null
  const isMyTurn = currentPlayer?.profile_id === myProfile?.id
  const gameActive = game?.status === 'active'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-2 py-6 relative overflow-hidden">
      {/* BG glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-64 h-64 bg-neon-cyan/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-neon-purple/3 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="w-full max-w-2xl flex items-center justify-between mb-6 px-2">
        <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Lobby</button>
        <div className="text-center">
          <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
          <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <p>{game?.mode.replace('_', ' ').toUpperCase()}</p>
          {rotationCount > 0 && (
            <p className="text-neon-amber">↻ ×{rotationCount}</p>
          )}
        </div>
      </header>

      {/* Waiting for players */}
      {game?.status === 'waiting' && (
        <div className="card mb-6 text-center">
          <p className="text-neon-cyan animate-pulse mb-2">Waiting for players…</p>
          {game.join_code && (
            <div>
              <p className="text-slate-400 text-sm mb-1">Share this code:</p>
              <p className="text-3xl font-black text-neon-amber tracking-widest">
                {game.join_code}
              </p>
            </div>
          )}
          <p className="text-slate-500 text-xs mt-2">
            {players.length}/{game.max_players} players joined
          </p>
        </div>
      )}

      {/* Board — shown once active or completed */}
      {(game?.status === 'active' || game?.status === 'completed') && (
        <div className="relative mt-8">
          <GameBoard
            board={board}
            players={players}
            currentSymbol={currentSymbol}
            mySymbol={mySymbol}
            winningCells={winningCells}
            isRotating={isRotating}
            onColumnClick={handleColumnClick}
            disabled={!gameActive || !isMyTurn}
          />
        </div>
      )}

      {/* Win modal */}
      {winState && (
        <WinModal {...winState} />
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl font-black text-neon-cyan text-glow-cyan animate-pulse mb-4">
          ROTATE<span className="text-neon-purple text-glow-purple">4</span>
        </div>
        <p className="text-slate-500 text-sm">Loading game…</p>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  const router = useRouter()
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card text-center max-w-sm">
        <p className="text-red-400 mb-4">{message}</p>
        <button onClick={() => router.push('/')} className="btn-primary">Back to Lobby</button>
      </div>
    </div>
  )
}
