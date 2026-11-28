import type { Database } from 'better-sqlite3';

const tables = {
  subscription_definition: `CREATE TABLE subscription_definition (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL CHECK(revision > 0),
    document_json TEXT NOT NULL
  )`,
  subscription_charge: `CREATE TABLE subscription_charge (
    plan_id TEXT NOT NULL REFERENCES budget_plan(id) ON DELETE CASCADE,
    line_id TEXT NOT NULL,
    transaction_line_id INTEGER NOT NULL UNIQUE REFERENCES transaction_line(id) ON DELETE RESTRICT,
    forecast_hash TEXT NOT NULL,
    receipt_json TEXT NOT NULL,
    PRIMARY KEY(plan_id, line_id)
  )`,
};
const normalized = (value: string) =>
  value.replace(/\bIF NOT EXISTS\b/gi, '').replace(/[\s;]/g, '');

export function budgetSubscriptionsReady(db: Database) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?");
  const triggers = db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name=?");
  return Object.entries(tables).every(([name, sql]) => {
    const row = schema.get(name) as { sql: string } | undefined;
    return !!row && normalized(row.sql) === normalized(sql) && !triggers.get(name);
  });
}

export function installBudgetSubscriptions(db: Database) {
  db.transaction(() => {
    for (const sql of Object.values(tables)) {
      db.exec(sql.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    }
    if (!budgetSubscriptionsReady(db)) throw new Error('Incompatible subscriptions storage.');
    for (const name of Object.keys(tables)) {
      if (db.prepare(`PRAGMA foreign_key_check('${name}')`).all().length)
        throw new Error('Invalid references in subscriptions storage.');
    }
  }).immediate();
}
