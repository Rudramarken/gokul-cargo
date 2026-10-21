-- Phase 3: LR/Bilty enhancements — journey direction, transporter/freight, commission, LR expenses
-- Safe, backward-compatible: only ADD COLUMN, never drop or alter existing data.

-- 1. Add journey direction to lr_bilties
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'journey_direction') THEN
    ALTER TABLE lr_bilties ADD COLUMN journey_direction text DEFAULT 'up' CHECK (journey_direction IN ('up','down','return','single'));
  END IF;
END $$;

-- 2. Transporter / Freight Payable section
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'transporter_name') THEN
    ALTER TABLE lr_bilties ADD COLUMN transporter_name text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'transporter_vehicle_number') THEN
    ALTER TABLE lr_bilties ADD COLUMN transporter_vehicle_number text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'transporter_vehicle_name') THEN
    ALTER TABLE lr_bilties ADD COLUMN transporter_vehicle_name text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'transporter_driver_name') THEN
    ALTER TABLE lr_bilties ADD COLUMN transporter_driver_name text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'transporter_vehicle_id') THEN
    ALTER TABLE lr_bilties ADD COLUMN transporter_vehicle_id uuid REFERENCES vehicles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'transporter_driver_id') THEN
    ALTER TABLE lr_bilties ADD COLUMN transporter_driver_id uuid REFERENCES drivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'freight_payable') THEN
    ALTER TABLE lr_bilties ADD COLUMN freight_payable numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'freight_paid') THEN
    ALTER TABLE lr_bilties ADD COLUMN freight_paid numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'freight_payment_status') THEN
    ALTER TABLE lr_bilties ADD COLUMN freight_payment_status text DEFAULT 'unpaid' CHECK (freight_payment_status IN ('unpaid','partially_paid','paid'));
  END IF;
END $$;

-- 3. Commission section
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_applicable') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_applicable boolean DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_type') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_type text CHECK (commission_type IN ('fixed','percentage'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_value') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_value numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_amount') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_amount numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_received') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_received numeric DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_status') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_status text DEFAULT 'n/a' CHECK (commission_status IN ('n/a','pending','partial','received'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_date') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_date date;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lr_bilties' AND column_name = 'commission_notes') THEN
    ALTER TABLE lr_bilties ADD COLUMN commission_notes text;
  END IF;
END $$;

-- 4. LR Expenses table (consignor / consignee expenses separately)
CREATE TABLE IF NOT EXISTS lr_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  lr_bilty_id uuid NOT NULL REFERENCES lr_bilties(id),
  expense_side text NOT NULL CHECK (expense_side IN ('consignor','consignee')),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  paid_by text NOT NULL DEFAULT 'gokul' CHECK (paid_by IN ('gokul','consignor','consignee','other')),
  responsible_party text,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  is_reversed boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- RLS on lr_expenses
ALTER TABLE lr_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_lr_expenses" ON lr_expenses FOR SELECT
  TO authenticated USING (auth.uid() IN (SELECT user_id FROM business_members WHERE business_id = lr_expenses.business_id));
CREATE POLICY "insert_own_lr_expenses" ON lr_expenses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IN (SELECT user_id FROM business_members WHERE business_id = lr_expenses.business_id));
CREATE POLICY "update_own_lr_expenses" ON lr_expenses FOR UPDATE
  TO authenticated USING (auth.uid() IN (SELECT user_id FROM business_members WHERE business_id = lr_expenses.business_id))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM business_members WHERE business_id = lr_expenses.business_id));
CREATE POLICY "delete_own_lr_expenses" ON lr_expenses FOR DELETE
  TO authenticated USING (auth.uid() IN (SELECT user_id FROM business_members WHERE business_id = lr_expenses.business_id));

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_lr_expenses_lr_bilty_id ON lr_expenses(lr_bilty_id);
CREATE INDEX IF NOT EXISTS idx_lr_expenses_business_id ON lr_expenses(business_id);