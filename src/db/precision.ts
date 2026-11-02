import type { Database } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { assertMoney, decimal, decimalNumber, decimalText, roundMoney } from '../utils/money';

export const MONEY_SCHEMA_VERSION = 'money-decimal-v1';
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

// null denotes a rate/percentage, whose precision is independent of currency minor units.
export const decimalColumns: Record<string, Record<string, string | null>> = {
  transaction_line: { amount: '(SELECT currency FROM account WHERE id = account_id)' },
  reconciliation: {
    real_balance: '(SELECT currency FROM account WHERE id = account_id)',
    calculated_balance: '(SELECT currency FROM account WHERE id = account_id)',
    difference: '(SELECT currency FROM account WHERE id = account_id)',
  },
  cash_denomination: { value: 'currency' },
  cash_reconciliation_detail: {
    denomination_value:
      '(SELECT a.currency FROM reconciliation r JOIN account a ON a.id = r.account_id WHERE r.id = reconciliation_id)',
    line_total:
      '(SELECT a.currency FROM reconciliation r JOIN account a ON a.id = r.account_id WHERE r.id = reconciliation_id)',
  },
  exchange_rate: { rate: null },
  payroll_ccss_worker_rate: { employee_rate: null, employer_rate: null },
  payroll_income_tax_bracket: { amount_from: "'CRC'", amount_to: "'CRC'", tax_rate: null },
  budget: { total_income: 'currency' },
  budget_line: { amount: '(SELECT currency FROM budget WHERE id = budget_id)', percentage: null },
  report_snapshot: {
    total_crc: "'CRC'",
    total_usd: "'USD'",
    exchange_rate_used: null,
    consolidated_amount: 'base_currency',
  },
  report_snapshot_line: { amount: 'account_currency' },
};

export function registerDecimalSql(db: Database): void {
  db.function('decimal_cmp', { deterministic: true }, (left: unknown, right: unknown) => {
    if (left === null || right === null) return null;
    return decimal(String(left)).cmp(decimal(String(right)));
  });
  db.function('decimal_valid', { deterministic: true }, (value: unknown) => {
    if (value === null) return 1;
    try {
      decimalNumber(String(value));
      return typeof value === 'string' ? 1 : 0;
    } catch {
      return 0;
    }
  });
  db.function('decimal_text', { deterministic: true }, (value: unknown) =>
    decimalText(String(value)),
  );
  db.aggregate('decimal_sum', {
    start: () => '0',
    step: (sum: string, value: unknown) =>
      value === null ? sum : decimalText(decimal(sum).plus(decimal(String(value)))),
    result: (sum: string) => sum,
  });
}

function exists(db: Database, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

export function hasPrecisionSchema(db: Database): boolean {
  return (
    exists(db, 'schema_migration') &&
    Boolean(db.prepare('SELECT 1 FROM schema_migration WHERE version=?').get(MONEY_SCHEMA_VERSION))
  );
}

export function requiresExplicitMoneyMigration(db: Database): boolean {
  return (
    !hasPrecisionSchema(db) &&
    Object.keys(decimalColumns).some(
      (table) =>
        exists(db, table) && Boolean(db.prepare(`SELECT 1 FROM ${quote(table)} LIMIT 1`).get()),
    )
  );
}

type Row = Record<string, unknown>;
function canonicalRows(db: Database, table: string): Row[] {
  const configured = decimalColumns[table];
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    ),
  );
  const currencies = Object.entries(configured).filter(
    ([name, currency]) => columns.has(name) && currency !== null,
  );
  const extras = currencies.map(
    ([name, currency]) => `${currency} AS ${quote(`__currency_${name}`)}`,
  );
  const rows = db
    .prepare(
      `SELECT *${extras.length ? ', ' + extras.join(', ') : ''} FROM ${quote(table)} ORDER BY id`,
    )
    .all() as Row[];
  return rows.map((source) => {
    const row = { ...source };
    for (const [name, currency] of Object.entries(configured)) {
      if (!columns.has(name) || row[name] === null) continue;
      try {
        if (currency !== null) assertMoney(String(row[name]), String(row[`__currency_${name}`]));
        else decimalNumber(String(row[name]));
        row[name] = decimalText(String(row[name]));
      } catch (error) {
        throw new Error(
          `Money migration blocked at ${table}.${name}, row ${row.id}: ${(error as Error).message}`,
        );
      }
    }
    for (const key of Object.keys(row)) if (key.startsWith('__currency_')) delete row[key];
    return row;
  });
}

function balances(db: Database) {
  if (!exists(db, 'transaction_line')) return [];
  const result: Array<{
    scope: string;
    id: number;
    currency: string;
    exact: string;
    legacy: number;
  }> = [];
  for (const scope of ['account_id', 'envelope_id']) {
    const groups = db
      .prepare(
        `SELECT tl.${scope} AS id, a.currency, decimal_sum(tl.amount) AS exact, SUM(tl.amount) AS legacy
      FROM transaction_line tl JOIN account a ON a.id=tl.account_id GROUP BY tl.${scope}, a.currency ORDER BY tl.${scope}`,
      )
      .all() as Array<{ id: number; currency: string; exact: string; legacy: number }>;
    for (const group of groups) {
      assertMoney(group.exact, group.currency);
      // A difference larger than a representational residue requires investigation, never correction.
      if (!decimal(roundMoney(group.legacy, group.currency)).eq(group.exact)) {
        throw new Error(
          `Money migration blocked: unexplained ${scope} balance discrepancy for ${group.id}`,
        );
      }
      result.push({ scope, ...group });
    }
  }
  return result;
}

