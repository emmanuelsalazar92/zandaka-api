import db from '../db/db';
import { AccountEnvelope } from '../types';

export class EnvelopeRepository {
  create(accountId: number, categoryId: number): AccountEnvelope {
    const stmt = db.prepare(`
      INSERT INTO account_envelope (account_id, category_id, is_active)
      VALUES (?, ?, 1)
    `);
    const result = stmt.run(accountId, categoryId);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): AccountEnvelope | null {
    const stmt = db.prepare('SELECT * FROM account_envelope WHERE id = ?');
    return stmt.get(id) as AccountEnvelope | null;
  }

  findByAccountAndCategory(accountId: number, categoryId: number): AccountEnvelope | null {
    const stmt = db.prepare(
      'SELECT * FROM account_envelope WHERE account_id = ? AND category_id = ?'
    );
    return stmt.get(accountId, categoryId) as AccountEnvelope | null;
  }

  deactivate(id: number): boolean {
    const stmt = db.prepare('UPDATE account_envelope SET is_active = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  isActive(id: number): boolean {
    const envelope = this.findById(id);
    return envelope?.is_active === 1;
  }

  findByAccountId(accountId: number): AccountEnvelope[] {
    const stmt = db.prepare('SELECT * FROM account_envelope WHERE account_id = ?');
    return stmt.all(accountId) as AccountEnvelope[];
  }

  getBalance(id: number): number {
    const stmt = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as balance FROM transaction_line WHERE envelope_id = ?'
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

