DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'market_vehicle_number'
  ) THEN
    ALTER TABLE trips ADD COLUMN market_vehicle_number text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trips_market_vehicle ON trips(business_id, market_vehicle_number);