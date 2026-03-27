export interface User {
  id: number;
  name: string;
  base_currency: string;
}

export interface Institution {
  id: number;
  user_id: number;
  name: string;
  type: string;
  is_active: number; // SQLite uses 0/1 for boolean
}

export interface Account {
  id: number;
  user_id: number;
  institution_id: number;
  name: string;
  currency: string;
  is_active: number;
  allow_overdraft: number;
}

export interface AccountsInfo {
  id: number;
  user_id: number;
  institution_id: number;
  name: string;
  currency: string;
  is_active: number;
  allow_overdraft: number;
  institution: string | null;
  type: string | null;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  parent_id: number | null;
  is_active: number;
}

export interface AccountEnvelope {
  id: number;
  account_id: number;
  category_id: number;
  is_active: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  date: string;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  created_at?: string;
}

export interface TransactionLine {
  id: number;
  transaction_id: number;
  account_id: number;
  envelope_id: number;
  amount: number; // stored as integer (cents) or decimal
}

export interface Reconciliation {
  id: number;
  account_id: number;
  date: string;
  real_balance: number;
  status: 'OPEN' | 'BALANCED' | 'IGNORED';
  calculated_balance: number;
  difference: number;
  is_active: number;
  note: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface ExchangeRate {
  id: number;
  user_id: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  created_at: string;
}

export type BudgetStatus = 'draft' | 'finalized' | 'funded';

export interface Budget {
  id: number;
  user_id: number;
  month: string;
  currency: string;
  total_income: number;
  status: BudgetStatus;
  funding_source_account_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: number;
  budget_id: number;
  category_id: number;
  account_envelope_id: number | null;
  amount: number;
  percentage: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Request/Response DTOs
export interface CreateTransactionRequest {
  userId: number;
  date: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  description: string;
  lines: Array<{
    accountId: number;
    envelopeId: number;
    amount: number;
  }>;
}

export interface CreateReconciliationRequest {
  accountId: number;
  date: string;
  realBalance: number;
  note?: string;
}

export interface ReconciliationResponse {
  id: number;
  accountId: number;
  date: string;
  realBalance: number;
  calculatedBalance: number;
  difference: number;
  status: 'OPEN' | 'BALANCED' | 'IGNORED';
  isActive: number;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface ReconciliationSummaryResponse extends ReconciliationResponse {
  calculatedCurrent: number;
  differenceCurrent: number;
  statusCurrent: 'OPEN' | 'BALANCED';
}

export interface ErrorResponse {
  message?: string;
  errors?: Array<{
    field: string;
    detail: string;
  }>;
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'CONFLICT'
      | 'INACTIVE_RESOURCE'
      | 'INTERNAL_ERROR';
    message: string;
    details?: any[];
  };
}
