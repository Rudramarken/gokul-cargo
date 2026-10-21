/*
# Trip Stops and Load-to-Stop Relationships

## Overview
Introduces multi-stop route support for trips and allows each LR/Bilty to be
linked to specific loading and unloading stops on the journey. This enables
the real-world scenario where a single truck carries multiple consignments
that are picked up and dropped off at different stops along the route
(e.g. Yamunanagar -> Delhi -> Kali Aam, with LR-001 unloaded in Delhi and
LR-002 continuing to Kali Aam).

## New Tables
1. `trip_stops`
   - Ordered list of stops for a journey leg.
   - Each stop has a sequence number, location, stop type (loading / unloading /
     both / intermediate), optional expected & actual arrival/departure times,
     a status (planned / arrived / completed / skipped), and notes.
   - Scoped to a business and a trip. Cascades on trip deletion.

## Modified Tables
1. `trips`
   - Adds `journey_type` text column: 'single' | 'multi_stop' | 'round_trip'.
     Defaults to 'single'. Distinct from the existing `journey_direction`
     (which tracks up/down/return/single leg direction within a round trip).
2. `lr_bilties`
   - Adds `loading_stop_id` and `unloading_stop_id` nullable foreign keys to
     `trip_stops`. These are optional: an LR/Bilty can still be created without
     any stop association, and can be linked later. The existing
     `loading_point` / `delivery_point` text fields are preserved for backward
     compatibility and free-text entry.

## Security
- RLS enabled on `trip_stops` with the standard business-member CRUD pattern
  (SELECT/INSERT/UPDATE for any member; DELETE restricted to owner/admin).
- All other tables retain their existing policies — no changes.

## Important Notes
1. Fully backward compatible: existing trips keep their single origin/destination
   text fields and remain valid. `journey_type` defaults to 'single'.
2. Existing LR/Bilties remain valid with their text loading/delivery points;
   the new stop links are optional.
3. No existing columns or tables are dropped or renamed.
4. Stop sequence numbers are managed by the application; a unique constraint
   enforces per-trip sequence uniqueness.
*/

-- ============================================================
-- 1. trips: add journey_type
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'journey_type') THEN
    ALTER TABLE trips ADD COLUMN journey_type text NOT NULL DEFAULT 'single'
      CHECK (journey_type IN ('single','multi_stop','round_trip'));
  END IF;
END $$;

-- ============================================================
-- 2. New table: trip_stops
-- ============================================================
CREATE TABLE IF NOT EXISTS trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sequence_no integer NOT NULL,
  location text NOT NULL,
  stop_type text NOT NULL DEFAULT 'intermediate'
    CHECK (stop_type IN ('loading','unloading','both','intermediate')),
  expected_arrival timestamptz,
  expected_departure timestamptz,
  actual_arrival timestamptz,
  actual_departure timestamptz,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','arrived','completed','skipped')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(trip_id, sequence_no)
);
ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_trip_stops_business ON trip_stops(business_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_seq ON trip_stops(trip_id, sequence_no);

-- RLS policies for trip_stops (standard business-member pattern)
DROP POLICY IF EXISTS "select_trip_stops" ON trip_stops;
CREATE POLICY "select_trip_stops" ON trip_stops FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_trip_stops" ON trip_stops;
CREATE POLICY "insert_trip_stops" ON trip_stops FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_trip_stops" ON trip_stops;
CREATE POLICY "update_trip_stops" ON trip_stops FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_trip_stops" ON trip_stops;
CREATE POLICY "delete_trip_stops" ON trip_stops FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- ============================================================
-- 3. lr_bilties: add optional loading_stop_id / unloading_stop_id
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lr_bilties' AND column_name = 'loading_stop_id') THEN
    ALTER TABLE lr_bilties ADD COLUMN loading_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lr_bilties' AND column_name = 'unloading_stop_id') THEN
    ALTER TABLE lr_bilties ADD COLUMN unloading_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lr_bilties_loading_stop ON lr_bilties(loading_stop_id);
CREATE INDEX IF NOT EXISTS idx_lr_bilties_unloading_stop ON lr_bilties(unloading_stop_id);