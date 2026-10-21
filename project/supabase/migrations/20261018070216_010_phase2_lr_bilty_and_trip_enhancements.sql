/*
# Phase 2: LR/Bilty independence + Trip enhancements

## Overview
Makes LR/Bilty independent of trips, adds weight×rate calculation columns to LR/Bilties,
adds consignee/loading/delivery/return-trip fields to trips, adds new rate types,
and creates tables for driver salary records.

## Changes

### 1. lr_bilties — make trip_id nullable + add calculation columns
- ALTER trip_id to be nullable (was NOT NULL) — LR/Bilty can now be standalone
- Add columns for weight-based freight calculation:
  - rate_type (text, CHECK in 'fixed','per_kg','per_quintal','per_ton') default 'fixed'
  - rate_value numeric(14,2) default 0 — rate per unit
  - rate_unit text default 'kg' — the unit the rate applies to
  - base_freight numeric(14,2) default 0 — calculated base freight
  - additional_amount numeric(14,2) default 0 — additions (+)
  - deduction_amount numeric(14,2) default 0 — deductions (-)
  - adjustment_reason text — reason for additions/deductions
  - final_amount numeric(14,2) default 0 — base + additions - deductions

### 2. trips — add consignee, loading/delivery points, return trip
- Add consignee_party_id uuid REFERENCES parties ON DELETE SET NULL
- Add loading_point text
- Add delivery_point text
- Add return_trip_id uuid REFERENCES trips(id) ON DELETE SET NULL (self-reference for return trips)
- Add rate_type CHECK constraint extended to 'per_kg','per_ton' (existing already has 'fixed','per_quintal')
  NOTE: We must DROP and recreate the constraint to include new values.

### 3. New table: driver_salary_records
- Records driver joining, salary, payments, outstanding salary
- Columns: driver_id, joining_date, agreed_salary, salary_frequency, salary_period, 
  due_date, payment_date, amount_paid, payment_method, reference_number, notes,
  status (pending/partially_paid/paid)

### 4. New table: trip_advances
- Records advances/payments to driver, transporter, truck owner, or other
- Columns: trip_id, advance_date, recipient_type, recipient_party_id, recipient_name,
  amount, payment_method, reference_number, notes, ledger_entry_id

### 5. trip_expenses — add paid_by, responsible_party_id, recovery_status
- Add paid_by text (values: 'gokul','consignor','consignee','other')
- Add responsible_party_id uuid REFERENCES parties ON DELETE SET NULL
- Add recovery_status text default 'n/a' CHECK in ('n/a','pending','recovered','written_off')
- Add lr_bilty_id uuid REFERENCES lr_bilties ON DELETE SET NULL

### 6. payments — add bank details + third-party collection fields
- Add bank_name, account_holder, account_number, ifsc_code, upi_id text (all nullable)
- Add on_behalf_of_party_id uuid REFERENCES parties ON DELETE SET NULL
  (when a third party pays on behalf of another party)

### 7. trips — add optional commission fields
- Add has_direct_payment boolean default false
- Add direct_payment_amount numeric(14,2) default 0
- Add commission_applicable boolean default false
- Add commission_type text CHECK in ('fixed','percentage') default null
- Add commission_value numeric(14,2) default 0
- Add commission_received numeric(14,2) default 0
- Add commission_status text default 'n/a' CHECK in ('n/a','pending','received','partial')
- Add commission_date date
- Add commission_notes text

## Security
- RLS enabled on all new tables with same business_id pattern
- 4 policies per new table (select/insert/update/delete) scoped to authenticated + is_business_member
- No existing policies changed
- No data deleted or modified
*/