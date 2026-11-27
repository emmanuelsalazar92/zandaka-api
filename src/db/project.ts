import type { Database } from 'better-sqlite3';

const schema = `CREATE TABLE project (
  id TEXT NOT NULL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT,
  archived_at TEXT,
  creation_key TEXT,
  creation_title TEXT,
  UNIQUE(user_id, creation_key)
)`;

const movementSchema = `CREATE TABLE project_transaction_line (
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  transaction_line_id INTEGER NOT NULL REFERENCES transaction_line(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('expense', 'refund')),
  PRIMARY KEY(project_id, transaction_line_id)
)`;

const normalize = (sql: string) => sql.replace(/\bIF NOT EXISTS\b/gi, '').replace(/[\s;]/g, '');

function matchesTable(db: Database, name: string, expected: string): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { sql: string } | undefined;
  return Boolean(
    row &&
    normalize(row.sql) === normalize(expected) &&
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").get(name),
  );
}

export function projectsReady(db: Database): boolean {
  return matchesTable(db, 'project', schema);
}

export function projectMovementsReady(db: Database): boolean {
  return (
    db.pragma('foreign_keys', { simple: true }) === 1 &&
    matchesTable(db, 'project_transaction_line', movementSchema)
  );
}

export function installProjects(db: Database): void {
  db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'").get())
      throw new Error('An existing Zandaka database with the user table is required.');
    db.exec(schema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    if (!projectsReady(db)) throw new Error('Incompatible project schema; setup rolled back.');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_project_owner_updated ON project(user_id, updated_at DESC, id DESC)',
    );
  }).immediate();
}

export function installProjectMovements(db: Database): void {
  db.transaction(() => {
    if (
      !db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'transaction_line'")
        .get()
    )
      throw new Error('An existing Zandaka ledger with the transaction_line table is required.');
    installProjects(db);
    db.exec(movementSchema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    if (
      !projectMovementsReady(db) ||
      db.prepare("SELECT 1 FROM pragma_foreign_key_check('project_transaction_line') LIMIT 1").get()
    )
      throw new Error('Incompatible project movement storage; setup rolled back.');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_project_movement_line ON project_transaction_line(transaction_line_id)',
    );
  }).immediate();
}
