import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const revalidate = 60 // refresh every 60s

export default async function LeaderboardPage() {
  const supabase = createClient()

  const { data: top } = await supabase
    .from('profiles')
    .select('id, username, elo, games_played, games_won')
    .order('elo', { ascending: false })
    .limit(50)

  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id

  // Find my rank
  let myRank: number | null = null
  if (myId && top) {
    const idx = top.findIndex(p => p.id === myId)
    if (idx !== -1) myRank = idx + 1
  }

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="btn-ghost text-sm">← Back</Link>
          <h1 className="text-2xl font-black">
            <span className="text-neon-cyan text-glow-cyan">🏆 Leaderboard</span>
          </h1>
          <div className="w-16" />
        </div>

        <p className="text-slate-500 text-xs text-center uppercase tracking-widest mb-6">
          Competitive ELO Rankings
        </p>

        {/* My rank callout */}
        {myRank && (
          <div className="card border-neon-cyan/20 mb-4 flex items-center gap-3 text-sm">
            <span className="text-neon-cyan font-bold text-lg">#{myRank}</span>
            <span className="text-slate-400">Your current rank</span>
          </div>
        )}

        {/* Table */}
        <div className="card border-white/5 overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Player</th>
                <th className="text-right px-4 py-3">ELO</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">W/G</th>
              </tr>
            </thead>
            <tbody>
              {(top ?? []).map((player, i) => {
                const isMe = player.id === myId
                const rank = i + 1
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                const winRate = player.games_played > 0
                  ? Math.round((player.games_won / player.games_played) * 100)
                  : 0

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
                        {player.elo}
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

          {(!top || top.length === 0) && (
            <div className="text-center py-12 text-slate-600">
              <p className="text-2xl mb-2">🏆</p>
              <p>No ranked games played yet. Be the first!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
