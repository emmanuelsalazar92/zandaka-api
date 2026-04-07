import db from '../db/db';
import { AutoAssignmentMatchType, AutoAssignmentRuleDetails } from '../types';

export class AutoAssignmentRuleRepository {
  private readonly baseSelect = `
    SELECT
      aar.*,
      a.name AS account_name,
      a.currency AS account_currency,
      ae.account_id AS account_envelope_account_id,
      ae.category_id AS category_id,
      c.name AS category_name,
      CASE
        WHEN ae.id IS NULL THEN NULL
        ELSE COALESCE(ea.name, 'Account') || ' / ' || COALESCE(c.name, 'Envelope')
      END AS account_envelope_label
    FROM auto_assignment_rule aar
    LEFT JOIN account a ON aar.account_id = a.id
    LEFT JOIN account_envelope ae ON aar.account_envelope_id = ae.id
    LEFT JOIN account ea ON ae.account_id = ea.id
    LEFT JOIN category c ON ae.category_id = c.id
  `;

  listByUser(userId: number): AutoAssignmentRuleDetails[] {
    const stmt = db.prepare(`
      ${this.baseSelect}
      WHERE aar.user_id = ?
      ORDER BY aar.priority ASC, aar.updated_at DESC, aar.id ASC
    `);

    return stmt.all(userId) as AutoAssignmentRuleDetails[];
  }

  listActiveByUser(userId: number): AutoAssignmentRuleDetails[] {
    const stmt = db.prepare(`
      ${this.baseSelect}
      WHERE aar.user_id = ? AND aar.is_active = 1
      ORDER BY aar.priority ASC, aar.updated_at DESC, aar.id ASC
    `);

    return stmt.all(userId) as AutoAssignmentRuleDetails[];
  }

  findById(id: number): AutoAssignmentRuleDetails | null {
    const stmt = db.prepare(`
      ${this.baseSelect}
      WHERE aar.id = ?
      LIMIT 1
    `);

    return stmt.get(id) as AutoAssignmentRuleDetails | null;
  }

  create(params: {
    userId: number;
    pattern: string;
    matchType: AutoAssignmentMatchType;
    accountId: number | null;
    accountEnvelopeId: number | null;
    priority: number;
    isActive: number;
    notes: string | null;
  }): AutoAssignmentRuleDetails {
    const stmt = db.prepare(`
      INSERT INTO auto_assignment_rule (
        user_id,
        pattern,
        match_type,
        account_id,
        account_envelope_id,
        priority,
        is_active,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.userId,
      params.pattern,
      params.matchType,
      params.accountId,
      params.accountEnvelopeId,
      params.priority,
      params.isActive,
      params.notes,
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  update(
    id: number,
    params: {
      pattern?: string;
      matchType?: AutoAssignmentMatchType;
      accountId?: number | null;
      accountEnvelopeId?: number | null;
      priority?: number;
      isActive?: number;
      notes?: string | null;
    },
  ): AutoAssignmentRuleDetails | null {
    const updates: string[] = [];
    const values: Array<number | string | null> = [];

    if (params.pattern !== undefined) {
      updates.push('pattern = ?');
      values.push(params.pattern);
    }

    if (params.matchType !== undefined) {
      updates.push('match_type = ?');
      values.push(params.matchType);
    }

    if (params.accountId !== undefined) {
      updates.push('account_id = ?');
      values.push(params.accountId);
    }

    if (params.accountEnvelopeId !== undefined) {
      updates.push('account_envelope_id = ?');
      values.push(params.accountEnvelopeId);
    }

    if (params.priority !== undefined) {
      updates.push('priority = ?');
      values.push(params.priority);
    }

    if (params.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(params.isActive);
    }

    if (params.notes !== undefined) {
      updates.push('notes = ?');
      values.push(params.notes);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`UPDATE auto_assignment_rule SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }
}
