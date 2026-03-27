import { AccountRepository } from '../repositories/account.repo';
import { BudgetLineRow, BudgetListRow, BudgetRepository } from '../repositories/budget.repo';
import { CategoryRepository } from '../repositories/category.repo';
import { EnvelopeRepository } from '../repositories/envelope.repo';
import { InstitutionRepository } from '../repositories/institution.repo';
import { ReconciliationRepository } from '../repositories/reconciliation.repo';
import { UserRepository } from '../repositories/user.repo';
import { Budget, BudgetStatus } from '../types';

const MONEY_TOLERANCE = 0.01;
const PERCENT_TOLERANCE = 0.01;

type ValidationIssue = {
  field: string;
  detail: string;
};

export class BudgetService {
  private repo = new BudgetRepository();
  private userRepo = new UserRepository();
  private categoryRepo = new CategoryRepository();
  private accountRepo = new AccountRepository();
  private envelopeRepo = new EnvelopeRepository();
  private institutionRepo = new InstitutionRepository();
  private reconciliationRepo = new ReconciliationRepository();

  create(input: {
    userId: number;
    month: string;
    currency: string;
    totalIncome: number;
  }) {
    this.ensureUserExists(input.userId);
    const currency = this.normalizeCurrency(input.currency);

    if (this.repo.findByUserMonthCurrency(input.userId, input.month, currency)) {
      throw {
        code: 'CONFLICT',
        message: 'A budget already exists for this month and currency.',
        details: [
          {
            field: 'month',
            detail: `User ${input.userId} already has a ${currency} budget for ${input.month}.`,
          },
        ],
      };
    }

    const budget = this.repo.create(input.userId, input.month, currency, input.totalIncome);

    return {
      message: 'Budget created in draft status.',
      data: this.mapBudgetWithSummary(budget, {
        line_count: 0,
        distributed_amount: 0,
        distributed_percentage: 0,
      }),
    };
  }

  list(params: {
    userId: number;
    month?: string;
    currency?: string;
    status?: BudgetStatus;
    page: number;
    pageSize: number;
  }) {
    this.ensureUserExists(params.userId);
    const result = this.repo.list({
      ...params,
      currency: params.currency ? this.normalizeCurrency(params.currency) : undefined,
    });

    return {
      message: 'Budgets retrieved successfully.',
      data: {
        items: result.data.map((budget) => this.mapBudgetListItem(budget)),
        meta: result.meta,
      },
    };
  }

  history(params: {
    userId: number;
    currency?: string;
    status?: BudgetStatus;
    fromMonth?: string;
    toMonth?: string;
    page: number;
    pageSize: number;
  }) {
    this.ensureUserExists(params.userId);
    const result = this.repo.list({
      ...params,
      currency: params.currency ? this.normalizeCurrency(params.currency) : undefined,
    });

    return {
      message: 'Budget history retrieved successfully.',
      data: {
        items: result.data.map((budget) => this.mapBudgetListItem(budget)),
        meta: result.meta,
      },
    };
  }

  getById(id: number, userId: number) {
    const budget = this.getOwnedBudget(id, userId);
    const summary = this.repo.getDistributionSummary(id);

    return {
      message: 'Budget retrieved successfully.',
      data: this.mapBudgetWithSummary(budget, summary),
    };
  }

  getLines(id: number, userId: number) {
    this.getOwnedBudget(id, userId);
    const lines = this.repo.getLines(id);

    return {
      message: 'Budget lines retrieved successfully.',
      data: {
        budgetId: id,
        items: lines.map((line) => this.mapBudgetLine(line)),
      },
    };
  }

  replaceLines(
    id: number,
    userId: number,
    lines: Array<{
      categoryId: number;
      amount: number;
      percentage: number;
      notes?: string;
      sortOrder: number;
    }>,
  ) {
    const budget = this.getOwnedBudget(id, userId);
    this.ensureBudgetStatus(budget, 'draft', 'Only draft budgets can replace planning lines.');
    this.validatePlanningLines(userId, lines);

    this.repo.replaceLines(id, lines);

    const updatedBudget = this.getOwnedBudget(id, userId);
    const updatedLines = this.repo.getLines(id);

    return {
      message: 'Budget lines replaced successfully.',
      data: {
        budget: this.mapBudgetWithSummary(updatedBudget, this.repo.getDistributionSummary(id)),
        lines: updatedLines.map((line) => this.mapBudgetLine(line)),
        validation: this.buildPlanningValidation(updatedBudget, updatedLines),
      },
    };
  }

