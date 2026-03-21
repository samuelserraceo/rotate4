export type PlayerSymbol = 'X' | 'O' | 'W' | 'M'
export type Cell = PlayerSymbol | null
export type Board = Cell[][]

export type GameMode =
  | 'competitive_1v1'
  | 'competitive_4p'
  | 'hosted_1v1'
  | 'hosted_4p'

export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned'

export interface Profile {
  id: string
  username: string
  email?: string
  elo: number
  elo_1v1: number
  elo_4p: number
  coins: number
  games_played: number
  games_won: number
  equipped_skin_id?: string
  created_at: string
  updated_at: string
}

export interface Skin {
  id: string
  name: string
  description?: string
  color: string
  glow_color: string
  price: number
  is_default: boolean
}

export interface OwnedSkin {
  id: string
  profile_id: string
  skin_id: string
  purchased_at: string
  skins?: Skin
}

export interface Game {
  id: string
  mode: GameMode
  status: GameStatus
  board_state: Board
  current_turn_index: number
  rotation_count: number
  winner_id?: string
  host_id?: string
  join_code?: string
  max_players: number
  created_at: string
  completed_at?: string
}

export interface GamePlayer {
  id: string
  game_id: string
  profile_id: string
  symbol: PlayerSymbol
  player_index: number
  elo_before?: number
  elo_after?: number
  elo_change?: number
  coins_earned: number
  placement?: number
  profiles?: Profile
}

export interface GameMove {
  id: string
  game_id: string
  profile_id: string
  move_number: number
  column_index: number
  row_landed: number
  caused_rotation: boolean
  board_state_after?: Board
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'blocked'
  created_at: string
  requester?: Profile
  addressee?: Profile
}

export interface GameInvite {
  id: string
  game_id: string
  from_profile_id: string
  to_profile_id: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  created_at: string
  from_profile?: Profile
  games?: Game
}

export interface MoveResult {
  newBoard: Board
  rowLanded: number
  causedRotation: boolean
  isValid: boolean
}

export interface WinResult {
  hasWon: boolean
  winner?: PlayerSymbol
  winningCells?: [number, number][]
}

// Economy constants — hosted games give no rewards (handled in game page)
export const COIN_REWARDS = {
  competitive_1v1: { win: 150, loss: 30 },
  competitive_4p:  { 1: 300, 2: 100, 3: 50,  4: 20 },
} as const

export const ELO_CONFIG = {
  starting: 1200,
  win_reward: 150,
  loss_penalty: 115,
} as const

// Symbol → corner position for display
export const SYMBOL_CORNERS: Record<PlayerSymbol, string> = {
  X: 'bottom-left',
  O: 'top-right',
  W: 'top-left',
  M: 'bottom-right',
}

export const SYMBOL_COLORS: Record<PlayerSymbol, { color: string; glow: string }> = {
  X: { color: '#00f5ff', glow: '#00f5ff' },
  O: { color: '#a855f7', glow: '#a855f7' },
  W: { color: '#f97316', glow: '#f97316' },
  M: { color: '#22c55e', glow: '#22c55e' },
}
