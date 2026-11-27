import type { Database } from 'better-sqlite3';

const schema = `CREATE TABLE budget_month_start (
  plan_id TEXT NOT NULL REFERENCES budget_plan(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  movement_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  second_movement_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,
  request_id TEXT,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY(plan_id, step),
  CHECK(second_movement_id IS NULL OR second_movement_id <> movement_id)
)`;

function normalized(sql: string) {
  return sql.replace(/\bIF NOT EXISTS\b/gi, '').replace(/[\s;]/g, '');
}

export function budgetMonthStartReady(db: Database) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='budget_month_start'")
    .get() as { sql: string } | undefined;
  return (
    !!row &&
    normalized(row.sql) === normalized(schema) &&
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name='budget_month_start'")
      .get()
  );
}

export function installBudgetMonthStart(db: Database) {
  db.transaction(() => {
    db.exec(schema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    if (!budgetMonthStartReady(db)) throw new Error('Incompatible budget_month_start schema.');
    if (db.prepare("PRAGMA foreign_key_check('budget_month_start')").all().length)
      throw new Error('Invalid references in budget_month_start.');
  }).immediate();
}

/** Finalizing and funding preserve the document. Saves and reopening require review. */
export function advanceMonthStartEvidence(db: Database, id: string, revision: number) {
  if (budgetMonthStartReady(db)) {
    db.prepare('UPDATE budget_month_start SET revision=? WHERE plan_id=? AND revision=?').run(
      revision + 1,
      id,
      revision,
    );
  }
}
