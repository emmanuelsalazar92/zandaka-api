-- Schema from main before money-decimal-v1. No user data.
CREATE TABLE "account" (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      allow_overdraft INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (institution_id) REFERENCES institution(id)
    );

CREATE TABLE "account_envelope" (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id, category_id),
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (category_id) REFERENCES category(id)
    );

CREATE TABLE "auto_assignment_rule" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      pattern TEXT NOT NULL CHECK(length(trim(pattern)) > 0),
      match_type TEXT NOT NULL DEFAULT 'CONTAINS'
        CHECK(match_type IN ('CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT', 'REGEX')),
      account_id INTEGER NULL,
      account_envelope_id INTEGER NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      notes TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(account_id IS NOT NULL OR account_envelope_id IS NOT NULL),
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (account_envelope_id) REFERENCES account_envelope(id)
    );

CREATE TABLE "budget" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      currency TEXT NOT NULL,
      total_income NUMERIC NOT NULL CHECK(total_income > 0),
      ccss_rule_set_id INTEGER NULL,
      income_tax_rule_set_id INTEGER NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'finalized', 'funded')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (ccss_rule_set_id) REFERENCES payroll_rule_set(id),
      FOREIGN KEY (income_tax_rule_set_id) REFERENCES payroll_rule_set(id),
      UNIQUE(user_id, month, currency)
    );

CREATE TABLE "budget_line" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      account_envelope_id INTEGER NULL,
      amount NUMERIC NOT NULL CHECK(amount >= 0),
      percentage NUMERIC NOT NULL CHECK(percentage >= 0 AND percentage <= 100),
      notes TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budget(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES category(id),
      FOREIGN KEY (account_envelope_id) REFERENCES account_envelope(id),
      UNIQUE(budget_id, category_id)
    );

CREATE TABLE "cash_denomination" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      currency TEXT NOT NULL,
      value NUMERIC NOT NULL CHECK(value > 0),
      type TEXT NOT NULL CHECK(type IN ('BILL', 'COIN')),
      label TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

CREATE TABLE "cash_reconciliation_detail" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reconciliation_id INTEGER NOT NULL,
      denomination_id INTEGER NULL,
      denomination_value NUMERIC NOT NULL CHECK(denomination_value > 0),
      denomination_type TEXT NOT NULL CHECK(denomination_type IN ('BILL', 'COIN')),
      denomination_label TEXT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      line_total NUMERIC NOT NULL CHECK(line_total >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reconciliation_id) REFERENCES reconciliation(id) ON DELETE CASCADE,
      FOREIGN KEY (denomination_id) REFERENCES cash_denomination(id)
    );

CREATE TABLE "category" (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      parent_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (parent_id) REFERENCES category(id)
    );

CREATE TABLE "exchange_rate" (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate NUMERIC NOT NULL,
      effective_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id),
      UNIQUE(user_id, from_currency, to_currency, effective_date)
    );

CREATE TABLE "institution" (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BANK', 'CASH', 'VIRTUAL')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

CREATE TABLE "payroll_ccss_worker_rate" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_set_id INTEGER NOT NULL,
      employee_rate NUMERIC NOT NULL CHECK(employee_rate >= 0 AND employee_rate <= 1),
      employer_rate NUMERIC NULL CHECK(employer_rate IS NULL OR (employer_rate >= 0 AND employer_rate <= 1)),
      base_type TEXT NOT NULL DEFAULT 'GROSS_SALARY',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rule_set_id),
      FOREIGN KEY (rule_set_id) REFERENCES payroll_rule_set(id) ON DELETE CASCADE
    );

CREATE TABLE "payroll_income_tax_bracket" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_set_id INTEGER NOT NULL,
      range_order INTEGER NOT NULL,
      amount_from NUMERIC NOT NULL CHECK(amount_from >= 0),
      amount_to NUMERIC NULL CHECK(amount_to IS NULL OR amount_to > amount_from),
      tax_rate NUMERIC NOT NULL CHECK(tax_rate >= 0 AND tax_rate <= 1),
      is_exempt INTEGER NOT NULL DEFAULT 0 CHECK(is_exempt IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rule_set_id) REFERENCES payroll_rule_set(id) ON DELETE CASCADE
    );

