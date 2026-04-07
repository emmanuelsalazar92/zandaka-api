import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';

type TableColumn = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

const dbPath = process.env.DB_PATH || 'C:\\sqlite\\presupuesto.db';

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database file not found at ${dbPath}. Please ensure the database exists.`);
}

const db: DatabaseType = new Database(dbPath);

export { db };
export default db;

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

function tableExists(tableName: string): boolean {
  const stmt = db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `);

  return Boolean(stmt.get(tableName));
}

function getTableColumns(tableName: string): TableColumn[] {
  if (!tableExists(tableName)) {
    return [];
  }

  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableColumn[];
}

function getColumnNames(tableName: string): Set<string> {
  return new Set(getTableColumns(tableName).map((column) => column.name));
}

function getColumnType(tableName: string, columnName: string): string | null {
  const column = getTableColumns(tableName).find((item) => item.name === columnName);
  return column?.type?.toUpperCase() ?? null;
}

function getTableDefinitionSql(tableName: string): string | null {
  const stmt = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `);

  const row = stmt.get(tableName) as { sql?: string | null } | undefined;
  return row?.sql ?? null;
}

function getAuditExpressions(columns: Set<string>) {
  const createdAt = columns.has('created_at')
    ? 'COALESCE(created_at, CURRENT_TIMESTAMP)'
    : 'CURRENT_TIMESTAMP';

  let updatedAt = 'CURRENT_TIMESTAMP';
  if (columns.has('updated_at') && columns.has('created_at')) {
    updatedAt = 'COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)';
  } else if (columns.has('updated_at')) {
    updatedAt = 'COALESCE(updated_at, CURRENT_TIMESTAMP)';
  } else if (columns.has('created_at')) {
    updatedAt = 'COALESCE(created_at, CURRENT_TIMESTAMP)';
  }

  return { createdAt, updatedAt };
}

function createUserTableSql(tableName = 'user'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

function createInstitutionTableSql(tableName = 'institution'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BANK', 'CASH', 'VIRTUAL')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    )
  `;
}

function createAccountTableSql(tableName = 'account'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createCategoryTableSql(tableName = 'category'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      parent_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (parent_id) REFERENCES category(id)
    )
  `;
}

function createAccountEnvelopeTableSql(tableName = 'account_envelope'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id, category_id),
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (category_id) REFERENCES category(id)
    )
  `;
}

function createTransactionsTableSql(tableName = 'transactions'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    )
  `;
}

function createTransactionLineTableSql(tableName = 'transaction_line'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createReconciliationTableSql(tableName = 'reconciliation'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createCashDenominationTableSql(tableName = 'cash_denomination'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createCashReconciliationDetailTableSql(
  tableName = 'cash_reconciliation_detail',
): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createExchangeRateTableSql(tableName = 'exchange_rate'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createPayrollRuleSetTableSql(tableName = 'payroll_rule_set'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createPayrollCcssWorkerRateTableSql(tableName = 'payroll_ccss_worker_rate'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_set_id INTEGER NOT NULL,
      employee_rate NUMERIC NOT NULL CHECK(employee_rate >= 0 AND employee_rate <= 1),
      employer_rate NUMERIC NULL CHECK(employer_rate IS NULL OR (employer_rate >= 0 AND employer_rate <= 1)),
      base_type TEXT NOT NULL DEFAULT 'GROSS_SALARY',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rule_set_id),
      FOREIGN KEY (rule_set_id) REFERENCES payroll_rule_set(id) ON DELETE CASCADE
    )
  `;
}

