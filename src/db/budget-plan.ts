import type { Database } from 'better-sqlite3';

const schema = `CREATE TABLE budget_plan (
      id TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
      month TEXT NOT NULL,
      document_json TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK(revision > 0),
      status TEXT NOT NULL CHECK(status IN ('draft','finalized','funded')),
      last_write_hash TEXT,
      fund_hash TEXT,
      receipt_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, month)
    )`;
const normalize = (sql: string) =>
  sql
    .replace(/\bIF NOT EXISTS\b/gi, '')
    .split(/('(?:''|[^'])*')/)
    .map((part, index) => (index % 2 ? part : part.replace(/[\s;]/g, '')))
    .join('');
export function budgetPlansReady(db: Database): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='budget_plan'")
    .get() as { sql: string } | undefined;
  return (
    !!row &&
    normalize(row.sql) === normalize(schema) &&
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name='budget_plan'").get()
  );
}
/** Additive, explicit preparation only. Never invoked by API startup. */
export function installBudgetPlans(db: Database): void {
  db.transaction(() => {
    db.exec(schema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    if (!budgetPlansReady(db))
      throw new Error('Incompatible budget_plan schema; preparation rolled back.');
  }).immediate();
}
