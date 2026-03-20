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
 * Returns the new board, the row it landed on, and whether rotation was triggered.
 *
 * Rotation rule: if the piece lands directly on top of an OPPONENT's piece
 * (i.e. the cell immediately below is occupied by a different symbol), rotate.
 */
export function dropPiece(
  board: Board,
  col: number,
  symbol: PlayerSymbol
): MoveResult {
  if (col < 0 || col >= BOARD_SIZE) {
    return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
  }

  // Find lowest empty row in this column (gravity → row BOARD_SIZE-1)
  let rowLanded = -1
  for (let r = BOARD_SIZE - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      rowLanded = r
      break
    }
  }

  if (rowLanded === -1) {
    // Column is full
    return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
  }

  // Place the piece
  const newBoard: Board = board.map(row => [...row])
  newBoard[rowLanded][col] = symbol

  // Check rotation trigger: piece below is an opponent's piece
  const pieceBelow = rowLanded < BOARD_SIZE - 1 ? newBoard[rowLanded + 1][col] : null
  const causedRotation = pieceBelow !== null && pieceBelow !== symbol

  return { newBoard, rowLanded, causedRotation, isValid: true }
}

/**
 * Rotate the board 90° clockwise.
 *
 * Formula: new[i][j] = old[N-1-j][i]
 *
 * What was the bottom row (row N-1) becomes the leftmost column (col 0).
 * So pieces that were on the bottom are now on the left ("west") side — matching
 * the game rule: "bottom is now on the west".
 *
 * After rotation, gravity still pulls toward row N-1 (the visual bottom),
 * so the next piece dropped falls onto whatever is now at the bottom
 * (what was the left side before rotation).
 */
export function rotateBoard(board: Board): Board {
  const N = BOARD_SIZE
  const newBoard: Board = Array.from({ length: N }, () => Array<Cell>(N).fill(null))
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      newBoard[j][N - 1 - i] = board[i][j]
    }
  }
  return newBoard
}

/**
 * Check if a given symbol has 4 in a row anywhere on the board.
 * Returns the winning cells if found.
 */
export function checkWin(board: Board, symbol: PlayerSymbol): WinResult {
  const N = BOARD_SIZE
  const W = WIN_LENGTH

  // Check horizontal
  for (let r = 0; r < N; r++) {
    for (let c = 0; c <= N - W; c++) {
      if (Array.from({ length: W }, (_, i) => board[r][c + i]).every(v => v === symbol)) {
        return {
          hasWon: true,
          winner: symbol,
          winningCells: Array.from({ length: W }, (_, i) => [r, c + i] as [number, number]),
        }
      }
    }
  }

  // Check vertical
  for (let r = 0; r <= N - W; r++) {
    for (let c = 0; c < N; c++) {
      if (Array.from({ length: W }, (_, i) => board[r + i][c]).every(v => v === symbol)) {
        return {
          hasWon: true,
          winner: symbol,
          winningCells: Array.from({ length: W }, (_, i) => [r + i, c] as [number, number]),
        }
      }
    }
  }

  // Check diagonal ↘
  for (let r = 0; r <= N - W; r++) {
    for (let c = 0; c <= N - W; c++) {
      if (Array.from({ length: W }, (_, i) => board[r + i][c + i]).every(v => v === symbol)) {
        return {
          hasWon: true,
          winner: symbol,
          winningCells: Array.from({ length: W }, (_, i) => [r + i, c + i] as [number, number]),
        }
      }
    }
  }

  // Check diagonal ↙
  for (let r = 0; r <= N - W; r++) {
    for (let c = W - 1; c < N; c++) {
      if (Array.from({ length: W }, (_, i) => board[r + i][c - i]).every(v => v === symbol)) {
        return {
          hasWon: true,
          winner: symbol,
          winningCells: Array.from({ length: W }, (_, i) => [r + i, c - i] as [number, number]),
        }
      }
    }
  }

  return { hasWon: false }
}

/**
 * Check if the board is completely full (draw condition).
 */
export function isBoardFull(board: Board): boolean {
  return board[0].every(cell => cell !== null)
}

/**
 * Get the valid column indices (columns that are not full).
 */
export function getValidColumns(board: Board): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, c) => c).filter(
    c => board[0][c] === null
  )
}
