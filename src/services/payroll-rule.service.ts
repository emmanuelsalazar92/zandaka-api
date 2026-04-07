import { DEFAULT_COSTA_RICA_PAYROLL_RULES_2026 } from '../config/payroll-default-rules';
import {
  PayrollCcssWorkerRate,
  PayrollRuleSetResponse,
  PayrollRuleType,
} from '../types';
import {
  PayrollCcssDetailInput,
  PayrollIncomeTaxBracketInput,
  PayrollRuleRepository,
  PayrollRuleSetDocument,
} from '../repositories/payroll-rule.repo';
import { UserRepository } from '../repositories/user.repo';
import { roundPayrollMoney, roundPayrollRate } from '../utils/payroll.util';

type HistoryResponse = {
  user_id: number;
  type: PayrollRuleType | null;
  items: PayrollRuleSetResponse[];
};

export class PayrollRuleService {
  private repo = new PayrollRuleRepository();
  private userRepo = new UserRepository();

  listHistory(params: { user_id: number; type?: PayrollRuleType }): HistoryResponse {
    this.ensureUserExists(params.user_id);
    this.ensureDefaultRulesForUser(params.user_id);

    return {
      user_id: params.user_id,
      type: params.type ?? null,
      items: this.repo.listDocuments(params.user_id, params.type).map((item) => this.mapDocument(item)),
    };
  }

  getActiveRuleSetByDate(userId: number, ruleType: PayrollRuleType, periodDate: string): PayrollRuleSetDocument {
    this.ensureUserExists(userId);
    this.ensureDefaultRulesForUser(userId);

    const ruleSet = this.repo.findActiveByDate(userId, ruleType, periodDate);
    if (!ruleSet) {
      throw {
        code: 'NOT_FOUND',
        message: `No active ${ruleType} rule is configured for ${periodDate}.`,
        details: [
          {
            field: 'date',
            detail: `Create or activate a ${ruleType} rule set that covers ${periodDate}.`,
          },
        ],
      };
    }

    return this.repo.findDocumentById(ruleSet.id)!;
  }

  getActiveRuleResponse(params: {
    user_id: number;
    type: PayrollRuleType;
    date: string;
  }): PayrollRuleSetResponse {
    return this.mapDocument(this.getActiveRuleSetByDate(params.user_id, params.type, params.date));
  }

  getById(id: number, userId: number): PayrollRuleSetResponse {
    this.ensureUserExists(userId);
    const rule = this.repo.findByIdForUser(id, userId);
    if (!rule) {
      throw {
        code: 'NOT_FOUND',
        message: `Payroll rule set ${id} not found.`,
        details: [{ field: 'id', detail: `Rule set ${id} does not belong to user ${userId}.` }],
      };
    }

    return this.mapDocument(this.repo.findDocumentById(id)!);
  }

  createCcss(input: {
    user_id: number;
    country_code?: string;
    name: string;
    effective_from: string;
    effective_to: string | null;
    is_active?: boolean;
    employee_rate: number;
    employer_rate: number | null;
    base_type: string;
  }): PayrollRuleSetResponse {
    this.ensureUserExists(input.user_id);
    this.validateEffectiveRange(input.effective_from, input.effective_to);
    this.validateRuleSetOverlap({
      userId: input.user_id,
      ruleType: 'CCSS_WORKER',
      effectiveFrom: input.effective_from,
      effectiveTo: input.effective_to,
      isActive: input.is_active ?? true,
    });

    const document = this.repo.createCcssRuleSet({
      user_id: input.user_id,
      country_code: (input.country_code ?? 'CR').trim().toUpperCase(),
      rule_type: 'CCSS_WORKER',
      name: input.name.trim(),
      effective_from: input.effective_from,
      effective_to: input.effective_to,
      is_active: input.is_active === false ? 0 : 1,
      employee_rate: roundPayrollRate(input.employee_rate),
      employer_rate: input.employer_rate === null ? null : roundPayrollRate(input.employer_rate),
      base_type: input.base_type.trim().toUpperCase(),
    });

    return this.mapDocument(document);
  }

