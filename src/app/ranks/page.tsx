'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getRank, getAllDivisions } from '@/lib/ranks'
import type { Profile } from '@/types'

export default function RanksPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<'1v1' | '4p'>('1v1')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const elo = profile
    ? (tab === '1v1' ? (profile.elo_1v1 ?? profile.elo ?? 1200) : (profile.elo_4p ?? profile.elo ?? 1200))
    : 1200

  const rank = getRank(elo)
  const divisions = getAllDivisions()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Lobby</button>
        <h1 className="text-lg font-black text-white">
          Rank <span style={{ color: rank.color }}>Road</span>
        </h1>
        <div className="w-16" />
      </header>

      <div className="max-w-lg mx-auto w-full px-4 py-6 space-y-6">

        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden border border-white/5">
          <button
            onClick={() => setTab('1v1')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === '1v1' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-500 hover:text-white'}`}
          >
            ⚔️ 1v1 Ranked
          </button>
          <button
            onClick={() => setTab('4p')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === '4p' ? 'bg-neon-purple/10 text-neon-purple' : 'text-slate-500 hover:text-white'}`}
          >
            🏟️ 4-Player Ranked
          </button>
        </div>

        {/* Current rank card */}
        <div
          className="card text-center py-6"
          style={{ borderColor: rank.color + '30', background: rank.bgColor }}
        >
          <p className="text-5xl mb-2">{rank.emoji}</p>
          <p className="text-2xl font-black" style={{ color: rank.color }}>{rank.divisionName}</p>
          <p className="text-slate-400 text-sm mt-1 font-mono">{elo} ELO</p>

          {/* Progress bar */}
          <div className="mt-4 px-4">
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>{rank.divisionMin}</span>
              <span>{rank.divisionMax}</span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${rank.progress * 100}%`,
                  background: `linear-gradient(90deg, ${rank.color}80, ${rank.color})`,
                  boxShadow: `0 0 8px ${rank.color}`,
                }}
              />
            </div>
            <p className="text-xs text-slate-600 mt-1 text-right">
              {elo - rank.divisionMin} / {rank.divisionMax - rank.divisionMin} to next
            </p>
          </div>
        </div>

        {/* Rank Road — Clash Royale style */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">Rank Road</h2>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-white/5" />

            <div className="space-y-1">
              {[...divisions].reverse().map((div, revIdx) => {
                const idx = divisions.length - 1 - revIdx
                const isCurrentDivision = elo >= div.min && elo < div.max
                const isPast = elo >= div.max
                const isFuture = elo < div.min

                return (
                  <div
                    key={div.name}
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      isCurrentDivision
                        ? 'bg-white/5 border border-white/10'
                        : 'opacity-60'
                    }`}
                  >
                    {/* Node */}
                    <div
                      className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                      style={{
                        background: isPast ? div.color + '30' : isCurrentDivision ? div.color + '20' : 'transparent',
                        border: `1.5px solid ${isPast || isCurrentDivision ? div.color : '#1e293b'}`,
                        boxShadow: isCurrentDivision ? `0 0 12px ${div.color}60` : undefined,
                      }}
                    >
                      {isPast ? '✓' : isCurrentDivision ? div.emoji : <span style={{ color: '#334155' }}>{div.emoji}</span>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold text-sm"
                        style={{ color: isCurrentDivision ? div.color : isPast ? div.color + 'cc' : '#334155' }}
                      >
                        {div.name}
                        {isCurrentDivision && <span className="ml-2 text-xs font-normal text-slate-500">← You are here</span>}
                      </p>
                      <p className="text-xs text-slate-600">{div.min} – {div.max} ELO</p>
                    </div>

                    {/* ELO badge for current */}
                    {isCurrentDivision && (
                      <div
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: div.color + '20', color: div.color }}
                      >
                        {elo}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tier list */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">All Tiers</h2>
          <div className="card border-white/5 divide-y divide-white/5 p-0 overflow-hidden">
            {[
              { name: 'Bronze',   emoji: '🥉', color: '#cd7f32', range: '0 – 2,000'      },
              { name: 'Silver',   emoji: '🥈', color: '#94a3b8', range: '2,000 – 3,500'  },
              { name: 'Gold',     emoji: '🥇', color: '#f59e0b', range: '3,500 – 5,000'  },
              { name: 'Diamond',  emoji: '💎', color: '#38bdf8', range: '5,000 – 7,000'  },
              { name: 'Emerald',  emoji: '💚', color: '#10b981', range: '7,000 – 10,000' },
              { name: 'Champion', emoji: '👑', color: '#a855f7', range: '10,000+',  note: 'Unlimited I, II, III…' },
            ].map(t => (
              <div key={t.name} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{t.emoji}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: t.color }}>{t.name}</p>
                  {t.note && <p className="text-xs text-slate-600">{t.note}</p>}
                </div>
                <p className="text-xs text-slate-500 font-mono">{t.range}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-700 text-center pb-4">
          Divisions advance every 1,000 ELO within each tier. ELO cannot drop below 0.
        </p>
      </div>
    </div>
  )
}
