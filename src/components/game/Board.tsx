'use client'

import { useState, useCallback } from 'react'
import type { Board, PlayerSymbol, GamePlayer, Profile } from '@/types'
import { SYMBOL_COLORS } from '@/types'
import { BOARD_SIZE, getLandingRow, getTopLandingRow } from '@/lib/game/board'

interface BoardProps {
  board: Board
  players: (GamePlayer & { profiles?: Profile })[]
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
  winningCells: [number, number][] | null
  isRotating: boolean
  onColumnClick: (col: number, reverse: boolean) => void
  disabled: boolean
  recentDrop?: { row: number; col: number } | null
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
  recentDrop,
}: BoardProps) {
  const [hovered, setHovered] = useState<{ col: number; rev: boolean } | null>(null)
  const isMyTurn = mySymbol !== null && currentSymbol === mySymbol
  const canClick = isMyTurn && !disabled && !isRotating
  // Ghost landing row depends on drop direction
  const ghostRow = hovered !== null
    ? (hovered.rev ? getTopLandingRow(board, hovered.col) : getLandingRow(board, hovered.col))
    : -1

  const handleCellClick = useCallback((col: number, row: number) => {
    if (!canClick) return
    const rev = row < Math.floor(BOARD_SIZE / 2)
    onColumnClick(col, rev)
  }, [canClick, onColumnClick])

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

        {/* Top arrows — normal drop (piece falls DOWN to bottom of stack) */}
        {canClick && (
          <div className="flex mb-1">
            {Array.from({ length: BOARD_SIZE }, (_, c) => {
              const lr = getLandingRow(board, c)
              return (
                <div key={c} className="flex-1 flex justify-center cursor-pointer"
                  style={{ minWidth: 0 }}
                  onMouseEnter={() => setHovered({ col: c, rev: false })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => { if (canClick && lr !== -1) onColumnClick(c, false) }}
                >
                  <div className="text-sm transition-opacity"
                    style={{
                      color: mySymbol ? SYMBOL_COLORS[mySymbol].color : '#00f5ff',
                      opacity: hovered?.col === c && !hovered.rev ? 1 : 0.25,
                    }}
                  >▼</div>
                </div>
              )
            })}
          </div>
        )}
        {/* Grid */}
        <div className="rounded-xl overflow-hidden border border-neon-cyan/10"
          style={{ background: 'rgba(13,13,27,0.9)' }}
        >
          {board.map((row, rIdx) => (
            <div key={rIdx} className="flex">
              {row.map((cell, cIdx) => {
                const winning = isWinningCell(rIdx, cIdx)
                const isGhost = hovered?.col === cIdx && rIdx === ghostRow && !cell && canClick
                const isRecentDrop = recentDrop?.row === rIdx && recentDrop?.col === cIdx
                return (
                  <BoardCell
                    key={cIdx}
                    cell={cell}
                    isWinning={winning}
                    isLandingRow={isGhost}
                    isRecentDrop={isRecentDrop}
                    canClick={canClick && ghostRow !== -1}
                    mySymbol={mySymbol}
                    onClick={() => handleCellClick(cIdx, rIdx)}
                    onMouseEnter={() => canClick && setHovered({ col: cIdx, rev: rIdx < Math.floor(BOARD_SIZE / 2) })}
                    onMouseLeave={() => setHovered(null)}
                    onTouchStart={() => canClick && setHovered({ col: cIdx, rev: rIdx < Math.floor(BOARD_SIZE / 2) })}
                  />
                )
              })}
            </div>
          ))}
        </div>
        {/* Bottom arrows — reverse drop (piece rises UP to top of stack) */}
        {canClick && (
          <div className="flex mt-1">
            {Array.from({ length: BOARD_SIZE }, (_, c) => {
              const tlr = getTopLandingRow(board, c)
              return (
                <div key={c} className="flex-1 flex justify-center cursor-pointer"
                  style={{ minWidth: 0 }}
                  onMouseEnter={() => setHovered({ col: c, rev: true })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => { if (canClick && tlr !== -1) onColumnClick(c, true) }}
                >
                  <div className="text-sm transition-opacity"
                    style={{
                      color: mySymbol ? SYMBOL_COLORS[mySymbol].color : '#00f5ff',
                      opacity: hovered?.col === c && hovered.rev ? 1 : 0.25,
                    }}
                  >▲</div>
                </div>
              )
            })}
          </div>
        )}
        {/* Rotation overlay flash */}
        {isRotating && (
          <div className="absolute inset-0 rounded-xl bg-neon-cyan/8 pointer-events-none border border-neon-cyan/40" />
        )}
      </div>

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

// ─── Board Cell ─────────────────────────────────────────────────────────────

interface CellProps {
  cell: PlayerSymbol | null
  isWinning: boolean
  isLandingRow: boolean
  isRecentDrop: boolean
  canClick: boolean
  mySymbol: PlayerSymbol | null
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTouchStart: () => void
}

function BoardCell({
  cell, isWinning, isLandingRow, isRecentDrop, canClick, mySymbol,
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
        cursor: canClick && isLandingRow ? 'pointer' : canClick ? 'pointer' : 'default',
        // Subtle column highlight for entire hovered column
        background: isLandingRow ? 'rgba(0, 245, 255, 0.05)' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
    >
      {cell && (
        <GamePiece symbol={cell} color={color!} glow={glow!} winning={isWinning} recentDrop={isRecentDrop} />
      )}
      {/* Ghost piece only at landing row */}
      {!cell && isLandingRow && mySymbol && (
        <GhostPiece symbol={mySymbol} color={SYMBOL_COLORS[mySymbol].color} />
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

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

// ─── Player Corners ──────────────────────────────────────────────────────────

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
              {p.profiles?.username ?? '…'}
              {isMe && <span className="ml-0.5 opacity-60">(you)</span>}
            </span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
          </div>
        )
      })}
    </>
  )
}

// ─── Turn Indicator ──────────────────────────────────────────────────────────

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
    <div className="mt-8 text-center">
      {isRotating ? (
        <p className="text-neon-amber text-glow-amber font-semibold text-sm animate-pulse">
          ↻ Board Rotating…
        </p>
      ) : disabled ? null : (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Current Turn</p>
          <p className="font-bold text-lg" style={{ color, textShadow: `0 0 10px ${color}66` }}>
            {isMe ? '⚡ Your Turn!' : `${player?.profiles?.username ?? currentSymbol}`}
          </p>
        </div>
      )}
    </div>
  )
}
