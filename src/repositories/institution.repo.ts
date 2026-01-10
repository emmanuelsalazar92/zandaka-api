import db from '../db/db';
import { Institution } from '../types';

export class InstitutionRepository {
  create(userId: number, name: string, type: string): Institution {
    const stmt = db.prepare(`
      INSERT INTO institution (user_id, name, type, is_active)
      VALUES (?, ?, ?, 1)
    `);
    const result = stmt.run(userId, name, type);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): Institution | null {
    const stmt = db.prepare('SELECT * FROM institution WHERE id = ?');
    return stmt.get(id) as Institution | null;
  }

  findAll(): Institution[] {
    const stmt = db.prepare('select * FROM institution WHERE is_active = 1');
    return stmt.all() as Institution[];
  }

  update(id: number, name?: string, type?: string): Institution | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const stmt = db.prepare(`UPDATE institution SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.findById(id);
  }

  deactivate(id: number): boolean {
    const stmt = db.prepare('UPDATE institution SET is_active = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  isActive(id: number): boolean {
    const institution = this.findById(id);
    return institution?.is_active === 1;
  }
}

