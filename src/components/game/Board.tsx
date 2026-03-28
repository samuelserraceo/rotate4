'use client'

import { useState, useCallback, useMemo } from 'react'
import type { Board, PlayerSymbol, GamePlayer, Profile } from '@/types'
import { SYMBOL_COLORS } from '@/types'
import { getValidLandingRows } from '@/lib/game/board'

// Per-player skin colors: maps symbol â { color, glow, skinName? }
export type PlayerColorMap = Partial<Record<PlayerSymbol, { color: string; glow: string; skinName?: string }>>

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
  playerColors?: PlayerColorMap
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
  playerColors,
}: BoardProps) {
  // Resolve color for a symbol: skin color first, fallback to SYMBOL_COLORS
  const getColor = useCallback((sym: PlayerSymbol) => playerColors?.[sym] ?? SYMBOL_COLORS[sym], [playerColors])
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

  const boardSize = board.length

  return (
    <div className="flex flex-col items-center w-full">
      <div
        className={`relative select-none ${isRotating ? 'board-rotating' : ''}`}
        style={{ touchAction: 'none' }}
      >
        {/* Player labels in corners */}
        <PlayerCorners players={players} currentSymbol={currentSymbol} mySymbol={mySymbol} getColor={getColor} />

        {/* Drop arrow indicator above hovered column */}
        {canClick && (
          <div className="flex mb-1">
            {Array.from({ length: boardSize }, (_, c) => (
              <div key={c} className="flex-1 flex justify-center" style={{ minWidth: 0 }}>
                {hoveredCol === c && hasValidLanding && (
                  <div
                    className="text-sm animate-bounce"
                    style={{ color: mySymbol ? getColor(mySymbol).color : '#00f5ff' }}
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
                    boardSize={boardSize}
                    getColor={getColor}
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
        getColor={getColor}
      />
    </div>
  )
}

// âââ Board Cell ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface CellProps {
  cell: PlayerSymbol | null
  isWinning: boolean
  isValidLanding: boolean
  isRecentDrop: boolean
  canClick: boolean
  mySymbol: PlayerSymbol | null
  boardSize: number
  getColor: (sym: PlayerSymbol) => { color: string; glow: string; skinName?: string }
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTouchStart: () => void
}

function BoardCell({
  cell, isWinning, isValidLanding, isRecentDrop, canClick, mySymbol, boardSize,
  getColor, onClick, onMouseEnter, onMouseLeave, onTouchStart,
}: CellProps) {
  const color = cell ? getColor(cell).color : undefined
  const glow  = cell ? getColor(cell).glow  : undefined
  // Scale cell size based on board dimensions: 9->52px max, 11->44px max, 13->38px max
  const maxSize = Math.max(28, Math.floor(52 * 9 / boardSize))
  const vwSize = Math.floor(75 / boardSize)

  return (
    <div
      className={`board-cell ${canClick ? 'clickable' : ''} ${isWinning ? 'winning-cell' : ''}`}
      style={{
        width:  `clamp(18px, ${vwSize}vw, ${maxSize}px)`,
        height: `clamp(18px, ${vwSize}vw, ${maxSize}px)`,
        cursor: canClick && isValidLanding ? 'pointer' : canClick ? 'pointer' : 'default',
        background: isValidLanding ? 'rgba(0, 245, 255, 0.05)' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
    >
      {cell && (
        <GamePiece symbol={cell} color={color!} glow={glow!} winning={isWinning} recentDrop={isRecentDrop} boardSize={boardSize} skinName={cell ? getColor(cell).skinName : undefined} />
      )}
      {/* Ghost piece at ALL valid landing positions in hovered column */}
      {!cell && isValidLanding && mySymbol && (
        <GhostPiece symbol={mySymbol} color={getColor(mySymbol).color} boardSize={boardSize} />
      )}
    </div>
  )
}

// âââ Pieces ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const ULTRA_SKINS = ['Sakura Petals', 'Ocean Depths', 'Space Nebula'] as const

function GamePiece({ symbol, color, glow, winning, recentDrop, boardSize, skinName }: {
  symbol: PlayerSymbol; color: string; glow: string; winning: boolean; recentDrop: boolean; boardSize: number; skinName?: string
}) {
  const isUltra = skinName && ULTRA_SKINS.includes(skinName as typeof ULTRA_SKINS[number])

  if (isUltra) {
    return (
      <div
        className={`w-4/5 h-4/5 rounded-lg flex items-center justify-center piece-drop ${winning ? 'scale-110' : ''}`}
        style={{
          boxShadow: winning
            ? `0 0 16px ${glow}, 0 0 32px ${glow}66`
            : recentDrop
              ? `0 0 14px ${glow}cc, 0 0 6px ${glow}66`
              : `0 0 6px ${glow}66`,
          transition: 'box-shadow 0.3s ease',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <UltraSkinSVG skinName={skinName!} symbol={symbol} winning={winning} />
      </div>
    )
  }

  const fontSize = `clamp(8px, ${Math.floor(250 / boardSize)}%, 18px)`
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
        fontSize,
        transition: 'box-shadow 0.3s ease, background 0.3s ease',
      }}
    >
      {symbol}
    </div>
  )
}

function GhostPiece({ symbol, color, boardSize }: { symbol: PlayerSymbol; color: string; boardSize: number }) {
  const fontSize = `clamp(8px, ${Math.floor(250 / boardSize)}%, 18px)`
  return (
    <div
      className="w-4/5 h-4/5 rounded-lg flex items-center justify-center font-bold"
      style={{
        color: `${color}70`,
        border: `2px dashed ${color}50`,
        background: `${color}08`,
        fontSize,
      }}
    >
      {symbol}
    </div>
  )
}

// âââ Ultra Skin SVG Renderer âââââââââââââââââââââââââââââââââââââââââââââââââââââ

function UltraSkinSVG({ skinName, symbol, winning }: { skinName: string; symbol: PlayerSymbol; winning: boolean }) {
  const uid = `${skinName.replace(/\s/g, '')}_${symbol}`
  switch (skinName) {
    case 'Sakura Petals': return <SakuraSVG symbol={symbol} uid={uid} winning={winning} />
    case 'Ocean Depths':  return <OceanSVG symbol={symbol} uid={uid} winning={winning} />
    case 'Space Nebula':  return <SpaceSVG symbol={symbol} uid={uid} winning={winning} />
    default: return null
  }
}

function SakuraSVG({ symbol, uid, winning }: { symbol: PlayerSymbol; uid: string; winning: boolean }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`sakF_${uid}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor="#fff1f2"/>
          <stop offset="35%" stopColor="#ffe4e6"/>
          <stop offset="70%" stopColor="#fda4af"/>
          <stop offset="100%" stopColor="#e879a2"/>
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="16" ry="16"
        fill={`url(#sakF_${uid})`} stroke="#fda4af" strokeWidth={winning ? '3.5' : '2.5'}/>
      {/* Main cherry blossom */}
      <g transform="translate(34,26)" opacity="0.55">
        <ellipse cx="0" cy="-7" rx="4" ry="7" fill="#fff1f2"/>
        <ellipse cx="0" cy="-7" rx="4" ry="7" fill="#fff1f2" transform="rotate(72)"/>
        <ellipse cx="0" cy="-7" rx="4" ry="7" fill="#fff1f2" transform="rotate(144)"/>
        <ellipse cx="0" cy="-7" rx="4" ry="7" fill="#fff1f2" transform="rotate(216)"/>
        <ellipse cx="0" cy="-7" rx="4" ry="7" fill="#fff1f2" transform="rotate(288)"/>
        <circle cx="0" cy="0" r="3" fill="#fecdd3"/>
      </g>
      {/* Small flower bottom-right */}
      <g transform="translate(70,68)" opacity="0.4">
        <ellipse cx="0" cy="-5" rx="3" ry="5" fill="#fff1f2"/>
        <ellipse cx="0" cy="-5" rx="3" ry="5" fill="#fff1f2" transform="rotate(72)"/>
        <ellipse cx="0" cy="-5" rx="3" ry="5" fill="#fff1f2" transform="rotate(144)"/>
        <ellipse cx="0" cy="-5" rx="3" ry="5" fill="#fff1f2" transform="rotate(216)"/>
        <ellipse cx="0" cy="-5" rx="3" ry="5" fill="#fff1f2" transform="rotate(288)"/>
        <circle cx="0" cy="0" r="2" fill="#fecdd3"/>
      </g>
      {/* Tiny flower */}
      <g transform="translate(72,30)" opacity="0.3">
        <ellipse cx="0" cy="-3.5" rx="2" ry="3.5" fill="#fff1f2"/>
        <ellipse cx="0" cy="-3.5" rx="2" ry="3.5" fill="#fff1f2" transform="rotate(72)"/>
        <ellipse cx="0" cy="-3.5" rx="2" ry="3.5" fill="#fff1f2" transform="rotate(144)"/>
        <ellipse cx="0" cy="-3.5" rx="2" ry="3.5" fill="#fff1f2" transform="rotate(216)"/>
        <ellipse cx="0" cy="-3.5" rx="2" ry="3.5" fill="#fff1f2" transform="rotate(288)"/>
        <circle cx="0" cy="0" r="1.5" fill="#fecdd3"/>
      </g>
      {/* Petal dots */}
      <circle cx="22" cy="68" r="1.5" fill="#fecdd3" opacity="0.4"/>
      <circle cx="55" cy="16" r="1" fill="#fecdd3" opacity="0.35"/>
      {/* Letter */}
      <text x="50" y="60" textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontWeight="900" fontSize="34" fill="#881337" opacity="0.85">{symbol}</text>
    </svg>
  )
}

function OceanSVG({ symbol, uid, winning }: { symbol: PlayerSymbol; uid: string; winning: boolean }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`oceF_${uid}`} cx="40%" cy="40%">
          <stop offset="0%" stopColor="#cffafe"/>
          <stop offset="45%" stopColor="#67e8f9"/>
          <stop offset="100%" stopColor="#0891b2"/>
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="16" ry="16"
        fill={`url(#oceF_${uid})`} stroke="#06b6d4" strokeWidth={winning ? '3.5' : '2.5'}/>
      {/* Bubble cluster top-left */}
      <circle cx="26" cy="30" r="4" fill="none" stroke="#ecfeff" strokeWidth="1" opacity="0.55"/>
      <circle cx="32" cy="24" r="2.5" fill="none" stroke="#ecfeff" strokeWidth="0.8" opacity="0.45"/>
      <circle cx="20" cy="25" r="2" fill="none" stroke="#ecfeff" strokeWidth="0.6" opacity="0.35"/>
      {/* Bubble cluster bottom-right */}
      <circle cx="72" cy="64" r="3.5" fill="none" stroke="#ecfeff" strokeWidth="0.9" opacity="0.45"/>
      <circle cx="78" cy="58" r="2" fill="none" stroke="#ecfeff" strokeWidth="0.6" opacity="0.35"/>
      <circle cx="67" cy="70" r="2" fill="none" stroke="#ecfeff" strokeWidth="0.5" opacity="0.28"/>
      {/* Light rays */}
      <line x1="35" y1="4" x2="38" y2="30" stroke="#ecfeff" strokeWidth="2" opacity="0.13" strokeLinecap="round"/>
      <line x1="55" y1="4" x2="56" y2="26" stroke="#ecfeff" strokeWidth="1.5" opacity="0.1" strokeLinecap="round"/>
      <line x1="72" y1="4" x2="70" y2="22" stroke="#ecfeff" strokeWidth="1" opacity="0.08" strokeLinecap="round"/>
      {/* Sparkle dots */}
      <circle cx="46" cy="16" r="1" fill="#ecfeff" opacity="0.5"/>
      <circle cx="84" cy="44" r="0.8" fill="#ecfeff" opacity="0.3"/>
      {/* Letter */}
      <text x="50" y="60" textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontWeight="900" fontSize="34" fill="#083344" opacity="0.9">{symbol}</text>
    </svg>
  )
}

function SpaceSVG({ symbol, uid, winning }: { symbol: PlayerSymbol; uid: string; winning: boolean }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spaF_${uid}`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#c7d2fe"/>
          <stop offset="30%" stopColor="#a5b4fc"/>
          <stop offset="60%" stopColor="#c4b5fd"/>
          <stop offset="100%" stopColor="#ddd6fe"/>
        </linearGradient>
        <clipPath id={`spaC_${uid}`}>
          <rect x="4" y="4" width="92" height="92" rx="16" ry="16"/>
        </clipPath>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="16" ry="16"
        fill={`url(#spaF_${uid})`} stroke="#a5b4fc" strokeWidth={winning ? '3.5' : '2.5'}/>
      {/* Aurora bands clipped to piece */}
      <g clipPath={`url(#spaC_${uid})`}>
        <path d="M0 28 Q18 16 40 22 Q62 28 82 18 Q96 14 100 20 L100 32 Q78 26 58 34 Q38 42 18 32 Z" fill="#a7f3d0" opacity="0.25"/>
        <path d="M0 40 Q22 30 45 38 Q68 46 90 34 L90 46 Q68 56 45 48 Q22 40 0 50 Z" fill="#e9d5ff" opacity="0.2"/>
        <path d="M4 56 Q26 48 48 55 Q70 62 92 52 L92 62 Q70 70 48 63 Q26 56 4 64 Z" fill="#bae6fd" opacity="0.18"/>
        <path d="M6 70 Q28 64 50 69 Q72 74 92 67 L92 76 Q72 82 50 76 Q28 70 6 78 Z" fill="#a7f3d0" opacity="0.12"/>
      </g>
      {/* Stars */}
      <circle cx="18" cy="16" r="1.5" fill="#ffffff" opacity="0.85"/>
      <circle cx="76" cy="14" r="1.8" fill="#ffffff" opacity="0.8"/>
      <circle cx="86" cy="44" r="1.2" fill="#ffffff" opacity="0.6"/>
      <circle cx="14" cy="62" r="1" fill="#ffffff" opacity="0.5"/>
      <circle cx="62" cy="82" r="1.3" fill="#ffffff" opacity="0.55"/>
      <circle cx="42" cy="12" r="1" fill="#ffffff" opacity="0.6"/>
      <circle cx="82" cy="74" r="0.8" fill="#ffffff" opacity="0.4"/>
      {/* Twinkle crosses */}
      <g transform="translate(76,14)" opacity="0.55">
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#ffffff" strokeWidth="0.6"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#ffffff" strokeWidth="0.6"/>
      </g>
      <g transform="translate(18,16)" opacity="0.45">
        <line x1="-3" y1="0" x2="3" y2="0" stroke="#ffffff" strokeWidth="0.5"/>
        <line x1="0" y1="-3" x2="0" y2="3" stroke="#ffffff" strokeWidth="0.5"/>
      </g>
      {/* Letter */}
      <text x="50" y="60" textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontWeight="900" fontSize="34" fill="#1e1b4b" opacity="0.85">{symbol}</text>
    </svg>
  )
}

// âââ Player Corners ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function PlayerCorners({ players, currentSymbol, mySymbol, getColor }: {
  players: (GamePlayer & { profiles?: Profile })[]
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
  getColor: (sym: PlayerSymbol) => { color: string; glow: string; skinName?: string }
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
        const color = getColor(sym).color
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

// âââ Turn Indicator ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function TurnIndicator({ currentSymbol, mySymbol, players, gameOver, isRotating, getColor }: {
  currentSymbol: PlayerSymbol | null
  mySymbol: PlayerSymbol | null
  players: (GamePlayer & { profiles?: Profile })[]
  gameOver: boolean
  isRotating: boolean
  getColor: (sym: PlayerSymbol) => { color: string; glow: string; skinName?: string }
}) {
  if (!currentSymbol) return null

  const color = getColor(currentSymbol).color
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
            {isMe ? `{'\u26A1'} Your Turn!` : `${player?.profiles?.username ?? currentSymbol}'s Turn`}
          </p>
        </div>
      )}
    </div>
  )
}
