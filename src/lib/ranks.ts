export interface Rank {
  tier: string
  division: number
  divisionName: string
  color: string
  glow: string
  bgColor: string
  emoji: string
  progress: number   // 0-1 within this division
  divisionMin: number
  divisionMax: number
  tierMin: number
  tierMax: number | null
}

export const TIERS = [
  { name: 'Bronze',   emoji: '🥉', color: '#cd7f32', glow: '#cd7f3240', bg: '#cd7f3210', min: 0,     max: 2000  },
  { name: 'Silver',   emoji: '🥈', color: '#94a3b8', glow: '#94a3b840', bg: '#94a3b810', min: 2000,  max: 3500  },
  { name: 'Gold',     emoji: '🥇', color: '#f59e0b', glow: '#f59e0b40', bg: '#f59e0b10', min: 3500,  max: 5000  },
  { name: 'Diamond',  emoji: '💎', color: '#38bdf8', glow: '#38bdf840', bg: '#38bdf810', min: 5000,  max: 7000  },
  { name: 'Emerald',  emoji: '💚', color: '#10b981', glow: '#10b98140', bg: '#10b98110', min: 7000,  max: 10000 },
  { name: 'Champion', emoji: '👑', color: '#a855f7', glow: '#a855f740', bg: '#a855f710', min: 10000, max: null  },
] as const

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X',
                'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX']

export function romanNumeral(n: number): string {
  return ROMAN[n - 1] ?? `${n}`
}

export function getRank(elo: number): Rank {
  const safeElo = Math.max(0, elo)

  for (const tier of TIERS) {
    const inTier = tier.max === null ? safeElo >= tier.min : safeElo >= tier.min && safeElo < tier.max
    if (!inTier) continue

    const divisionNumber  = Math.floor((safeElo - tier.min) / 1000) + 1
    const divisionMin     = tier.min + (divisionNumber - 1) * 1000
    const divisionMax     = tier.max !== null
      ? Math.min(tier.max, divisionMin + 1000)
      : divisionMin + 1000

    const progress = Math.max(0, Math.min(1, (safeElo - divisionMin) / (divisionMax - divisionMin)))

    return {
      tier:         tier.name,
      division:     divisionNumber,
      divisionName: `${tier.name} ${romanNumeral(divisionNumber)}`,
      color:        tier.color,
      glow:         tier.glow,
      bgColor:      tier.bg,
      emoji:        tier.emoji,
      progress,
      divisionMin,
      divisionMax,
      tierMin:      tier.min,
      tierMax:      tier.max ?? null,
    }
  }

  return getRank(0) // fallback
}

/** All divisions for the rank road display */
export function getAllDivisions(): Array<{ name: string; emoji: string; color: string; min: number; max: number; tier: string }> {
  const divisions: Array<{ name: string; emoji: string; color: string; min: number; max: number; tier: string }> = []
  for (const tier of TIERS) {
    const tierMax = tier.max ?? (tier.min + 5000) // show 5 champion divisions by default
    let div = 1
    let cursor = tier.min
    while (cursor < tierMax) {
      const divMax = Math.min(cursor + 1000, tierMax)
      divisions.push({
        name: `${tier.name} ${romanNumeral(div)}`,
        emoji: tier.emoji,
        color: tier.color,
        min: cursor,
        max: divMax,
        tier: tier.name,
      })
      cursor += 1000
      div++
      // For Champion, show 5 divisions then stop
      if (tier.max === null && div > 5) break
    }
  }
  return divisions
}
