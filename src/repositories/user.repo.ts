import db from '../db/db';
import { User } from '../types';

export class UserRepository {
  findById(id: number): User | null {
    const stmt = db.prepare('SELECT * FROM user WHERE id = ?');
    return stmt.get(id) as User | null;
  }

  update(id: number, params: { name?: string; baseCurrency?: string }): User | null {
    const updates: string[] = [];
    const values: Array<number | string> = [];

    if (params.name !== undefined) {
      updates.push('name = ?');
      values.push(params.name);
    }

    if (params.baseCurrency !== undefined) {
      updates.push('base_currency = ?');
      values.push(params.baseCurrency);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }
}
