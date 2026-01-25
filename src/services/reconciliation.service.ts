import { ReconciliationRepository } from '../repositories/reconciliation.repo';
import { CreateReconciliationRequest, ReconciliationResponse, ReconciliationSummaryResponse } from '../types';

export class ReconciliationService {
  private repo = new ReconciliationRepository();

  create(data: CreateReconciliationRequest): ReconciliationResponse {
    const accountIsActive = this.repo.getAccountIsActive(data.accountId);
    if (accountIsActive === null) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }
    if (!accountIsActive) {
      throw { code: 'INACTIVE_RESOURCE', message: 'Account is inactive' };
    }

    const activeReconciliation = this.repo.getActiveReconciliation(data.accountId);
    if (activeReconciliation) {
      throw { code: 'CONFLICT', message: 'Active reconciliation already exists for account' };
    }

    const calculatedBalance = this.repo.computeCalculatedBalance(data.accountId, data.date);
    const difference = data.realBalance - calculatedBalance;
    const isBalanced = Math.abs(difference) <= 0.01;
    const status = isBalanced ? 'BALANCED' : 'OPEN';
    const isActive = isBalanced ? 0 : 1;
    const closedAt = isBalanced ? new Date().toISOString() : null;

    const reconciliation = this.repo.create({
      accountId: data.accountId,
      date: data.date,
      realBalance: data.realBalance,
      calculatedBalance,
      difference,
      status,
      isActive,
      closedAt,
      note: data.note,
    });

    return this.toResponse(reconciliation);
  }

  list(params: {
    accountId?: number;
    status?: 'OPEN' | 'BALANCED';
    limit: number;
    offset: number;
  }): ReconciliationResponse[] {
    const reconciliations = this.repo.findWithFilters(params);
    return reconciliations.map((r) => this.toResponse(r));
  }

  findById(id: number): ReconciliationResponse {
    const reconciliation = this.repo.findById(id);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Reconciliation not found' };
    }
    return this.toResponse(reconciliation);
  }

  findActiveByAccountId(accountId: number): ReconciliationResponse {
    const accountIsActive = this.repo.getAccountIsActive(accountId);
    if (accountIsActive === null) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }

    const reconciliation = this.repo.getActiveReconciliation(accountId);
    if (!reconciliation) {
      throw { code: 'NOT_FOUND', message: 'Active reconciliation not found' };
    }
    return this.toResponse(reconciliation);
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
      reconciliation.date
    );
    const differenceCurrent = reconciliation.real_balance - calculatedCurrent;
    const statusCurrent = Math.abs(differenceCurrent) <= 0.01 ? 'BALANCED' : 'OPEN';
    return {
      ...this.toResponse(reconciliation),
      calculatedCurrent,
      differenceCurrent,
      statusCurrent,
    };
  }

  private toResponse(reconciliation: {
    id: number;
    account_id: number;
    date: string;
    real_balance: number;
    calculated_balance: number;
    difference: number;
    status: 'OPEN' | 'BALANCED';
    is_active: number;
    note: string | null;
    created_at: string;
    closed_at: string | null;
  }): ReconciliationResponse {
    return {
      id: reconciliation.id,
      accountId: reconciliation.account_id,
      date: reconciliation.date,
      realBalance: reconciliation.real_balance,
      calculatedBalance: reconciliation.calculated_balance,
      difference: reconciliation.difference,
      status: reconciliation.status,
      isActive: reconciliation.is_active,
      note: reconciliation.note,
      createdAt: reconciliation.created_at,
      closedAt: reconciliation.closed_at,
    };
  }
}

