import type { Board, Cell, PlayerSymbol, MoveResult, WinResult } from '@/types'

export const BOARD_SIZE = 9
export const WIN_LENGTH = 4

/** Create a fresh empty 9×9 board */
export function createBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<Cell>(BOARD_SIZE).fill(null)
  )
}

/**
 * Drop a piece into a column.
 * Rotation rule: if piece lands directly on top of an OPPONENT's piece, rotate.
 */
export function dropPiece(
  board: Board,
  col: number,
  symbol: PlayerSymbol
): MoveResult {
  if (col < 0 || col >= BOARD_SIZE) {
    return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
  }

  let rowLanded = -1
  for (let r = BOARD_SIZE - 1; r >= 0; r--) {
    if (board[r][col] === null) { rowLanded = r; break }
  }

  if (rowLanded === -1) {
    return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
  }

  const newBoard: Board = board.map(row => [...row])
  newBoard[rowLanded][col] = symbol

  const pieceBelow = rowLanded < BOARD_SIZE - 1 ? newBoard[rowLanded + 1][col] : null
  const causedRotation = pieceBelow !== null && pieceBelow !== symbol

  return { newBoard, rowLanded, causedRotation, isValid: true }
}


/**
 * Rotate 90° clockwise. Pieces STICK to whatever surface they're on —
 * no gravity is applied. Pieces only fall when newly dropped (via dropPiece).
 * Formula: rotated[j][N-1-i] = original[i][j]
 */
export function rotateBoard(board: Board): Board {
  const N = BOARD_SIZE
  const rotated: Board = Array.from({ length: N }, () => Array<Cell>(N).fill(null))
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      rotated[j][N - 1 - i] = board[i][j]
    }
  }
  return rotated
}

/** Check if a given symbol has 4 in a row anywhere on the board. */
export function checkWin(board: Board, symbol: PlayerSymbol): WinResult {
  const N = BOARD_SIZE
  const W = WIN_LENGTH

  for (let r = 0; r < N; r++) {
    for (let c = 0; c <= N - W; c++) {
      if (Array.from({ length: W }, (_, i) => board[r][c + i]).every(v => v === symbol)) {
        return { hasWon: true, winner: symbol, winningCells: Array.from({ length: W }, (_, i) => [r, c + i] as [number, number]) }
      }
    }
  }
  for (let r = 0; r <= N - W; r++) {
    for (let c = 0; c < N; c++) {
      if (Array.from({ length: W }, (_, i) => board[r + i][c]).every(v => v === symbol)) {
        return { hasWon: true, winner: symbol, winningCells: Array.from({ length: W }, (_, i) => [r + i, c] as [number, number]) }
      }
    }
  }
  for (let r = 0; r <= N - W; r++) {
    for (let c = 0; c <= N - W; c++) {
      if (Array.from({ length: W }, (_, i) => board[r + i][c + i]).every(v => v === symbol)) {
        return { hasWon: true, winner: symbol, winningCells: Array.from({ length: W }, (_, i) => [r + i, c + i] as [number, number]) }
      }
    }
  }
  for (let r = 0; r <= N - W; r++) {
    for (let c = W - 1; c < N; c++) {
      if (Array.from({ length: W }, (_, i) => board[r + i][c - i]).every(v => v === symbol)) {
        return { hasWon: true, winner: symbol, winningCells: Array.from({ length: W }, (_, i) => [r + i, c - i] as [number, number]) }
      }
    }
  }
  return { hasWon: false }
}

/** Board is full only when every column has no empty cells at all */
export function isBoardFull(board: Board): boolean {
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (getLandingRow(board, c) !== -1) return false
  }
  return true
}

export function getValidColumns(board: Board): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, c) => c).filter(c => getLandingRow(board, c) !== -1)
}

/** Get the row where a piece would land if dropped in this column (-1 if full) */
export function getLandingRow(board: Board, col: number): number {
  for (let r = BOARD_SIZE - 1; r >= 0; r--) {
    if (board[r][col] === null) return r
  }
  return -1
}
