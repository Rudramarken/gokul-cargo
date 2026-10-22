/*
# Add branch and account_holder columns to bank_accounts

## Purpose
The bank account form needs to store the account holder name and branch
information. These columns do not yet exist on bank_accounts.

## Modified Tables
- `bank_accounts` — added `account_holder` (text, nullable) and `branch` (text, nullable)

## Security
- No RLS or policy changes. Existing policies cover the new columns automatically.

## Notes
1. Both columns are nullable so existing records are unaffected.
2. IF NOT EXISTS guard makes this safe to re-run.
*/

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_holder text;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS branch text;

NOTIFY pgrst, 'reload schema';
