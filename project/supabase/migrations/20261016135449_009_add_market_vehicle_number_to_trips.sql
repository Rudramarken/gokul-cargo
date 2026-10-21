/*
# Add market_vehicle_number column to trips

## Purpose
Allows Attached/Market trips to store a temporary truck registration number
directly on the trip record, without requiring the truck to be permanently
registered in the vehicles table.

## Background
The trips table already has a nullable vehicle_id FK. For own-fleet trips,
vehicle_id points to a registered vehicle. For market/attached trips where
the truck is temporary and not registered in Vehicles, vehicle_id stays NULL
and the new market_vehicle_number column captures the truck number entered
by the user in the trip form.

## Changes
1. Add column `market_vehicle_number` (text, nullable) to trips.
   - Nullable because own-fleet trips don't need it.
   - No FK constraint — market trucks are intentionally not in the vehicles table.
2. Add an index on (business_id, market_vehicle_number) for lookups when
   reusing a market truck number across trips.
3. No RLS policy changes — existing trip policies already cover all columns.

## Security
No security changes. Existing RLS policies on trips remain unchanged and
continue to enforce business_id isolation through is_business_member().
*/