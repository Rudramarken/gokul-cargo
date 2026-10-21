-- ============================================================
-- 1. lr_bilties: make trip_id nullable + add calculation columns
-- ============================================================

-- Make trip_id nullable
ALTER TABLE lr_bilties ALTER COLUMN trip_id DROP NOT NULL;

-- Add calculation columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'rate_type') THEN
    ALTER TABLE lr_bilties ADD COLUMN rate_type text NOT NULL DEFAULT 'fixed' CHECK (rate_type IN ('fixed','per_kg','per_quintal','per_ton'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'rate_value') THEN
    ALTER TABLE lr_bilties ADD COLUMN rate_value numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'rate_unit') THEN
    ALTER TABLE lr_bilties ADD COLUMN rate_unit text NOT NULL DEFAULT 'kg';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'base_freight') THEN
    ALTER TABLE lr_bilties ADD COLUMN base_freight numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'additional_amount') THEN
    ALTER TABLE lr_bilties ADD COLUMN additional_amount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'deduction_amount') THEN
    ALTER TABLE lr_bilties ADD COLUMN deduction_amount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'adjustment_reason') THEN
    ALTER TABLE lr_bilties ADD COLUMN adjustment_reason text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'final_amount') THEN
    ALTER TABLE lr_bilties ADD COLUMN final_amount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- 2. trips: add consignee, loading/delivery points, return trip, commission
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'consignee_party_id') THEN
    ALTER TABLE trips ADD COLUMN consignee_party_id uuid REFERENCES parties(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'loading_point') THEN
    ALTER TABLE trips ADD COLUMN loading_point text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'delivery_point') THEN
    ALTER TABLE trips ADD COLUMN delivery_point text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'return_trip_id') THEN
    ALTER TABLE trips ADD COLUMN return_trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Extend trips rate_type to include per_kg and per_ton
-- Must drop and recreate the constraint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'trips_rate_type_check' AND table_name = 'trips') THEN
    ALTER TABLE trips DROP CONSTRAINT trips_rate_type_check;
  END IF;
  ALTER TABLE trips ADD CONSTRAINT trips_rate_type_check CHECK (rate_type IN ('fixed','per_quintal','per_kg','per_ton'));
END $$;

