'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type LeaderboardEntry = {
  id: string
  username: string
  elo: number
  elo_1v1: number
  elo_3p: number
  elo_4p: number
  games_played: number
  games_won: number
}

export default function LeaderboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab]     = useState<'1v1' | '3p' | '4p'>('1v1')
  const [top, setTop]     = useState<LeaderboardEntry[]>([])
  const [myId, setMyId]   = useState<string | null>(null)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setMyId(user.id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setLoading(true)
    const eloCol = tab === '1v1' ? 'elo_1v1' : tab === '3p' ? 'elo_3p' : 'elo_4p'
    supabase
      .from('profiles')
      .select('id, username, elo, elo_1v1, elo_3p, elo_4p, games_played, games_won')
      .order(eloCol, { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setTop((data ?? []) as LeaderboardEntry[])
        if (myId && data) {
          const idx = data.findIndex((p: LeaderboardEntry) => p.id === myId)
          setMyRank(idx !== -1 ? idx + 1 : null)
        }
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, myId])

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Back</button>
          <h1 className="text-2xl font-black">
            <span className="text-neon-cyan text-glow-cyan">🏆 Leaderboard</span>
          </h1>
          <div className="w-16" />
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden border border-white/5 mb-6">
          <button
            onClick={() => setTab('1v1')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === '1v1' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-500 hover:text-white'}`}
          >
            ⚔️ 1v1 Competitive
          </button>
          <button
            onClick={() => setTab('3p')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === '3p' ? 'bg-neon-green/10 text-neon-green' : 'text-slate-500 hover:text-white'}`}
          >
            🟢 3-Player Competitive
          </button>
          <button
            onClick={() => setTab('4p')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === '4p' ? 'bg-neon-purple/10 text-neon-purple' : 'text-slate-500 hover:text-white'}`}
          >
            🏟️ 4-Player Competitive
          </button>
        </div>

        {/* My rank callout */}
        {myRank && (
          <div className="card border-neon-cyan/20 mb-4 flex items-center gap-3 text-sm">
            <span className="text-neon-cyan font-bold text-lg">#{myRank}</span>
            <span className="text-slate-400">Your current rank ({tab === '1v1' ? '1v1' : '4-Player'})</span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-16">
            <p className="text-neon-cyan animate-pulse text-sm">Loading rankings…</p>
          </div>
        ) : (
          <div className="card border-white/5 overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 w-12">#</th>
                  <th className="text-left px-4 py-3">Player</th>
                  <th className="text-right px-4 py-3">{tab === '1v1' ? '1v1 ELO' : tab === '3p' ? '3P ELO' : '4P ELO'}</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">W/G</th>
                </tr>
              </thead>
              <tbody>
                {top.map((player, i) => {
                  const isMe = player.id === myId
                  const rank = i + 1
                  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                  const winRate = player.games_played > 0
                    ? Math.round((player.games_won / player.games_played) * 100)
                    : 0
                  const displayElo = tab === '1v1'
                    ? (player.elo_1v1 ?? player.elo)
                    : tab === '3p'
                    ? (player.elo_3p ?? player.elo)
                    : (player.elo_4p ?? player.elo)

                  return (
                    <tr
                      key={player.id}
                      className={`
                        border-b border-white/3 transition-colors
                        ${isMe ? 'bg-neon-cyan/5' : 'hover:bg-white/2'}
                      `}
                    >
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {medal ?? <span className="text-slate-600">{rank}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${isMe ? 'text-neon-cyan' : 'text-slate-200'}`}>
                          {player.username}
                          {isMe && <span className="ml-1.5 text-xs text-neon-cyan/60">(you)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-bold font-mono"
                          style={{
                            color: rank <= 3 ? ['#f59e0b','#94a3b8','#cd7f32'][rank-1] : '#e2e8f0',
                          }}
                        >
                          {displayElo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 hidden sm:table-cell font-mono">
                        {winRate}%
                        <span className="text-slate-700 ml-1 text-xs">({player.games_played}g)</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {top.length === 0 && (
              <div className="text-center py-12 text-slate-600">
                <p className="text-2xl mb-2">🏆</p>
                <p>No ranked games played yet. Be the first!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
