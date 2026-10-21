/*
# Fix ambiguous doc_type column reference in get_next_document_number

## Problem
The function get_next_document_number(b_id uuid, doc_type text) has a parameter
named `doc_type` that clashes with the `document_sequences.doc_type` column.
In the WHERE clause `WHERE business_id = b_id AND doc_type = doc_type`,
PostgreSQL cannot resolve which `doc_type` is the column and which is the
parameter, producing: "column reference "doc_type" is ambiguous".

This error surfaces every time the frontend calls the RPC to generate a
trip, LR, or bill number — blocking trip creation entirely.

## Fix
1. DROP the existing function (required by Postgres when changing parameter names).
2. Recreate with parameter renamed from `doc_type` to `p_doc_type`.
3. Qualify all column references as `document_sequences.doc_type` and
   `document_sequences.business_id` for clarity.
4. The CASE expression still uses the parameter value to pick the correct
   prefix from business_settings — now referenced as `p_doc_type`.

## Security
No security changes. The function remains SECURITY DEFINER with the same
behavior. Existing document_sequences rows are preserved.

## Frontend impact
The frontend RPC call passes params as { b_id, doc_type }. Since the
parameter is renamed to p_doc_type, the frontend must pass { b_id, p_doc_type }.
This change is made in TripsPage.tsx, LrBiltiesPage.tsx, and
CustomerBillingPage.tsx.
*/

DROP FUNCTION IF EXISTS get_next_document_number(uuid, text);

CREATE OR REPLACE FUNCTION get_next_document_number(b_id uuid, p_doc_type text)
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
  WHERE document_sequences.business_id = b_id
    AND document_sequences.doc_type = p_doc_type
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Get prefix from settings
    SELECT CASE p_doc_type
      WHEN 'trip' THEN trip_prefix
      WHEN 'lr' THEN lr_prefix
      WHEN 'bill' THEN bill_prefix
      ELSE 'DOC'
    END INTO prefix_val
    FROM business_settings WHERE business_settings.business_id = b_id;

    IF prefix_val IS NULL THEN
      prefix_val := 'DOC';
    END IF;

    next_num := 1;

    INSERT INTO document_sequences (business_id, doc_type, last_number, prefix)
    VALUES (b_id, p_doc_type, next_num, prefix_val)
    ON CONFLICT (business_id, doc_type) DO UPDATE
      SET last_number = document_sequences.last_number + 1
      RETURNING last_number, prefix INTO next_num, prefix_val;
  ELSE
    next_num := seq_row.last_number + 1;
    prefix_val := seq_row.prefix;

    UPDATE document_sequences
    SET last_number = next_num
    WHERE document_sequences.business_id = b_id
      AND document_sequences.doc_type = p_doc_type;
  END IF;

  result := prefix_val || '-' || LPAD(next_num::text, 5, '0');
  RETURN result;
END;
$$;