CREATE TABLE "payroll_rule_set" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'CR',
      rule_type TEXT NOT NULL CHECK(rule_type IN ('CCSS_WORKER', 'INCOME_TAX')),
      name TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

CREATE TABLE "reconciliation" (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      real_balance NUMERIC NOT NULL,
      count_method TEXT NOT NULL DEFAULT 'MANUAL_TOTAL'
        CHECK(count_method IN ('MANUAL_TOTAL', 'DENOMINATION_COUNT')),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'OPEN',
      calculated_balance NUMERIC NOT NULL DEFAULT 0,
      difference NUMERIC NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      closed_at TEXT NULL,
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

CREATE TABLE "report_snapshot" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      report_month TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      base_currency TEXT NOT NULL,
      total_crc NUMERIC NOT NULL DEFAULT 0,
      total_usd NUMERIC NOT NULL DEFAULT 0,
      exchange_rate_id INTEGER NULL,
      exchange_rate_used NUMERIC NULL,
      consolidated_amount NUMERIC NULL,
      ccss_rule_set_id INTEGER NULL,
      income_tax_rule_set_id INTEGER NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_latest INTEGER NOT NULL DEFAULT 1 CHECK(is_latest IN (0, 1)),
      notes TEXT NULL,
      status TEXT NOT NULL DEFAULT 'FINALIZED' CHECK(status IN ('DRAFT', 'FINALIZED', 'ARCHIVED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (exchange_rate_id) REFERENCES exchange_rate(id),
      FOREIGN KEY (ccss_rule_set_id) REFERENCES payroll_rule_set(id),
      FOREIGN KEY (income_tax_rule_set_id) REFERENCES payroll_rule_set(id)
    );

CREATE TABLE "report_snapshot_line" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_snapshot_id INTEGER NOT NULL,
      line_type TEXT NOT NULL CHECK(line_type IN ('ACCOUNT_TOTAL', 'ENVELOPE_TOTAL')),
      account_id INTEGER NULL,
      account_name TEXT NOT NULL,
      account_currency TEXT NOT NULL,
      envelope_id INTEGER NULL,
      envelope_name TEXT NULL,
      category_id INTEGER NULL,
      category_name TEXT NULL,
      amount NUMERIC NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_snapshot_id) REFERENCES report_snapshot(id) ON DELETE CASCADE
    );

CREATE TABLE "transaction_line" (
      id INTEGER PRIMARY KEY,
      transaction_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      envelope_id INTEGER NOT NULL,
      amount NUMERIC NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (envelope_id) REFERENCES account_envelope(id)
    );

