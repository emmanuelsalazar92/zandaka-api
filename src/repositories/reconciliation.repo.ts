import db from '../db/db';
import { Reconciliation } from '../types';

export class ReconciliationRepository {
  create(accountId: number, date: string, realBalance: number, note?: string): Reconciliation {
    const stmt = db.prepare(`
      INSERT INTO reconciliation (account_id, date, real_balance, note)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(accountId, date, realBalance, note || null);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): Reconciliation | null {
    const stmt = db.prepare('SELECT * FROM reconciliation WHERE id = ?');
    return stmt.get(id) as Reconciliation | null;
  }

  findByAccountId(accountId: number): Reconciliation[] {
    const stmt = db.prepare(
      'SELECT * FROM reconciliation WHERE account_id = ? ORDER BY date DESC, created_at DESC'
    );
    return stmt.all(accountId) as Reconciliation[];
  }

  findLatestByAccountId(accountId: number): Reconciliation | null {
    const stmt = db.prepare(`
      SELECT * FROM reconciliation 
      WHERE account_id = ? 
      ORDER BY date DESC, created_at DESC 
      LIMIT 1
    `);
    return stmt.get(accountId) as Reconciliation | null;
  }

  findAllLatest(): Array<{ accountId: number; reconciliation: Reconciliation | null }> {
    // Get all accounts and their latest reconciliation
    const stmt = db.prepare(`
      SELECT DISTINCT account_id 
      FROM account
    `);
    const accounts = stmt.all() as Array<{ account_id: number }>;

    return accounts.map((acc) => ({
      accountId: acc.account_id,
      reconciliation: this.findLatestByAccountId(acc.account_id),
    }));
  }
}

