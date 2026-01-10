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
  note: string | null;
  created_at: string;
}

export interface ExchangeRate {
  id: number;
  user_id: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  created_at: string;
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
  note: string | null;
  createdAt: string;
}

export interface ErrorResponse {
  error: {
    code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'INACTIVE_RESOURCE' | 'INTERNAL_ERROR';
    message: string;
    details?: any[];
  };
}

