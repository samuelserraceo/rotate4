'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GameBoard from '@/components/game/Board'
import WinModal from '@/components/game/WinModal'
import type { Game, GamePlayer, Profile, PlayerSymbol, Board } from '@/types'
import { COIN_REWARDS, ELO_CONFIG } from '@/types'
import { dropPiece, rotateBoard, checkWin, isBoardFull, createBoard } from '@/lib/game/board'
import { calculate1v1Elo } from '@/lib/game/elo'

type PlayerWithProfile = GamePlayer & { profiles?: Profile }

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [game, setGame]                   = useState<Game | null>(null)
  const [players, setPlayers]             = useState<PlayerWithProfile[]>([])
  const [myProfile, setMyProfile]         = useState<Profile | null>(null)
  const [mySymbol, setMySymbol]           = useState<PlayerSymbol | null>(null)
  const [board, setBoard]                 = useState<Board>(createBoard())
  const [currentTurn, setCurrentTurn]     = useState(0)
  const [isRotating, setIsRotating]       = useState(false)
  const [winState, setWinState]           = useState<{
    winner: PlayerSymbol | null
    winnerUsername: string
    isMe: boolean
    coinsEarned: number
    eloChange?: number
    isDraw?: boolean
    forfeit?: boolean
  } | null>(null)
  const [winningCells, setWinningCells]   = useState<[number, number][] | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [rotationCount, setRotationCount] = useState(0)
  const [lastDrop, setLastDrop]           = useState<{ row: number; col: number } | null>(null)
  const [turnTimer, setTurnTimer]         = useState(30)

  // Stable refs Ã¢ÂÂ never stale
  const processingMove    = useRef(false)
  const mountedRef        = useRef(true)
  const playersRef        = useRef<PlayerWithProfile[]>([])
  const myProfileRef      = useRef<Profile | null>(null)
  const gameRef           = useRef<Game | null>(null)
  const winStateRef       = useRef(false)
  const rotationCountRef  = useRef(0)
  const pendingBoardRef   = useRef<Board | null>(null)
  const currentTurnRef    = useRef(0)
  const turnTimerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const skipInProgressRef    = useRef(false)

  // Keep refs in sync
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { myProfileRef.current = myProfile }, [myProfile])
  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { currentTurnRef.current = currentTurn }, [currentTurn])

  // \u2500\u2500 30-second turn timer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    if (!game || game.status !== 'active' || isRotating) return

    setTurnTimer(30)
    skipInProgressRef.current = false
    if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current)

    turnTimerIntervalRef.current = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          clearInterval(turnTimerIntervalRef.current!)
          if (!skipInProgressRef.current) {
            skipInProgressRef.current = true
            const currentPlayers = playersRef.current
            if (currentPlayers.length === 0) return 0
            const nextTurn = (currentTurnRef.current + 1) % currentPlayers.length
            supabase.from('games').update({ current_turn_index: nextTurn })
              .eq('id', gameId)
              .eq('current_turn_index', currentTurnRef.current)
              .then(() => {})
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn, game?.status, isRotating])

  // \u2500\u2500 Init + subscribe \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    mountedRef.current = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mountedRef.current) { setMyProfile(profile); myProfileRef.current = profile }

      const { data: gameData } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (!gameData) { setError('Game not found.'); setLoading(false); return }

      if (gameData.status === 'completed' || gameData.status === 'abandoned') {
        setError('This game has already ended.')
        setLoading(false)
        return
      }

      if (mountedRef.current) {
        setGame(gameData); gameRef.current = gameData
        setBoard(gameData.board_state ?? createBoard())
        setCurrentTurn(gameData.current_turn_index ?? 0)
        currentTurnRef.current = gameData.current_turn_index ?? 0
        const rc = gameData.rotation_count ?? 0
        setRotationCount(rc); rotationCountRef.current = rc
      }

      const { data: playersData } = await supabase
        .from('game_players').select('*, profiles(*)')
        .eq('game_id', gameId).order('player_index')
      if (mountedRef.current && playersData) {
        setPlayers(playersData as PlayerWithProfile[])
        playersRef.current = playersData as PlayerWithProfile[]
        const me = playersData.find((p: GamePlayer) => p.profile_id === user.id)
        if (me) setMySymbol(me.symbol as PlayerSymbol)
      }

      if (mountedRef.current) setLoading(false)
    }

    init()

    const channel = supabase.channel(`game:${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}`,
      }, (payload) => {
        const g = payload.new as Game
        if (!mountedRef.current) return

        setGame(g); gameRef.current = g
        setCurrentTurn(g.current_turn_index ?? 0)
        currentTurnRef.current = g.current_turn_index ?? 0

        const newRotCount = g.rotation_count ?? 0

        if (newRotCount > rotationCountRef.current) {
          rotationCountRef.current = newRotCount
          setRotationCount(newRotCount)
          pendingBoardRef.current = g.board_state
          setIsRotating(true)

          setTimeout(() => {
            if (!mountedRef.current) return
            setIsRotating(false)
            setBoard(pendingBoardRef.current ?? createBoard())
            pendingBoardRef.current = null
          }, 450)
        } else {
          rotationCountRef.current = newRotCount
          setRotationCount(newRotCount)
          setBoard(g.board_state ?? createBoard())
        }

        if ((g.status === 'completed' || g.status === 'abandoned') && !winStateRef.current) {
          handleGameEnd(g)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}`,
      }, async () => {
        const { data: pd } = await supabase
          .from('game_players').select('*, profiles(*)').eq('game_id', gameId).order('player_index')
        if (mountedRef.current && pd) {
          setPlayers(pd as PlayerWithProfile[])
          playersRef.current = pd as PlayerWithProfile[]
        }
      })
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // \u2500\u2500 Handle game end \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleGameEnd = useCallback(async (finishedGame: Game) => {
    if (winStateRef.current) return
    winStateRef.current = true

    const profile = myProfileRef.current
    if (!profile) return

    await new Promise(r => setTimeout(r, 600))

    const { data: gamePlayers } = await supabase
      .from('game_players').select('*').eq('game_id', gameId)

    const me = gamePlayers?.find((p: GamePlayer) => p.profile_id === profile.id)
    const coinsEarned = me?.coins_earned ?? 0
    const eloChange = me?.elo_change

    let winnerUsername = 'Unknown'
    let winnerSym: PlayerSymbol | null = null

    if (finishedGame.winner_id) {
      const currentPlayers = playersRef.current
      const winnerPlayer = currentPlayers.find(p => p.profile_id === finishedGame.winner_id)
      if (winnerPlayer) {
        winnerSym = winnerPlayer.symbol as PlayerSymbol
        winnerUsername = winnerPlayer.profiles?.username ?? 'Unknown'
      } else {
        const { data: wp } = await supabase
          .from('profiles').select('username').eq('id', finishedGame.winner_id).single()
        const { data: gp } = await supabase
          .from('game_players').select('symbol').eq('game_id', gameId).eq('profile_id', finishedGame.winner_id).single()
        winnerUsername = wp?.username ?? 'Unknown'
        winnerSym = (gp?.symbol as PlayerSymbol) ?? null
      }
    }

    if (mountedRef.current) {
      setWinState({
        winner: winnerSym,
        winnerUsername,
        isMe: finishedGame.winner_id === profile.id,
        coinsEarned,
        eloChange,
        isDraw: !finishedGame.winner_id,
        forfeit: finishedGame.status === 'abandoned',
      })
    }
  }, [gameId, supabase])

  // \u2500\u2500 Drop a piece \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleCellClick = useCallback(async (row: number, col: number) => {
    const myProfile = myProfileRef.current
    const game = gameRef.current
    const currentPlayers = playersRef.current

    if (!myProfile || !mySymbol || !game || processingMove.current) return
    if (game.status !== 'active') return
    if (currentPlayers[currentTurnRef.current]?.profile_id !== myProfile.id) return

    processingMove.current = true

    const result = dropPiece(board, col, mySymbol, row)
    if (!result.isValid) { processingMove.current = false; return }

    setBoard(result.newBoard)
    setLastDrop({ row: result.rowLanded, col })

    let finalBoard = result.newBoard
    let newRotationCount = rotationCountRef.current
    const causedRotation = result.causedRotation

    const winBefore = checkWin(finalBoard, mySymbol)
    if (winBefore.hasWon) {
      setWinningCells(winBefore.winningCells ?? null)
      await finalizeGame(finalBoard, myProfile.id, newRotationCount, causedRotation, true)
      processingMove.current = false
      return
    }

    if (causedRotation) {
      newRotationCount += 1
      finalBoard = rotateBoard(result.newBoard)

      setIsRotating(true)
      rotationCountRef.current = newRotationCount
      setRotationCount(newRotationCount)

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!mountedRef.current) { resolve(); return }
          setIsRotating(false)
          setBoard(finalBoard)
          resolve()
        }, 450)
      })

      const winAfter = checkWin(finalBoard, mySymbol)
      if (winAfter.hasWon) {
        setWinningCells(winAfter.winningCells ?? null)
        await finalizeGame(finalBoard, myProfile.id, newRotationCount, causedRotation, true)
        processingMove.current = false
        return
      }
    }

    const draw = isBoardFull(finalBoard)
    const nextTurn = (currentTurnRef.current + 1) % currentPlayers.length

    await supabase.from('game_moves').insert({
      game_id: gameId, profile_id: myProfile.id,
      move_number: 0, column_index: col, row_landed: result.rowLanded,
      caused_rotation: causedRotation, board_state_after: finalBoard,
    })

    await supabase.from('games').update({
      board_state: finalBoard,
      current_turn_index: nextTurn,
      rotation_count: newRotationCount,
      status: draw ? 'completed' : 'active',
    }).eq('id', gameId)

    if (draw) await distributeRewards(null)

    processingMove.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, mySymbol, gameId, supabase])


  // \u2500\u2500 Finalize game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const finalizeGame = useCallback(async (
    finalBoard: Board,
    winnerId: string,
    rotCount: number,
    causedRot: boolean,
    isWin: boolean,
  ) => {
    await distributeRewards(isWin ? winnerId : null)

    await supabase.from('games').update({
      board_state: finalBoard,
      status: 'completed',
      winner_id: isWin ? winnerId : null,
      completed_at: new Date().toISOString(),
      rotation_count: rotCount,
    }).eq('id', gameId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, supabase])

  // \u2500\u2500 Distribute rewards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const distributeRewards = useCallback(async (
    winnerId: string | null,
  ) => {
    const game = gameRef.current
    if (!game) return

    // Hosted games Ã¢ÂÂ no rewards
    if (game.host_id || game.mode.startsWith('hosted')) return

    const is1v1 = game.mode === 'competitive_1v1'
    const is3p  = game.mode === 'competitive_3p'
    const currentPlayers = playersRef.current

    const profileIds = currentPlayers.map(p => p.profile_id)
    const { data: freshProfiles } = await supabase.from('profiles').select('*').in('id', profileIds)
    if (!freshProfiles) return

    const profileMap = Object.fromEntries(freshProfiles.map((p: Profile) => [p.id, p]))

    if (is1v1 && winnerId && currentPlayers.length === 2) {
      // Competitive 1v1 Ã¢ÂÂ ELO + coins
      const winnerPlayer = currentPlayers.find(p => p.profile_id === winnerId)!
      const loserPlayer  = currentPlayers.find(p => p.profile_id !== winnerId)!
      const wP = profileMap[winnerPlayer.profile_id]
      const lP = profileMap[loserPlayer.profile_id]

      const wElo = wP.elo_1v1 ?? wP.elo ?? 0
      const lElo = lP.elo_1v1 ?? lP.elo ?? 0
      const [newWEloRaw, newLEloRaw, wChange, lChange] = calculate1v1Elo(wElo, lElo, wP.games_played, lP.games_played)
      const newWElo = Math.max(0, newWEloRaw)
      const newLElo = Math.max(0, newLEloRaw)
      const coins = COIN_REWARDS.competitive_1v1

      await supabase.from('profiles').update({
        elo_1v1: newWElo, coins: wP.coins + coins.win,
        games_played: wP.games_played + 1, games_won: wP.games_won + 1,
      }).eq('id', wP.id)
      await supabase.from('game_players').update({
        elo_before: wElo, elo_after: newWElo, elo_change: wChange,
        coins_earned: coins.win, placement: 1,
      }).eq('game_id', gameId).eq('profile_id', wP.id)

      await supabase.from('profiles').update({
        elo_1v1: newLElo, coins: lP.coins + coins.loss,
        games_played: lP.games_played + 1,
      }).eq('id', lP.id)
      await supabase.from('game_players').update({
        elo_before: lElo, elo_after: newLElo, elo_change: lChange,
        coins_earned: coins.loss, placement: 2,
      }).eq('game_id', gameId).eq('profile_id', lP.id)

    } else if (is3p && winnerId) {
      // Competitive 3P Ã¢ÂÂ ELO (elo_3p) + coins
      const coins = COIN_REWARDS.competitive_3p
      for (let i = 0; i < currentPlayers.length; i++) {
        const pl = currentPlayers[i]
        const p = profileMap[pl.profile_id]
        const pElo = p.elo_3p ?? p.elo ?? 0
        const isWin = pl.profile_id === winnerId
        const placement = isWin ? 1 : (i + 1 === 1 ? 2 : i + 1) // winner = 1, others keep index order
        const coinKey = Math.min(placement, 3) as 1 | 2 | 3
        const earned = coins[coinKey]
        const eloChange = isWin ? ELO_CONFIG.win_reward_3p : -ELO_CONFIG.loss_penalty_3p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({
          elo_3p: newElo, coins: p.coins + earned,
          games_played: p.games_played + 1, games_won: isWin ? p.games_won + 1 : p.games_won,
        }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_before: pElo, elo_after: newElo, elo_change: eloChange,
          coins_earned: earned, placement,
        }).eq('game_id', gameId).eq('profile_id', p.id)
      }

    } else if (!is1v1 && !is3p && winnerId) {
      // Competitive 4P Ã¢ÂÂ ELO (elo_4p) + coins
      const coins = COIN_REWARDS.competitive_4p
      for (let i = 0; i < currentPlayers.length; i++) {
        const pl = currentPlayers[i]
        const p = profileMap[pl.profile_id]
        const pElo = p.elo_4p ?? p.elo ?? 0
        const isWin = pl.profile_id === winnerId
        const placement = isWin ? 1 : i + 1
        const coinKey = placement as 1 | 2 | 3 | 4
        const earned = coins[coinKey] ?? coins[4]
        const eloChange = isWin ? ELO_CONFIG.win_reward_4p : -ELO_CONFIG.loss_penalty_4p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({
          elo_4p: newElo, coins: p.coins + earned,
          games_played: p.games_played + 1, games_won: isWin ? p.games_won + 1 : p.games_won,
        }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_before: pElo, elo_after: newElo, elo_change: eloChange,
          coins_earned: earned, placement,
        }).eq('game_id', gameId).eq('profile_id', p.id)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, supabase])

  // \u2500\u2500 Start hosted game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const startGame = async () => {
    const boardSize = game?.max_players === 4 ? 13 : game?.max_players === 3 ? 11 : 9
    await supabase.from('games').update({
      status: 'active',
      board_state: createBoard(boardSize),
    }).eq('id', gameId)
  }

  // \u2500\u2500 Cancel hosted game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const cancelGame = async () => {
    const myProfile = myProfileRef.current
    const game = gameRef.current
    const isHost = playersRef.current.find(p => p.profile_id === myProfile?.id)?.player_index === 0
    if (isHost && game) {
      await supabase.from('games').update({ status: 'abandoned' }).eq('id', game.id)
    }
    router.push('/')
  }

  // \u2500\u2500 Leave game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleLeaveGame = useCallback(async () => {
    const profile = myProfileRef.current
    const game = gameRef.current
    const currentPlayers = playersRef.current
    if (!profile || !game) { router.push('/'); return }

    // Hosted games Ã¢ÂÂ no ELO, just navigate
    if (game.host_id || game.mode.startsWith('hosted')) {
      router.push('/')
      return
    }

    const is1v1 = game.mode === 'competitive_1v1'
    const is3p  = game.mode === 'competitive_3p'

    if (is1v1 && currentPlayers.length === 2) {
      // Award full win to the opponent
      const opponent = currentPlayers.find(p => p.profile_id !== profile.id)
      if (opponent) {
        await distributeRewards(opponent.profile_id)
        await supabase.from('games').update({
          status: 'abandoned',
          winner_id: opponent.profile_id,
          completed_at: new Date().toISOString(),
        }).eq('id', game.id)
      }
    } else if (is3p) {
      // 3P leave Ã¢ÂÂ deduct ELO from leaver on elo_3p, abandon game
      const { data: freshProfiles } = await supabase.from('profiles').select('*').eq('id', profile.id)
      const p = freshProfiles?.[0] as Profile | undefined
      if (p) {
        const pElo = p.elo_3p ?? p.elo ?? 0
        const eloChange = -ELO_CONFIG.loss_penalty_3p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({ elo_3p: newElo }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_change: eloChange,
          placement: currentPlayers.length,
        }).eq('game_id', game.id).eq('profile_id', p.id)
      }
      await supabase.from('games').update({
        status: 'abandoned',
        completed_at: new Date().toISOString(),
      }).eq('id', game.id)
    } else if (!is1v1 && !is3p && currentPlayers.length > 0) {
      // 4P leave Ã¢ÂÂ deduct ELO from leaver on elo_4p, abandon game
      const { data: freshProfiles } = await supabase.from('profiles').select('*').eq('id', profile.id)
      const p = freshProfiles?.[0] as Profile | undefined
      if (p) {
        const pElo = p.elo_4p ?? p.elo ?? 0
        const eloChange = -ELO_CONFIG.loss_penalty_4p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({ elo_4p: newElo }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_change: eloChange,
          placement: currentPlayers.length,
        }).eq('game_id', game.id).eq('profile_id', p.id)
      }
      await supabase.from('games').update({
        status: 'abandoned',
        completed_at: new Date().toISOString(),
      }).eq('id', game.id)
    }

    router.push('/')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, distributeRewards])

  // \u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen message={error} />

  const currentPlayer = players[currentTurn]
  const currentSymbol = currentPlayer?.symbol as PlayerSymbol ?? null
  const isMyTurn = currentPlayer?.profile_id === myProfile?.id
  const gameActive = game?.status === 'active'

  // Waiting room
  if (game?.status === 'waiting') {
    const modeLabel = game.max_players === 4 ? '4-Player' : game.max_players === 3 ? '3-Player' : '1v1'
    const amHost = players[0]?.profile_id === myProfile?.id
    const canStart = players.length >= 2
    return (
      <div className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <button onClick={cancelGame} className="btn-ghost text-sm">{'\u2190'} Lobby</button>
          <div className="text-center">
            <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
            <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
          </div>
          <div className="w-16" />
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="card w-full max-w-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-white">Hosting {'\u2014'} waiting for players{'\u2026'}</h2>
              <div className="w-2.5 h-2.5 rounded-full bg-neon-cyan animate-pulse" />
            </div>

            <div className="flex gap-2 mb-5">
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">{'\u{1F3E0}'} Private</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">{modeLabel}</span>
            </div>

            <div className="flex gap-2 mb-5">
              {Array.from({ length: game.max_players }, (_, i) => {
                const p = players[i]
                const filled = !!p
                const isMe = p?.profile_id === myProfile?.id
                return (
                  <div key={i} className="flex-1 h-14 rounded-xl border flex flex-col items-center justify-center gap-1"
                    style={{ borderColor: filled ? '#00f5ff40' : '#ffffff10', background: filled ? '#00f5ff08' : 'transparent' }}>
                    <span className="text-lg font-black" style={{ color: filled ? '#00f5ff' : '#1e293b' }}>
                      {filled ? ((p.profiles as Profile | undefined)?.username?.[0]?.toUpperCase() ?? '?') : '?'}
                    </span>
                    <span className="text-xs" style={{ color: filled ? '#00f5ff60' : '#1e293b' }}>
                      {filled ? (isMe ? 'You' : ((p.profiles as Profile | undefined)?.username ?? '\u00b7\u00b7\u00b7')) : '\u00b7\u00b7\u00b7'}
                    </span>
                  </div>
                )
              })}
            </div>

            {game.join_code && (
              <div className="mb-5 text-center bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-slate-500 text-xs mb-2 uppercase tracking-wider">Join Code</p>
                <p className="text-3xl font-black text-neon-amber tracking-widest">{game.join_code}</p>
                <p className="text-slate-600 text-xs mt-2">Share with friends to join</p>
              </div>
            )}

            <div className="flex justify-center gap-1.5 mb-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-neon-cyan/40 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>

            {amHost && canStart && (
              <button onClick={startGame} className="btn-primary w-full mb-3">
                {'\u25B6'} Start Game
              </button>
            )}

            <button onClick={cancelGame} className="btn-ghost w-full text-sm text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40">
              {'\u2715'} Cancel Game
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active game
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-2 py-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-64 h-64 bg-neon-cyan/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-neon-purple/3 rounded-full blur-3xl" />
      </div>

      <header className="w-full max-w-2xl flex items-center justify-between mb-6 px-2">
        <div className="w-16" />
        <div className="text-center">
          <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
          <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <p>{game?.mode.replace(/_/g, ' ').toUpperCase()}</p>
          {rotationCount > 0 && <p className="text-neon-amber">{'\u21BB'} {'\u00D7'}{rotationCount}</p>}
        </div>
      </header>

      <div className="relative mt-8">
        <GameBoard
          board={board}
          players={players}
          currentSymbol={currentSymbol}
          mySymbol={mySymbol}
          winningCells={winningCells}
          isRotating={isRotating}
          onCellClick={handleCellClick}
          disabled={!gameActive || !isMyTurn}
          gameOver={!gameActive}
          recentDrop={lastDrop}
        />
      </div>

      {gameActive && !winState && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <div
              className="text-sm font-mono font-bold tabular-nums"
              style={{
                color: turnTimer <= 10 ? '#f59e0b' : '#475569',
                textShadow: turnTimer <= 10 ? '0 0 8px #f59e0b66' : undefined,
              }}
            >
              {turnTimer}s
            </div>
            <div className="w-24 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${(turnTimer / 30) * 100}%`,
                  background: turnTimer <= 10 ? '#f59e0b' : '#00f5ff40',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {gameActive && (
        <button
          onClick={handleLeaveGame}
          className="mt-3 text-xs text-slate-700 hover:text-slate-500 transition-colors"
        >
          Leave game
        </button>
      )}

      {winState && <WinModal {...winState} />}
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
        <p className="text-slate-500 text-sm">Loading game{'\u2026'}</p>
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
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GameBoard from '@/components/game/Board'
import WinModal from '@/components/game/WinModal'
import type { Game, GamePlayer, Profile, PlayerSymbol, Board } from '@/types'
import { COIN_REWARDS, ELO_CONFIG } from '@/types'
import { dropPiece, rotateBoard, checkWin, isBoardFull, createBoard } from '@/lib/game/board'
import { calculate1v1Elo } from '@/lib/game/elo'

type PlayerWithProfile = GamePlayer & { profiles?: Profile }

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [game, setGame]                   = useState<Game | null>(null)
  const [players, setPlayers]             = useState<PlayerWithProfile[]>([])
  const [myProfile, setMyProfile]         = useState<Profile | null>(null)
  const [mySymbol, setMySymbol]           = useState<PlayerSymbol | null>(null)
  const [board, setBoard]                 = useState<Board>(createBoard())
  const [currentTurn, setCurrentTurn]     = useState(0)
  const [isRotating, setIsRotating]       = useState(false)
  const [winState, setWinState]           = useState<{
    winner: PlayerSymbol | null
    winnerUsername: string
    isMe: boolean
    coinsEarned: number
    eloChange?: number
    isDraw?: boolean
    forfeit?: boolean
  } | null>(null)
  const [winningCells, setWinningCells]   = useState<[number, number][] | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [rotationCount, setRotationCount] = useState(0)
  const [lastDrop, setLastDrop]           = useState<{ row: number; col: number } | null>(null)
  const [turnTimer, setTurnTimer]         = useState(30)

  // Stable refs â never stale
  const processingMove    = useRef(false)
  const mountedRef        = useRef(true)
  const playersRef        = useRef<PlayerWithProfile[]>([])
  const myProfileRef      = useRef<Profile | null>(null)
  const gameRef           = useRef<Game | null>(null)
  const winStateRef       = useRef(false)
  const rotationCountRef  = useRef(0)
  const pendingBoardRef   = useRef<Board | null>(null)
  const currentTurnRef    = useRef(0)
  const turnTimerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const skipInProgressRef    = useRef(false)

  // Keep refs in sync
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { myProfileRef.current = myProfile }, [myProfile])
  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { currentTurnRef.current = currentTurn }, [currentTurn])

  // \u2500\u2500 30-second turn timer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    if (!game || game.status !== 'active' || isRotating) return

    setTurnTimer(30)
    skipInProgressRef.current = false
    if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current)

    turnTimerIntervalRef.current = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          clearInterval(turnTimerIntervalRef.current!)
          if (!skipInProgressRef.current) {
            skipInProgressRef.current = true
            const currentPlayers = playersRef.current
            if (currentPlayers.length === 0) return 0
            const nextTurn = (currentTurnRef.current + 1) % currentPlayers.length
            supabase.from('games').update({ current_turn_index: nextTurn })
              .eq('id', gameId)
              .eq('current_turn_index', currentTurnRef.current)
              .then(() => {})
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn, game?.status, isRotating])

  // \u2500\u2500 Init + subscribe \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    mountedRef.current = true

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mountedRef.current) { setMyProfile(profile); myProfileRef.current = profile }

      const { data: gameData } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (!gameData) { setError('Game not found.'); setLoading(false); return }

      if (gameData.status === 'completed' || gameData.status === 'abandoned') {
        setError('This game has already ended.')
        setLoading(false)
        return
      }

      if (mountedRef.current) {
        setGame(gameData); gameRef.current = gameData
        setBoard(gameData.board_state ?? createBoard())
        setCurrentTurn(gameData.current_turn_index ?? 0)
        currentTurnRef.current = gameData.current_turn_index ?? 0
        const rc = gameData.rotation_count ?? 0
        setRotationCount(rc); rotationCountRef.current = rc
      }

      const { data: playersData } = await supabase
        .from('game_players').select('*, profiles(*)')
        .eq('game_id', gameId).order('player_index')
      if (mountedRef.current && playersData) {
        setPlayers(playersData as PlayerWithProfile[])
        playersRef.current = playersData as PlayerWithProfile[]
        const me = playersData.find((p: GamePlayer) => p.profile_id === user.id)
        if (me) setMySymbol(me.symbol as PlayerSymbol)
      }

      if (mountedRef.current) setLoading(false)
    }

    init()

    const channel = supabase.channel(`game:${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}`,
      }, (payload) => {
        const g = payload.new as Game
        if (!mountedRef.current) return

        setGame(g); gameRef.current = g
        setCurrentTurn(g.current_turn_index ?? 0)
        currentTurnRef.current = g.current_turn_index ?? 0

        const newRotCount = g.rotation_count ?? 0

        if (newRotCount > rotationCountRef.current) {
          rotationCountRef.current = newRotCount
          setRotationCount(newRotCount)
          pendingBoardRef.current = g.board_state
          setIsRotating(true)

          setTimeout(() => {
            if (!mountedRef.current) return
            setIsRotating(false)
            setBoard(pendingBoardRef.current ?? createBoard())
            pendingBoardRef.current = null
          }, 450)
        } else {
          rotationCountRef.current = newRotCount
          setRotationCount(newRotCount)
          setBoard(g.board_state ?? createBoard())
        }

        if ((g.status === 'completed' || g.status === 'abandoned') && !winStateRef.current) {
          handleGameEnd(g)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}`,
      }, async () => {
        const { data: pd } = await supabase
          .from('game_players').select('*, profiles(*)').eq('game_id', gameId).order('player_index')
        if (mountedRef.current && pd) {
          setPlayers(pd as PlayerWithProfile[])
          playersRef.current = pd as PlayerWithProfile[]
        }
      })
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // \u2500\u2500 Handle game end \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleGameEnd = useCallback(async (finishedGame: Game) => {
    if (winStateRef.current) return
    winStateRef.current = true

    const profile = myProfileRef.current
    if (!profile) return

    await new Promise(r => setTimeout(r, 600))

    const { data: gamePlayers } = await supabase
      .from('game_players').select('*').eq('game_id', gameId)

    const me = gamePlayers?.find((p: GamePlayer) => p.profile_id === profile.id)
    const coinsEarned = me?.coins_earned ?? 0
    const eloChange = me?.elo_change

    let winnerUsername = 'Unknown'
    let winnerSym: PlayerSymbol | null = null

    if (finishedGame.winner_id) {
      const currentPlayers = playersRef.current
      const winnerPlayer = currentPlayers.find(p => p.profile_id === finishedGame.winner_id)
      if (winnerPlayer) {
        winnerSym = winnerPlayer.symbol as PlayerSymbol
        winnerUsername = winnerPlayer.profiles?.username ?? 'Unknown'
      } else {
        const { data: wp } = await supabase
          .from('profiles').select('username').eq('id', finishedGame.winner_id).single()
        const { data: gp } = await supabase
          .from('game_players').select('symbol').eq('game_id', gameId).eq('profile_id', finishedGame.winner_id).single()
        winnerUsername = wp?.username ?? 'Unknown'
        winnerSym = (gp?.symbol as PlayerSymbol) ?? null
      }
    }

    if (mountedRef.current) {
      setWinState({
        winner: winnerSym,
        winnerUsername,
        isMe: finishedGame.winner_id === profile.id,
        coinsEarned,
        eloChange,
        isDraw: !finishedGame.winner_id,
        forfeit: finishedGame.status === 'abandoned',
      })
    }
  }, [gameId, supabase])

  // \u2500\u2500 Drop a piece \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleCellClick = useCallback(async (row: number, col: number) => {
    const myProfile = myProfileRef.current
    const game = gameRef.current
    const currentPlayers = playersRef.current

    if (!myProfile || !mySymbol || !game || processingMove.current) return
    if (game.status !== 'active') return
    if (currentPlayers[currentTurnRef.current]?.profile_id !== myProfile.id) return

    processingMove.current = true

    const result = dropPiece(board, col, mySymbol, row)
    if (!result.isValid) { processingMove.current = false; return }

    setBoard(result.newBoard)
    setLastDrop({ row: result.rowLanded, col })

    let finalBoard = result.newBoard
    let newRotationCount = rotationCountRef.current
    const causedRotation = result.causedRotation

    const winBefore = checkWin(finalBoard, mySymbol)
    if (winBefore.hasWon) {
      setWinningCells(winBefore.winningCells ?? null)
      await finalizeGame(finalBoard, myProfile.id, newRotationCount, causedRotation, true)
      processingMove.current = false
      return
    }

    if (causedRotation) {
      newRotationCount += 1
      finalBoard = rotateBoard(result.newBoard)

      setIsRotating(true)
      rotationCountRef.current = newRotationCount
      setRotationCount(newRotationCount)

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!mountedRef.current) { resolve(); return }
          setIsRotating(false)
          setBoard(finalBoard)
          resolve()
        }, 450)
      })

      const winAfter = checkWin(finalBoard, mySymbol)
      if (winAfter.hasWon) {
        setWinningCells(winAfter.winningCells ?? null)
        await finalizeGame(finalBoard, myProfile.id, newRotationCount, causedRotation, true)
        processingMove.current = false
        return
      }
    }

    const draw = isBoardFull(finalBoard)
    const nextTurn = (currentTurnRef.current + 1) % currentPlayers.length

    await supabase.from('game_moves').insert({
      game_id: gameId, profile_id: myProfile.id,
      move_number: 0, column_index: col, row_landed: result.rowLanded,
      caused_rotation: causedRotation, board_state_after: finalBoard,
    })

    await supabase.from('games').update({
      board_state: finalBoard,
      current_turn_index: nextTurn,
      rotation_count: newRotationCount,
      status: draw ? 'completed' : 'active',
    }).eq('id', gameId)

    if (draw) await distributeRewards(null)

    processingMove.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, mySymbol, gameId, supabase])


  // \u2500\u2500 Finalize game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const finalizeGame = useCallback(async (
    finalBoard: Board,
    winnerId: string,
    rotCount: number,
    causedRot: boolean,
    isWin: boolean,
  ) => {
    await distributeRewards(isWin ? winnerId : null)

    await supabase.from('games').update({
      board_state: finalBoard,
      status: 'completed',
      winner_id: isWin ? winnerId : null,
      completed_at: new Date().toISOString(),
      rotation_count: rotCount,
    }).eq('id', gameId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, supabase])

  // \u2500\u2500 Distribute rewards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const distributeRewards = useCallback(async (
    winnerId: string | null,
  ) => {
    const game = gameRef.current
    if (!game) return

    // Hosted games â no rewards
    if (game.host_id || game.mode.startsWith('hosted')) return

    const is1v1 = game.mode === 'competitive_1v1'
    const is3p  = game.mode === 'competitive_3p'
    const currentPlayers = playersRef.current

    const profileIds = currentPlayers.map(p => p.profile_id)
    const { data: freshProfiles } = await supabase.from('profiles').select('*').in('id', profileIds)
    if (!freshProfiles) return

    const profileMap = Object.fromEntries(freshProfiles.map((p: Profile) => [p.id, p]))

    if (is1v1 && winnerId && currentPlayers.length === 2) {
      // Competitive 1v1 â ELO + coins
      const winnerPlayer = currentPlayers.find(p => p.profile_id === winnerId)!
      const loserPlayer  = currentPlayers.find(p => p.profile_id !== winnerId)!
      const wP = profileMap[winnerPlayer.profile_id]
      const lP = profileMap[loserPlayer.profile_id]

      const wElo = wP.elo_1v1 ?? wP.elo ?? 0
      const lElo = lP.elo_1v1 ?? lP.elo ?? 0
      const [newWEloRaw, newLEloRaw, wChange, lChange] = calculate1v1Elo(wElo, lElo, wP.games_played, lP.games_played)
      const newWElo = Math.max(0, newWEloRaw)
      const newLElo = Math.max(0, newLEloRaw)
      const coins = COIN_REWARDS.competitive_1v1

      await supabase.from('profiles').update({
        elo_1v1: newWElo, coins: wP.coins + coins.win,
        games_played: wP.games_played + 1, games_won: wP.games_won + 1,
      }).eq('id', wP.id)
      await supabase.from('game_players').update({
        elo_before: wElo, elo_after: newWElo, elo_change: wChange,
        coins_earned: coins.win, placement: 1,
      }).eq('game_id', gameId).eq('profile_id', wP.id)

      await supabase.from('profiles').update({
        elo_1v1: newLElo, coins: lP.coins + coins.loss,
        games_played: lP.games_played + 1,
      }).eq('id', lP.id)
      await supabase.from('game_players').update({
        elo_before: lElo, elo_after: newLElo, elo_change: lChange,
        coins_earned: coins.loss, placement: 2,
      }).eq('game_id', gameId).eq('profile_id', lP.id)

    } else if (is3p && winnerId) {
      // Competitive 3P â ELO (elo_3p) + coins
      const coins = COIN_REWARDS.competitive_3p
      for (let i = 0; i < currentPlayers.length; i++) {
        const pl = currentPlayers[i]
        const p = profileMap[pl.profile_id]
        const pElo = p.elo_3p ?? p.elo ?? 0
        const isWin = pl.profile_id === winnerId
        const placement = isWin ? 1 : (i + 1 === 1 ? 2 : i + 1) // winner = 1, others keep index order
        const coinKey = Math.min(placement, 3) as 1 | 2 | 3
        const earned = coins[coinKey]
        const eloChange = isWin ? ELO_CONFIG.win_reward_3p : -ELO_CONFIG.loss_penalty_3p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({
          elo_3p: newElo, coins: p.coins + earned,
          games_played: p.games_played + 1, games_won: isWin ? p.games_won + 1 : p.games_won,
        }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_before: pElo, elo_after: newElo, elo_change: eloChange,
          coins_earned: earned, placement,
        }).eq('game_id', gameId).eq('profile_id', p.id)
      }

    } else if (!is1v1 && !is3p && winnerId) {
      // Competitive 4P â ELO (elo_4p) + coins
      const coins = COIN_REWARDS.competitive_4p
      for (let i = 0; i < currentPlayers.length; i++) {
        const pl = currentPlayers[i]
        const p = profileMap[pl.profile_id]
        const pElo = p.elo_4p ?? p.elo ?? 0
        const isWin = pl.profile_id === winnerId
        const placement = isWin ? 1 : i + 1
        const coinKey = placement as 1 | 2 | 3 | 4
        const earned = coins[coinKey] ?? coins[4]
        const eloChange = isWin ? ELO_CONFIG.win_reward_4p : -ELO_CONFIG.loss_penalty_4p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({
          elo_4p: newElo, coins: p.coins + earned,
          games_played: p.games_played + 1, games_won: isWin ? p.games_won + 1 : p.games_won,
        }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_before: pElo, elo_after: newElo, elo_change: eloChange,
          coins_earned: earned, placement,
        }).eq('game_id', gameId).eq('profile_id', p.id)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, supabase])

  // \u2500\u2500 Start hosted game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const startGame = async () => {
    await supabase.from('games').update({
      status: 'active',
      board_state: createBoard(),
    }).eq('id', gameId)
  }

  // \u2500\u2500 Cancel hosted game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const cancelGame = async () => {
    const myProfile = myProfileRef.current
    const game = gameRef.current
    const isHost = playersRef.current.find(p => p.profile_id === myProfile?.id)?.player_index === 0
    if (isHost && game) {
      await supabase.from('games').update({ status: 'abandoned' }).eq('id', game.id)
    }
    router.push('/')
  }

  // \u2500\u2500 Leave game \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleLeaveGame = useCallback(async () => {
    const profile = myProfileRef.current
    const game = gameRef.current
    const currentPlayers = playersRef.current
    if (!profile || !game) { router.push('/'); return }

    // Hosted games â no ELO, just navigate
    if (game.host_id || game.mode.startsWith('hosted')) {
      router.push('/')
      return
    }

    const is1v1 = game.mode === 'competitive_1v1'
    const is3p  = game.mode === 'competitive_3p'

    if (is1v1 && currentPlayers.length === 2) {
      // Award full win to the opponent
      const opponent = currentPlayers.find(p => p.profile_id !== profile.id)
      if (opponent) {
        await distributeRewards(opponent.profile_id)
        await supabase.from('games').update({
          status: 'abandoned',
          winner_id: opponent.profile_id,
          completed_at: new Date().toISOString(),
        }).eq('id', game.id)
      }
    } else if (is3p) {
      // 3P leave â deduct ELO from leaver on elo_3p, abandon game
      const { data: freshProfiles } = await supabase.from('profiles').select('*').eq('id', profile.id)
      const p = freshProfiles?.[0] as Profile | undefined
      if (p) {
        const pElo = p.elo_3p ?? p.elo ?? 0
        const eloChange = -ELO_CONFIG.loss_penalty_3p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({ elo_3p: newElo }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_change: eloChange,
          placement: currentPlayers.length,
        }).eq('game_id', game.id).eq('profile_id', p.id)
      }
      await supabase.from('games').update({
        status: 'abandoned',
        completed_at: new Date().toISOString(),
      }).eq('id', game.id)
    } else if (!is1v1 && !is3p && currentPlayers.length > 0) {
      // 4P leave â deduct ELO from leaver on elo_4p, abandon game
      const { data: freshProfiles } = await supabase.from('profiles').select('*').eq('id', profile.id)
      const p = freshProfiles?.[0] as Profile | undefined
      if (p) {
        const pElo = p.elo_4p ?? p.elo ?? 0
        const eloChange = -ELO_CONFIG.loss_penalty_4p
        const newElo = Math.max(0, pElo + eloChange)
        await supabase.from('profiles').update({ elo_4p: newElo }).eq('id', p.id)
        await supabase.from('game_players').update({
          elo_change: eloChange,
          placement: currentPlayers.length,
        }).eq('game_id', game.id).eq('profile_id', p.id)
      }
      await supabase.from('games').update({
        status: 'abandoned',
        completed_at: new Date().toISOString(),
      }).eq('id', game.id)
    }

    router.push('/')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, distributeRewards])

  // \u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen message={error} />

  const currentPlayer = players[currentTurn]
  const currentSymbol = currentPlayer?.symbol as PlayerSymbol ?? null
  const isMyTurn = currentPlayer?.profile_id === myProfile?.id
  const gameActive = game?.status === 'active'

  // Waiting room
  if (game?.status === 'waiting') {
    const modeLabel = game.max_players === 4 ? '4-Player' : game.max_players === 3 ? '3-Player' : '1v1'
    const amHost = players[0]?.profile_id === myProfile?.id
    const canStart = players.length >= 2
    return (
      <div className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <button onClick={cancelGame} className="btn-ghost text-sm">{'\u2190'} Lobby</button>
          <div className="text-center">
            <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
            <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
          </div>
          <div className="w-16" />
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="card w-full max-w-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-white">Hosting {'\u2014'} waiting for players{'\u2026'}</h2>
              <div className="w-2.5 h-2.5 rounded-full bg-neon-cyan animate-pulse" />
            </div>

            <div className="flex gap-2 mb-5">
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">{'\u{1F3E0}'} Private</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">{modeLabel}</span>
            </div>

            <div className="flex gap-2 mb-5">
              {Array.from({ length: game.max_players }, (_, i) => {
                const p = players[i]
                const filled = !!p
                const isMe = p?.profile_id === myProfile?.id
                return (
                  <div key={i} className="flex-1 h-14 rounded-xl border flex flex-col items-center justify-center gap-1"
                    style={{ borderColor: filled ? '#00f5ff40' : '#ffffff10', background: filled ? '#00f5ff08' : 'transparent' }}>
                    <span className="text-lg font-black" style={{ color: filled ? '#00f5ff' : '#1e293b' }}>
                      {filled ? ((p.profiles as Profile | undefined)?.username?.[0]?.toUpperCase() ?? '?') : '?'}
                    </span>
                    <span className="text-xs" style={{ color: filled ? '#00f5ff60' : '#1e293b' }}>
                      {filled ? (isMe ? 'You' : ((p.profiles as Profile | undefined)?.username ?? '\u00b7\u00b7\u00b7')) : '\u00b7\u00b7\u00b7'}
                    </span>
                  </div>
                )
              })}
            </div>

            {game.join_code && (
              <div className="mb-5 text-center bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-slate-500 text-xs mb-2 uppercase tracking-wider">Join Code</p>
                <p className="text-3xl font-black text-neon-amber tracking-widest">{game.join_code}</p>
                <p className="text-slate-600 text-xs mt-2">Share with friends to join</p>
              </div>
            )}

            <div className="flex justify-center gap-1.5 mb-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-neon-cyan/40 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>

            {amHost && canStart && (
              <button onClick={startGame} className="btn-primary w-full mb-3">
                {'\u25B6'} Start Game
              </button>
            )}

            <button onClick={cancelGame} className="btn-ghost w-full text-sm text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40">
              {'\u2715'} Cancel Game
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active game
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-2 py-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-64 h-64 bg-neon-cyan/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-neon-purple/3 rounded-full blur-3xl" />
      </div>

      <header className="w-full max-w-2xl flex items-center justify-between mb-6 px-2">
        <div className="w-16" />
        <div className="text-center">
          <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
          <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <p>{game?.mode.replace(/_/g, ' ').toUpperCase()}</p>
          {rotationCount > 0 && <p className="text-neon-amber">{'\u21BB'} {'\u00D7'}{rotationCount}</p>}
        </div>
      </header>

      <div className="relative mt-8">
        <GameBoard
          board={board}
          players={players}
          currentSymbol={currentSymbol}
          mySymbol={mySymbol}
          winningCells={winningCells}
          isRotating={isRotating}
          onCellClick={handleCellClick}
          disabled={!gameActive || !isMyTurn}
          gameOver={!gameActive}
          recentDrop={lastDrop}
        />
      </div>

      {gameActive && !winState && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <div
              className="text-sm font-mono font-bold tabular-nums"
              style={{
                color: turnTimer <= 10 ? '#f59e0b' : '#475569',
                textShadow: turnTimer <= 10 ? '0 0 8px #f59e0b66' : undefined,
              }}
            >
              {turnTimer}s
            </div>
            <div className="w-24 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${(turnTimer / 30) * 100}%`,
                  background: turnTimer <= 10 ? '#f59e0b' : '#00f5ff40',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {gameActive && (
        <button
          onClick={handleLeaveGame}
          className="mt-3 text-xs text-slate-700 hover:text-slate-500 transition-colors"
        >
          Leave game
        </button>
      )}

      {winState && <WinModal {...winState} />}
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
        <p className="text-slate-500 text-sm">Loading game{'\u2026'}</p>
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
