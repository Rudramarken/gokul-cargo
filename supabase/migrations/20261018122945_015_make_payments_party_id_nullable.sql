-- Make party_id nullable on payments to support manual payer names for third-party payments
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'party_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE payments ALTER COLUMN party_id DROP NOT NULL;
  END IF;
END $$;