-- Commission fields on trips
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'has_direct_payment') THEN
    ALTER TABLE trips ADD COLUMN has_direct_payment boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'direct_payment_amount') THEN
    ALTER TABLE trips ADD COLUMN direct_payment_amount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_applicable') THEN
    ALTER TABLE trips ADD COLUMN commission_applicable boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_type') THEN
    ALTER TABLE trips ADD COLUMN commission_type text CHECK (commission_type IN ('fixed','percentage') OR commission_type IS NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_value') THEN
    ALTER TABLE trips ADD COLUMN commission_value numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_received') THEN
    ALTER TABLE trips ADD COLUMN commission_received numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_status') THEN
    ALTER TABLE trips ADD COLUMN commission_status text NOT NULL DEFAULT 'n/a' CHECK (commission_status IN ('n/a','pending','received','partial'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_date') THEN
    ALTER TABLE trips ADD COLUMN commission_date date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'commission_notes') THEN
    ALTER TABLE trips ADD COLUMN commission_notes text;
  END IF;
END $$;

-- Index for return trip lookups
CREATE INDEX IF NOT EXISTS idx_trips_return_trip ON trips(business_id, return_trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_consignee ON trips(business_id, consignee_party_id);

-- ============================================================
-- 3. trip_expenses: add paid_by, responsible_party, recovery_status, lr_bilty_id
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_expenses' AND column_name = 'paid_by') THEN
    ALTER TABLE trip_expenses ADD COLUMN paid_by text NOT NULL DEFAULT 'gokul' CHECK (paid_by IN ('gokul','consignor','consignee','other'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_expenses' AND column_name = 'responsible_party_id') THEN
    ALTER TABLE trip_expenses ADD COLUMN responsible_party_id uuid REFERENCES parties(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_expenses' AND column_name = 'recovery_status') THEN
    ALTER TABLE trip_expenses ADD COLUMN recovery_status text NOT NULL DEFAULT 'n/a' CHECK (recovery_status IN ('n/a','pending','recovered','written_off'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_expenses' AND column_name = 'lr_bilty_id') THEN
    ALTER TABLE trip_expenses ADD COLUMN lr_bilty_id uuid REFERENCES lr_bilties(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Extend expense categories
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'trip_expenses_expense_category_check' AND table_name = 'trip_expenses') THEN
    ALTER TABLE trip_expenses DROP CONSTRAINT trip_expenses_expense_category_check;
  END IF;
  ALTER TABLE trip_expenses ADD CONSTRAINT trip_expenses_expense_category_check CHECK (expense_category IN ('fuel','toll','loading','unloading','driver','maintenance','food','repairs','other'));
END $$;

-- ============================================================
-- 4. payments: add bank details + third-party collection fields
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'bank_name') THEN
    ALTER TABLE payments ADD COLUMN bank_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'account_holder') THEN
    ALTER TABLE payments ADD COLUMN account_holder text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'account_number') THEN
    ALTER TABLE payments ADD COLUMN account_number text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'ifsc_code') THEN
    ALTER TABLE payments ADD COLUMN ifsc_code text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'upi_id') THEN
    ALTER TABLE payments ADD COLUMN upi_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'on_behalf_of_party_id') THEN
    ALTER TABLE payments ADD COLUMN on_behalf_of_party_id uuid REFERENCES parties(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 5. New table: driver_salary_records
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_salary_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  joining_date date,
  agreed_salary numeric(14,2) NOT NULL DEFAULT 0,
  salary_frequency text NOT NULL DEFAULT 'monthly' CHECK (salary_frequency IN ('monthly','weekly','daily','trip_based')),
  salary_period text,
  due_date date,
  payment_date date,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  reference_number text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partially_paid','paid')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE driver_salary_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_driver_salary_business ON driver_salary_records(business_id);
CREATE INDEX IF NOT EXISTS idx_driver_salary_driver ON driver_salary_records(driver_id);

DROP POLICY IF EXISTS "select_driver_salary_records" ON driver_salary_records;
CREATE POLICY "select_driver_salary_records" ON driver_salary_records FOR SELECT
  TO authenticated USING (is_business_member(business_id));
DROP POLICY IF EXISTS "insert_driver_salary_records" ON driver_salary_records;
CREATE POLICY "insert_driver_salary_records" ON driver_salary_records FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "update_driver_salary_records" ON driver_salary_records;
CREATE POLICY "update_driver_salary_records" ON driver_salary_records FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "delete_driver_salary_records" ON driver_salary_records;
CREATE POLICY "delete_driver_salary_records" ON driver_salary_records FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- ============================================================
-- 6. New table: trip_advances
-- ============================================================
CREATE TABLE IF NOT EXISTS trip_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  advance_date date NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('driver','transporter','truck_owner','other')),
  recipient_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  recipient_name text,
  amount numeric(14,2) NOT NULL,
  payment_method text,
  reference_number text,
  ledger_entry_id uuid REFERENCES ledger_entries(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE trip_advances ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_trip_advances_business ON trip_advances(business_id);
CREATE INDEX IF NOT EXISTS idx_trip_advances_trip ON trip_advances(trip_id);

DROP POLICY IF EXISTS "select_trip_advances" ON trip_advances;
CREATE POLICY "select_trip_advances" ON trip_advances FOR SELECT
  TO authenticated USING (is_business_member(business_id));
DROP POLICY IF EXISTS "insert_trip_advances" ON trip_advances;
CREATE POLICY "insert_trip_advances" ON trip_advances FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "update_trip_advances" ON trip_advances;
CREATE POLICY "update_trip_advances" ON trip_advances FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "delete_trip_advances" ON trip_advances;
CREATE POLICY "delete_trip_advances" ON trip_advances FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));