import db from '../db/db';
import { Reconciliation } from '../types';

export class ReconciliationRepository {
  create(params: {
    accountId: number;
    date: string;
    realBalance: number;
    calculatedBalance: number;
    difference: number;
    status: 'OPEN' | 'BALANCED';
    isActive: number;
    closedAt: string | null;
    note?: string;
  }): Reconciliation {
    const stmt = db.prepare(`
      INSERT INTO reconciliation (
        account_id, date, real_balance, status, calculated_balance, difference, is_active, closed_at, note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.accountId,
      params.date,
      params.realBalance,
      params.status,
      params.calculatedBalance,
      params.difference,
      params.isActive,
      params.closedAt,
      params.note || null
    );
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

  findWithFilters(params: {
    accountId?: number;
    status?: 'OPEN' | 'BALANCED';
    limit: number;
    offset: number;
  }): Reconciliation[] {
    const conditions: string[] = [];
    const values: Array<number | string> = [];

    if (params.accountId !== undefined) {
      conditions.push('account_id = ?');
      values.push(params.accountId);
    }
    if (params.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`
      SELECT *
      FROM reconciliation
      ${where}
      ORDER BY date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(...values, params.limit, params.offset) as Reconciliation[];
  }

  updateNote(id: number, note: string | null): Reconciliation | null {
    const stmt = db.prepare('UPDATE reconciliation SET note = ? WHERE id = ?');
    const result = stmt.run(note, id);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(id);
  }

  getAccountIsActive(accountId: number): boolean | null {
    const stmt = db.prepare('SELECT is_active FROM account WHERE id = ?');
    const result = stmt.get(accountId) as { is_active: number } | undefined;
    if (!result) return null;
    return result.is_active === 1;
  }

  getActiveReconciliation(accountId: number): Reconciliation | null {
    const stmt = db.prepare(`
      SELECT * FROM reconciliation
      WHERE account_id = ? AND is_active = 1
      ORDER BY date DESC, created_at DESC
      LIMIT 1
    `);
    return stmt.get(accountId) as Reconciliation | null;
  }

  computeCalculatedBalance(accountId: number, asOfDate: string): number {
    const stmt = db.prepare(`
      SELECT COALESCE(SUM(tl.amount), 0) as balance
      FROM transaction_line tl
      JOIN transactions t ON tl.transaction_id = t.id
      WHERE tl.account_id = ?
        AND t.date <= ?
    `);
    const result = stmt.get(accountId, asOfDate) as { balance: number } | undefined;
    return result?.balance ?? 0;
  }

  closeReconciliation(reconciliationId: number): Reconciliation | null {
    const stmt = db.prepare(`
      UPDATE reconciliation
      SET status = 'BALANCED', is_active = 0, closed_at = datetime('now')
      WHERE id = ? AND is_active = 1
    `);
    const result = stmt.run(reconciliationId);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(reconciliationId);
  }
}

