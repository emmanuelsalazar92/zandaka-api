import { ReconciliationRepository } from '../repositories/reconciliation.repo';
import { ReportRepository } from '../repositories/report.repo';
import { AccountRepository } from '../repositories/account.repo';
import { CreateReconciliationRequest, ReconciliationResponse } from '../types';

export class ReconciliationService {
  private repo = new ReconciliationRepository();
  private reportRepo = new ReportRepository();
  private accountRepo = new AccountRepository();

  create(data: CreateReconciliationRequest): ReconciliationResponse {
    // Verify account exists
    const account = this.accountRepo.findById(data.accountId);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }

    // Calculate balance as of the reconciliation date
    const calculatedBalance = this.reportRepo.getAccountCalculatedBalance(
      data.accountId,
      data.date
    );

    // Create reconciliation
    const reconciliation = this.repo.create(
      data.accountId,
      data.date,
      data.realBalance,
      data.note
    );

    return {
      id: reconciliation.id,
      accountId: reconciliation.account_id,
      date: reconciliation.date,
      realBalance: reconciliation.real_balance,
      calculatedBalance,
      difference: data.realBalance - calculatedBalance,
      note: reconciliation.note,
      createdAt: reconciliation.created_at,
    };
  }

  findByAccountId(accountId: number) {
    // Verify account exists
    const account = this.accountRepo.findById(accountId);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }

    const reconciliations = this.repo.findByAccountId(accountId);
    return reconciliations.map((r) => {
      const calculatedBalance = this.reportRepo.getAccountCalculatedBalance(
        r.account_id,
        r.date
      );
      return {
        id: r.id,
        accountId: r.account_id,
        date: r.date,
        realBalance: r.real_balance,
        calculatedBalance,
        difference: r.real_balance - calculatedBalance,
        note: r.note,
        createdAt: r.created_at,
      };
    });
  }
}

