import db from '../db/db';
import { Account } from '../types';

export class AccountRepository {
  create(
    userId: number,
    institutionId: number,
    name: string,
    currency: string,
    allowOverdraft: boolean = false
  ): Account {
    const stmt = db.prepare(`
      INSERT INTO account (user_id, institution_id, name, currency, is_active, allow_overdraft)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    const result = stmt.run(userId, institutionId, name, currency, allowOverdraft ? 1 : 0);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): Account | null {
    const stmt = db.prepare('SELECT * FROM account WHERE id = ?');
    return stmt.get(id) as Account | null;
  }

  update(id: number, name?: string): Account | null {
    if (name === undefined) return this.findById(id);
    const stmt = db.prepare('UPDATE account SET name = ? WHERE id = ?');
    stmt.run(name, id);
    return this.findById(id);
  }

  deactivate(id: number): boolean {
    const stmt = db.prepare('UPDATE account SET is_active = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  isActive(id: number): boolean {
    const account = this.findById(id);
    return account?.is_active === 1;
  }

  getAll(userId?: number): Account[] {
    if (userId) {
      const stmt = db.prepare('SELECT * FROM account WHERE user_id = ?');
      return stmt.all(userId) as Account[];
    }
    const stmt = db.prepare('SELECT * FROM account');
    return stmt.all() as Account[];
  }

  findAllActive(): Account[] {
    const stmt = db.prepare('SELECT * FROM account WHERE is_active = 1');
    return stmt.all() as Account[];
  }
}

