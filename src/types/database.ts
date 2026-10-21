export type BusinessRole = 'owner' | 'admin' | 'staff';

export type PartyType = 'customer' | 'supplier' | 'both' | 'other';
export type OpeningBalanceType = 'receivable' | 'payable' | 'none';

export type RateType = 'fixed' | 'per_quintal' | 'per_kg' | 'per_ton';
export type OwnershipType = 'own' | 'attached';

export type TripStatus = 'draft' | 'booked' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
export type DocumentStatus = 'active' | 'cancelled';

export type ExpenseCategory = 'fuel' | 'toll' | 'loading' | 'unloading' | 'driver' | 'maintenance' | 'food' | 'repairs' | 'other';

export type BillStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';

export type PaymentType = 'customer_receipt' | 'supplier_payment' | 'other';

export type SettlementStatus = 'pending' | 'partially_settled' | 'settled' | 'cancelled';

export type CommissionStatus = 'n/a' | 'pending' | 'received' | 'partial';
export type CommissionType = 'fixed' | 'percentage';
export type PaidByType = 'gokul' | 'consignor' | 'consignee' | 'other';
export type RecoveryStatus = 'n/a' | 'pending' | 'recovered' | 'written_off';
export type RecipientType = 'driver' | 'transporter' | 'truck_owner' | 'other';
export type SalaryFrequency = 'monthly' | 'weekly' | 'daily' | 'trip_based';
export type SalaryStatus = 'pending' | 'partially_paid' | 'paid';

export type JourneyDirection = 'up' | 'down' | 'return' | 'single';
export type JourneyType = 'single' | 'multi_stop' | 'round_trip';
export type FreightPaymentStatus = 'unpaid' | 'partially_paid' | 'paid';
export type LrExpenseSide = 'consignor' | 'consignee';
export type StopType = 'loading' | 'unloading' | 'both' | 'intermediate';
export type StopStatus = 'planned' | 'arrived' | 'completed' | 'skipped';

export type LedgerEntryType =
  | 'opening_balance'
  | 'customer_bill'
  | 'customer_receipt'
  | 'supplier_payment'
  | 'truck_owner_cost'
  | 'truck_owner_payment'
  | 'expense'
  | 'adjustment'
  | 'reversal'
  | 'driver_advance'
  | 'driver_salary'
  | 'commission_income';

export interface Business {
  id: string;
  business_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessRole;
  permissions: string[];
  created_at: string;
}

export interface BusinessSettings {
  id: string;
  business_id: string;
  business_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  currency: string;
  time_zone: string;
  date_format: string;
  trip_prefix: string;
  lr_prefix: string;
  bill_prefix: string;
  default_rate_type: string;
  created_at: string;
  updated_at: string;
}

