import db from '../db/db';
import { Reconciliation } from '../types';

export type ReconciliationAccountContext = {
  id: number;
  user_id: number;
  currency: string;
  is_active: number;
  type: string | null;
};

export class ReconciliationRepository {
  create(params: {
    accountId: number;
    date: string;
    realBalance: number;
    countMethod: 'MANUAL_TOTAL' | 'DENOMINATION_COUNT';
    calculatedBalance: number;
    difference: number;
    status: 'OPEN' | 'BALANCED';
    isActive: number;
    closedAt: string | null;
    note?: string;
  }): Reconciliation {
    const stmt = db.prepare(`
      INSERT INTO reconciliation (
        account_id,
        date,
        real_balance,
        count_method,
        status,
        calculated_balance,
        difference,
        is_active,
        closed_at,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.accountId,
      params.date,
      params.realBalance,
      params.countMethod,
      params.status,
      params.calculatedBalance,
      params.difference,
      params.isActive,
      params.closedAt,
      params.note || null,
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): Reconciliation | null {
    const stmt = db.prepare('SELECT * FROM reconciliation WHERE id = ?');
    return stmt.get(id) as Reconciliation | null;
  }

  findByAccountId(accountId: number): Reconciliation[] {
    const stmt = db.prepare(
      'SELECT * FROM reconciliation WHERE account_id = ? ORDER BY date DESC, created_at DESC',
    );
    return stmt.all(accountId) as Reconciliation[];
  }

  findLatestByAccountId(accountId: number): Reconciliation | null {
    const stmt = db.prepare(`
      SELECT *
      FROM reconciliation
      WHERE account_id = ?
      ORDER BY date DESC, created_at DESC
      LIMIT 1
    `);
    return stmt.get(accountId) as Reconciliation | null;
  }

  findAllLatest(): Array<{ accountId: number; reconciliation: Reconciliation | null }> {
    const stmt = db.prepare(`
      SELECT DISTINCT account_id
      FROM account
    `);
    const accounts = stmt.all() as Array<{ account_id: number }>;

    return accounts.map((account) => ({
      accountId: account.account_id,
      reconciliation: this.findLatestByAccountId(account.account_id),
    }));
  }

  findWithFilters(params: {
    accountId?: number;
    status?: 'OPEN' | 'BALANCED' | 'IGNORED';
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
    const stmt = db.prepare(`
      UPDATE reconciliation
      SET note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(note, id);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(id);
  }

  getAccountContext(accountId: number): ReconciliationAccountContext | null {
    const stmt = db.prepare(`
      SELECT
        account.id,
        account.user_id,
        account.currency,
        account.is_active,
        institution.type
      FROM account
      INNER JOIN institution ON institution.id = account.institution_id
      WHERE account.id = ?
    `);

    return stmt.get(accountId) as ReconciliationAccountContext | null;
  }

  getAccountIsActive(accountId: number): boolean | null {
    const context = this.getAccountContext(accountId);
    if (!context) return null;
    return context.is_active === 1;
  }

  getActiveReconciliation(accountId: number): Reconciliation | null {
    const stmt = db.prepare(`
      SELECT *
      FROM reconciliation
      WHERE account_id = ? AND is_active = 1
      ORDER BY date DESC, created_at DESC
      LIMIT 1
    `);
    return stmt.get(accountId) as Reconciliation | null;
  }

  computeCalculatedBalance(accountId: number, asOfDate: string): number {
    const stmt = db.prepare(`
      SELECT COALESCE(SUM(tl.amount), 0) AS balance
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
      SET
        status = 'BALANCED',
        is_active = 0,
        closed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = 1
    `);
    const result = stmt.run(reconciliationId);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(reconciliationId);
  }

  ignoreReconciliation(reconciliationId: number): Reconciliation | null {
    const stmt = db.prepare(`
      UPDATE reconciliation
      SET
        status = 'IGNORED',
        is_active = 0,
        closed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = 1
    `);
    const result = stmt.run(reconciliationId);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(reconciliationId);
  }
}
