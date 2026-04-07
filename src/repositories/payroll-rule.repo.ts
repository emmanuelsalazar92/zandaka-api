import db from '../db/db';
import {
  PayrollCcssWorkerRate,
  PayrollIncomeTaxBracket,
  PayrollRuleSet,
  PayrollRuleType,
} from '../types';

export type PayrollRuleSetDocument = {
  rule_set: PayrollRuleSet;
  ccss_detail: PayrollCcssWorkerRate | null;
  income_tax_brackets: PayrollIncomeTaxBracket[];
};

type PayrollRuleSetHeaderInput = {
  user_id: number;
  country_code: string;
  rule_type: PayrollRuleType;
  name: string;
  effective_from: string;
  effective_to: string | null;
  is_active: number;
};

type PayrollCcssDetailInput = {
  employee_rate: number;
  employer_rate: number | null;
  base_type: string;
};

type PayrollIncomeTaxBracketInput = {
  range_order: number;
  amount_from: number;
  amount_to: number | null;
  tax_rate: number;
  is_exempt: number;
};

export class PayrollRuleRepository {
  countByUserAndType(userId: number, ruleType: PayrollRuleType): number {
    const stmt = db.prepare(`
      SELECT COUNT(*) AS total
      FROM payroll_rule_set
      WHERE user_id = ? AND rule_type = ?
    `);

    return ((stmt.get(userId, ruleType) as { total?: number } | undefined)?.total ?? 0) as number;
  }

  findById(id: number): PayrollRuleSet | null {
    const stmt = db.prepare(`
      SELECT *
      FROM payroll_rule_set
      WHERE id = ?
    `);

    return (stmt.get(id) as PayrollRuleSet | undefined) ?? null;
  }

  findByIdForUser(id: number, userId: number): PayrollRuleSet | null {
    const stmt = db.prepare(`
      SELECT *
      FROM payroll_rule_set
      WHERE id = ? AND user_id = ?
    `);

    return (stmt.get(id, userId) as PayrollRuleSet | undefined) ?? null;
  }

  findActiveByDate(
    userId: number,
    ruleType: PayrollRuleType,
    periodDate: string,
  ): PayrollRuleSet | null {
    const stmt = db.prepare(`
      SELECT *
      FROM payroll_rule_set
      WHERE user_id = ?
        AND rule_type = ?
        AND is_active = 1
        AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    `);

    return (
      (stmt.get(userId, ruleType, periodDate, periodDate) as PayrollRuleSet | undefined) ?? null
    );
  }

  listHistory(userId: number, ruleType?: PayrollRuleType): PayrollRuleSet[] {
    const stmt = ruleType
      ? db.prepare(`
          SELECT *
          FROM payroll_rule_set
          WHERE user_id = ? AND rule_type = ?
          ORDER BY effective_from DESC, id DESC
        `)
      : db.prepare(`
          SELECT *
          FROM payroll_rule_set
          WHERE user_id = ?
          ORDER BY effective_from DESC, id DESC
        `);

    return (ruleType ? stmt.all(userId, ruleType) : stmt.all(userId)) as PayrollRuleSet[];
  }

  findOverlappingActiveRuleSets(params: {
    userId: number;
    ruleType: PayrollRuleType;
    effectiveFrom: string;
    effectiveTo: string | null;
    excludeId?: number;
  }): PayrollRuleSet[] {
    const stmt = db.prepare(`
      SELECT *
      FROM payroll_rule_set
      WHERE user_id = ?
        AND rule_type = ?
        AND is_active = 1
        AND id <> COALESCE(?, -1)
        AND effective_from <= COALESCE(?, '9999-12-31')
        AND COALESCE(effective_to, '9999-12-31') >= ?
      ORDER BY effective_from DESC, id DESC
    `);

    return stmt.all(
      params.userId,
      params.ruleType,
      params.excludeId ?? null,
      params.effectiveTo,
      params.effectiveFrom,
    ) as PayrollRuleSet[];
  }

  findCcssDetailByRuleSetId(ruleSetId: number): PayrollCcssWorkerRate | null {
    const stmt = db.prepare(`
      SELECT *
      FROM payroll_ccss_worker_rate
      WHERE rule_set_id = ?
      LIMIT 1
    `);

    return (stmt.get(ruleSetId) as PayrollCcssWorkerRate | undefined) ?? null;
  }