  createIncomeTax(input: {
    user_id: number;
    country_code?: string;
    name: string;
    effective_from: string;
    effective_to: string | null;
    is_active?: boolean;
    brackets: PayrollIncomeTaxBracketInput[];
  }): PayrollRuleSetResponse {
    this.ensureUserExists(input.user_id);
    this.validateEffectiveRange(input.effective_from, input.effective_to);
    const brackets = this.normalizeAndValidateBrackets(input.brackets);

    this.validateRuleSetOverlap({
      userId: input.user_id,
      ruleType: 'INCOME_TAX',
      effectiveFrom: input.effective_from,
      effectiveTo: input.effective_to,
      isActive: input.is_active ?? true,
    });

    const document = this.repo.createIncomeTaxRuleSet({
      user_id: input.user_id,
      country_code: (input.country_code ?? 'CR').trim().toUpperCase(),
      rule_type: 'INCOME_TAX',
      name: input.name.trim(),
      effective_from: input.effective_from,
      effective_to: input.effective_to,
      is_active: input.is_active === false ? 0 : 1,
      brackets,
    });

    return this.mapDocument(document);
  }

  update(
    id: number,
    input: {
      user_id: number;
      name?: string;
      effective_from?: string;
      effective_to?: string | null;
      is_active?: boolean;
      country_code?: string;
      employee_rate?: number;
      employer_rate?: number | null;
      base_type?: string;
      brackets?: PayrollIncomeTaxBracketInput[];
    },
  ): PayrollRuleSetResponse {
    this.ensureUserExists(input.user_id);
    const current = this.repo.findByIdForUser(id, input.user_id);
    if (!current) {
      throw {
        code: 'NOT_FOUND',
        message: `Payroll rule set ${id} not found.`,
        details: [{ field: 'id', detail: `Rule set ${id} does not belong to user ${input.user_id}.` }],
      };
    }

    const nextEffectiveFrom = input.effective_from ?? current.effective_from;
    const nextEffectiveTo =
      input.effective_to !== undefined ? input.effective_to : current.effective_to;
    const nextIsActive = input.is_active !== undefined ? input.is_active : current.is_active === 1;

    this.validateEffectiveRange(nextEffectiveFrom, nextEffectiveTo);
    this.validateRuleSetOverlap({
      userId: current.user_id,
      ruleType: current.rule_type,
      effectiveFrom: nextEffectiveFrom,
      effectiveTo: nextEffectiveTo,
      isActive: nextIsActive,
      excludeId: current.id,
    });

    if (current.rule_type === 'CCSS_WORKER') {
      if (input.brackets) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'CCSS rule sets cannot accept income-tax brackets.',
          details: [{ field: 'brackets', detail: 'Remove brackets when updating a CCSS_WORKER rule.' }],
        };
      }

      const detail = this.repo.findCcssDetailByRuleSetId(id);
      if (!detail) {
        throw {
          code: 'CONFLICT',
          message: 'CCSS rule set is missing its detail record.',
          details: [{ field: 'id', detail: `Rule set ${id} has no payroll_ccss_worker_rate row.` }],
        };
      }

      const nextDetail = this.buildNextCcssDetail(detail, input);
      const updated = this.repo.updateCcssRuleSet(
        id,
        {
          country_code: input.country_code?.trim().toUpperCase() ?? current.country_code,
          name: input.name?.trim() ?? current.name,
          effective_from: nextEffectiveFrom,
          effective_to: nextEffectiveTo,
          is_active: nextIsActive ? 1 : 0,
        },
        nextDetail,
      );

