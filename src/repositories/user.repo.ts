import db from '../db/db';
import { User } from '../types';

export class UserRepository {
  findById(id: number): User | null {
    const stmt = db.prepare('SELECT * FROM user WHERE id = ?');
    return stmt.get(id) as User | null;
  }
}
