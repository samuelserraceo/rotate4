'use client'

import { useRouter } from 'next/navigation'
import type { PlayerSymbol } from '@/types'
import { SYMBOL_COLORS } from '@/types'

interface WinModalProps {
  winner: PlayerSymbol | null
  winnerUsername: string
  isMe: boolean
  coinsEarned: number
  eloChange?: number
  isDraw?: boolean
  winnerColor?: string
}

export default function WinModal({
  winner, winnerUsername, isMe, coinsEarned, eloChange, isDraw, winnerColor,
}: WinModalProps) {
  const router = useRouter()
  const color = winnerColor ?? (winner ? SYMBOL_COLORS[winner].color : '#64748b')

  return (
    <div className="modal-overlay">
      <div className="modal-box text-center max-w-sm">
        {/* Big symbol */}
        {winner && (
          <div
            className="text-6xl font-black mb-3 animate-bounce-in"
            style={{ color, textShadow: `0 0 20px ${color}, 0 0 40px ${color}66` }}
          >
            {winner}
          </div>
        )}

        <h2 className="text-2xl font-bold text-white mb-1">
          {isDraw ? "It's a Draw!" : isMe ? '\u{1F389} You Win!' : `${winnerUsername} Wins!`}
        </h2>

        <div className="neon-line my-4" />

        {/* Rewards */}
        <div className="flex justify-center gap-6 mb-6">
          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Coins Earned</p>
            <p className="text-2xl font-bold text-neon-amber text-glow-amber">
              +{coinsEarned}
            </p>
          </div>
          {eloChange !== undefined && (
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">ELO Change</p>
              <p
                className={`text-2xl font-bold ${eloChange >= 0 ? 'text-neon-green' : 'text-red-400'}`}
                style={{ textShadow: eloChange >= 0 ? '0 0 10px #10b98166' : '0 0 10px #ef444466' }}
              >
                {eloChange >= 0 ? '+' : ''}{eloChange}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => router.push('/')}
          className="btn-primary w-full py-3 text-base"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  )
}
