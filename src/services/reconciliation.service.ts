import db from '../db/db';
import { CashDenominationRepository } from '../repositories/cash-denomination.repo';
import { CashReconciliationDetailRepository } from '../repositories/cash-reconciliation-detail.repo';
import {
  ReconciliationRepository,
  type ReconciliationAccountContext,
} from '../repositories/reconciliation.repo';
import {
  AccountCashDenominationsResponse,
  CashDenominationResponse,
  CreateCashReconciliationLineRequest,
  CreateReconciliationRequest,
  ReconciliationExpectedTotalResponse,
  ReconciliationLineResponse,
  ReconciliationResponse,
  ReconciliationSummaryResponse,
} from '../types';

const MONEY_TOLERANCE = 0.01;

type NormalizedDenominationLine = {
  denominationId: number | null;
  denominationValue: number;
  denominationType: 'BILL' | 'COIN';
  denominationLabel: string | null;
  quantity: number;
  lineTotal: number;
  sortOrder: number;
};

export class ReconciliationService {
  private repo = new ReconciliationRepository();
  private denominationRepo = new CashDenominationRepository();
  private detailRepo = new CashReconciliationDetailRepository();

  create(data: CreateReconciliationRequest): ReconciliationResponse {
    const account = this.assertAccountAvailable(data.accountId);
    const countMethod = this.resolveCountMethod(data);
    const date = this.resolveDate(data.date);

    const activeReconciliation = this.repo.getActiveReconciliation(data.accountId);
    if (activeReconciliation) {
      throw { code: 'CONFLICT', message: 'Active reconciliation already exists for account' };
    }

    const expectedTotal = this.repo.computeCalculatedBalance(data.accountId, date);

    let countedTotal = 0;
    let lines: NormalizedDenominationLine[] = [];

    if (countMethod === 'DENOMINATION_COUNT') {
      this.assertCashAccount(account);
      lines = this.normalizeDenominationLines(account, data.lines ?? []);
      countedTotal = this.roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    } else {
      countedTotal = this.resolveManualTotal(data);
    }

    const difference = this.roundMoney(countedTotal - expectedTotal);
    const isBalanced = Math.abs(difference) <= MONEY_TOLERANCE;
    const status = isBalanced ? 'BALANCED' : 'OPEN';
    const isActive = isBalanced ? 0 : 1;
    const closedAt = isBalanced ? new Date().toISOString() : null;
    const note = this.normalizeNote(data.notes ?? data.note);

    const createInTransaction = db.transaction(() => {
      const reconciliation = this.repo.create({
        accountId: data.accountId,
        date,
        realBalance: countedTotal,
        countMethod,
        calculatedBalance: expectedTotal,
        difference,
        status,
        isActive,
        closedAt,
        note: note ?? undefined,
      });

      if (countMethod === 'DENOMINATION_COUNT' && lines.length > 0) {
        this.detailRepo.createMany(reconciliation.id, lines);
      }

      return reconciliation;
    });

    const reconciliation = createInTransaction();
    return this.toResponse(reconciliation, {
      account,
      includeLines: countMethod === 'DENOMINATION_COUNT',
    });
  }

  list(params: {
    accountId?: number;
    status?: 'OPEN' | 'BALANCED' | 'IGNORED';
    limit: number;
    offset: number;
  }): ReconciliationResponse[] {
    const reconciliations = this.repo.findWithFilters(params);
    return reconciliations.map((reconciliation) => this.toResponse(reconciliation));
  }

