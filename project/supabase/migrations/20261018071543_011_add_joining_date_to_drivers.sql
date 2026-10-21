-- Add joining_date to drivers table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'joining_date') THEN
    ALTER TABLE drivers ADD COLUMN joining_date date;
  END IF;
END $$;