      return this.mapDocument(updated);
    }

    if (
      input.employee_rate !== undefined ||
      input.employer_rate !== undefined ||
      input.base_type !== undefined
    ) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Income-tax rule sets cannot accept CCSS detail fields.',
        details: [
          {
            field: 'employee_rate',
            detail: 'Use brackets when updating an INCOME_TAX rule.',
          },
        ],
      };
    }

    const nextBrackets = input.brackets
      ? this.normalizeAndValidateBrackets(input.brackets)
      : undefined;
    const updated = this.repo.updateIncomeTaxRuleSet(
      id,
      {
        country_code: input.country_code?.trim().toUpperCase() ?? current.country_code,
        name: input.name?.trim() ?? current.name,
        effective_from: nextEffectiveFrom,
        effective_to: nextEffectiveTo,
        is_active: nextIsActive ? 1 : 0,
      },
      nextBrackets,
    );

    return this.mapDocument(updated);
  }

  deactivate(id: number, userId: number): PayrollRuleSetResponse {
    this.ensureUserExists(userId);
    const current = this.repo.findByIdForUser(id, userId);
    if (!current) {
      throw {
        code: 'NOT_FOUND',
        message: `Payroll rule set ${id} not found.`,
        details: [{ field: 'id', detail: `Rule set ${id} does not belong to user ${userId}.` }],
      };
    }

    const updated = this.repo.deactivate(id);
    if (!updated) {
      throw {
        code: 'NOT_FOUND',
        message: `Payroll rule set ${id} not found.`,
      };
    }

    return this.mapDocument(updated);
  }

  assertRuleSetReference(userId: number, ruleSetId: number, expectedType: PayrollRuleType) {
    const ruleSet = this.repo.findByIdForUser(ruleSetId, userId);
    if (!ruleSet) {
      throw {
        code: 'NOT_FOUND',
        message: `Payroll rule set ${ruleSetId} not found.`,
        details: [
          {
            field: expectedType === 'CCSS_WORKER' ? 'ccssRuleSetId' : 'incomeTaxRuleSetId',
            detail: `Rule set ${ruleSetId} does not belong to user ${userId}.`,
          },
        ],
      };
    }

    if (ruleSet.rule_type !== expectedType) {
      throw {
        code: 'CONFLICT',
        message: `Payroll rule set ${ruleSetId} is not a ${expectedType} rule.`,
        details: [
          {
            field: expectedType === 'CCSS_WORKER' ? 'ccssRuleSetId' : 'incomeTaxRuleSetId',
            detail: `Rule set ${ruleSetId} has type ${ruleSet.rule_type}.`,
          },
        ],
      };
    }

    return ruleSet;
  }

  private ensureUserExists(userId: number) {
    const user = this.userRepo.findById(userId);
    if (!user) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found.`,
        details: [{ field: 'user_id', detail: `Create or select user ${userId} first.` }],
      };
    }
  }

  private ensureDefaultRulesForUser(userId: number) {
    if (this.repo.countByUserAndType(userId, 'CCSS_WORKER') === 0) {
      this.repo.createCcssRuleSet({
        user_id: userId,
        country_code: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.country_code,
        rule_type: 'CCSS_WORKER',
        name: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.name,
        effective_from: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.effective_from,
        effective_to: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.effective_to,
        is_active: 1,
        employee_rate: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.employee_rate,
        employer_rate: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.employer_rate,
        base_type: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.ccssWorker.base_type,
      });
    }

    if (this.repo.countByUserAndType(userId, 'INCOME_TAX') === 0) {
      this.repo.createIncomeTaxRuleSet({
        user_id: userId,
        country_code: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.incomeTax.country_code,
        rule_type: 'INCOME_TAX',
        name: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.incomeTax.name,
        effective_from: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.incomeTax.effective_from,
        effective_to: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.incomeTax.effective_to,
        is_active: 1,
        brackets: DEFAULT_COSTA_RICA_PAYROLL_RULES_2026.incomeTax.brackets.map((bracket) => ({
          ...bracket,
        })),
      });
    }
  }

  private validateEffectiveRange(effectiveFrom: string, effectiveTo: string | null) {
    if (effectiveTo !== null && effectiveTo < effectiveFrom) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'effective_to cannot be earlier than effective_from.',
        details: [
          {
            field: 'effective_to',
            detail: `Received ${effectiveTo}, but effective_from is ${effectiveFrom}.`,
          },
        ],
      };
    }
  }

  private validateRuleSetOverlap(params: {
    userId: number;
    ruleType: PayrollRuleType;
    effectiveFrom: string;
    effectiveTo: string | null;
    isActive: boolean;
    excludeId?: number;
  }) {
    if (!params.isActive) {
      return;
    }

    const overlaps = this.repo.findOverlappingActiveRuleSets({
      userId: params.userId,
      ruleType: params.ruleType,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      excludeId: params.excludeId,
    });

    if (overlaps.length === 0) {
      return;
    }

    throw {
      code: 'CONFLICT',
      message: 'Payroll rule validity overlaps an existing active rule set.',
      details: overlaps.map((rule) => ({
        field: 'effective_from',
        detail: `Rule set ${rule.id} (${rule.name}) already covers ${rule.effective_from} to ${rule.effective_to ?? 'open-ended'}.`,
      })),
    };
  }

  private buildNextCcssDetail(
    current: PayrollCcssWorkerRate,
    input: {
      employee_rate?: number;
      employer_rate?: number | null;
      base_type?: string;
    },
  ): PayrollCcssDetailInput {
    return {
      employee_rate: roundPayrollRate(input.employee_rate ?? current.employee_rate),
      employer_rate:
        input.employer_rate !== undefined
          ? input.employer_rate === null
            ? null
            : roundPayrollRate(input.employer_rate)
          : current.employer_rate,
      base_type: input.base_type?.trim().toUpperCase() ?? current.base_type,
    };
  }

  private normalizeAndValidateBrackets(
    brackets: PayrollIncomeTaxBracketInput[],
  ): PayrollIncomeTaxBracketInput[] {
    const normalized = [...brackets]
      .map((bracket) => ({
        range_order: bracket.range_order,
        amount_from: roundPayrollMoney(bracket.amount_from),
        amount_to:
          bracket.amount_to === null ? null : roundPayrollMoney(bracket.amount_to),
        tax_rate: roundPayrollRate(bracket.tax_rate),
        is_exempt: bracket.is_exempt ? 1 : 0,
      }))
      .sort((left, right) => left.range_order - right.range_order);

    if (normalized.length === 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Income tax rule sets require at least one bracket.',
        details: [{ field: 'brackets', detail: 'Provide one or more progressive tax brackets.' }],
      };
    }

    const seenOrders = new Set<number>();

    normalized.forEach((bracket, index) => {
      if (seenOrders.has(bracket.range_order)) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Income tax brackets contain duplicate range_order values.',
          details: [
            {
              field: `brackets[${index}].range_order`,
              detail: `range_order ${bracket.range_order} appears more than once.`,
            },
          ],
        };
      }

      seenOrders.add(bracket.range_order);

      if (bracket.range_order !== index + 1) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Income tax brackets must use consecutive range_order values starting at 1.',
          details: [
            {
              field: `brackets[${index}].range_order`,
              detail: `Expected ${index + 1}, received ${bracket.range_order}.`,
            },
          ],
        };
      }

      if (index === 0 && bracket.amount_from !== 0) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'The first income tax bracket must start at 0.',
          details: [
            {
              field: `brackets[${index}].amount_from`,
              detail: `Expected 0, received ${bracket.amount_from}.`,
            },
          ],
        };
      }

      if (bracket.is_exempt === 1 && bracket.tax_rate !== 0) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Exempt brackets must use a tax_rate of 0.',
          details: [
            {
              field: `brackets[${index}].tax_rate`,
              detail: `Bracket ${bracket.range_order} is exempt but uses tax_rate ${bracket.tax_rate}.`,
            },
          ],
        };
      }

      if (index > 0) {
        const previous = normalized[index - 1];
        if (previous.amount_to === null) {
          throw {
            code: 'VALIDATION_ERROR',
            message: 'Only the last income tax bracket can be open-ended.',
            details: [
              {
                field: `brackets[${index - 1}].amount_to`,
                detail: `Bracket ${previous.range_order} is open-ended, so no later brackets are allowed.`,
              },
            ],
          };
        }

        if (bracket.amount_from !== previous.amount_to) {
          throw {
            code: 'VALIDATION_ERROR',
            message: 'Income tax brackets must be contiguous and non-overlapping.',
            details: [
              {
                field: `brackets[${index}].amount_from`,
                detail: `Bracket ${bracket.range_order} must start at ${previous.amount_to}.`,
              },
            ],
          };
        }
      }

      if (bracket.amount_to === null && index !== normalized.length - 1) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Only the last income tax bracket can have amount_to = null.',
          details: [
            {
              field: `brackets[${index}].amount_to`,
              detail: `Bracket ${bracket.range_order} is open-ended but is not the last range.`,
            },
          ],
        };
      }
    });

    return normalized;
  }

  private mapDocument(document: PayrollRuleSetDocument): PayrollRuleSetResponse {
    return {
      id: document.rule_set.id,
      user_id: document.rule_set.user_id,
      country_code: document.rule_set.country_code,
      rule_type: document.rule_set.rule_type,
      name: document.rule_set.name,
      effective_from: document.rule_set.effective_from,
      effective_to: document.rule_set.effective_to,
      is_active: document.rule_set.is_active === 1,
      created_at: document.rule_set.created_at,
      updated_at: document.rule_set.updated_at,
      ccss_detail: document.ccss_detail
        ? {
            id: document.ccss_detail.id,
            employee_rate: document.ccss_detail.employee_rate,
            employer_rate: document.ccss_detail.employer_rate,
            base_type: document.ccss_detail.base_type,
            created_at: document.ccss_detail.created_at,
            updated_at: document.ccss_detail.updated_at,
          }
        : null,
      income_tax_brackets: document.income_tax_brackets.map((bracket) => ({
        id: bracket.id,
        range_order: bracket.range_order,
        amount_from: bracket.amount_from,
        amount_to: bracket.amount_to,
        tax_rate: bracket.tax_rate,
        is_exempt: bracket.is_exempt === 1,
        created_at: bracket.created_at,
        updated_at: bracket.updated_at,
      })),
    };
  }
}
