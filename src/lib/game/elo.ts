import { ELO_CONFIG } from '@/types'

/**
 * Standard ELO expected score for player A against player B.
 */
function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
}

/**
 * K-factor based on number of games played.
 */
function kFactor(gamesPlayed: number): number {
  return gamesPlayed < ELO_CONFIG.new_threshold ? ELO_CONFIG.k_new : ELO_CONFIG.k_established
}

/**
 * Calculate ELO changes for a 1v1 match.
 * @returns [newEloWinner, newEloLoser, changeWinner, changeLoser]
 */
export function calculate1v1Elo(
  winnerElo: number,
  loserElo: number,
  winnerGames: number,
  loserGames: number
): [number, number, number, number] {
  const expected = expectedScore(winnerElo, loserElo)
  const kW = kFactor(winnerGames)
  const kL = kFactor(loserGames)

  const changeWinner = Math.round(kW * (1 - expected))
  const changeLoser  = Math.round(kL * (0 - (1 - expected)))

  return [
    winnerElo + changeWinner,
    loserElo + changeLoser,
    changeWinner,
    changeLoser,
  ]
}

/**
 * Calculate ELO changes for a 4-player match.
 * Each player is compared pairwise against all others.
 * Placement: 1 = winner, 4 = last.
 *
 * Score for each pairing: win=1, loss=0.
 * Final ELO change is the average of pairwise results.
 *
 * @param players Array of { elo, gamesPlayed } in order of placement (index 0 = 1st place)
 * @returns Array of { newElo, change } in same order
 */
export function calculate4pElo(
  players: Array<{ elo: number; gamesPlayed: number }>
): Array<{ newElo: number; change: number }> {
  const n = players.length
  const changes = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const expectedI = expectedScore(players[i].elo, players[j].elo)
      const expectedJ = 1 - expectedI
      const kI = kFactor(players[i].gamesPlayed)
      const kJ = kFactor(players[j].gamesPlayed)

      // i placed before j so i "won" this pairing
      changes[i] += Math.round(kI * (1 - expectedI))
      changes[j] += Math.round(kJ * (0 - expectedJ))
    }
  }

  return players.map((p, i) => ({
    newElo: Math.max(100, p.elo + changes[i]), // floor at 100
    change: changes[i],
  }))
}
