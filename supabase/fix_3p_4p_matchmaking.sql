-- ============================================================
-- FIX: Enable 3P/4P matchmaking + larger board support
-- Run this in Supabase SQL Editor (once)
-- Date: 2026-03-28
-- ============================================================

-- 1. ADD MISSING ELO COLUMNS TO PROFILES
--    (Skip if already added — IF NOT EXISTS handles this)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='elo_1v1') THEN
    ALTER TABLE profiles ADD COLUMN elo_1v1 INTEGER NOT NULL DEFAULT 1200;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='elo_3p') THEN
    ALTER TABLE profiles ADD COLUMN elo_3p INTEGER NOT NULL DEFAULT 1200;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='elo_4p') THEN
    ALTER TABLE profiles ADD COLUMN elo_4p INTEGER NOT NULL DEFAULT 1200;
  END IF;
END $$;

-- 2. FIX games.mode CHECK CONSTRAINT
--    Drop old constraint, add new one with ALL valid modes
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_mode_check;
ALTER TABLE games ADD CONSTRAINT games_mode_check
  CHECK (mode IN (
    'competitive_1v1', 'competitive_3p', 'competitive_4p',
    'hosted_1v1', 'hosted_3p', 'hosted_4p',
    'casual_1v1', 'casual_4p'
  ));

-- 3. FIX matchmaking_queue.mode CHECK CONSTRAINT
--    Drop old constraint, add new one with 3p
ALTER TABLE matchmaking_queue DROP CONSTRAINT IF EXISTS matchmaking_queue_mode_check;
ALTER TABLE matchmaking_queue ADD CONSTRAINT matchmaking_queue_mode_check
  CHECK (mode IN ('1v1', '3p', '4p'));

-- 4. FIX game_moves COLUMN/ROW CONSTRAINTS FOR LARGER BOARDS
--    3P = 11x11 (cols/rows 0-10), 4P = 13x13 (cols/rows 0-12)
ALTER TABLE game_moves DROP CONSTRAINT IF EXISTS game_moves_column_index_check;
ALTER TABLE game_moves ADD CONSTRAINT game_moves_column_index_check
  CHECK (column_index BETWEEN 0 AND 12);

ALTER TABLE game_moves DROP CONSTRAINT IF EXISTS game_moves_row_landed_check;
ALTER TABLE game_moves ADD CONSTRAINT game_moves_row_landed_check
  CHECK (row_landed BETWEEN 0 AND 12);

-- 5. FIX matchmaking_queue RLS: players must read ALL queue entries to find matches
--    (Without this, each player can only see their own row — matchmaking can't work)
DROP POLICY IF EXISTS "matchmaking_read_own" ON matchmaking_queue;
DROP POLICY IF EXISTS "matchmaking_read_all" ON matchmaking_queue;
CREATE POLICY "matchmaking_read_all" ON matchmaking_queue
  FOR SELECT USING (true);

-- 6. ADD matchmaking_queue UPDATE policy for upsert support
--    (upsert = INSERT ON CONFLICT UPDATE — needs UPDATE privilege on own row)
DROP POLICY IF EXISTS "matchmaking_update_own" ON matchmaking_queue;
CREATE POLICY "matchmaking_update_own" ON matchmaking_queue
  FOR UPDATE USING (auth.uid() = profile_id);

-- ============================================================
-- VERIFICATION: Run these queries to confirm fixes applied
-- ============================================================

-- Check constraints are correct:
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid IN ('games'::regclass, 'matchmaking_queue'::regclass, 'game_moves'::regclass)
  AND contype = 'c'
ORDER BY conrelid::text, conname;

-- Check profiles has ELO columns:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name IN ('elo_1v1', 'elo_3p', 'elo_4p');

-- Check matchmaking_queue RLS policies:
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'matchmaking_queue';
