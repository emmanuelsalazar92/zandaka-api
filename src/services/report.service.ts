import { ReportRepository } from '../repositories/report.repo';
import {
  AccountBalance,
  EnvelopeBalance,
  NegativeEnvelope,
  MonthlyExpense,
  CategoryTotal,
  Inconsistency,
} from '../repositories/report.repo';

export class ReportService {
  private repo = new ReportRepository();

  getAccountBalances(): AccountBalance[] {
    return this.repo.getAccountBalances();
  }

  getEnvelopeBalances(accountId: number): EnvelopeBalance[] {
    return this.repo.getEnvelopeBalances(accountId);
  }

  getNegativeEnvelopes(): NegativeEnvelope[] {
    return this.repo.getNegativeEnvelopes();
  }

  getMonthlyExpenses(month: string): MonthlyExpense[] {
    // Validate month format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw { code: 'VALIDATION_ERROR', message: 'Month must be in YYYY-MM format' };
    }
    return this.repo.getMonthlyExpenses(month);
  }

  getCategoryTotals(): CategoryTotal[] {
    return this.repo.getCategoryTotals();
  }

  getInconsistencies(accountId?: number): Inconsistency[] {
    return this.repo.getInconsistencies(accountId);
  }
}