  findById(id: number): ReconciliationResponse {
    const reconciliation = this.repo.findById(id);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Reconciliation not found' };
    }
    return this.toResponse(reconciliation, { includeLines: true });
  }

  findActiveByAccountId(accountId: number): ReconciliationResponse {
    const account = this.repo.getAccountContext(accountId);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }

    const reconciliation = this.repo.getActiveReconciliation(accountId);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Active reconciliation not found' };
    }
    return this.toResponse(reconciliation, {
      account,
      includeLines: reconciliation.count_method === 'DENOMINATION_COUNT',
    });
  }

  updateNote(id: number, note: string | null): ReconciliationResponse {
    const reconciliation = this.repo.updateNote(id, note);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Reconciliation not found' };
    }
    return this.toResponse(reconciliation);
  }

  getSummary(id: number): ReconciliationSummaryResponse {
    const reconciliation = this.repo.findById(id);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Reconciliation not found' };
    }
    const calculatedCurrent = this.repo.computeCalculatedBalance(
      reconciliation.account_id,
      reconciliation.date,
    );
    const differenceCurrent = this.roundMoney(reconciliation.real_balance - calculatedCurrent);
    const statusCurrent = Math.abs(differenceCurrent) <= MONEY_TOLERANCE ? 'BALANCED' : 'OPEN';
    return {
      ...this.toResponse(reconciliation, {
        includeLines: reconciliation.count_method === 'DENOMINATION_COUNT',
      }),
      calculatedCurrent,
      differenceCurrent,
      statusCurrent,
    };
  }

  getCashDenominationsForAccount(accountId: number): AccountCashDenominationsResponse {
    const account = this.assertAccountAvailable(accountId);
    this.assertCashAccount(account);

    const denominations = this.denominationRepo.findByUserAndCurrency({
      userId: account.user_id,
      currency: account.currency,
      includeInactive: false,
    });

    return {
      accountId: account.id,
      currency: account.currency,
      countMethod: 'DENOMINATION_COUNT',
      denominations: denominations.map((item) => this.toDenominationResponse(item)),
    };
  }

  getExpectedTotalForAccount(accountId: number, date: string): ReconciliationExpectedTotalResponse {
    const account = this.assertAccountAvailable(accountId);

    return {
      accountId: account.id,
      currency: account.currency,
      date,
      expectedTotal: this.repo.computeCalculatedBalance(account.id, date),
    };
  }

  blockDeletion(id: number): never {
    const reconciliation = this.repo.findById(id);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Reconciliation not found' };
    }

    throw {
      code: 'CONFLICT',
      message: 'Reconciliations cannot be deleted',
    };
  }

  ignore(id: number): ReconciliationResponse {
    const reconciliation = this.repo.findById(id);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Reconciliation not found' };
    }

    if (reconciliation.is_active !== 1) {
      throw { code: 'CONFLICT', message: 'Only active reconciliations can be ignored' };
    }

    const ignored = this.repo.ignoreReconciliation(id);
    if (!ignored) {
      throw { code: 'CONFLICT', message: 'Only active reconciliations can be ignored' };
    }

    return this.toResponse(ignored);
  }

  private resolveCountMethod(
    data: CreateReconciliationRequest,
  ): 'MANUAL_TOTAL' | 'DENOMINATION_COUNT' {
    if (data.countMethod) {
      return data.countMethod;
    }
    return Array.isArray(data.lines) && data.lines.length > 0
      ? 'DENOMINATION_COUNT'
      : 'MANUAL_TOTAL';
  }

  private resolveDate(date?: string): string {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    return new Date().toISOString().slice(0, 10);
  }

  private resolveManualTotal(data: CreateReconciliationRequest): number {
    const countedTotal = data.countedTotal ?? data.realBalance;
    if (typeof countedTotal !== 'number' || !Number.isFinite(countedTotal)) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Manual reconciliations require a counted total',
        details: [{ field: 'realBalance', detail: 'Provide a valid counted total' }],
      };
    }

    return this.roundMoney(countedTotal);
  }

  private normalizeDenominationLines(
    account: ReconciliationAccountContext,
    inputLines: CreateCashReconciliationLineRequest[],
  ): NormalizedDenominationLine[] {
    if (inputLines.length === 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Denomination count reconciliations require at least one line',
        details: [{ field: 'lines', detail: 'Provide at least one denomination line' }],
      };
    }

    const seen = new Set<string>();

    return inputLines.map((line, index) => {
      const quantity = line.quantity;
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Invalid denomination quantity',
          details: [
            {
              field: `lines[${index}].quantity`,
              detail: 'Quantity must be an integer greater than or equal to zero',
            },
          ],
        };
      }

      let denominationId: number | null = null;
      let denominationValue: number;
      let denominationType: 'BILL' | 'COIN';
      let denominationLabel: string | null = null;
      let sortOrder = line.sortOrder ?? index;

      if (line.denominationId !== undefined) {
        const denomination = this.denominationRepo.findById(line.denominationId);
        if (!denomination) {
          throw { code: 'NOT_FOUND', message: 'Cash denomination not found' };
        }
        if (denomination.user_id !== account.user_id) {
          throw {
            code: 'FORBIDDEN',
            message: 'Cash denomination does not belong to the account owner',
          };
        }
        if (denomination.currency !== account.currency) {
          throw {
            code: 'CONFLICT',
            message: 'Cash denomination currency does not match account currency',
          };
        }
        if (denomination.is_active !== 1) {
          throw { code: 'CONFLICT', message: 'Cash denomination is inactive' };
        }

        denominationId = denomination.id;
        denominationValue = denomination.value;
        denominationType = denomination.type;
        denominationLabel = denomination.label;
        sortOrder = denomination.sort_order;
      } else {
        if (
          typeof line.denominationValue !== 'number' ||
          !Number.isFinite(line.denominationValue) ||
          line.denominationValue <= 0
        ) {
          throw {
            code: 'VALIDATION_ERROR',
            message: 'Invalid denomination value',
            details: [
              {
                field: `lines[${index}].denominationValue`,
                detail: 'Denomination value must be greater than zero',
              },
            ],
          };
        }

        if (line.denominationType !== 'BILL' && line.denominationType !== 'COIN') {
          throw {
            code: 'VALIDATION_ERROR',
            message: 'Invalid denomination type',
            details: [
              {
                field: `lines[${index}].denominationType`,
                detail: 'Denomination type must be BILL or COIN',
              },
            ],
          };
        }

        denominationValue = this.roundMoney(line.denominationValue);
        denominationType = line.denominationType;
        denominationLabel = this.normalizeNote(line.denominationLabel) ?? null;
      }

      const duplicateKey =
        denominationId !== null
          ? `id:${denominationId}`
          : `value:${denominationValue}:type:${denominationType}`;
      if (seen.has(duplicateKey)) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Duplicate denomination lines are not allowed',
          details: [
            {
              field: `lines[${index}]`,
              detail: 'Each denomination can only appear once per reconciliation',
            },
          ],
        };
      }
      seen.add(duplicateKey);

      return {
        denominationId,
        denominationValue,
        denominationType,
        denominationLabel,
        quantity,
        lineTotal: this.roundMoney(denominationValue * quantity),
        sortOrder,
      };
    });
  }

  private assertAccountAvailable(accountId: number): ReconciliationAccountContext {
    const account = this.repo.getAccountContext(accountId);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }
    if (account.is_active !== 1) {
      throw { code: 'INACTIVE_RESOURCE', message: 'Account is inactive' };
    }
    return account;
  }

  private assertCashAccount(account: ReconciliationAccountContext): void {
    if (account.type !== 'CASH') {
      throw {
        code: 'CONFLICT',
        message: 'Denomination counts are only available for CASH accounts',
      };
    }
  }

  private normalizeNote(value?: string | null): string | null {
    const note = value?.trim() ?? '';
    return note.length > 0 ? note : null;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toResponse(
    reconciliation: {
      id: number;
      account_id: number;
      date: string;
      real_balance: number;
      count_method?: 'MANUAL_TOTAL' | 'DENOMINATION_COUNT';
      calculated_balance: number;
      difference: number;
      status: 'OPEN' | 'BALANCED' | 'IGNORED';
      is_active: number;
      note: string | null;
      created_at: string;
      updated_at: string;
      closed_at: string | null;
    },
    options?: {
      account?: ReconciliationAccountContext | null;
      includeLines?: boolean;
    },
  ): ReconciliationResponse {
    const account = options?.account ?? this.repo.getAccountContext(reconciliation.account_id);
    const countMethod = reconciliation.count_method ?? 'MANUAL_TOTAL';
    const lines =
      options?.includeLines && countMethod === 'DENOMINATION_COUNT'
        ? this.detailRepo
            .findByReconciliationId(reconciliation.id)
            .map((line) => this.toLineResponse(line))
        : undefined;

    return {
      id: reconciliation.id,
      accountId: reconciliation.account_id,
      currency: account?.currency ?? '',
      date: reconciliation.date,
      countMethod,
      expectedTotal: reconciliation.calculated_balance,
      countedTotal: reconciliation.real_balance,
      realBalance: reconciliation.real_balance,
      calculatedBalance: reconciliation.calculated_balance,
      difference: reconciliation.difference,
      status: reconciliation.status,
      isActive: reconciliation.is_active,
      note: reconciliation.note,
      notes: reconciliation.note,
      createdAt: reconciliation.created_at,
      updatedAt: reconciliation.updated_at,
      closedAt: reconciliation.closed_at,
      ...(lines ? { lines } : {}),
    };
  }

  private toLineResponse(line: {
    id: number;
    reconciliation_id: number;
    denomination_id: number | null;
    denomination_value: number;
    denomination_type: 'BILL' | 'COIN';
    denomination_label: string | null;
    quantity: number;
    line_total: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }): ReconciliationLineResponse {
    return {
      id: line.id,
      reconciliationId: line.reconciliation_id,
      denominationId: line.denomination_id,
      denominationValue: line.denomination_value,
      denominationType: line.denomination_type,
      denominationLabel: line.denomination_label,
      quantity: line.quantity,
      lineTotal: line.line_total,
      sortOrder: line.sort_order,
      createdAt: line.created_at,
      updatedAt: line.updated_at,
    };
  }

  private toDenominationResponse(denomination: {
    id: number;
    user_id: number;
    currency: string;
    value: number;
    type: 'BILL' | 'COIN';
    label: string | null;
    sort_order: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  }): CashDenominationResponse {
    return {
      id: denomination.id,
      userId: denomination.user_id,
      currency: denomination.currency,
      value: denomination.value,
      type: denomination.type,
      label: denomination.label,
      sortOrder: denomination.sort_order,
      isActive: denomination.is_active === 1,
      createdAt: denomination.created_at,
      updatedAt: denomination.updated_at,
    };
  }
}
