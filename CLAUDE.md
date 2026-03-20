# CLAUDE.md — Rotate4 Project Context

Read this file at the start of every new Claude session for this project.
Then read SESSION_REGISTER.md and INDEX.md at the mnt root.

## What This Project Is
Rotate4 is a multiplayer web game — a twist on Connect 4 on a 9×9 board.
Placing a piece directly on top of an opponent's piece rotates the board 90° clockwise.
Built with Next.js 14, Tailwind CSS, TypeScript, and Supabase (auth + DB + Realtime).

## Where Everything Lives
- Project folder: C:\Users\kinga\OneDrive\Desktop\Alex Claud\rotate4\
- Session register: mnt/SESSION_REGISTER.md
- Index: mnt/INDEX.md
- Supabase project: https://bkzjgrjdaibgdiwvcrpp.supabase.co

## Key Technical Decisions
- Game logic is fully client-side (dropPiece, rotateBoard, checkWin in src/lib/game/board.ts)
- Real-time sync uses Supabase Realtime postgres_changes on the games table
- Auth is Google OAuth only via Supabase
- Matchmaking uses a polling approach (every 2s) on matchmaking_queue table
- Board state is stored as JSONB in the games table
- ELO is updated at game end by the client that triggered the win (first mover principle)

## Game Mechanic Reference
- Clockwise rotation formula: new[i][j] = old[N-1-j][i] where N=9
- After rotation: old bottom row → new leftmost column (west)
- Win condition: 4 in a row (horiz/vert/diag) — checked BEFORE and AFTER rotation
- Symbols: X (cyan), O (purple), W (green), M (amber)
- Symbol corners: X=bottom-left, O=top-right, W=top-left, M=bottom-right

## Economy
- Competitive win: 150 coins | loss: 30
- Casual win: 75 coins | loss: 15
- Basic skins: 500 coins | Premium skins: 1500 coins

## DO NOT
- Do not change the rotation formula without testing thoroughly
- Do not remove RLS policies from Supabase tables
- Do not change the symbol-to-corner mapping (it's used in multiple places)
- Do not add server-side move validation without reviewing the current client flow first
