import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';

// Use existing database at C:\sqlite\presupuesto.db
const dbPath = 'C:\\sqlite\\presupuesto.db';

// Verify database file exists
if (!fs.existsSync(dbPath)) {
  throw new Error(`Database file not found at ${dbPath}. Please ensure the database exists.`);
}

const db: DatabaseType = new Database(dbPath);
export { db };
export default db;

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema if tables don't exist
export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institution (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      allow_overdraft INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (institution_id) REFERENCES institution(id)
    );

    CREATE TABLE IF NOT EXISTS category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      parent_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (parent_id) REFERENCES category(id)
    );

    CREATE TABLE IF NOT EXISTS account_envelope (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (category_id) REFERENCES category(id),
      UNIQUE(account_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS transaction_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      envelope_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (envelope_id) REFERENCES account_envelope(id)
    );

    CREATE TABLE IF NOT EXISTS reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      real_balance REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE TABLE IF NOT EXISTS exchange_rate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transaction_line_transaction_id ON transaction_line(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_line_account_id ON transaction_line(account_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_line_envelope_id ON transaction_line(envelope_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  `);
}

// Initialize on import
initializeDatabase();

