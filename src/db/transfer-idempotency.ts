import type { Database } from 'better-sqlite3';

/** Explicit additive setup. Never called by application startup or by a write request. */
export function installTransferIdempotency(db: Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_request (
        user_id INTEGER NOT NULL,
        request_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        transaction_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, request_id),
        FOREIGN KEY (user_id) REFERENCES user(id),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT
      ) WITHOUT ROWID;
    `);
  }).immediate();
}
