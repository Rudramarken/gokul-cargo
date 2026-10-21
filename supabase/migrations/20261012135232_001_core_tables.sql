/*
# Gokul Cargo Movers — Core Schema

## Overview
Creates the foundational tables for a transport management ERP for Gokul Cargo Movers.
This is a multi-user, business-scoped application with Supabase Auth (email/password).
Every business-owned record is associated with a business_id.

## Tables Created
1. businesses — Company profile for each transport business
2. business_members — Links auth.users to a business with a role (owner/admin/staff)
3. business_settings — Per-business configuration (prefixes, currency, etc.)
4. parties — Customers, suppliers/truck owners, and other parties
5. party_rates — Rate cards per party/route with effective dates
6. vehicles — Own and attached/market vehicles
7. drivers — Driver records
8. routes — Origin/destination routes with optional distance
9. trips — Core trip records with financial snapshots
10. lr_bilties — Lorry receipt / bilty documents linked to trips
11. trip_expenses — Expense records linked to trips
12. customer_bills — Customer billing documents
13. customer_bill_items — Line items on customer bills
14. payments — Customer receipts and supplier payments
15. payment_allocations — Allocation of payments to specific bills
16. truck_owner_settlements — Settlement records for attached/market vehicles
17. ledger_entries — Auditable financial ledger entries
18. audit_logs — Audit trail for sensitive operations

## Security
- RLS enabled on every table
- All policies scoped to authenticated users who are members of the owning business
- Owner/admin/staff roles enforced through business_members table
- No public access — all operations require authentication and business membership

## Notes
- All money fields use NUMERIC(14,2) for precision
- UUID primary keys throughout
- Timestamps with timezone
- Sequential document numbers are generated via database functions with row-level locking
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- BUSINESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  address text,
  phone text,
  email text,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BUSINESS_MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','admin','staff')),
  permissions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, user_id)
);
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is a member of a business
CREATE OR REPLACE FUNCTION is_business_member(b_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = b_id AND user_id = auth.uid()
  );
$$;

-- Helper function: get current user's role in a business
CREATE OR REPLACE FUNCTION user_role_in_business(b_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM business_members
  WHERE business_id = b_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper function: check if user is owner or admin
CREATE OR REPLACE FUNCTION is_owner_or_admin(b_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = b_id AND user_id = auth.uid()
    AND role IN ('owner','admin')
  );
$$;

-- ============================================================
-- BUSINESS_SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  address text,
  phone text,
  email text,
  logo_url text,
  currency text NOT NULL DEFAULT 'INR',
  time_zone text NOT NULL DEFAULT 'Asia/Kolkata',
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  trip_prefix text NOT NULL DEFAULT 'TRP',
  lr_prefix text NOT NULL DEFAULT 'LR',
  bill_prefix text NOT NULL DEFAULT 'BILL',
  default_rate_type text NOT NULL DEFAULT 'fixed',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PARTIES
-- ============================================================
CREATE TABLE IF NOT EXISTS parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  party_name text NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('customer','supplier','both','other')),
  contact_person text,
  phone text,
  alternate_phone text,
  address text,
  city text,
  state text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance_type text NOT NULL DEFAULT 'none' CHECK (opening_balance_type IN ('receivable','payable','none')),
  opening_balance_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_parties_business ON parties(business_id);
CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(business_id, party_name);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(business_id, party_type);

-- ============================================================
-- PARTY_RATES
-- ============================================================
CREATE TABLE IF NOT EXISTS party_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  origin text NOT NULL,
  destination text NOT NULL,
  vehicle_category text,
  rate_type text NOT NULL CHECK (rate_type IN ('fixed','per_quintal')),
  rate_value numeric(14,2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE party_rates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_party_rates_business ON party_rates(business_id);
CREATE INDEX IF NOT EXISTS idx_party_rates_party ON party_rates(party_id);

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vehicle_number text NOT NULL,
  vehicle_number_normalized text NOT NULL,
  vehicle_category text,
  ownership_type text NOT NULL CHECK (ownership_type IN ('own','attached')),
  owner_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  capacity numeric(14,2),
  capacity_unit text DEFAULT 'kg',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, vehicle_number_normalized)
);
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vehicles_business ON vehicles(business_id);

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  driver_name text NOT NULL,
  phone text,
  licence_number text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_drivers_business ON drivers(business_id);

-- ============================================================
-- ROUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  origin text NOT NULL,
  destination text NOT NULL,
  distance_km numeric(10,2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_routes_business ON routes(business_id);

-- ============================================================
-- TRIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trip_number text NOT NULL,
  trip_date date NOT NULL,
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  route_id uuid REFERENCES routes(id) ON DELETE SET NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  material_description text,
  quantity numeric(14,2),
  quantity_unit text,
  rate_type text NOT NULL CHECK (rate_type IN ('fixed','per_quintal')),
  applied_rate numeric(14,2) NOT NULL DEFAULT 0,
  customer_freight numeric(14,2) NOT NULL DEFAULT 0,
  truck_owner_cost numeric(14,2) NOT NULL DEFAULT 0,
  ownership_type_snapshot text NOT NULL CHECK (ownership_type_snapshot IN ('own','attached')),
  truck_owner_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','booked','in_transit','delivered','completed','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, trip_number)
);
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_trips_business ON trips(business_id);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(business_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_trips_party ON trips(business_id, party_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(business_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(business_id, status);

-- ============================================================
-- LR_BILTIES
-- ============================================================
CREATE TABLE IF NOT EXISTS lr_bilties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lr_number text NOT NULL,
  bilty_date date NOT NULL,
  consignor_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  consignee_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  loading_point text,
  delivery_point text,
  goods_description text,
  quantity numeric(14,2),
  weight numeric(14,2),
  freight_amount numeric(14,2) NOT NULL DEFAULT 0,
  document_status text NOT NULL DEFAULT 'active' CHECK (document_status IN ('active','cancelled')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, lr_number)
);
ALTER TABLE lr_bilties ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lr_bilties_business ON lr_bilties(business_id);
CREATE INDEX IF NOT EXISTS idx_lr_bilties_trip ON lr_bilties(trip_id);

-- ============================================================
-- TRIP_EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  expense_category text NOT NULL CHECK (expense_category IN ('fuel','toll','loading','unloading','driver','maintenance','other')),
  amount numeric(14,2) NOT NULL,
  payment_method text,
  paid_to_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  description text,
  is_reversed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE trip_expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_trip_expenses_business ON trip_expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip ON trip_expenses(trip_id);

-- ============================================================
-- CUSTOMER_BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bill_number text NOT NULL,
  customer_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  billing_period_start date,
  billing_period_end date,
  bill_date date NOT NULL,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  adjustments numeric(14,2) NOT NULL DEFAULT 0,
  adjustment_reason text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, bill_number)
);
ALTER TABLE customer_bills ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customer_bills_business ON customer_bills(business_id);
CREATE INDEX IF NOT EXISTS idx_customer_bills_customer ON customer_bills(business_id, customer_party_id);
CREATE INDEX IF NOT EXISTS idx_customer_bills_status ON customer_bills(business_id, status);

-- ============================================================
-- CUSTOMER_BILL_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES customer_bills(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  lr_bilty_id uuid REFERENCES lr_bilties(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(14,2),
  rate numeric(14,2),
  amount numeric(14,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_bill_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customer_bill_items_bill ON customer_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_customer_bill_items_trip ON customer_bill_items(trip_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  payment_date date NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('customer_receipt','supplier_payment','other')),
  amount numeric(14,2) NOT NULL,
  payment_method text,
  reference_number text,
  notes text,
  is_reversed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(business_id, party_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(business_id, payment_date);

-- ============================================================
-- PAYMENT_ALLOCATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES customer_bills(id) ON DELETE CASCADE,
  allocated_amount numeric(14,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_bill ON payment_allocations(bill_id);

-- ============================================================
-- TRUCK_OWNER_SETTLEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS truck_owner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  truck_owner_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  settlement_date date NOT NULL,
  agreed_amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  balance_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partially_settled','settled','cancelled')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE truck_owner_settlements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_truck_owner_settlements_business ON truck_owner_settlements(business_id);
CREATE INDEX IF NOT EXISTS idx_truck_owner_settlements_owner ON truck_owner_settlements(business_id, truck_owner_party_id);
CREATE INDEX IF NOT EXISTS idx_truck_owner_settlements_trip ON truck_owner_settlements(trip_id);

-- ============================================================
-- LEDGER_ENTRIES
-- ============================================================
-- Convention: For customers (receivables): debit increases what they owe, credit reduces it.
-- For suppliers/truck owners (payables): credit increases what we owe, debit reduces it.
-- Opening receivable = debit entry. Opening payable = credit entry.
-- Customer bill = debit entry. Customer receipt = credit entry.
-- Supplier payment = debit entry. Truck owner cost = credit entry.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  transaction_date date NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'opening_balance','customer_bill','customer_receipt','supplier_payment',
    'truck_owner_cost','truck_owner_payment','expense','adjustment','reversal'
  )),
  reference_type text,
  reference_id uuid,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  description text,
  reversal_of_entry_id uuid REFERENCES ledger_entries(id) ON DELETE SET NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_business ON ledger_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_party ON ledger_entries(business_id, party_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(business_id, transaction_date);

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_business ON audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(business_id, created_at DESC);

-- ============================================================
-- SEQUENCE COUNTERS for document numbers
-- ============================================================
CREATE TABLE IF NOT EXISTS document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('trip','lr','bill')),
  last_number integer NOT NULL DEFAULT 0,
  prefix text NOT NULL,
  UNIQUE(business_id, doc_type)
);
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;

-- Function to generate next document number safely
CREATE OR REPLACE FUNCTION get_next_document_number(b_id uuid, doc_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  seq_row document_sequences%ROWTYPE;
  next_num integer;
  prefix_val text;
  result text;
BEGIN
  SELECT * INTO seq_row
  FROM document_sequences
  WHERE business_id = b_id AND doc_type = doc_type
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Get prefix from settings
    SELECT CASE doc_type
      WHEN 'trip' THEN trip_prefix
      WHEN 'lr' THEN lr_prefix
      WHEN 'bill' THEN bill_prefix
      ELSE 'DOC'
    END INTO prefix_val
    FROM business_settings WHERE business_id = b_id;

    IF prefix_val IS NULL THEN
      prefix_val := 'DOC';
    END IF;

    next_num := 1;

    INSERT INTO document_sequences (business_id, doc_type, last_number, prefix)
    VALUES (b_id, doc_type, next_num, prefix_val)
    ON CONFLICT (business_id, doc_type) DO UPDATE
      SET last_number = document_sequences.last_number + 1
      RETURNING last_number, prefix INTO next_num, prefix_val;
  ELSE
    next_num := seq_row.last_number + 1;
    prefix_val := seq_row.prefix;

    UPDATE document_sequences
    SET last_number = next_num
    WHERE business_id = b_id AND doc_type = doc_type;
  END IF;

  result := prefix_val || '-' || LPAD(next_num::text, 5, '0');
  RETURN result;
END;
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- BUSINESSES: members can read, owner can update
DROP POLICY IF EXISTS "select_own_business" ON businesses;
CREATE POLICY "select_own_business" ON businesses FOR SELECT
  TO authenticated USING (is_business_member(id));

DROP POLICY IF EXISTS "update_own_business" ON businesses;
CREATE POLICY "update_own_business" ON businesses FOR UPDATE
  TO authenticated USING (is_owner_or_admin(id)) WITH CHECK (is_owner_or_admin(id));

DROP POLICY IF EXISTS "insert_business" ON businesses;
CREATE POLICY "insert_business" ON businesses FOR INSERT
  TO authenticated WITH CHECK (true);

-- BUSINESS_MEMBERS: members can read, owner/admin can manage
DROP POLICY IF EXISTS "select_business_members" ON business_members;
CREATE POLICY "select_business_members" ON business_members FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_business_member" ON business_members;
CREATE POLICY "insert_business_member" ON business_members FOR INSERT
  TO authenticated WITH CHECK (is_owner_or_admin(business_id));

DROP POLICY IF EXISTS "update_business_member" ON business_members;
CREATE POLICY "update_business_member" ON business_members FOR UPDATE
  TO authenticated USING (is_owner_or_admin(business_id)) WITH CHECK (is_owner_or_admin(business_id));

DROP POLICY IF EXISTS "delete_business_member" ON business_members;
CREATE POLICY "delete_business_member" ON business_members FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- BUSINESS_SETTINGS: members can read, owner/admin can update
DROP POLICY IF EXISTS "select_business_settings" ON business_settings;
CREATE POLICY "select_business_settings" ON business_settings FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "update_business_settings" ON business_settings;
CREATE POLICY "update_business_settings" ON business_settings FOR UPDATE
  TO authenticated USING (is_owner_or_admin(business_id)) WITH CHECK (is_owner_or_admin(business_id));

DROP POLICY IF EXISTS "insert_business_settings" ON business_settings;
CREATE POLICY "insert_business_settings" ON business_settings FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

-- Generic policy pattern for all business data tables
-- PARTIES
DROP POLICY IF EXISTS "select_parties" ON parties;
CREATE POLICY "select_parties" ON parties FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_parties" ON parties;
CREATE POLICY "insert_parties" ON parties FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_parties" ON parties;
CREATE POLICY "update_parties" ON parties FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_parties" ON parties;
CREATE POLICY "delete_parties" ON parties FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- PARTY_RATES
DROP POLICY IF EXISTS "select_party_rates" ON party_rates;
CREATE POLICY "select_party_rates" ON party_rates FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_party_rates" ON party_rates;
CREATE POLICY "insert_party_rates" ON party_rates FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_party_rates" ON party_rates;
CREATE POLICY "update_party_rates" ON party_rates FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_party_rates" ON party_rates;
CREATE POLICY "delete_party_rates" ON party_rates FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- VEHICLES
DROP POLICY IF EXISTS "select_vehicles" ON vehicles;
CREATE POLICY "select_vehicles" ON vehicles FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_vehicles" ON vehicles;
CREATE POLICY "insert_vehicles" ON vehicles FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_vehicles" ON vehicles;
CREATE POLICY "update_vehicles" ON vehicles FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_vehicles" ON vehicles;
CREATE POLICY "delete_vehicles" ON vehicles FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- DRIVERS
DROP POLICY IF EXISTS "select_drivers" ON drivers;
CREATE POLICY "select_drivers" ON drivers FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_drivers" ON drivers;
CREATE POLICY "insert_drivers" ON drivers FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_drivers" ON drivers;
CREATE POLICY "update_drivers" ON drivers FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_drivers" ON drivers;
CREATE POLICY "delete_drivers" ON drivers FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- ROUTES
DROP POLICY IF EXISTS "select_routes" ON routes;
CREATE POLICY "select_routes" ON routes FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_routes" ON routes;
CREATE POLICY "insert_routes" ON routes FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_routes" ON routes;
CREATE POLICY "update_routes" ON routes FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_routes" ON routes;
CREATE POLICY "delete_routes" ON routes FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- TRIPS
DROP POLICY IF EXISTS "select_trips" ON trips;
CREATE POLICY "select_trips" ON trips FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_trips" ON trips;
CREATE POLICY "insert_trips" ON trips FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_trips" ON trips;
CREATE POLICY "update_trips" ON trips FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_trips" ON trips;
CREATE POLICY "delete_trips" ON trips FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- LR_BILTIES
DROP POLICY IF EXISTS "select_lr_bilties" ON lr_bilties;
CREATE POLICY "select_lr_bilties" ON lr_bilties FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_lr_bilties" ON lr_bilties;
CREATE POLICY "insert_lr_bilties" ON lr_bilties FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_lr_bilties" ON lr_bilties;
CREATE POLICY "update_lr_bilties" ON lr_bilties FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_lr_bilties" ON lr_bilties;
CREATE POLICY "delete_lr_bilties" ON lr_bilties FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- TRIP_EXPENSES
DROP POLICY IF EXISTS "select_trip_expenses" ON trip_expenses;
CREATE POLICY "select_trip_expenses" ON trip_expenses FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_trip_expenses" ON trip_expenses;
CREATE POLICY "insert_trip_expenses" ON trip_expenses FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_trip_expenses" ON trip_expenses;
CREATE POLICY "update_trip_expenses" ON trip_expenses FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_trip_expenses" ON trip_expenses;
CREATE POLICY "delete_trip_expenses" ON trip_expenses FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- CUSTOMER_BILLS
DROP POLICY IF EXISTS "select_customer_bills" ON customer_bills;
CREATE POLICY "select_customer_bills" ON customer_bills FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_customer_bills" ON customer_bills;
CREATE POLICY "insert_customer_bills" ON customer_bills FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_customer_bills" ON customer_bills;
CREATE POLICY "update_customer_bills" ON customer_bills FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_customer_bills" ON customer_bills;
CREATE POLICY "delete_customer_bills" ON customer_bills FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- CUSTOMER_BILL_ITEMS
DROP POLICY IF EXISTS "select_customer_bill_items" ON customer_bill_items;
CREATE POLICY "select_customer_bill_items" ON customer_bill_items FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_customer_bill_items" ON customer_bill_items;
CREATE POLICY "insert_customer_bill_items" ON customer_bill_items FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_customer_bill_items" ON customer_bill_items;
CREATE POLICY "update_customer_bill_items" ON customer_bill_items FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_customer_bill_items" ON customer_bill_items;
CREATE POLICY "delete_customer_bill_items" ON customer_bill_items FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- PAYMENTS
DROP POLICY IF EXISTS "select_payments" ON payments;
CREATE POLICY "select_payments" ON payments FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_payments" ON payments;
CREATE POLICY "insert_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_payments" ON payments;
CREATE POLICY "update_payments" ON payments FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_payments" ON payments;
CREATE POLICY "delete_payments" ON payments FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- PAYMENT_ALLOCATIONS
DROP POLICY IF EXISTS "select_payment_allocations" ON payment_allocations;
CREATE POLICY "select_payment_allocations" ON payment_allocations FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_payment_allocations" ON payment_allocations;
CREATE POLICY "insert_payment_allocations" ON payment_allocations FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_payment_allocations" ON payment_allocations;
CREATE POLICY "delete_payment_allocations" ON payment_allocations FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- TRUCK_OWNER_SETTLEMENTS
DROP POLICY IF EXISTS "select_truck_owner_settlements" ON truck_owner_settlements;
CREATE POLICY "select_truck_owner_settlements" ON truck_owner_settlements FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_truck_owner_settlements" ON truck_owner_settlements;
CREATE POLICY "insert_truck_owner_settlements" ON truck_owner_settlements FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_truck_owner_settlements" ON truck_owner_settlements;
CREATE POLICY "update_truck_owner_settlements" ON truck_owner_settlements FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_truck_owner_settlements" ON truck_owner_settlements;
CREATE POLICY "delete_truck_owner_settlements" ON truck_owner_settlements FOR DELETE
  TO authenticated USING (is_owner_or_admin(business_id));

-- LEDGER_ENTRIES
DROP POLICY IF EXISTS "select_ledger_entries" ON ledger_entries;
CREATE POLICY "select_ledger_entries" ON ledger_entries FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_ledger_entries" ON ledger_entries;
CREATE POLICY "insert_ledger_entries" ON ledger_entries FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_ledger_entries" ON ledger_entries;
CREATE POLICY "update_ledger_entries" ON ledger_entries FOR UPDATE
  TO authenticated USING (is_owner_or_admin(business_id)) WITH CHECK (is_owner_or_admin(business_id));

-- AUDIT_LOGS (read-only for members, system inserts)
DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

-- DOCUMENT_SEQUENCES
DROP POLICY IF EXISTS "select_document_sequences" ON document_sequences;
CREATE POLICY "select_document_sequences" ON document_sequences FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "update_document_sequences" ON document_sequences;
CREATE POLICY "update_document_sequences" ON document_sequences FOR UPDATE
  TO authenticated USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_document_sequences" ON document_sequences;
CREATE POLICY "insert_document_sequences" ON document_sequences FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));
