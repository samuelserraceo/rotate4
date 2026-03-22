import type { Board, Cell, PlayerSymbol, MoveResult, WinResult } from '@/types'

export const BOARD_SIZE = 9
export const WIN_LENGTH = 4

/** Create a fresh empty N×N board. Size defaults to 9 (1v1). Pass 11 for 3P, 13 for 4P. */
export function createBoard(size: number = BOARD_SIZE): Board {
  return Array.from({ length: size }, () =>
    Array<Cell>(size).fill(null)
  )
}

/**
 * Get ALL valid landing rows in a column.
 * A cell is a valid landing position if:
 *   1. It is empty (null)
 *   2. Either it is the bottom row, OR the cell directly below is occupied
 * This supports "ledge" placement after board rotations.
 */
export function getValidLandingRows(board: Board, col: number): number[] {
  const N = board.length
  if (col < 0 || col >= N) return []
  const rows: number[] = []
  for (let r = 0; r < N; r++) {
    if (board[r][col] !== null) continue
    if (r === N - 1 || board[r + 1][col] !== null) {
      rows.push(r)
    }
  }
  return rows
}

/**
 * Drop a piece into a column, optionally at a specific target row (ledge).
 * Rotation rule: if piece lands directly on top of an OPPONENT's piece, rotate.
 *
 * @param targetRow - If provided, place at this specific row (must be a valid landing position).
 *                    If omitted, falls to lowest empty cell (backward compatible).
 */
export function dropPiece(
  board: Board,
  col: number,
  symbol: PlayerSymbol,
  targetRow?: number
): MoveResult {
  const N = board.length
  if (col < 0 || col >= N) {
    return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
  }

  let rowLanded: number

  if (targetRow !== undefined) {
    if (
      targetRow < 0 || targetRow >= N ||
      board[targetRow][col] !== null
    ) {
      return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
    }
    if (targetRow < N - 1 && board[targetRow + 1][col] === null) {
      return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
    }
    rowLanded = targetRow
  } else {
    rowLanded = -1
    for (let r = N - 1; r >= 0; r--) {
      if (board[r][col] === null) { rowLanded = r; break }
    }
    if (rowLanded === -1) {
      return { newBoard: board, rowLanded: -1, causedRotation: false, isValid: false }
    }
  }

  const newBoard: Board = board.map(row => [...row])
  newBoard[rowLanded][col] = symbol

  const pieceBelow = rowLanded < N - 1 ? newBoard[rowLanded + 1][col] : null
  const causedRotation = pieceBelow !== null && pieceBelow !== symbol

  return { newBoard, rowLanded, causedRotation, isValid: true }
}


/**
 * Rotate 90° clockwise. Pieces STICK to whatever surface they're on —
 * no gravity is applied. Pieces only fall when newly dropped (via dropPiece).
 * Formula: rotated[j][N-1-i] = original[i][j]
 */
export function rotateBoard(board: Board): Board {
  const N = board.length
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
  const N = board.length
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
  const N = board.length
  for (let c = 0; c < N; c++) {
    if (getLandingRow(board, c) !== -1) return false
  }
  return true
}

export function getValidColumns(board: Board): number[] {
  const N = board.length
  return Array.from({ length: N }, (_, c) => c).filter(c => getLandingRow(board, c) !== -1)
}

/** Get the row where a piece would land if dropped in this column (-1 if full) */
export function getLandingRow(board: Board, col: number): number {
  const N = board.length
  for (let r = N - 1; r >= 0; r--) {
    if (board[r][col] === null) return r
  }
  return -1
}
