-- Add manual payer name to payments table for third-party payments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'payer_name_manual') THEN
    ALTER TABLE payments ADD COLUMN payer_name_manual text;
  END IF;
END $$;