  findIncomeTaxBracketsByRuleSetId(ruleSetId: number): PayrollIncomeTaxBracket[] {
    const stmt = db.prepare(`
      SELECT *
      FROM payroll_income_tax_bracket
      WHERE rule_set_id = ?
      ORDER BY range_order ASC, id ASC
    `);

    return stmt.all(ruleSetId) as PayrollIncomeTaxBracket[];
  }

  findDocumentById(id: number): PayrollRuleSetDocument | null {
    const ruleSet = this.findById(id);
    if (!ruleSet) {
      return null;
    }

    return {
      rule_set: ruleSet,
      ccss_detail:
        ruleSet.rule_type === 'CCSS_WORKER' ? this.findCcssDetailByRuleSetId(ruleSet.id) : null,
      income_tax_brackets:
        ruleSet.rule_type === 'INCOME_TAX' ? this.findIncomeTaxBracketsByRuleSetId(ruleSet.id) : [],
    };
  }

  listDocuments(userId: number, ruleType?: PayrollRuleType): PayrollRuleSetDocument[] {
    return this.listHistory(userId, ruleType)
      .map((ruleSet) => this.findDocumentById(ruleSet.id))
      .filter((item): item is PayrollRuleSetDocument => item !== null);
  }

  createCcssRuleSet(
    input: PayrollRuleSetHeaderInput & PayrollCcssDetailInput,
  ): PayrollRuleSetDocument {
    const insertRuleSet = db.prepare(`
      INSERT INTO payroll_rule_set (
        user_id,
        country_code,
        rule_type,
        name,
        effective_from,
        effective_to,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertDetail = db.prepare(`
      INSERT INTO payroll_ccss_worker_rate (
        rule_set_id,
        employee_rate,
        employer_rate,
        base_type
      )
      VALUES (?, ?, ?, ?)
    `);

    const transaction = db.transaction(
      (payload: PayrollRuleSetHeaderInput & PayrollCcssDetailInput) => {
        const result = insertRuleSet.run(
          payload.user_id,
          payload.country_code,
          payload.rule_type,
          payload.name,
          payload.effective_from,
          payload.effective_to,
          payload.is_active,
        );
        const ruleSetId = Number(result.lastInsertRowid);

        insertDetail.run(
          ruleSetId,
          payload.employee_rate,
          payload.employer_rate,
          payload.base_type,
        );

        return this.findDocumentById(ruleSetId)!;
      },
    );

    return transaction(input);
  }

  createIncomeTaxRuleSet(
    input: PayrollRuleSetHeaderInput & { brackets: PayrollIncomeTaxBracketInput[] },
  ): PayrollRuleSetDocument {
    const insertRuleSet = db.prepare(`
      INSERT INTO payroll_rule_set (
        user_id,
        country_code,
        rule_type,
        name,
        effective_from,
        effective_to,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBracket = db.prepare(`
      INSERT INTO payroll_income_tax_bracket (
        rule_set_id,
        range_order,
        amount_from,
        amount_to,
        tax_rate,
        is_exempt
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(
      (payload: PayrollRuleSetHeaderInput & { brackets: PayrollIncomeTaxBracketInput[] }) => {
        const result = insertRuleSet.run(
          payload.user_id,
          payload.country_code,
          payload.rule_type,
          payload.name,
          payload.effective_from,
          payload.effective_to,
          payload.is_active,
        );
        const ruleSetId = Number(result.lastInsertRowid);

        for (const bracket of payload.brackets) {
          insertBracket.run(
            ruleSetId,
            bracket.range_order,
            bracket.amount_from,
            bracket.amount_to,
            bracket.tax_rate,
            bracket.is_exempt,
          );
        }

        return this.findDocumentById(ruleSetId)!;
      },
    );

    return transaction(input);
  }

  updateCcssRuleSet(
    ruleSetId: number,
    header: Omit<PayrollRuleSetHeaderInput, 'user_id' | 'country_code' | 'rule_type'> & {
      country_code?: string;
      is_active: number;
    },
    detail?: PayrollCcssDetailInput,
  ): PayrollRuleSetDocument {
    const updateHeader = db.prepare(`
      UPDATE payroll_rule_set
      SET
        country_code = ?,
        name = ?,
        effective_from = ?,
        effective_to = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const deleteDetail = db.prepare(`
      DELETE FROM payroll_ccss_worker_rate
      WHERE rule_set_id = ?
    `);
    const insertDetail = db.prepare(`
      INSERT INTO payroll_ccss_worker_rate (
        rule_set_id,
        employee_rate,
        employer_rate,
        base_type
      )
      VALUES (?, ?, ?, ?)
    `);

    const transaction = db.transaction(
      (
        id: number,
        nextHeader: Omit<PayrollRuleSetHeaderInput, 'user_id' | 'country_code' | 'rule_type'> & {
          country_code?: string;
          is_active: number;
        },
        nextDetail?: PayrollCcssDetailInput,
      ) => {
        updateHeader.run(
          nextHeader.country_code ?? 'CR',
          nextHeader.name,
          nextHeader.effective_from,
          nextHeader.effective_to,
          nextHeader.is_active,
          id,
        );

        if (nextDetail) {
          deleteDetail.run(id);
          insertDetail.run(
            id,
            nextDetail.employee_rate,
            nextDetail.employer_rate,
            nextDetail.base_type,
          );
        }

        return this.findDocumentById(id)!;
      },
    );

    return transaction(ruleSetId, header, detail);
  }

  updateIncomeTaxRuleSet(
    ruleSetId: number,
    header: Omit<PayrollRuleSetHeaderInput, 'user_id' | 'country_code' | 'rule_type'> & {
      country_code?: string;
      is_active: number;
    },
    brackets?: PayrollIncomeTaxBracketInput[],
  ): PayrollRuleSetDocument {
    const updateHeader = db.prepare(`
      UPDATE payroll_rule_set
      SET
        country_code = ?,
        name = ?,
        effective_from = ?,
        effective_to = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const deleteBrackets = db.prepare(`
      DELETE FROM payroll_income_tax_bracket
      WHERE rule_set_id = ?
    `);
    const insertBracket = db.prepare(`
      INSERT INTO payroll_income_tax_bracket (
        rule_set_id,
        range_order,
        amount_from,
        amount_to,
        tax_rate,
        is_exempt
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(
      (
        id: number,
        nextHeader: Omit<PayrollRuleSetHeaderInput, 'user_id' | 'country_code' | 'rule_type'> & {
          country_code?: string;
          is_active: number;
        },
        nextBrackets?: PayrollIncomeTaxBracketInput[],
      ) => {
        updateHeader.run(
          nextHeader.country_code ?? 'CR',
          nextHeader.name,
          nextHeader.effective_from,
          nextHeader.effective_to,
          nextHeader.is_active,
          id,
        );

        if (nextBrackets) {
          deleteBrackets.run(id);
          for (const bracket of nextBrackets) {
            insertBracket.run(
              id,
              bracket.range_order,
              bracket.amount_from,
              bracket.amount_to,
              bracket.tax_rate,
              bracket.is_exempt,
            );
          }
        }

        return this.findDocumentById(id)!;
      },
    );

    return transaction(ruleSetId, header, brackets);
  }

  deactivate(ruleSetId: number): PayrollRuleSetDocument | null {
    const stmt = db.prepare(`
      UPDATE payroll_rule_set
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(ruleSetId);
    if (result.changes === 0) {
      return null;
    }

    return this.findDocumentById(ruleSetId);
  }

  isRuleSetUsed(ruleSetId: number): boolean {
    const budgetUsage = db
      .prepare(
        `
        SELECT 1
        FROM budget
        WHERE ccss_rule_set_id = ? OR income_tax_rule_set_id = ?
        LIMIT 1
      `,
      )
      .get(ruleSetId, ruleSetId);

    if (budgetUsage) {
      return true;
    }

    const snapshotUsage = db
      .prepare(
        `
        SELECT 1
        FROM report_snapshot
        WHERE ccss_rule_set_id = ? OR income_tax_rule_set_id = ?
        LIMIT 1
      `,
      )
      .get(ruleSetId, ruleSetId);

    return Boolean(snapshotUsage);
  }
}

export type { PayrollRuleSetHeaderInput, PayrollCcssDetailInput, PayrollIncomeTaxBracketInput };
