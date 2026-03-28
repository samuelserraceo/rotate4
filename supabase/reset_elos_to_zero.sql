-- ============================================================
-- RESET ALL ELOs TO 0
-- Run this in Supabase SQL Editor (once)
-- Date: 2026-03-28
-- ============================================================

-- Reset all ELO columns to 0 for every profile
UPDATE profiles SET
  elo = 0,
  elo_1v1 = 0,
  elo_3p = 0,
  elo_4p = 0;

-- Verify the reset
SELECT id, username, elo, elo_1v1, elo_3p, elo_4p
FROM profiles
ORDER BY username
LIMIT 20;
