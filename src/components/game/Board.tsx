'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Board, PlayerSymbol, GamePlayer, Profile } from '@/types'
import { SYMBOL_COLORS } from '@/types'
import { BOARD_SIZE } from '@/lib/game/board'

interface BoardProps {
  board: Board
  players: (GamePlayer & { profiles?: Profile })[]
  currentSymbol: PlayerSymbol | null   // whose turn it is
  mySymbol: PlayerSymbol | null        // this client's symbol
  winningCells: [number, number][] | null
  isRotating: boolean
  onColumnClick: (col: number) => void
  disabled: boolean
}

export default function GameBoard({
  board,
  players,
  currentSymbol,
  mySymbol,
  winningCells,
  isRotating,
  onColumnClick,
  disabled,
}: BoardProps) {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const [lastDropped, setLastDropped] = useState<{ row: number; col: number } | null>(null)
  const isMyTurn = mySymbol !== null && currentSymbol === mySymbol
  const canClick = isMyTurn && !disabled && !isRotating
  const boardRef = useRef<HTMLDivElement>(null)

  // Track the last placed piece for drop animation
  useEffect(() => {
    // When board changes, find what changed (simple heuristic: track in parent)
  }, [board])

  const handleCellClick = useCallback((col: number) => {
    if (!canClick) return
    onColumnClick(col)
  }, [canClick, onColumnClick])

  const isWinningCell = (row: number, col: number) =>
    winningCells?.some(([r, c]) => r === row && c === col) ?? false

  // Get player for a symbol
  const getPlayerForSymbol = (sym: PlayerSymbol | null) =>
    players.find(p => p.symbol === sym)

  // Corner layout positions for usernames
  const cornerPositions: Record<PlayerSymbol, string> = {
    X: 'bottom-left',
    O: 'top-right',
    W: 'top-left',
    M: 'bottom-right',
  }

  return (
    <div className="flex flex-col items-center w-full">
      {/* Board container with rotation animation */}
      <div
        ref={boardRef}
        className={`relative select-none ${isRotating ? 'board-rotating' : ''}`}
        style={{ touchAction: 'none' }}
      >
        {/* Player labels in corners */}
        <PlayerCorners players={players} currentSymbol={currentSymbol} mySymbol={mySymbol} />

        {/* Column hover indicator (arrow above each column) */}
        {canClick && (
          <div className="flex mb-1">
            {Array.from({ length: BOARD_SIZE }, (_, c) => (
              <div
                key={c}
                className="flex-1 flex justify-center"
                style={{ minWidth: 0 }}
              >
                {hoveredCol === c && (
                  <div
                    className="text-sm animate-bounce"
                    style={{ color: mySymbol ? SYMBOL_COLORS[mySymbol].color : '#00f5ff' }}
                  >
                    ▼
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
                return (
                  <BoardCell
                    key={cIdx}
                    cell={cell}
                    row={rIdx}
                    col={cIdx}
                    isWinning={winning}
                    isHoveredCol={hoveredCol === cIdx}
                    canClick={canClick}
                    mySymbol={mySymbol}
                    onClick={() => handleCellClick(cIdx)}
                    onMouseEnter={() => canClick && setHoveredCol(cIdx)}
                    onMouseLeave={() => setHoveredCol(null)}
                    onTouchStart={() => canClick && setHoveredCol(cIdx)}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Rotation flash overlay */}
        {isRotating && (
          <div className="absolute inset-0 rounded-xl bg-neon-cyan/5 animate-pulse pointer-events-none border border-neon-cyan/30" />
        )}
      </div>

      {/* Turn indicator */}
      <TurnIndicator
        currentSymbol={currentSymbol}
        mySymbol={mySymbol}
        players={players}
        disabled={disabled}
        isRotating={isRotating}
      />
    </div>
  )
}

// ─── Board Cell ────────────────────────────────────────────────────────────────

interface CellProps {
  cell: PlayerSymbol | null
  row: number
  col: number
  isWinning: boolean
  isHoveredCol: boolean
  canClick: boolean
  mySymbol: PlayerSymbol | null
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTouchStart: () => void
}

function BoardCell({
  cell, isWinning, isHoveredCol, canClick, mySymbol,
  onClick, onMouseEnter, onMouseLeave, onTouchStart
}: CellProps) {
  const color = cell ? SYMBOL_COLORS[cell].color : undefined
  const glow  = cell ? SYMBOL_COLORS[cell].glow  : undefined

  return (
    <div
      className={`
        board-cell
        ${canClick ? 'clickable' : ''}
        ${isWinning ? 'winning-cell' : ''}
        ${isHoveredCol && !cell && canClick ? 'col-hover' : ''}
      `}
      style={{
        width:  'clamp(28px, 9vw, 52px)',
        height: 'clamp(28px, 9vw, 52px)',
        cursor: canClick && !cell ? 'pointer' : 'default',
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
    >
      {cell && (
        <GamePiece symbol={cell} color={color!} glow={glow!} winning={isWinning} />
      )}
      {/* Hover ghost piece */}
      {!cell && isHoveredCol && canClick && mySymbol && (
        <GhostPiece symbol={mySymbol} color={SYMBOL_COLORS[mySymbol].color} />
      )}
    </div>
  )
}

// ─── Game Piece ────────────────────────────────────────────────────────────────

function GamePiece({ symbol, color, glow, winning }: {
  symbol: PlayerSymbol; color: string; glow: string; winning: boolean
}) {
  return (
    <div
      className={`
        w-4/5 h-4/5 rounded-lg flex items-center justify-center
        font-bold piece-drop
        ${winning ? 'scale-110' : ''}
      `}
      style={{
        color,
        border: `2px solid ${color}`,
        boxShadow: winning
          ? `0 0 12px ${glow}, 0 0 24px ${glow}66`
          : `0 0 6px ${glow}66`,
        background: `${color}15`,
        fontSize: 'clamp(10px, 3vw, 18px)',
        transition: 'box-shadow 0.3s ease',
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
        color: `${color}60`,
        border: `2px dashed ${color}40`,
        fontSize: 'clamp(10px, 3vw, 18px)',
      }}
    >
      {symbol}
    </div>
  )
}

// ─── Player Corners ────────────────────────────────────────────────────────────

function PlayerCorners({ players, currentSymbol, mySymbol }: {
  players: (GamePlayer & { profiles?: Profile })[]
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
}) {
  // Corner positions for symbols
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
          <div
            key={p.id}
            className="absolute flex items-center gap-1.5 text-xs font-semibold"
            style={{ ...corner, position: 'absolute' }}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
              style={{
                color,
                border: `1.5px solid ${color}`,
                background: `${color}15`,
                boxShadow: isActive ? `0 0 8px ${color}` : undefined,
              }}
            >
              {sym}
            </div>
            <span
              style={{ color: isActive ? color : '#64748b' }}
              className="max-w-[80px] truncate"
            >
              {p.profiles?.username ?? '…'}
              {isMe && <span className="ml-0.5 opacity-60">(you)</span>}
            </span>
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
            )}
          </div>
        )
      })}
    </>
  )
}

// ─── Turn Indicator ─────────────────────────────────────────────────────────────

function TurnIndicator({ currentSymbol, mySymbol, players, disabled, isRotating }: {
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
  players: (GamePlayer & { profiles?: Profile })[]
  disabled: boolean
  isRotating: boolean
}) {
  if (!currentSymbol) return null

  const color = SYMBOL_COLORS[currentSymbol].color
  const player = players.find(p => p.symbol === currentSymbol)
  const isMe = currentSymbol === mySymbol

  return (
    <div className="mt-8 text-center animate-fade-in">
      {isRotating ? (
        <p className="text-neon-amber text-glow-amber font-semibold text-sm animate-pulse">
          ↻ Board Rotating…
        </p>
      ) : disabled ? (
        <p className="text-slate-500 text-sm">Game over</p>
      ) : (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Current Turn</p>
          <p
            className="font-bold text-lg"
            style={{ color, textShadow: `0 0 10px ${color}66` }}
          >
            {isMe ? '⚡ Your Turn!' : `${player?.profiles?.username ?? currentSymbol}`}
          </p>
        </div>
      )}
    </div>
  )
}
