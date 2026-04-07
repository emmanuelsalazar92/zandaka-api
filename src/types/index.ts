export interface AuditedEntity {
  created_at: string;
  updated_at: string;
}

export interface User extends AuditedEntity {
  id: number;
  name: string;
  base_currency: string;
}

export interface Institution extends AuditedEntity {
  id: number;
  user_id: number;
  name: string;
  type: string;
  is_active: number;
}

export interface Account extends AuditedEntity {
  id: number;
  user_id: number;
  institution_id: number;
  name: string;
  currency: string;
  is_active: number;
  allow_overdraft: number;
}

export interface AccountsInfo extends Account {
  institution: string | null;
  type: string | null;
}

export interface Category extends AuditedEntity {
  id: number;
  user_id: number;
  name: string;
  parent_id: number | null;
  is_active: number;
}

export interface AccountEnvelope extends AuditedEntity {
  id: number;
  account_id: number;
  category_id: number;
  is_active: number;
}

export interface Transaction extends AuditedEntity {
  id: number;
  user_id: number;
  date: string;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
}

export interface TransactionLine extends AuditedEntity {
  id: number;
  transaction_id: number;
  account_id: number;
  envelope_id: number;
  amount: number;
}

export interface Reconciliation extends AuditedEntity {
  id: number;
  account_id: number;
  date: string;
  real_balance: number;
  count_method: 'MANUAL_TOTAL' | 'DENOMINATION_COUNT';
  status: 'OPEN' | 'BALANCED' | 'IGNORED';
  calculated_balance: number;
  difference: number;
  is_active: number;
  note: string | null;
  closed_at: string | null;
}

export type PayrollRuleType = 'CCSS_WORKER' | 'INCOME_TAX';

export interface PayrollRuleSet extends AuditedEntity {
  id: number;
  user_id: number;
  country_code: string;
  rule_type: PayrollRuleType;
  name: string;
  effective_from: string;
  effective_to: string | null;
  is_active: number;
}

export interface PayrollCcssWorkerRate extends AuditedEntity {
  id: number;
  rule_set_id: number;
  employee_rate: number;
  employer_rate: number | null;
  base_type: string;
}

export interface PayrollIncomeTaxBracket extends AuditedEntity {
  id: number;
  rule_set_id: number;
  range_order: number;
  amount_from: number;
  amount_to: number | null;
  tax_rate: number;
  is_exempt: number;
}

export type CashDenominationType = 'BILL' | 'COIN';

export interface CashDenomination extends AuditedEntity {
  id: number;
  user_id: number;
  currency: string;
  value: number;
  type: CashDenominationType;
  label: string | null;
  sort_order: number;
  is_active: number;
}

export interface CashReconciliationDetail extends AuditedEntity {
  id: number;
  reconciliation_id: number;
  denomination_id: number | null;
  denomination_value: number;
  denomination_type: CashDenominationType;
  denomination_label: string | null;
  quantity: number;
  line_total: number;
  sort_order: number;
}

export interface ExchangeRate extends AuditedEntity {
  id: number;
  user_id: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
}

export type AutoAssignmentMatchType =
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'EXACT'
  | 'REGEX';

export interface AutoAssignmentRule extends AuditedEntity {
  id: number;
  user_id: number;
  pattern: string;
  match_type: AutoAssignmentMatchType;
  account_id: number | null;
  account_envelope_id: number | null;
  priority: number;
  is_active: number;
  notes: string | null;
}

export interface AutoAssignmentRuleDetails extends AutoAssignmentRule {
  account_name: string | null;
  account_currency: string | null;
  account_envelope_account_id: number | null;
  category_id: number | null;
  category_name: string | null;
  account_envelope_label: string | null;
}

export type BudgetStatus = 'draft' | 'finalized' | 'funded';

export interface Budget extends AuditedEntity {
  id: number;
  user_id: number;
  month: string;
  currency: string;
  total_income: number;
  ccss_rule_set_id: number | null;
  income_tax_rule_set_id: number | null;
  status: BudgetStatus;
}

export interface BudgetLine extends AuditedEntity {
  id: number;
  budget_id: number;
  category_id: number;
  account_envelope_id: number | null;
  amount: number;
  percentage: number;
  notes: string | null;
  sort_order: number;
}

export interface PayrollRuleSetResponse {
  id: number;
  user_id: number;
  country_code: string;
  rule_type: PayrollRuleType;
  name: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  ccss_detail: {
    id: number;
    employee_rate: number;
    employer_rate: number | null;
    base_type: string;
    created_at: string;
    updated_at: string;
  } | null;
  income_tax_brackets: Array<{
    id: number;
    range_order: number;
    amount_from: number;
    amount_to: number | null;
    tax_rate: number;
    is_exempt: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

export interface PayrollNetSalaryTaxBreakdownLineResponse {
  range_order: number;
  taxable_amount: number;
  tax_rate: number;
  tax_amount: number;
}

export interface PayrollNetSalaryCalculationResponse {
  gross_salary: number;
  period_date: string;
  ccss_worker_rate: number;
  ccss_worker_amount: number;
  taxable_base: number;
  income_tax_amount: number;
  net_salary: number;
  ccss_rule_set_id: number;
  income_tax_rule_set_id: number;
  tax_breakdown: PayrollNetSalaryTaxBreakdownLineResponse[];
}

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
  date?: string;
  countMethod?: 'MANUAL_TOTAL' | 'DENOMINATION_COUNT';
  realBalance?: number;
  countedTotal?: number;
  note?: string;
  notes?: string;
  lines?: CreateCashReconciliationLineRequest[];
}

export interface CreateCashReconciliationLineRequest {
  denominationId?: number;
  denominationValue?: number;
  denominationType?: CashDenominationType;
  denominationLabel?: string | null;
  quantity: number;
  sortOrder?: number;
}

export interface ReconciliationResponse {
  id: number;
  accountId: number;
  currency: string;
  date: string;
  countMethod: 'MANUAL_TOTAL' | 'DENOMINATION_COUNT';
  expectedTotal: number;
  countedTotal: number;
  realBalance: number;
  calculatedBalance: number;
  difference: number;
  status: 'OPEN' | 'BALANCED' | 'IGNORED';
  isActive: number;
  note: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lines?: ReconciliationLineResponse[];
}

export interface ReconciliationSummaryResponse extends ReconciliationResponse {
  calculatedCurrent: number;
  differenceCurrent: number;
  statusCurrent: 'OPEN' | 'BALANCED';
}

export interface ReconciliationExpectedTotalResponse {
  accountId: number;
  currency: string;
  date: string;
  expectedTotal: number;
}

export interface ReconciliationLineResponse {
  id: number;
  reconciliationId: number;
  denominationId: number | null;
  denominationValue: number;
  denominationType: CashDenominationType;
  denominationLabel: string | null;
  quantity: number;
  lineTotal: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashDenominationResponse {
  id: number;
  userId: number;
  currency: string;
  value: number;
  type: CashDenominationType;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashDenominationListResponse {
  userId: number;
  currency: string | null;
  items: CashDenominationResponse[];
}

export interface AccountCashDenominationsResponse {
  accountId: number;
  currency: string;
  countMethod: 'DENOMINATION_COUNT';
  denominations: CashDenominationResponse[];
}

export interface PreferredCurrencyResponse {
  userId: number;
  baseCurrency: string;
}

export interface UserSettingsResponse {
  id: number;
  name: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
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