export function auditMoneyDatabase(db: Database) {
  const tables = Object.keys(decimalColumns)
    .filter((table) => exists(db, table))
    .map((table) => {
      const rows = canonicalRows(db, table);
      return {
        table,
        rows: rows.length,
        sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      };
    });
  return { version: MONEY_SCHEMA_VERSION, tables, balances: balances(db) };
}

// Called inside the existing schema transaction, with foreign keys temporarily disabled.
export function migrateMoneyDatabase(db: Database): void {
  if (hasPrecisionSchema(db)) return;
  if (!db.inTransaction) throw new Error('Money migration requires an explicit schema transaction');
  if (
    exists(db, 'transaction_line') &&
    !(db.prepare('PRAGMA table_info(transaction_line)').all() as Array<{ name: string }>).some(
      (column) => column.name === 'source_amount_text',
    )
  ) {
    db.exec('ALTER TABLE transaction_line ADD COLUMN source_amount_text TEXT NULL');
  }
  const before = auditMoneyDatabase(db);
  for (const { table } of before.tables) {
    const rows = canonicalRows(db, table);
    const original = (
      db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {
        sql: string;
      }
    ).sql;
    const objects = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
      )
      .all(table) as Array<{ sql: string }>;
    const sequence = exists(db, 'sqlite_sequence')
      ? (db.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get(table) as
          | { seq: number }
          | undefined)
      : undefined;
    let sql = original.replace(/^[\s\S]*?\(/, `CREATE TABLE ${quote(`${table}__decimal_v1`)} (`);
    for (const name of Object.keys(decimalColumns[table])) {
      sql = sql.replace(
        new RegExp(`"?\\b${name}\\b"?\\s+(NUMERIC|REAL|INTEGER|TEXT)\\b`, 'i'),
        `${quote(name)} TEXT CHECK(decimal_valid(${quote(name)}))`,
      );
    }
    // Re-express original numeric constraints before TEXT affinity changes comparisons.
    for (const name of Object.keys(decimalColumns[table])) {
      sql = sql.replace(
        new RegExp(
          `"?\\b${name}\\b"?\\s*(>=|<=|>|<)\\s*("?\\b(?:${Object.keys(decimalColumns[table]).join('|')})\\b"?|[0-9]+)`,
          'g',
        ),
        (_match, operator: string, right: string) =>
          `decimal_cmp(${quote(name)}, ${/^\d+$/.test(right) ? right : quote(right.replace(/"/g, ''))}) ${operator} 0`,
      );
    }
    db.exec(sql);
    const rebuiltColumns = db
      .prepare(`PRAGMA table_info(${quote(`${table}__decimal_v1`)})`)
      .all() as Array<{ name: string; type: string }>;
    for (const name of Object.keys(decimalColumns[table])) {
      if (
        !rebuiltColumns.some(
          (column) => column.name === name && column.type.toUpperCase() === 'TEXT',
        )
      ) {
        throw new Error(`Money migration blocked: unsupported declaration for ${table}.${name}`);
      }
    }
    if (rows.length) {
      const columns = Object.keys(rows[0]);
      const insert = db.prepare(
        `INSERT INTO ${quote(`${table}__decimal_v1`)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      );
      for (const row of rows) insert.run(...columns.map((column) => row[column]));
    }
    db.exec(
      `DROP TABLE ${quote(table)}; ALTER TABLE ${quote(`${table}__decimal_v1`)} RENAME TO ${quote(table)}`,
    );
    if (sequence) {
      const updated = db
        .prepare('UPDATE sqlite_sequence SET seq=? WHERE name=?')
        .run(sequence.seq, table);
      if (!updated.changes)
        db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)').run(table, sequence.seq);
    }
    for (const object of objects)
      db.exec(
        table === 'cash_denomination' && /CREATE UNIQUE INDEX/i.test(object.sql)
          ? object.sql.replace(/\bvalue\b/g, 'decimal_text(value)')
          : object.sql,
      );
  }
  const after = auditMoneyDatabase(db);
  if (
    JSON.stringify(before.tables) !== JSON.stringify(after.tables) ||
    JSON.stringify(
      before.balances.map(({ scope, id, currency, exact }) => ({ scope, id, currency, exact })),
    ) !==
      JSON.stringify(
        after.balances.map(({ scope, id, currency, exact }) => ({ scope, id, currency, exact })),
      )
  ) {
    throw new Error('Money migration blocked: historical rows or reconstructed balances changed');
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('Money migration blocked: foreign key violations');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migration (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, audit_json TEXT NOT NULL)',
  );
  db.prepare('INSERT INTO schema_migration(version,audit_json) VALUES (?,?)').run(
    MONEY_SCHEMA_VERSION,
    JSON.stringify({ before, after }),
  );
}