export interface Party {
  id: string;
  business_id: string;
  party_name: string;
  party_type: PartyType;
  contact_person: string | null;
  phone: string | null;
  alternate_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  opening_balance: number;
  opening_balance_type: OpeningBalanceType;
  opening_balance_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartyRate {
  id: string;
  business_id: string;
  party_id: string;
  origin: string;
  destination: string;
  vehicle_category: string | null;
  rate_type: RateType;
  rate_value: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  party?: Party;
}

export interface Vehicle {
  id: string;
  business_id: string;
  vehicle_number: string;
  vehicle_number_normalized: string;
  vehicle_category: string | null;
  ownership_type: OwnershipType;
  owner_party_id: string | null;
  capacity: number | null;
  capacity_unit: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  owner_party?: Party;
}

export interface Driver {
  id: string;
  business_id: string;
  driver_name: string;
  phone: string | null;
  licence_number: string | null;
  address: string | null;
  joining_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Route {
  id: string;
  business_id: string;
  origin: string;
  destination: string;
  distance_km: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  business_id: string;
  trip_number: string;
  trip_date: string;
  party_id: string;
  consignee_party_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  route_id: string | null;
  return_trip_id: string | null;
  origin: string;
  destination: string;
  loading_point: string | null;
  delivery_point: string | null;
  material_description: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  rate_type: RateType;
  applied_rate: number;
  customer_freight: number;
  truck_owner_cost: number;
  ownership_type_snapshot: OwnershipType;
  truck_owner_party_id: string | null;
  market_vehicle_number: string | null;
  has_direct_payment: boolean;
  direct_payment_amount: number;
  commission_applicable: boolean;
  commission_type: CommissionType | null;
  commission_value: number;
  commission_received: number;
  commission_status: CommissionStatus;
  commission_date: string | null;
  commission_notes: string | null;
  journey_direction: JourneyDirection;
  journey_type: JourneyType;
  transporter_name: string | null;
  transporter_vehicle_number: string | null;
  transporter_vehicle_name: string | null;
  transporter_driver_name: string | null;
  freight_payable: number;
  freight_paid: number;
  freight_payment_status: FreightPaymentStatus;
  status: TripStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  party?: Party;
  consignee?: Party;
  vehicle?: Vehicle;
  driver?: Driver;
  route?: Route;
  truck_owner_party?: Party;
  return_trip?: Trip;
  stops?: TripStop[];
}

export interface TripStop {
  id: string;
  business_id: string;
  trip_id: string;
  sequence_no: number;
  location: string;
  stop_type: StopType;
  expected_arrival: string | null;
  expected_departure: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  status: StopStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LrBilty {
  id: string;
  business_id: string;
  trip_id: string | null;
  lr_number: string;
  bilty_date: string;
  consignor_party_id: string | null;
  consignee_party_id: string | null;
  loading_point: string | null;
  delivery_point: string | null;
  loading_stop_id: string | null;
  unloading_stop_id: string | null;
  goods_description: string | null;
  quantity: number | null;
  weight: number | null;
  rate_type: RateType;
  rate_value: number;
  rate_unit: string;
  base_freight: number;
  additional_amount: number;
  deduction_amount: number;
  adjustment_reason: string | null;
  freight_amount: number;
  final_amount: number;
  journey_direction: JourneyDirection;
  transporter_name: string | null;
  transporter_vehicle_number: string | null;
  transporter_vehicle_name: string | null;
  transporter_driver_name: string | null;
  transporter_vehicle_id: string | null;
  transporter_driver_id: string | null;
  freight_payable: number;
  freight_paid: number;
  freight_payment_status: FreightPaymentStatus;
  commission_applicable: boolean;
  commission_type: CommissionType | null;
  commission_value: number;
  commission_amount: number;
  commission_received: number;
  commission_status: CommissionStatus;
  commission_date: string | null;
  commission_notes: string | null;
  document_status: DocumentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  trip?: Trip;
  consignor_party?: Party;
  consignee_party?: Party;
  transporter_vehicle?: Vehicle;
  transporter_driver?: Driver;
  loading_stop?: TripStop;
  unloading_stop?: TripStop;
}

export interface TripExpense {
  id: string;
  business_id: string;
  trip_id: string;
  lr_bilty_id: string | null;
  expense_date: string;
  expense_category: ExpenseCategory;
  amount: number;
  paid_by: PaidByType;
  responsible_party_id: string | null;
  recovery_status: RecoveryStatus;
  payment_method: string | null;
  paid_to_party_id: string | null;
  description: string | null;
  is_reversed: boolean;
  created_by: string | null;
  created_at: string;
  trip?: Trip;
  paid_to_party?: Party;
  responsible_party?: Party;
}

export interface TripAdvance {
  id: string;
  business_id: string;
  trip_id: string;
  advance_date: string;
  recipient_type: RecipientType;
  recipient_party_id: string | null;
  recipient_name: string | null;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  ledger_entry_id: string | null;
  account_id: string | null;
  account_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  account?: BankAccount;
  trip?: Trip;
  account?: BankAccount;
}

export interface LrExpense {
  id: string;
  business_id: string;
  lr_bilty_id: string;
  expense_side: LrExpenseSide;
  expense_date: string;
  description: string | null;
  amount: number;
  paid_by: PaidByType;
  responsible_party: string | null;
  payment_status: 'pending' | 'paid';
  is_reversed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DriverSalaryRecord {
  id: string;
  business_id: string;
  driver_id: string;
  joining_date: string | null;
  agreed_salary: number;
  salary_frequency: SalaryFrequency;
  salary_period: string | null;
  due_date: string | null;
  payment_date: string | null;
  amount_paid: number;
  payment_method: string | null;
  reference_number: string | null;
  account_id: string | null;
  notes: string | null;
  status: SalaryStatus;
  account_id: string | null;
  created_by: string | null;
  account?: BankAccount;
  created_at: string;
  updated_at: string;
  driver?: Driver;
  account?: BankAccount;
}

export interface CustomerBill {
  id: string;
  business_id: string;
  bill_number: string;
  customer_party_id: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  bill_date: string;
  subtotal: number;
  adjustments: number;
  adjustment_reason: string | null;
  total_amount: number;
  status: BillStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer_party?: Party;
  items?: CustomerBillItem[];
}

export interface CustomerBillItem {
  id: string;
  business_id: string;
  bill_id: string;
  trip_id: string | null;
  lr_bilty_id: string | null;
  description: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
  created_at: string;
}

export interface Payment {
  id: string;
  business_id: string;
  party_id: string | null;
  on_behalf_of_party_id: string | null;
  payer_name_manual: string | null;
  payment_date: string;
  payment_type: PaymentType;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  bank_name: string | null;
  account_id: string | null;
  account_holder: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  account_id: string | null;
  notes: string | null;
  account?: BankAccount;
  is_reversed: boolean;
  created_by: string | null;
  created_at: string;
  party?: Party;
  on_behalf_of_party?: Party;
  account?: BankAccount;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  business_id: string;
  payment_id: string;
  bill_id: string;
  allocated_amount: number;
  created_at: string;
  bill?: CustomerBill;
}

export interface TruckOwnerSettlement {
  id: string;
  business_id: string;
  truck_owner_party_id: string;
  account_id: string | null;
  trip_id: string;
  settlement_date: string;
  agreed_amount: number;
  paid_amount: number;
  balance_amount: number;
  account?: BankAccount;
  status: SettlementStatus;
  account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  truck_owner_party?: Party;
  trip?: Trip;
  account?: BankAccount;
}

export interface LedgerEntry {
  id: string;
  business_id: string;
  party_id: string;
  transaction_date: string;
  transaction_type: LedgerEntryType;
  reference_type: string | null;
  reference_id: string | null;
  debit: number;
  credit: number;
  description: string | null;
  reversal_of_entry_id: string | null;
  is_reversed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  business_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type AccountType = 'cash' | 'bank';

export interface BankAccount {
  id: string;
  business_id: string;
  account_name: string;
  account_type: AccountType;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentSequence {
  id: string;
  business_id: string;
  doc_type: 'trip' | 'lr' | 'bill';
  last_number: number;
  prefix: string;
}

export type AccountType = 'cash' | 'bank';

export interface BankAccount {
  id: string;
  business_id: string;
  account_name: string;
  account_type: AccountType;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