  validate(id: number, userId: number) {
    const budget = this.getOwnedBudget(id, userId);
    const lines = this.repo.getLines(id);

    return {
      message: 'Budget validation calculated successfully.',
      data: this.buildPlanningValidation(budget, lines),
    };
  }

  finalize(id: number, userId: number) {
    const budget = this.getOwnedBudget(id, userId);
    this.ensureBudgetStatus(budget, 'draft', 'Only draft budgets can be finalized.');

    const lines = this.repo.getLines(id);
    const validation = this.buildPlanningValidation(budget, lines);
    if (!validation.isValid) {
      throw {
        code: 'CONFLICT',
        message: 'Budget cannot be finalized because planning is incomplete.',
        details: validation.errors,
      };
    }

    const updated = this.repo.updateStatus(id, 'finalized');
    return {
      message: 'Budget finalized successfully. Funding has not been executed yet.',
      data: this.mapBudgetWithSummary(updated!, this.repo.getDistributionSummary(id)),
    };
  }

  copyFromPrevious(id: number, userId: number, sourceBudgetId?: number) {
    const budget = this.getOwnedBudget(id, userId);
    this.ensureBudgetStatus(budget, 'draft', 'Only draft budgets can copy lines from another budget.');

    const sourceBudget = sourceBudgetId
      ? this.getOwnedBudget(sourceBudgetId, userId)
      : this.repo.findMostRecentPreviousBudget(userId, budget.currency, budget.month);

    if (!sourceBudget) {
      throw {
        code: 'NOT_FOUND',
        message: 'No previous budget was found to copy from.',
        details: [
          {
            field: 'sourceBudgetId',
            detail: `No earlier ${budget.currency} budget exists before ${budget.month}.`,
          },
        ],
      };
    }

    if (sourceBudget.id === budget.id) {
      throw {
        code: 'CONFLICT',
        message: 'A budget cannot copy lines from itself.',
        details: [{ field: 'sourceBudgetId', detail: 'Choose a different source budget.' }],
      };
    }

    if (sourceBudget.currency !== budget.currency) {
      throw {
        code: 'CONFLICT',
        message: 'Source budget currency does not match the destination budget currency.',
        details: [
          {
            field: 'sourceBudgetId',
            detail: `Source budget ${sourceBudget.id} uses ${sourceBudget.currency}, but destination budget uses ${budget.currency}.`,
          },
        ],
      };
    }

    this.repo.copyLinesFromBudget(sourceBudget.id, budget.id);
    const copiedLines = this.repo.getLines(id);

    return {
      message: 'Budget lines copied successfully from the selected source budget.',
      data: {
        budget: this.mapBudgetWithSummary(this.getOwnedBudget(id, userId), this.repo.getDistributionSummary(id)),
        sourceBudgetId: sourceBudget.id,
        lines: copiedLines.map((line) => this.mapBudgetLine(line)),
      },
    };
  }

