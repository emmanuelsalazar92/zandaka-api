import db from '../db/db';
import { Category } from '../types';

export class CategoryRepository {
  create(userId: number, name: string, parentId?: number): Category {
    const stmt = db.prepare(`
      INSERT INTO category (user_id, name, parent_id, is_active)
      VALUES (?, ?, ?, 1)
    `);
    const result = stmt.run(userId, name, parentId || null);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): Category | null {
    const stmt = db.prepare('SELECT * FROM category WHERE id = ?');
    return stmt.get(id) as Category | null;
  }

  update(id: number, name?: string, parentId?: number): Category | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (parentId !== undefined) {
      updates.push('parent_id = ?');
      values.push(parentId === null ? null : parentId);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const stmt = db.prepare(`UPDATE category SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.findById(id);
  }

  deactivate(id: number): boolean {
    const stmt = db.prepare('UPDATE category SET is_active = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  isActive(id: number): boolean {
    const category = this.findById(id);
    return category?.is_active === 1;
  }

  hasActiveChildren(parentId: number): boolean {
    const stmt = db.prepare(
      'SELECT 1 FROM category WHERE parent_id = ? AND is_active = 1 LIMIT 1'
    );
    const row = stmt.get(parentId);
    return !!row;
  }

  findAllActive(): Category[] {
    const stmt = db.prepare('SELECT * FROM category WHERE is_active = 1 ORDER BY id ASC');
    return stmt.all() as Category[];
  }
}

