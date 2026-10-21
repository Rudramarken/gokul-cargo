-- Phase 4: New Trip workflow — journey direction, transporter details, freight tracking
-- Safe, backward-compatible: only ADD COLUMN, never drop or alter existing data.

-- 1. Journey direction (up/down/return/single)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'journey_direction') THEN
    ALTER TABLE trips ADD COLUMN journey_direction text DEFAULT 'single' CHECK (journey_direction IN ('up','down','return','single'));
  END IF;
END $$;

-- 2. Transporter details (for attached/market vehicles entered manually)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'transporter_name') THEN
    ALTER TABLE trips ADD COLUMN transporter_name text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'transporter_vehicle_number') THEN
    ALTER TABLE trips ADD COLUMN transporter_vehicle_number text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'transporter_vehicle_name') THEN
    ALTER TABLE trips ADD COLUMN transporter_vehicle_name text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'transporter_driver_name') THEN
    ALTER TABLE trips ADD COLUMN transporter_driver_name text;
  END IF;
END $$;

-- 3. Transporter freight tracking (separate from customer freight)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'freight_payable') THEN
    ALTER TABLE trips ADD COLUMN freight_payable numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'freight_paid') THEN
    ALTER TABLE trips ADD COLUMN freight_paid numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'freight_payment_status') THEN
    ALTER TABLE trips ADD COLUMN freight_payment_status text DEFAULT 'unpaid' CHECK (freight_payment_status IN ('unpaid','partially_paid','paid'));
  END IF;
END $$;

-- 4. Make party_id nullable for trips that use LR/Bilties for load details instead
-- (party_id was NOT NULL; we keep it NOT NULL for backward compat but the form will use a default)
-- Actually we need party_id to remain required for ledger purposes, so leave as-is.