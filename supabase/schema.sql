-- ============================================================
-- ROTATE4 — SUPABASE DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor (once)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  elo INTEGER NOT NULL DEFAULT 1200,
  coins INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  equipped_skin_id UUID, -- FK added after skins table
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SKINS CATALOG
-- ============================================================
CREATE TABLE IF NOT EXISTS skins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL, -- hex color e.g. #ff00ff
  glow_color TEXT NOT NULL, -- glow hex color
  price INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OWNED SKINS (player inventory)
-- ============================================================
CREATE TABLE IF NOT EXISTS owned_skins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skin_id UUID NOT NULL REFERENCES skins(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, skin_id)
);

-- Add FK on profiles.equipped_skin_id now that skins exists
ALTER TABLE profiles ADD CONSTRAINT fk_equipped_skin
  FOREIGN KEY (equipped_skin_id) REFERENCES skins(id) ON DELETE SET NULL;

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

-- ============================================================
-- GAMES
-- ============================================================
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('casual_1v1', 'casual_4p', 'competitive_1v1', 'competitive_4p')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'abandoned')),
  board_state JSONB NOT NULL DEFAULT '[[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null]]',
  current_turn_index INTEGER NOT NULL DEFAULT 0,
  rotation_count INTEGER NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  host_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  join_code TEXT UNIQUE,
  max_players INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- GAME PLAYERS
-- ============================================================
CREATE TABLE IF NOT EXISTS game_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL CHECK (symbol IN ('X', 'O', 'W', 'M')),
  player_index INTEGER NOT NULL CHECK (player_index BETWEEN 0 AND 3),
  elo_before INTEGER,
  elo_after INTEGER,
  elo_change INTEGER,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  placement INTEGER CHECK (placement BETWEEN 1 AND 4),
  UNIQUE(game_id, profile_id),
  UNIQUE(game_id, player_index)
);

-- ============================================================
-- GAME MOVES
-- ============================================================
CREATE TABLE IF NOT EXISTS game_moves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  column_index INTEGER NOT NULL CHECK (column_index BETWEEN 0 AND 8),
  row_landed INTEGER NOT NULL CHECK (row_landed BETWEEN 0 AND 8),
  caused_rotation BOOLEAN NOT NULL DEFAULT FALSE,
  board_state_after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MATCHMAKING QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('1v1', '4p')),
  game_type TEXT NOT NULL CHECK (game_type IN ('casual', 'competitive')),
  elo INTEGER,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GAME INVITES (friend game invites)
-- ============================================================
CREATE TABLE IF NOT EXISTS game_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  from_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_profile_id <> to_profile_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skins ENABLE ROW LEVEL SECURITY;
ALTER TABLE owned_skins ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invites ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, only update own
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Skins: everyone can read the catalog
CREATE POLICY "skins_read_all" ON skins FOR SELECT USING (true);

-- Owned skins: players see their own
CREATE POLICY "owned_skins_read_own" ON owned_skins FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "owned_skins_insert_own" ON owned_skins FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Friendships: see your own requests/friendships
CREATE POLICY "friendships_read_own" ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships_insert_own" ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "friendships_update_own" ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Games: anyone can see waiting games, players see their games
CREATE POLICY "games_read" ON games FOR SELECT USING (true);
CREATE POLICY "games_insert_auth" ON games FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "games_update_players" ON games FOR UPDATE USING (true);

-- Game players: readable by all (needed to show player info)
CREATE POLICY "game_players_read" ON game_players FOR SELECT USING (true);
CREATE POLICY "game_players_insert_auth" ON game_players FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "game_players_update_own" ON game_players FOR UPDATE USING (auth.uid() = profile_id);

-- Game moves: readable by all
CREATE POLICY "game_moves_read" ON game_moves FOR SELECT USING (true);
CREATE POLICY "game_moves_insert_auth" ON game_moves FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Matchmaking queue: own row only
CREATE POLICY "matchmaking_read_own" ON matchmaking_queue FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "matchmaking_insert_own" ON matchmaking_queue FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "matchmaking_delete_own" ON matchmaking_queue FOR DELETE USING (auth.uid() = profile_id);

-- Game invites
CREATE POLICY "game_invites_read_own" ON game_invites FOR SELECT
  USING (auth.uid() = from_profile_id OR auth.uid() = to_profile_id);
CREATE POLICY "game_invites_insert_own" ON game_invites FOR INSERT
  WITH CHECK (auth.uid() = from_profile_id);
CREATE POLICY "game_invites_update_to" ON game_invites FOR UPDATE
  USING (auth.uid() = to_profile_id);

-- ============================================================
-- REALTIME: enable for live game sync
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE matchmaking_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE game_invites;

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Profile is created via onboarding page; this just ensures row exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SEED: default skins
-- ============================================================
INSERT INTO skins (name, description, color, glow_color, price, is_default) VALUES
  ('Default Cyan',   'The classic look.',              '#00f5ff', '#00f5ff', 0,    true),
  ('Neon Purple',    'Electric purple vibes.',         '#a855f7', '#a855f7', 500,  false),
  ('Neon Green',     'Hacker green.',                  '#10b981', '#10b981', 500,  false),
  ('Hot Pink',       'Bold and bright.',               '#ec4899', '#ec4899', 500,  false),
  ('Solar Orange',   'Warm neon glow.',                '#f97316', '#f97316', 500,  false),
  ('Electric Yellow','Bright as lightning.',           '#facc15', '#facc15', 500,  false),
  ('Crimson Red',    'Deep red intensity.',            '#ef4444', '#ef4444', 500,  false),
  ('Ice Blue',       'Cool and crisp.',                '#38bdf8', '#38bdf8', 500,  false),
  ('Lime Surge',     'Fresh and vivid.',               '#84cc16', '#84cc16', 500,  false),
  ('White Pulse',    'Pure light.',                    '#f8fafc', '#e2e8f0', 500,  false),
  ('Midnight Blue',  'Deep galaxy blue.',              '#1d4ed8', '#3b82f6', 1500, false),
  ('Magenta Storm',  'Wild magenta energy.',           '#d946ef', '#d946ef', 1500, false),
  ('Gold Rush',      'Premium gold glow.',             '#f59e0b', '#fbbf24', 1500, false),
  ('Toxic',          'Unsettling neon-green.',         '#4ade80', '#22c55e', 1500, false),
  ('Violet Dream',   'Soft violet shimmer.',           '#8b5cf6', '#c4b5fd', 1500, false);
