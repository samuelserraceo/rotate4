'use client'

import { useState, useCallback, useMemo } from 'react'
import type { Board, PlayerSymbol, GamePlayer, Profile } from '@/types'
import { SYMBOL_COLORS } from '@/types'
import { BOARD_SIZE, getValidLandingRows } from '@/lib/game/board'

interface BoardProps {
  board: Board
  players: (GamePlayer & { profiles?: Profile })[]
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
  winningCells: [number, number][] | null
  isRotating: boolean
  onCellClick: (row: number, col: number) => void
  disabled: boolean
  gameOver: boolean
  recentDrop?: { row: number; col: number } | null
}

export default function GameBoard({
  board,
  players,
  currentSymbol,
  mySymbol,
  winningCells,
  isRotating,
  onCellClick,
  disabled,
  gameOver,
  recentDrop,
}: BoardProps) {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const isMyTurn = mySymbol !== null && currentSymbol === mySymbol
  const canClick = isMyTurn && !disabled && !isRotating

  // Compute ALL valid landing rows for hovered column (ledge support)
  const validLandingRows = useMemo(() => {
    if (hoveredCol === null) return [] as number[]
    return getValidLandingRows(board, hoveredCol)
  }, [board, hoveredCol])

  const hasValidLanding = validLandingRows.length > 0

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!canClick) return
    const validRows = getValidLandingRows(board, col)
    if (validRows.includes(row)) {
      onCellClick(row, col)
    }
  }, [canClick, board, onCellClick])

  const isWinningCell = (row: number, col: number) =>
    winningCells?.some(([r, c]) => r === row && c === col) ?? false

  return (
    <div className="flex flex-col items-center w-full">
      <div
        className={`relative select-none ${isRotating ? 'board-rotating' : ''}`}
        style={{ touchAction: 'none' }}
      >
        {/* Player labels in corners */}
        <PlayerCorners players={players} currentSymbol={currentSymbol} mySymbol={mySymbol} />

        {/* Drop arrow indicator above hovered column */}
        {canClick && (
          <div className="flex mb-1">
            {Array.from({ length: BOARD_SIZE }, (_, c) => (
              <div key={c} className="flex-1 flex justify-center" style={{ minWidth: 0 }}>
                {hoveredCol === c && hasValidLanding && (
                  <div
                    className="text-sm animate-bounce"
                    style={{ color: mySymbol ? SYMBOL_COLORS[mySymbol].color : '#00f5ff' }}
                  >
                    {'\u25BC'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        <div
          className="rounded-xl overflow-hidden border border-neon-cyan/10"
          style={{ background: 'rgba(13,13,27,0.9)' }}
        >
          {board.map((row, rIdx) => (
            <div key={rIdx} className="flex">
              {row.map((cell, cIdx) => {
                const winning = isWinningCell(rIdx, cIdx)
                const isValidLanding = hoveredCol === cIdx && validLandingRows.includes(rIdx) && !cell && canClick
                const isRecentDrop = recentDrop?.row === rIdx && recentDrop?.col === cIdx

                return (
                  <BoardCell
                    key={cIdx}
                    cell={cell}
                    isWinning={winning}
                    isValidLanding={isValidLanding}
                    isRecentDrop={isRecentDrop}
                    canClick={canClick && hasValidLanding}
                    mySymbol={mySymbol}
                    onClick={() => handleCellClick(rIdx, cIdx)}
                    onMouseEnter={() => canClick && setHoveredCol(cIdx)}
                    onMouseLeave={() => setHoveredCol(null)}
                    onTouchStart={() => canClick && setHoveredCol(cIdx)}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Rotation overlay flash */}
        {isRotating && (
          <div className="absolute inset-0 rounded-xl bg-neon-cyan/8 pointer-events-none border border-neon-cyan/40" />
        )}
      </div>

      <TurnIndicator
        currentSymbol={currentSymbol}
        mySymbol={mySymbol}
        players={players}
        gameOver={gameOver}
        isRotating={isRotating}
      />
    </div>
  )
}

// --- Board Cell ---

interface CellProps {
  cell: PlayerSymbol | null
  isWinning: boolean
  isValidLanding: boolean
  isRecentDrop: boolean
  canClick: boolean
  mySymbol: PlayerSymbol | null
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTouchStart: () => void
}

function BoardCell({
  cell, isWinning, isValidLanding, isRecentDrop, canClick, mySymbol,
  onClick, onMouseEnter, onMouseLeave, onTouchStart,
}: CellProps) {
  const color = cell ? SYMBOL_COLORS[cell].color : undefined
  const glow  = cell ? SYMBOL_COLORS[cell].glow  : undefined

  return (
    <div
      className={`board-cell ${canClick ? 'clickable' : ''} ${isWinning ? 'winning-cell' : ''}`}
      style={{
        width:  'clamp(28px, 9vw, 52px)',
        height: 'clamp(28px, 9vw, 52px)',
        cursor: canClick && isValidLanding ? 'pointer' : canClick ? 'pointer' : 'default',
        background: isValidLanding ? 'rgba(0, 245, 255, 0.05)' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
    >
      {cell && (
        <GamePiece symbol={cell} color={color!} glow={glow!} winning={isWinning} recentDrop={isRecentDrop} />
      )}
      {/* Ghost piece at ALL valid landing positions in hovered column */}
      {!cell && isValidLanding && mySymbol && (
        <GhostPiece symbol={mySymbol} color={SYMBOL_COLORS[mySymbol].color} />
      )}
    </div>
  )
}

// --- Pieces ---

function GamePiece({ symbol, color, glow, winning, recentDrop }: {
  symbol: PlayerSymbol; color: string; glow: string; winning: boolean; recentDrop: boolean
}) {
  return (
    <div
      className={`w-4/5 h-4/5 rounded-lg flex items-center justify-center font-bold piece-drop ${winning ? 'scale-110' : ''}`}
      style={{
        color,
        border: `2px solid ${color}`,
        boxShadow: winning
          ? `0 0 16px ${glow}, 0 0 32px ${glow}66`
          : recentDrop
            ? `0 0 14px ${glow}cc, 0 0 6px ${glow}66`
            : `0 0 6px ${glow}66`,
        background: recentDrop ? `${color}28` : `${color}15`,
        fontSize: 'clamp(10px, 3vw, 18px)',
        transition: 'box-shadow 0.3s ease, background 0.3s ease',
      }}
    >
      {symbol}
    </div>
  )
}

function GhostPiece({ symbol, color }: { symbol: PlayerSymbol; color: string }) {
  return (
    <div
      className="w-4/5 h-4/5 rounded-lg flex items-center justify-center font-bold"
      style={{
        color: `${color}70`,
        border: `2px dashed ${color}50`,
        background: `${color}08`,
        fontSize: 'clamp(10px, 3vw, 18px)',
      }}
    >
      {symbol}
    </div>
  )
}

// --- Player Corners ---

function PlayerCorners({ players, currentSymbol, mySymbol }: {
  players: (GamePlayer & { profiles?: Profile })[]
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
}) {
  const corners: Record<PlayerSymbol, { top?: string; bottom?: string; left?: string; right?: string }> = {
    X: { bottom: '-32px', left: '0' },
    O: { top: '-32px',    right: '0' },
    W: { top: '-32px',    left: '0' },
    M: { bottom: '-32px', right: '0' },
  }

  return (
    <>
      {players.map(p => {
        const sym = p.symbol as PlayerSymbol
        const color = SYMBOL_COLORS[sym].color
        const isActive = currentSymbol === sym
        const isMe = mySymbol === sym
        const corner = corners[sym]

        return (
          <div key={p.id} className="absolute flex items-center gap-1.5 text-xs font-semibold"
            style={{ ...corner, position: 'absolute' }}>
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
              style={{
                color, border: `1.5px solid ${color}`, background: `${color}15`,
                boxShadow: isActive ? `0 0 8px ${color}` : undefined,
              }}
            >
              {sym}
            </div>
            <span style={{ color: isActive ? color : '#64748b' }} className="max-w-[80px] truncate">
              {p.profiles?.username ?? '\u2026'}
              {isMe && <span className="ml-0.5 opacity-60">(you)</span>}
            </span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
          </div>
        )
      })}
    </>
  )
}

// --- Turn Indicator ---

function TurnIndicator({ currentSymbol, mySymbol, players, gameOver, isRotating }: {
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
  players: (GamePlayer & { profiles?: Profile })[]
  gameOver: boolean
  isRotating: boolean
}) {
  if (!currentSymbol) return null

  const color = SYMBOL_COLORS[currentSymbol].color
  const player = players.find(p => p.symbol === currentSymbol)
  const isMe = currentSymbol === mySymbol

  return (
    <div className="mt-8 text-center">
      {isRotating ? (
        <p className="text-neon-amber text-glow-amber font-semibold text-sm animate-pulse">
          {'\u21BB'} Board Rotating{'\u2026'}
        </p>
      ) : gameOver ? (
        <p className="text-slate-500 text-sm">Game over</p>
      ) : (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Current Turn</p>
          <p className="font-bold text-lg" style={{ color, textShadow: `0 0 10px ${color}66` }}>
            {isMe ? `${'\u26A1'} Your Turn!` : `${player?.profiles?.username ?? currentSymbol}'s Turn`}
          </p>
        </div>
      )}
    </div>
  )
}