function createPayrollIncomeTaxBracketTableSql(
  tableName = 'payroll_income_tax_bracket',
): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createBudgetTableSql(tableName = 'budget'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createBudgetLineTableSql(tableName = 'budget_line'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createAutoAssignmentRuleTableSql(tableName = 'auto_assignment_rule'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createReportSnapshotTableSql(tableName = 'report_snapshot'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function createReportSnapshotLineTableSql(tableName = 'report_snapshot_line'): string {
  return `
    CREATE TABLE ${quoteIdentifier(tableName)} (
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
    )
  `;
}

function rebuildTable(params: {
  tableName: string;
  createSql: (tableName?: string) => string;
  insertSql: (sourceTable: string, targetTable: string) => string;
}): void {
  const tempTableName = `${params.tableName}__new`;
  db.exec(params.createSql(tempTableName));
  db.exec(params.insertSql(params.tableName, tempTableName));
  db.exec(`DROP TABLE ${quoteIdentifier(params.tableName)}`);
  db.exec(
    `ALTER TABLE ${quoteIdentifier(tempTableName)} RENAME TO ${quoteIdentifier(params.tableName)}`,
  );
}

function migrateUserTable(): void {
  if (!tableExists('user')) {
    db.exec(createUserTableSql());
    return;
  }

  const columns = getColumnNames('user');
  if (columns.has('created_at') && columns.has('updated_at')) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'user',
    createSql: createUserTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (id, name, base_currency, created_at, updated_at)
      SELECT
        id,
        name,
        base_currency,
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateInstitutionTable(): void {
  if (!tableExists('institution')) {
    db.exec(createInstitutionTableSql());
    return;
  }

  const columns = getColumnNames('institution');
  if (columns.has('created_at') && columns.has('updated_at')) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'institution',
    createSql: createInstitutionTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        name,
        type,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        name,
        type,
        COALESCE(is_active, 1),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateAccountTable(): void {
  if (!tableExists('account')) {
    db.exec(createAccountTableSql());
    return;
  }

  const columns = getColumnNames('account');
  if (columns.has('created_at') && columns.has('updated_at')) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'account',
    createSql: createAccountTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        institution_id,
        name,
        currency,
        is_active,
        allow_overdraft,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        institution_id,
        name,
        currency,
        COALESCE(is_active, 1),
        COALESCE(allow_overdraft, 1),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateCategoryTable(): void {
  if (!tableExists('category')) {
    db.exec(createCategoryTableSql());
    return;
  }

  const columns = getColumnNames('category');
  if (columns.has('created_at') && columns.has('updated_at')) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'category',
    createSql: createCategoryTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        name,
        parent_id,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        name,
        parent_id,
        COALESCE(is_active, 1),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateAccountEnvelopeTable(): void {
  if (!tableExists('account_envelope')) {
    db.exec(createAccountEnvelopeTableSql());
    return;
  }

  const columns = getColumnNames('account_envelope');
  if (columns.has('created_at') && columns.has('updated_at')) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'account_envelope',
    createSql: createAccountEnvelopeTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        account_id,
        category_id,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        id,
        account_id,
        category_id,
        COALESCE(is_active, 1),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateTransactionsTable(): void {
  if (!tableExists('transactions')) {
    db.exec(createTransactionsTableSql());
    return;
  }

  const columns = getColumnNames('transactions');
  if (columns.has('created_at') && columns.has('updated_at')) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'transactions',
    createSql: createTransactionsTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        date,
        description,
        type,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        date,
        description,
        type,
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateTransactionLineTable(): void {
  if (!tableExists('transaction_line')) {
    db.exec(createTransactionLineTableSql());
    return;
  }

  const columns = getColumnNames('transaction_line');
  const amountIsNumeric = getColumnType('transaction_line', 'amount') === 'NUMERIC';
  if (columns.has('created_at') && columns.has('updated_at') && amountIsNumeric) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'transaction_line',
    createSql: createTransactionLineTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        transaction_id,
        account_id,
        envelope_id,
        amount,
        created_at,
        updated_at
      )
      SELECT
        id,
        transaction_id,
        account_id,
        envelope_id,
        CAST(amount AS NUMERIC),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateReconciliationTable(): void {
  if (!tableExists('reconciliation')) {
    db.exec(createReconciliationTableSql());
    return;
  }

  const columns = getColumnNames('reconciliation');
  const monetaryColumnsAreNumeric =
    getColumnType('reconciliation', 'real_balance') === 'NUMERIC' &&
    getColumnType('reconciliation', 'calculated_balance') === 'NUMERIC' &&
    getColumnType('reconciliation', 'difference') === 'NUMERIC';
  const tableDefinition = getTableDefinitionSql('reconciliation') ?? '';
  const supportsCountMethod =
    columns.has('count_method') &&
    tableDefinition.includes("'MANUAL_TOTAL'") &&
    tableDefinition.includes("'DENOMINATION_COUNT'");

  if (
    columns.has('created_at') &&
    columns.has('updated_at') &&
    monetaryColumnsAreNumeric &&
    supportsCountMethod
  ) {
    return;
  }

  const audit = getAuditExpressions(columns);
  const countMethodExpression = columns.has('count_method')
    ? "COALESCE(count_method, 'MANUAL_TOTAL')"
    : "'MANUAL_TOTAL'";
  rebuildTable({
    tableName: 'reconciliation',
    createSql: createReconciliationTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        account_id,
        date,
        real_balance,
        count_method,
        note,
        created_at,
        updated_at,
        status,
        calculated_balance,
        difference,
        is_active,
        closed_at
      )
      SELECT
        id,
        account_id,
        date,
        CAST(real_balance AS NUMERIC),
        ${countMethodExpression},
        note,
        ${audit.createdAt},
        ${audit.updatedAt},
        COALESCE(status, 'OPEN'),
        CAST(COALESCE(calculated_balance, 0) AS NUMERIC),
        CAST(COALESCE(difference, 0) AS NUMERIC),
        COALESCE(is_active, 1),
        closed_at
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateCashDenominationTable(): void {
  if (!tableExists('cash_denomination')) {
    db.exec(createCashDenominationTableSql());
    return;
  }

  const columns = getColumnNames('cash_denomination');
  const requiredColumns = [
    'id',
    'user_id',
    'currency',
    'value',
    'type',
    'label',
    'sort_order',
    'is_active',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  const numericValue = getColumnType('cash_denomination', 'value') === 'NUMERIC';

  if (!missingRequiredColumn && numericValue) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'cash_denomination',
    createSql: createCashDenominationTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        currency,
        value,
        type,
        label,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        currency,
        CAST(value AS NUMERIC),
        type,
        label,
        COALESCE(sort_order, 0),
        COALESCE(is_active, 1),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateCashReconciliationDetailTable(): void {
  if (!tableExists('cash_reconciliation_detail')) {
    db.exec(createCashReconciliationDetailTableSql());
    return;
  }

  const columns = getColumnNames('cash_reconciliation_detail');
  const requiredColumns = [
    'id',
    'reconciliation_id',
    'denomination_id',
    'denomination_value',
    'denomination_type',
    'denomination_label',
    'quantity',
    'line_total',
    'sort_order',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  const numericColumnsAreCorrect =
    getColumnType('cash_reconciliation_detail', 'denomination_value') === 'NUMERIC' &&
    getColumnType('cash_reconciliation_detail', 'line_total') === 'NUMERIC';

  if (!missingRequiredColumn && numericColumnsAreCorrect) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'cash_reconciliation_detail',
    createSql: createCashReconciliationDetailTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        reconciliation_id,
        denomination_id,
        denomination_value,
        denomination_type,
        denomination_label,
        quantity,
        line_total,
        sort_order,
        created_at,
        updated_at
      )
      SELECT
        id,
        reconciliation_id,
        denomination_id,
        CAST(denomination_value AS NUMERIC),
        denomination_type,
        denomination_label,
        COALESCE(quantity, 0),
        CAST(COALESCE(line_total, 0) AS NUMERIC),
        COALESCE(sort_order, 0),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateExchangeRateTable(): void {
  if (!tableExists('exchange_rate')) {
    db.exec(createExchangeRateTableSql());
    return;
  }

  const columns = getColumnNames('exchange_rate');
  const rateIsNumeric = getColumnType('exchange_rate', 'rate') === 'NUMERIC';
  if (
    columns.has('effective_date') &&
    columns.has('created_at') &&
    columns.has('updated_at') &&
    rateIsNumeric
  ) {
    return;
  }

  const audit = getAuditExpressions(columns);
  const effectiveDateExpression = columns.has('effective_date')
    ? "CASE WHEN trim(COALESCE(effective_date, '')) <> '' THEN substr(effective_date, 1, 10) ELSE COALESCE(substr(created_at, 1, 10), date('now')) END"
    : "COALESCE(substr(created_at, 1, 10), date('now'))";

  rebuildTable({
    tableName: 'exchange_rate',
    createSql: createExchangeRateTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        from_currency,
        to_currency,
        rate,
        effective_date,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        from_currency,
        to_currency,
        CAST(rate AS NUMERIC),
        ${effectiveDateExpression},
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migratePayrollRuleSetTable(): void {
  if (!tableExists('payroll_rule_set')) {
    db.exec(createPayrollRuleSetTableSql());
    return;
  }

  const columns = getColumnNames('payroll_rule_set');
  const requiredColumns = [
    'id',
    'user_id',
    'country_code',
    'rule_type',
    'name',
    'effective_from',
    'effective_to',
    'is_active',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));

  if (!missingRequiredColumn) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'payroll_rule_set',
    createSql: createPayrollRuleSetTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        country_code,
        rule_type,
        name,
        effective_from,
        effective_to,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        COALESCE(country_code, 'CR'),
        rule_type,
        name,
        effective_from,
        effective_to,
        COALESCE(is_active, 1),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migratePayrollCcssWorkerRateTable(): void {
  if (!tableExists('payroll_ccss_worker_rate')) {
    db.exec(createPayrollCcssWorkerRateTableSql());
    return;
  }

  const columns = getColumnNames('payroll_ccss_worker_rate');
  const requiredColumns = [
    'id',
    'rule_set_id',
    'employee_rate',
    'employer_rate',
    'base_type',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  const numericColumnsAreCorrect =
    getColumnType('payroll_ccss_worker_rate', 'employee_rate') === 'NUMERIC' &&
    getColumnType('payroll_ccss_worker_rate', 'employer_rate') === 'NUMERIC';

  if (!missingRequiredColumn && numericColumnsAreCorrect) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'payroll_ccss_worker_rate',
    createSql: createPayrollCcssWorkerRateTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        rule_set_id,
        employee_rate,
        employer_rate,
        base_type,
        created_at,
        updated_at
      )
      SELECT
        id,
        rule_set_id,
        CAST(employee_rate AS NUMERIC),
        CAST(employer_rate AS NUMERIC),
        COALESCE(base_type, 'GROSS_SALARY'),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migratePayrollIncomeTaxBracketTable(): void {
  if (!tableExists('payroll_income_tax_bracket')) {
    db.exec(createPayrollIncomeTaxBracketTableSql());
    return;
  }

  const columns = getColumnNames('payroll_income_tax_bracket');
  const requiredColumns = [
    'id',
    'rule_set_id',
    'range_order',
    'amount_from',
    'amount_to',
    'tax_rate',
    'is_exempt',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  const numericColumnsAreCorrect =
    getColumnType('payroll_income_tax_bracket', 'amount_from') === 'NUMERIC' &&
    getColumnType('payroll_income_tax_bracket', 'amount_to') === 'NUMERIC' &&
    getColumnType('payroll_income_tax_bracket', 'tax_rate') === 'NUMERIC';

  if (!missingRequiredColumn && numericColumnsAreCorrect) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'payroll_income_tax_bracket',
    createSql: createPayrollIncomeTaxBracketTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        rule_set_id,
        range_order,
        amount_from,
        amount_to,
        tax_rate,
        is_exempt,
        created_at,
        updated_at
      )
      SELECT
        id,
        rule_set_id,
        range_order,
        CAST(amount_from AS NUMERIC),
        CAST(amount_to AS NUMERIC),
        CAST(tax_rate AS NUMERIC),
        COALESCE(is_exempt, 0),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateBudgetTable(): void {
  if (!tableExists('budget')) {
    db.exec(createBudgetTableSql());
    return;
  }

  const columns = getColumnNames('budget');
  const totalIncomeIsNumeric = getColumnType('budget', 'total_income') === 'NUMERIC';
  const hasPayrollRuleReferences =
    columns.has('ccss_rule_set_id') && columns.has('income_tax_rule_set_id');
  if (
    columns.has('created_at') &&
    columns.has('updated_at') &&
    totalIncomeIsNumeric &&
    hasPayrollRuleReferences
  ) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'budget',
    createSql: createBudgetTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        month,
        currency,
        total_income,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        status,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        month,
        currency,
        CAST(total_income AS NUMERIC),
        ${columns.has('ccss_rule_set_id') ? 'ccss_rule_set_id' : 'NULL'},
        ${columns.has('income_tax_rule_set_id') ? 'income_tax_rule_set_id' : 'NULL'},
        COALESCE(status, 'draft'),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateBudgetLineTable(): void {
  if (!tableExists('budget_line')) {
    db.exec(createBudgetLineTableSql());
    return;
  }

  const columns = getColumnNames('budget_line');
  const amountIsNumeric = getColumnType('budget_line', 'amount') === 'NUMERIC';
  const percentageIsNumeric = getColumnType('budget_line', 'percentage') === 'NUMERIC';

  if (columns.has('created_at') && columns.has('updated_at') && amountIsNumeric && percentageIsNumeric) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'budget_line',
    createSql: createBudgetLineTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        budget_id,
        category_id,
        account_envelope_id,
        amount,
        percentage,
        notes,
        sort_order,
        created_at,
        updated_at
      )
      SELECT
        id,
        budget_id,
        category_id,
        account_envelope_id,
        CAST(amount AS NUMERIC),
        CAST(percentage AS NUMERIC),
        notes,
        COALESCE(sort_order, 0),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateAutoAssignmentRuleTable(): void {
  if (!tableExists('auto_assignment_rule')) {
    db.exec(createAutoAssignmentRuleTableSql());
    return;
  }

  const columns = getColumnNames('auto_assignment_rule');
  const requiredColumns = [
    'id',
    'user_id',
    'pattern',
    'match_type',
    'account_id',
    'account_envelope_id',
    'priority',
    'is_active',
    'notes',
    'created_at',
    'updated_at',
  ];

  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  if (!missingRequiredColumn) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'auto_assignment_rule',
    createSql: createAutoAssignmentRuleTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        pattern,
        match_type,
        account_id,
        account_envelope_id,
        priority,
        is_active,
        notes,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        pattern,
        COALESCE(match_type, 'CONTAINS'),
        account_id,
        account_envelope_id,
        COALESCE(priority, 100),
        COALESCE(is_active, 1),
        notes,
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
      WHERE trim(COALESCE(pattern, '')) <> ''
        AND (account_id IS NOT NULL OR account_envelope_id IS NOT NULL)
    `,
  });
}

function migrateReportSnapshotTable(): void {
  if (!tableExists('report_snapshot')) {
    db.exec(createReportSnapshotTableSql());
    return;
  }

  const columns = getColumnNames('report_snapshot');
  const requiredColumns = [
    'id',
    'user_id',
    'report_month',
    'generated_at',
    'base_currency',
    'total_crc',
    'total_usd',
    'exchange_rate_id',
    'exchange_rate_used',
    'consolidated_amount',
    'ccss_rule_set_id',
    'income_tax_rule_set_id',
    'version',
    'is_latest',
    'notes',
    'status',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  const numericColumnsAreCorrect =
    getColumnType('report_snapshot', 'total_crc') === 'NUMERIC' &&
    getColumnType('report_snapshot', 'total_usd') === 'NUMERIC' &&
    getColumnType('report_snapshot', columns.has('exchange_rate_used') ? 'exchange_rate_used' : 'usd_to_crc_rate') === 'NUMERIC' &&
    getColumnType('report_snapshot', columns.has('consolidated_amount') ? 'consolidated_amount' : 'consolidated_crc') === 'NUMERIC';
  const tableDefinition = getTableDefinitionSql('report_snapshot') ?? '';
  const statusConstraintSupportsArchived = tableDefinition.includes("'ARCHIVED'");

  if (!missingRequiredColumn && numericColumnsAreCorrect && statusConstraintSupportsArchived) {
    return;
  }

  const audit = getAuditExpressions(columns);
  const generatedAtExpression = columns.has('generated_at')
    ? 'COALESCE(generated_at, CURRENT_TIMESTAMP)'
    : 'CURRENT_TIMESTAMP';
  const exchangeRateIdExpression = columns.has('exchange_rate_id') ? 'exchange_rate_id' : 'NULL';
  const legacyUsdToCrcExpression = columns.has('usd_to_crc_rate')
    ? 'CAST(usd_to_crc_rate AS NUMERIC)'
    : 'NULL';
  const legacyConsolidatedUsdExpression = columns.has('consolidated_usd')
    ? 'CAST(consolidated_usd AS NUMERIC)'
    : 'NULL';
  const exchangeRateUsedExpression = columns.has('exchange_rate_used')
    ? 'CAST(exchange_rate_used AS NUMERIC)'
    : columns.has('usd_to_crc_rate')
      ? columns.has('consolidated_usd')
        ? `
          CASE
            WHEN UPPER(base_currency) = 'USD'
              AND consolidated_usd IS NOT NULL
              AND CAST(COALESCE(total_crc, 0) AS NUMERIC) <> 0
              AND (${legacyConsolidatedUsdExpression} - CAST(COALESCE(total_usd, 0) AS NUMERIC)) <> 0
            THEN CAST(COALESCE(total_crc, 0) AS NUMERIC) /
                 (${legacyConsolidatedUsdExpression} - CAST(COALESCE(total_usd, 0) AS NUMERIC))
            ELSE ${legacyUsdToCrcExpression}
          END
        `
        : legacyUsdToCrcExpression
      : 'NULL';
  const consolidatedAmountExpression = columns.has('consolidated_amount')
    ? 'CAST(consolidated_amount AS NUMERIC)'
    : columns.has('consolidated_crc') || columns.has('consolidated_usd')
      ? `
        CASE
          WHEN UPPER(base_currency) = 'USD' THEN ${columns.has('consolidated_usd') ? 'CAST(consolidated_usd AS NUMERIC)' : 'NULL'}
          ELSE ${columns.has('consolidated_crc') ? 'CAST(consolidated_crc AS NUMERIC)' : 'NULL'}
        END
      `
      : 'NULL';
  const versionExpression = columns.has('version') ? 'COALESCE(version, 1)' : '1';
  const isLatestExpression = columns.has('is_latest') ? 'COALESCE(is_latest, 1)' : '1';
  const notesExpression = columns.has('notes') ? 'notes' : 'NULL';
  const ccssRuleSetExpression = columns.has('ccss_rule_set_id') ? 'ccss_rule_set_id' : 'NULL';
  const incomeTaxRuleSetExpression = columns.has('income_tax_rule_set_id')
    ? 'income_tax_rule_set_id'
    : 'NULL';
  const statusExpression = columns.has('status')
    ? "CASE WHEN status = 'ARCHIVED' THEN 'ARCHIVED' ELSE COALESCE(status, 'FINALIZED') END"
    : "'FINALIZED'";

  rebuildTable({
    tableName: 'report_snapshot',
    createSql: createReportSnapshotTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        user_id,
        report_month,
        generated_at,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_id,
        exchange_rate_used,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        version,
        is_latest,
        notes,
        status,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        report_month,
        ${generatedAtExpression},
        base_currency,
        CAST(COALESCE(total_crc, 0) AS NUMERIC),
        CAST(COALESCE(total_usd, 0) AS NUMERIC),
        ${exchangeRateIdExpression},
        ${exchangeRateUsedExpression},
        ${consolidatedAmountExpression},
        ${ccssRuleSetExpression},
        ${incomeTaxRuleSetExpression},
        ${versionExpression},
        ${isLatestExpression},
        ${notesExpression},
        ${statusExpression},
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function migrateReportSnapshotLineTable(): void {
  if (!tableExists('report_snapshot_line')) {
    db.exec(createReportSnapshotLineTableSql());
    return;
  }

  const columns = getColumnNames('report_snapshot_line');
  const requiredColumns = [
    'id',
    'report_snapshot_id',
    'line_type',
    'account_id',
    'account_name',
    'account_currency',
    'envelope_id',
    'envelope_name',
    'category_id',
    'category_name',
    'amount',
    'sort_order',
    'created_at',
    'updated_at',
  ];
  const missingRequiredColumn = requiredColumns.some((column) => !columns.has(column));
  const amountIsNumeric = getColumnType('report_snapshot_line', 'amount') === 'NUMERIC';

  if (!missingRequiredColumn && amountIsNumeric) {
    return;
  }

  const audit = getAuditExpressions(columns);
  rebuildTable({
    tableName: 'report_snapshot_line',
    createSql: createReportSnapshotLineTableSql,
    insertSql: (sourceTable, targetTable) => `
      INSERT INTO ${quoteIdentifier(targetTable)} (
        id,
        report_snapshot_id,
        line_type,
        account_id,
        account_name,
        account_currency,
        envelope_id,
        envelope_name,
        category_id,
        category_name,
        amount,
        sort_order,
        created_at,
        updated_at
      )
      SELECT
        id,
        report_snapshot_id,
        line_type,
        account_id,
        account_name,
        account_currency,
        envelope_id,
        envelope_name,
        category_id,
        category_name,
        CAST(COALESCE(amount, 0) AS NUMERIC),
        COALESCE(sort_order, 0),
        ${audit.createdAt},
        ${audit.updatedAt}
      FROM ${quoteIdentifier(sourceTable)}
    `,
  });
}

function ensureIndexes(): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_transactions_user_account_date;
    DROP INDEX IF EXISTS idx_transactions_user_category_date;
    DROP INDEX IF EXISTS idx_exchange_rate_latest;

    CREATE INDEX IF NOT EXISTS idx_account_envelope_category
      ON account_envelope(category_id);

    CREATE INDEX IF NOT EXISTS idx_transaction_line_transaction_id
      ON transaction_line(transaction_id);

    CREATE INDEX IF NOT EXISTS idx_transaction_line_account_id
      ON transaction_line(account_id);

    CREATE INDEX IF NOT EXISTS idx_transaction_line_envelope_id
      ON transaction_line(envelope_id);

    CREATE INDEX IF NOT EXISTS idx_transaction_line_account_transaction
      ON transaction_line(account_id, transaction_id);

    CREATE INDEX IF NOT EXISTS idx_transactions_date
      ON transactions(date);

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id
      ON transactions(user_id);

    CREATE INDEX IF NOT EXISTS idx_transactions_user_date
      ON transactions(user_id, date DESC);

    CREATE INDEX IF NOT EXISTS idx_reconciliation_account_date
      ON reconciliation(account_id, date);

    CREATE INDEX IF NOT EXISTS idx_reconciliation_account_active
      ON reconciliation(account_id, is_active, date DESC);

    CREATE INDEX IF NOT EXISTS idx_cash_denomination_user_currency
      ON cash_denomination(user_id, currency, is_active, sort_order ASC, value DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_denomination_active_unique
      ON cash_denomination(user_id, currency, value)
      WHERE is_active = 1;

    CREATE INDEX IF NOT EXISTS idx_cash_reconciliation_detail_reconciliation
      ON cash_reconciliation_detail(reconciliation_id, sort_order ASC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_cash_reconciliation_detail_denomination
      ON cash_reconciliation_detail(denomination_id);

    CREATE INDEX IF NOT EXISTS idx_exchange_rate_effective_lookup
      ON exchange_rate(user_id, from_currency, to_currency, effective_date DESC);

    CREATE INDEX IF NOT EXISTS idx_payroll_rule_set_user_id
      ON payroll_rule_set(user_id);

    CREATE INDEX IF NOT EXISTS idx_payroll_rule_set_rule_type
      ON payroll_rule_set(rule_type);

    CREATE INDEX IF NOT EXISTS idx_payroll_rule_set_effective_from
      ON payroll_rule_set(effective_from DESC);

    CREATE INDEX IF NOT EXISTS idx_payroll_rule_set_lookup
      ON payroll_rule_set(user_id, rule_type, is_active, effective_from DESC);

    CREATE INDEX IF NOT EXISTS idx_payroll_ccss_worker_rate_rule_set
      ON payroll_ccss_worker_rate(rule_set_id);

    CREATE INDEX IF NOT EXISTS idx_payroll_income_tax_bracket_rule_set
      ON payroll_income_tax_bracket(rule_set_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_income_tax_bracket_rule_set_range_order
      ON payroll_income_tax_bracket(rule_set_id, range_order);

    CREATE INDEX IF NOT EXISTS idx_payroll_income_tax_bracket_rule_set_order
      ON payroll_income_tax_bracket(rule_set_id, range_order ASC);

    CREATE INDEX IF NOT EXISTS idx_budget_user_id
      ON budget(user_id);

    CREATE INDEX IF NOT EXISTS idx_budget_month
      ON budget(month);

    CREATE INDEX IF NOT EXISTS idx_budget_status
      ON budget(status);

    CREATE INDEX IF NOT EXISTS idx_budget_user_month
      ON budget(user_id, month DESC);

    CREATE INDEX IF NOT EXISTS idx_budget_ccss_rule_set_id
      ON budget(ccss_rule_set_id);

    CREATE INDEX IF NOT EXISTS idx_budget_income_tax_rule_set_id
      ON budget(income_tax_rule_set_id);

    CREATE INDEX IF NOT EXISTS idx_budget_line_budget_id
      ON budget_line(budget_id);

    CREATE INDEX IF NOT EXISTS idx_budget_line_category_id
      ON budget_line(category_id);

    CREATE INDEX IF NOT EXISTS idx_budget_line_account_envelope_id
      ON budget_line(account_envelope_id);

    CREATE INDEX IF NOT EXISTS idx_budget_line_budget_sort
      ON budget_line(budget_id, sort_order ASC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_auto_assignment_rule_user_id
      ON auto_assignment_rule(user_id);

    CREATE INDEX IF NOT EXISTS idx_auto_assignment_rule_is_active
      ON auto_assignment_rule(is_active);

    CREATE INDEX IF NOT EXISTS idx_auto_assignment_rule_lookup
      ON auto_assignment_rule(user_id, priority ASC, is_active DESC);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_user_id
      ON report_snapshot(user_id);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_report_month
      ON report_snapshot(report_month);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_generated_at
      ON report_snapshot(generated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_user_month
      ON report_snapshot(user_id, report_month DESC);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_user_month_latest
      ON report_snapshot(user_id, report_month DESC, is_latest DESC, version DESC);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_exchange_rate_id
      ON report_snapshot(exchange_rate_id);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_ccss_rule_set_id
      ON report_snapshot(ccss_rule_set_id);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_income_tax_rule_set_id
      ON report_snapshot(income_tax_rule_set_id);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_line_snapshot_id
      ON report_snapshot_line(report_snapshot_id);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_line_snapshot_type
      ON report_snapshot_line(report_snapshot_id, line_type);

    CREATE INDEX IF NOT EXISTS idx_report_snapshot_line_snapshot_account_name
      ON report_snapshot_line(report_snapshot_id, account_name);
  `);
}

export function migrateDatabase(): void {
  db.pragma('foreign_keys = OFF');

  try {
    const migrate = db.transaction(() => {
      migrateUserTable();
      migrateInstitutionTable();
      migrateAccountTable();
      migrateCategoryTable();
      migrateAccountEnvelopeTable();
      migrateTransactionsTable();
      migrateTransactionLineTable();
      migrateReconciliationTable();
      migrateCashDenominationTable();
      migrateCashReconciliationDetailTable();
      migrateExchangeRateTable();
      migratePayrollRuleSetTable();
      migratePayrollCcssWorkerRateTable();
      migratePayrollIncomeTaxBracketTable();
      migrateBudgetTable();
      migrateBudgetLineTable();
      migrateAutoAssignmentRuleTable();
      migrateReportSnapshotTable();
      migrateReportSnapshotLineTable();
      ensureIndexes();
    });

    migrate();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all() as Array<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>;

  if (foreignKeyViolations.length > 0) {
    throw new Error(
      `Foreign key check failed after migration: ${JSON.stringify(foreignKeyViolations)}`,
    );
  }
}

export function initializeDatabase(): void {
  migrateDatabase();
}

db.pragma('foreign_keys = ON');
initializeDatabase();

