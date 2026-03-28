-- ============================================================
-- ADD 3 ULTRA SKINS: Sakura Petals, Ocean Depths, Space Nebula
-- Run this in Supabase SQL Editor (once)
-- Date: 2026-03-28
-- ============================================================

-- Sakura Petals — soft cherry-blossom pink with warm glow
INSERT INTO skins (name, description, color, glow_color, price, is_default)
VALUES (
  'Sakura Petals',
  'Delicate cherry blossom pink with a warm petal glow',
  '#fda4af',
  '#e879a2',
  2000,
  false
)
ON CONFLICT DO NOTHING;

-- Ocean Depths — deep aqua-teal with sea-green luminescence
INSERT INTO skins (name, description, color, glow_color, price, is_default)
VALUES (
  'Ocean Depths',
  'Deep aqua-teal waves with shimmering sea-green light',
  '#06b6d4',
  '#0891b2',
  2000,
  false
)
ON CONFLICT DO NOTHING;

-- Space Nebula — vibrant violet-indigo with cosmic purple glow
INSERT INTO skins (name, description, color, glow_color, price, is_default)
VALUES (
  'Space Nebula',
  'Vibrant cosmic violet with swirling nebula glow',
  '#a5b4fc',
  '#818cf8',
  2000,
  false
)
ON CONFLICT DO NOTHING;

-- Verify the new skins
SELECT id, name, color, glow_color, price
FROM skins
ORDER BY price DESC, name;