CREATE TABLE "transactions" (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

CREATE TABLE "user" (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

CREATE INDEX idx_account_envelope_category
      ON account_envelope(category_id);

CREATE INDEX idx_auto_assignment_rule_is_active
      ON auto_assignment_rule(is_active);

CREATE INDEX idx_auto_assignment_rule_lookup
      ON auto_assignment_rule(user_id, priority ASC, is_active DESC);

CREATE INDEX idx_auto_assignment_rule_user_id
      ON auto_assignment_rule(user_id);

CREATE INDEX idx_budget_ccss_rule_set_id
      ON budget(ccss_rule_set_id);

CREATE INDEX idx_budget_income_tax_rule_set_id
      ON budget(income_tax_rule_set_id);

CREATE INDEX idx_budget_line_account_envelope_id
      ON budget_line(account_envelope_id);

CREATE INDEX idx_budget_line_budget_id
      ON budget_line(budget_id);

CREATE INDEX idx_budget_line_budget_sort
      ON budget_line(budget_id, sort_order ASC, id ASC);

CREATE INDEX idx_budget_line_category_id
      ON budget_line(category_id);

CREATE INDEX idx_budget_month
      ON budget(month);

CREATE INDEX idx_budget_status
      ON budget(status);

CREATE INDEX idx_budget_user_id
      ON budget(user_id);

CREATE INDEX idx_budget_user_month
      ON budget(user_id, month DESC);

CREATE UNIQUE INDEX idx_cash_denomination_active_unique
      ON cash_denomination(user_id, currency, value)
      WHERE is_active = 1;

CREATE INDEX idx_cash_denomination_user_currency
      ON cash_denomination(user_id, currency, is_active, sort_order ASC, value DESC);

CREATE INDEX idx_cash_reconciliation_detail_denomination
      ON cash_reconciliation_detail(denomination_id);

CREATE INDEX idx_cash_reconciliation_detail_reconciliation
      ON cash_reconciliation_detail(reconciliation_id, sort_order ASC, id ASC);

CREATE INDEX idx_exchange_rate_effective_lookup
      ON exchange_rate(user_id, from_currency, to_currency, effective_date DESC);

CREATE INDEX idx_payroll_ccss_worker_rate_rule_set
      ON payroll_ccss_worker_rate(rule_set_id);

CREATE INDEX idx_payroll_income_tax_bracket_rule_set
      ON payroll_income_tax_bracket(rule_set_id);

CREATE INDEX idx_payroll_income_tax_bracket_rule_set_order
      ON payroll_income_tax_bracket(rule_set_id, range_order ASC);

CREATE UNIQUE INDEX idx_payroll_income_tax_bracket_rule_set_range_order
      ON payroll_income_tax_bracket(rule_set_id, range_order);

CREATE INDEX idx_payroll_rule_set_effective_from
      ON payroll_rule_set(effective_from DESC);

CREATE INDEX idx_payroll_rule_set_lookup
      ON payroll_rule_set(user_id, rule_type, is_active, effective_from DESC);

CREATE INDEX idx_payroll_rule_set_rule_type
      ON payroll_rule_set(rule_type);

CREATE INDEX idx_payroll_rule_set_user_id
      ON payroll_rule_set(user_id);

CREATE INDEX idx_reconciliation_account_active
      ON reconciliation(account_id, is_active, date DESC);

CREATE INDEX idx_reconciliation_account_date
      ON reconciliation(account_id, date);

CREATE INDEX idx_report_snapshot_ccss_rule_set_id
      ON report_snapshot(ccss_rule_set_id);

CREATE INDEX idx_report_snapshot_exchange_rate_id
      ON report_snapshot(exchange_rate_id);

CREATE INDEX idx_report_snapshot_generated_at
      ON report_snapshot(generated_at DESC);

CREATE INDEX idx_report_snapshot_income_tax_rule_set_id
      ON report_snapshot(income_tax_rule_set_id);

CREATE INDEX idx_report_snapshot_line_snapshot_account_name
      ON report_snapshot_line(report_snapshot_id, account_name);

CREATE INDEX idx_report_snapshot_line_snapshot_id
      ON report_snapshot_line(report_snapshot_id);

CREATE INDEX idx_report_snapshot_line_snapshot_type
      ON report_snapshot_line(report_snapshot_id, line_type);

CREATE INDEX idx_report_snapshot_report_month
      ON report_snapshot(report_month);

CREATE INDEX idx_report_snapshot_user_id
      ON report_snapshot(user_id);

CREATE INDEX idx_report_snapshot_user_month
      ON report_snapshot(user_id, report_month DESC);

CREATE INDEX idx_report_snapshot_user_month_latest
      ON report_snapshot(user_id, report_month DESC, is_latest DESC, version DESC);

CREATE INDEX idx_transaction_line_account_id
      ON transaction_line(account_id);

CREATE INDEX idx_transaction_line_account_transaction
      ON transaction_line(account_id, transaction_id);

CREATE INDEX idx_transaction_line_envelope_id
      ON transaction_line(envelope_id);

CREATE INDEX idx_transaction_line_transaction_id
      ON transaction_line(transaction_id);

CREATE INDEX idx_transactions_date
      ON transactions(date);

CREATE INDEX idx_transactions_user_date
      ON transactions(user_id, date DESC);

CREATE INDEX idx_transactions_user_id
      ON transactions(user_id);
