import { ELO_CONFIG } from '@/types'

/**
 * Calculate ELO changes for a 1v1 match (flat rewards).
 * Winner gains ELO_CONFIG.win_reward, loser loses ELO_CONFIG.loss_penalty.
 * @returns [newEloWinner, newEloLoser, changeWinner, changeLoser]
 */
export function calculate1v1Elo(
  winnerElo: number,
  loserElo: number,
  _winnerGames: number,
  _loserGames: number
): [number, number, number, number] {
  const changeWinner =  ELO_CONFIG.win_reward
  const changeLoser  = -ELO_CONFIG.loss_penalty

  return [
    Math.max(0, winnerElo + changeWinner),
    Math.max(0, loserElo  + changeLoser),
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