  getFundingOptions(id: number, userId: number) {
    const budget = this.getOwnedBudget(id, userId);
    if (budget.status === 'draft') {
      throw {
        code: 'CONFLICT',
        message: 'Funding options are only available after the budget is finalized.',
        details: [
          {
            field: 'status',
            detail: 'Finalize the budget before requesting funding options.',
          },
        ],
      };
    }

    const lines = this.repo.getLines(id);
    const accounts = this.repo.findFundingAccounts(userId, budget.currency);
    const envelopes = this.repo.findFundingEnvelopes(
      userId,
      budget.currency,
      [...new Set(lines.map((line) => line.category_id))],
    );

    const envelopesByCategory = new Map<number, typeof envelopes>();
    for (const envelope of envelopes) {
      const current = envelopesByCategory.get(envelope.category_id) ?? [];
      current.push(envelope);
      envelopesByCategory.set(envelope.category_id, current);
    }

    return {
      message: 'Funding options retrieved successfully.',
      data: {
        budget: this.mapBudgetWithSummary(budget, this.repo.getDistributionSummary(id)),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
          institutionId: account.institution_id,
          institutionName: account.institution_name,
        })),
        lines: lines.map((line) => ({
          ...this.mapBudgetLine(line),
          availableEnvelopes: (envelopesByCategory.get(line.category_id) ?? []).map((envelope) => ({
            id: envelope.id,
            accountId: envelope.account_id,
            accountName: envelope.account_name,
            accountCurrency: envelope.account_currency,
            institutionName: envelope.institution_name,
            categoryId: envelope.category_id,
            categoryName: envelope.category_name,
          })),
        })),
      },
    };
  }

  saveFundingPlan(
    id: number,
    userId: number,
    input: {
      sourceAccountId: number;
      lines: Array<{ budgetLineId: number; accountEnvelopeId: number }>;
    },
  ) {
    const budget = this.getOwnedBudget(id, userId);
    this.ensureFundingEditable(budget);

    const budgetLines = this.repo.getLines(id);
    if (budgetLines.length === 0) {
      throw {
        code: 'CONFLICT',
        message: 'Funding plan cannot be saved because the budget has no lines.',
        details: [{ field: 'lines', detail: 'Add planning lines before saving a funding plan.' }],
      };
    }

    const sourceAccount = this.accountRepo.findById(input.sourceAccountId);
    if (!sourceAccount || sourceAccount.user_id !== userId) {
      throw {
        code: 'NOT_FOUND',
        message: 'Source account not found for this user.',
        details: [{ field: 'sourceAccountId', detail: 'Use an active account owned by the same user.' }],
      };
    }
    if (sourceAccount.is_active !== 1) {
      throw {
        code: 'INACTIVE_RESOURCE',
        message: 'Source account is inactive.',
        details: [{ field: 'sourceAccountId', detail: 'Funding requires an active source account.' }],
      };
    }
    if (sourceAccount.currency !== budget.currency) {
      throw {
        code: 'CONFLICT',
        message: 'Source account currency does not match the budget currency.',
        details: [
          {
            field: 'sourceAccountId',
            detail: `Budget currency is ${budget.currency}, but account ${sourceAccount.id} uses ${sourceAccount.currency}.`,
          },
        ],
      };
    }
    if (!this.institutionRepo.isActive(sourceAccount.institution_id)) {
      throw {
        code: 'INACTIVE_RESOURCE',
        message: 'Source account institution is inactive.',
        details: [{ field: 'sourceAccountId', detail: 'Funding requires an active institution.' }],
      };
    }

    this.validateFundingAssignments(userId, budget, budgetLines, input.sourceAccountId, input.lines);
    this.repo.replaceFundingPlan(id, input.sourceAccountId, input.lines);

    return {
      message: 'Funding plan saved successfully.',
      data: this.buildFundingPlan(this.getOwnedBudget(id, userId), this.repo.getLines(id)),
    };
  }

  getFundingPlan(id: number, userId: number) {
    const budget = this.getOwnedBudget(id, userId);
    return {
      message: 'Funding plan retrieved successfully.',
      data: this.buildFundingPlan(budget, this.repo.getLines(id)),
    };
  }

  fund(id: number, userId: number, description?: string) {
    const budget = this.getOwnedBudget(id, userId);
    this.ensureFundingEditable(budget);

    const lines = this.repo.getLines(id);
    if (lines.length === 0) {
      throw {
        code: 'CONFLICT',
        message: 'Funding cannot run because the budget has no lines.',
        details: [{ field: 'lines', detail: 'Add planning lines before funding the budget.' }],
      };
    }
    if (!budget.funding_source_account_id) {
      throw {
        code: 'CONFLICT',
        message: 'Funding plan is incomplete because the source account has not been selected.',
        details: [{ field: 'sourceAccountId', detail: 'Save the funding plan before executing funding.' }],
      };
    }

    this.validateFundingAssignments(
      userId,
      budget,
      lines,
      budget.funding_source_account_id,
      lines.map((line) => ({
        budgetLineId: line.id,
        accountEnvelopeId: line.account_envelope_id ?? 0,
      })),
      true,
    );

    const postedDate = new Date().toISOString().slice(0, 10);
    const normalizedDescription =
      description?.trim() || `Budget funding for ${budget.month} (${budget.currency})`;
    const result = this.repo.executeFunding({
      budgetId: budget.id,
      userId: budget.user_id,
      date: postedDate,
      description: normalizedDescription,
      lines: lines.map((line) => ({
        accountId: line.envelope_account_id!,
        envelopeId: line.account_envelope_id!,
        amount: line.amount,
      })),
    });

    const activeReconciliation = this.reconciliationRepo.getActiveReconciliation(
      budget.funding_source_account_id,
    );
    if (activeReconciliation) {
      const calculatedCurrent = this.reconciliationRepo.computeCalculatedBalance(
        budget.funding_source_account_id,
        activeReconciliation.date,
      );
      const differenceCurrent = activeReconciliation.real_balance - calculatedCurrent;
      if (Math.abs(differenceCurrent) <= MONEY_TOLERANCE) {
        this.reconciliationRepo.closeReconciliation(activeReconciliation.id);
      }
    }

    return {
      message:
        'Budget funding executed successfully. The ledger records one ADJUSTMENT transaction because the current model does not maintain a separate unassigned-cash bucket.',
      data: {
        budget: this.mapBudgetWithSummary(this.getOwnedBudget(id, userId), this.repo.getDistributionSummary(id)),
        fundingTransactionId: result.transactionId,
        transactionType: 'ADJUSTMENT',
        postedDate,
      },
    };
  }

  private ensureUserExists(userId: number): void {
    const user = this.userRepo.findById(userId);
    if (!user) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found.`,
        details: [{ field: 'userId', detail: 'Create or select a valid user before using budgets.' }],
      };
    }
  }

  private getOwnedBudget(id: number, userId: number): Budget {
    const budget = this.repo.findById(id);
    if (!budget) {
      throw {
        code: 'NOT_FOUND',
        message: 'Budget not found.',
        details: [{ field: 'id', detail: `Budget ${id} does not exist.` }],
      };
    }
    if (budget.user_id !== userId) {
      throw {
        code: 'FORBIDDEN',
        message: 'You do not have access to this budget.',
        details: [{ field: 'userId', detail: `Budget ${id} belongs to another user.` }],
      };
    }
    return budget;
  }

  private ensureBudgetStatus(budget: Budget, expected: BudgetStatus, message: string): void {
    if (budget.status !== expected) {
      throw {
        code: 'CONFLICT',
        message,
        details: [
          {
            field: 'status',
            detail: `Budget ${budget.id} is currently ${budget.status}, expected ${expected}.`,
          },
        ],
      };
    }
  }

  private ensureFundingEditable(budget: Budget): void {
    if (budget.status === 'draft') {
      throw {
        code: 'CONFLICT',
        message: 'Funding is only available after the budget is finalized.',
        details: [{ field: 'status', detail: 'Finalize the budget before saving or executing funding.' }],
      };
    }
    if (budget.status === 'funded') {
      throw {
        code: 'CONFLICT',
        message: 'Funded budgets are read-only.',
        details: [{ field: 'status', detail: 'Funding can only be executed once per budget.' }],
      };
    }
  }

  private validatePlanningLines(
    userId: number,
    lines: Array<{
      categoryId: number;
      amount: number;
      percentage: number;
      notes?: string;
      sortOrder: number;
    }>,
  ): void {
    const categoryIds = new Set<number>();

    for (const [index, line] of lines.entries()) {
      if (categoryIds.has(line.categoryId)) {
        throw {
          code: 'CONFLICT',
          message: 'Budget lines cannot contain duplicate categories.',
          details: [
            {
              field: `lines[${index}].categoryId`,
              detail: `Category ${line.categoryId} is repeated in the same budget.`,
            },
          ],
        };
      }
      categoryIds.add(line.categoryId);

      const category = this.categoryRepo.findById(line.categoryId);
      if (!category || category.user_id !== userId) {
        throw {
          code: 'NOT_FOUND',
          message: 'Budget line category not found for this user.',
          details: [
            {
              field: `lines[${index}].categoryId`,
              detail: `Category ${line.categoryId} does not belong to user ${userId}.`,
            },
          ],
        };
      }
      if (category.is_active !== 1) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: 'Budget lines cannot use inactive categories.',
          details: [
            {
              field: `lines[${index}].categoryId`,
              detail: `Category ${line.categoryId} is inactive.`,
            },
          ],
        };
      }
      if (category.parent_id === null) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Budget lines must use child categories.',
          details: [
            {
              field: `lines[${index}].categoryId`,
              detail: `Category ${line.categoryId} is a parent category and cannot receive direct budget allocation.`,
            },
          ],
        };
      }
    }
  }

  private validateFundingAssignments(
    userId: number,
    budget: Budget,
    budgetLines: BudgetLineRow[],
    sourceAccountId: number,
    assignments: Array<{ budgetLineId: number; accountEnvelopeId: number }>,
    requireAssigned = false,
  ): void {
    const budgetLineIds = new Set(budgetLines.map((line) => line.id));
    const seenBudgetLineIds = new Set<number>();

    if (assignments.length !== budgetLines.length) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Funding plan must include every budget line exactly once.',
        details: [
          {
            field: 'lines',
            detail: `Expected ${budgetLines.length} funding assignments, received ${assignments.length}.`,
          },
        ],
      };
    }

    for (const [index, assignment] of assignments.entries()) {
      if (!budgetLineIds.has(assignment.budgetLineId)) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Funding plan references a line that does not belong to this budget.',
          details: [
            {
              field: `lines[${index}].budgetLineId`,
              detail: `Budget line ${assignment.budgetLineId} is not part of budget ${budget.id}.`,
            },
          ],
        };
      }
      if (seenBudgetLineIds.has(assignment.budgetLineId)) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Funding plan contains duplicate budget lines.',
          details: [
            {
              field: `lines[${index}].budgetLineId`,
              detail: `Budget line ${assignment.budgetLineId} appears more than once.`,
            },
          ],
        };
      }
      seenBudgetLineIds.add(assignment.budgetLineId);

      if (requireAssigned && assignment.accountEnvelopeId <= 0) {
        throw {
          code: 'CONFLICT',
          message: 'Funding cannot run because one or more budget lines are missing an assigned envelope.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Budget line ${assignment.budgetLineId} must be assigned before funding.`,
            },
          ],
        };
      }

      const budgetLine = budgetLines.find((line) => line.id === assignment.budgetLineId)!;
      const envelope = this.envelopeRepo.findById(assignment.accountEnvelopeId);
      if (!envelope) {
        throw {
          code: 'NOT_FOUND',
          message: 'Assigned account envelope was not found.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Account envelope ${assignment.accountEnvelopeId} does not exist.`,
            },
          ],
        };
      }
      if (envelope.is_active !== 1) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: 'Assigned account envelope is inactive.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Account envelope ${assignment.accountEnvelopeId} is inactive.`,
            },
          ],
        };
      }
      if (envelope.category_id !== budgetLine.category_id) {
        throw {
          code: 'CONFLICT',
          message: 'Assigned account envelope category does not match the budget line category.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Budget line ${budgetLine.id} expects category ${budgetLine.category_id}, but envelope ${envelope.id} is linked to category ${envelope.category_id}.`,
            },
          ],
        };
      }
      if (envelope.account_id !== sourceAccountId) {
        throw {
          code: 'CONFLICT',
          message: 'All funding envelopes must belong to the selected source account.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Envelope ${envelope.id} belongs to account ${envelope.account_id}, but source account is ${sourceAccountId}.`,
            },
          ],
        };
      }

      const account = this.accountRepo.findById(envelope.account_id);
      if (!account || account.user_id !== userId) {
        throw {
          code: 'NOT_FOUND',
          message: 'Assigned account envelope is linked to an unavailable account.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Envelope ${envelope.id} is not linked to an account owned by user ${userId}.`,
            },
          ],
        };
      }
      if (account.is_active !== 1) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: 'Assigned account is inactive.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Account ${account.id} is inactive.`,
            },
          ],
        };
      }
      if (account.currency !== budget.currency) {
        throw {
          code: 'CONFLICT',
          message: 'Assigned account currency does not match the budget currency.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Budget currency is ${budget.currency}, but account ${account.id} uses ${account.currency}.`,
            },
          ],
        };
      }
      if (!this.institutionRepo.isActive(account.institution_id)) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: 'Assigned account institution is inactive.',
          details: [
            {
              field: `lines[${index}].accountEnvelopeId`,
              detail: `Institution ${account.institution_id} is inactive.`,
            },
          ],
        };
      }

      const category = this.categoryRepo.findById(budgetLine.category_id);
      if (!category || category.is_active !== 1) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: 'Funding cannot proceed with inactive categories.',
          details: [
            {
              field: `lines[${index}].budgetLineId`,
              detail: `Category ${budgetLine.category_id} is inactive or missing.`,
            },
          ],
        };
      }
    }
  }

  private buildPlanningValidation(budget: Budget, lines: BudgetLineRow[]) {
    const distributedAmount = this.roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    const distributedPercentage = this.roundPercentage(
      lines.reduce((sum, line) => sum + line.percentage, 0),
    );
    const remainingAmount = this.roundMoney(budget.total_income - distributedAmount);
    const remainingPercentage = this.roundPercentage(100 - distributedPercentage);
    const errors: ValidationIssue[] = [];

    if (lines.length === 0) {
      errors.push({
        field: 'lines',
        detail: 'The budget must contain at least one line before it can be finalized.',
      });
    }

    for (const line of lines) {
      if (line.category_is_active !== 1) {
        errors.push({
          field: `line:${line.id}`,
          detail: `Category ${line.category_id} is inactive and cannot remain in the budget.`,
        });
      }
      if (line.category_parent_id === null) {
        errors.push({
          field: `line:${line.id}`,
          detail: `Category ${line.category_id} is a parent category; budget planning must target child categories only.`,
        });
      }
    }

    if (Math.abs(remainingAmount) > MONEY_TOLERANCE) {
      errors.push({
        field: 'totalIncome',
        detail: `Distributed amount is ${distributedAmount}, but the budget total income is ${budget.total_income}. Remaining amount: ${remainingAmount}.`,
      });
    }

    if (Math.abs(remainingPercentage) > PERCENT_TOLERANCE) {
      errors.push({
        field: 'percentage',
        detail: `Distributed percentage is ${distributedPercentage}. The budget requires exactly 100%. Remaining percentage: ${remainingPercentage}.`,
      });
    }

    return {
      isValid: errors.length === 0,
      distributedAmount,
      distributedPercentage,
      remainingAmount,
      remainingPercentage,
      errors,
    };
  }

  private buildFundingPlan(budget: Budget, lines: BudgetLineRow[]) {
    const sourceAccount =
      budget.funding_source_account_id !== null
        ? this.accountRepo.findById(budget.funding_source_account_id)
        : null;

    return {
      budget: this.mapBudgetWithSummary(budget, this.repo.getDistributionSummary(budget.id)),
      sourceAccountId: budget.funding_source_account_id,
      sourceAccountName: sourceAccount?.name ?? null,
      lines: lines.map((line) => ({
        budgetLineId: line.id,
        categoryId: line.category_id,
        categoryName: line.category_name,
        amount: line.amount,
        percentage: line.percentage,
        accountEnvelopeId: line.account_envelope_id,
        accountId: line.envelope_account_id,
        accountName: line.account_name,
        accountCurrency: line.account_currency,
        isAssigned: line.account_envelope_id !== null,
      })),
      isComplete: lines.length > 0 && lines.every((line) => line.account_envelope_id !== null),
    };
  }

  private mapBudgetWithSummary(
    budget: Budget,
    summary: {
      line_count: number;
      distributed_amount: number;
      distributed_percentage: number;
    },
  ) {
    const distributedAmount = this.roundMoney(summary.distributed_amount);
    const distributedPercentage = this.roundPercentage(summary.distributed_percentage);

    return {
      ...this.mapBudget(budget),
      linesCount: summary.line_count,
      distributedAmount,
      distributedPercentage,
      remainingAmount: this.roundMoney(budget.total_income - distributedAmount),
      remainingPercentage: this.roundPercentage(100 - distributedPercentage),
    };
  }

  private mapBudgetListItem(row: BudgetListRow) {
    return {
      ...this.mapBudgetWithSummary(row, {
        line_count: row.lines_count,
        distributed_amount: row.distributed_amount,
        distributed_percentage: row.distributed_percentage,
      }),
      sourceAccountId: row.funding_source_account_id,
      sourceAccountName: row.funding_source_account_name,
    };
  }

  private mapBudget(budget: Budget) {
    return {
      id: budget.id,
      userId: budget.user_id,
      month: budget.month,
      currency: budget.currency,
      totalIncome: budget.total_income,
      status: budget.status,
      sourceAccountId: budget.funding_source_account_id,
      createdAt: budget.created_at,
      updatedAt: budget.updated_at,
    };
  }

  private mapBudgetLine(line: BudgetLineRow) {
    return {
      id: line.id,
      budgetId: line.budget_id,
      categoryId: line.category_id,
      categoryName: line.category_name,
      amount: line.amount,
      percentage: line.percentage,
      notes: line.notes,
      sortOrder: line.sort_order,
      accountEnvelopeId: line.account_envelope_id,
      accountId: line.envelope_account_id,
      accountName: line.account_name,
      accountCurrency: line.account_currency,
      createdAt: line.created_at,
      updatedAt: line.updated_at,
    };
  }

  private normalizeCurrency(currency: string): string {
    return currency.trim().toUpperCase();
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundPercentage(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
