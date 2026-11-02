import { moneyStatement } from '../db/money-statement';
import { AccountEnvelope } from '../types';

export class EnvelopeRepository {
  create(accountId: number, categoryId: number): AccountEnvelope {
    const stmt = moneyStatement(`
      INSERT INTO account_envelope (account_id, category_id, is_active)
      VALUES (?, ?, 1)
    `);
    const result = stmt.run(accountId, categoryId);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): AccountEnvelope | null {
    const stmt = moneyStatement('SELECT * FROM account_envelope WHERE id = ?');
    return stmt.get(id) as AccountEnvelope | null;
  }

  findByAccountAndCategory(accountId: number, categoryId: number): AccountEnvelope | null {
    const stmt = moneyStatement(
      'SELECT * FROM account_envelope WHERE account_id = ? AND category_id = ?',
    );
    return stmt.get(accountId, categoryId) as AccountEnvelope | null;
  }

  deactivate(id: number): boolean {
    const stmt = moneyStatement(`
      UPDATE account_envelope
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  reactivate(id: number): boolean {
    const stmt = moneyStatement(`
      UPDATE account_envelope
      SET is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  isActive(id: number): boolean {
    const envelope = this.findById(id);
    return envelope?.is_active === 1;
  }

  findByAccountId(accountId: number): AccountEnvelope[] {
    const stmt = moneyStatement('SELECT * FROM account_envelope WHERE account_id = ?');
    return stmt.all(accountId) as AccountEnvelope[];
  }

  hasActiveForAccount(accountId: number): boolean {
    const stmt = moneyStatement(
      'SELECT 1 FROM account_envelope WHERE account_id = ? AND is_active = 1 LIMIT 1',
    );
    return !!stmt.get(accountId);
  }

  hasActiveForCategory(categoryId: number): boolean {
    const stmt = moneyStatement(
      'SELECT 1 FROM account_envelope WHERE category_id = ? AND is_active = 1 LIMIT 1',
    );
    return !!stmt.get(categoryId);
  }

  getBalance(id: number): number {
    const stmt = moneyStatement(
      `SELECT money_balance(COALESCE(decimal_sum(tl.amount), 0), a.currency) AS balance
       FROM account_envelope ae JOIN account a ON a.id = ae.account_id
       LEFT JOIN transaction_line tl ON tl.envelope_id = ae.id
       WHERE ae.id = ? GROUP BY ae.id, a.currency`,
    );
    const result = stmt.get(id) as { balance: number } | undefined;
    return result?.balance ?? 0;
  }

  // Verify that envelope belongs to account
  belongsToAccount(envelopeId: number, accountId: number): boolean {
    const envelope = this.findById(envelopeId);
    return envelope?.account_id === accountId;
  }
}
