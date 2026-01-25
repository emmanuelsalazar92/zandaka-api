import { TransactionRepository } from '../repositories/transaction.repo';
import { EnvelopeRepository } from '../repositories/envelope.repo';
import { AccountRepository } from '../repositories/account.repo';
import { CategoryRepository } from '../repositories/category.repo';
import { InstitutionRepository } from '../repositories/institution.repo';
import { ReconciliationRepository } from '../repositories/reconciliation.repo';
import { CreateTransactionRequest, Transaction, TransactionLine } from '../types';

export class TransactionService {
  private repo = new TransactionRepository();
  private envelopeRepo = new EnvelopeRepository();
  private accountRepo = new AccountRepository();
  private categoryRepo = new CategoryRepository();
  private institutionRepo = new InstitutionRepository();
  private reconciliationRepo = new ReconciliationRepository();

  create(data: CreateTransactionRequest): { transaction: Transaction; lines: TransactionLine[] } {
    // Validate lines
    if (!data.lines || data.lines.length === 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Transaction must have at least one line',
        details: [],
      };
    }

    // Validate TRANSFER type
    if (data.type === 'TRANSFER') {
      if (data.lines.length !== 2) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'TRANSFER transactions must have exactly 2 lines',
          details: [],
        };
      }

      const sum = data.lines.reduce((acc, line) => acc + line.amount, 0);
      if (Math.abs(sum) > 0.01) {
        // Allow small floating point differences
        throw {
          code: 'VALIDATION_ERROR',
          message: 'TRANSFER transaction lines must sum to zero',
          details: [],
        };
      }
    }

    // Validate each line
    for (const line of data.lines) {
      // Verify envelope exists
      const envelope = this.envelopeRepo.findById(line.envelopeId);
      if (!envelope) {
        throw {
          code: 'NOT_FOUND',
          message: `Envelope ${line.envelopeId} not found`,
          details: [{ field: 'lines', envelopeId: line.envelopeId }],
        };
      }

      // Verify envelope is active
      if (!this.envelopeRepo.isActive(line.envelopeId)) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: `Envelope ${line.envelopeId} is inactive`,
          details: [{ field: 'lines', envelopeId: line.envelopeId }],
        };
      }

      // Verify envelope belongs to account
      if (!this.envelopeRepo.belongsToAccount(line.envelopeId, line.accountId)) {
        throw {
          code: 'VALIDATION_ERROR',
          message: `Envelope ${line.envelopeId} does not belong to account ${line.accountId}`,
          details: [{ field: 'lines', envelopeId: line.envelopeId, accountId: line.accountId }],
        };
      }

      // Verify account exists and is active
      const account = this.accountRepo.findById(line.accountId);
      if (!account) {
        throw {
          code: 'NOT_FOUND',
          message: `Account ${line.accountId} not found`,
          details: [{ field: 'lines', accountId: line.accountId }],
        };
      }
      if (!this.accountRepo.isActive(line.accountId)) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: `Account ${line.accountId} is inactive`,
          details: [{ field: 'lines', accountId: line.accountId }],
        };
      }

      // Verify category is active
      const category = this.categoryRepo.findById(envelope.category_id);
      if (!category) {
        throw {
          code: 'NOT_FOUND',
          message: `Category ${envelope.category_id} not found`,
        };
      }
      if (!this.categoryRepo.isActive(envelope.category_id)) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: `Category ${envelope.category_id} is inactive`,
        };
      }

      // Verify institution is active
      if (!this.institutionRepo.isActive(account.institution_id)) {
        throw {
          code: 'INACTIVE_RESOURCE',
          message: `Institution ${account.institution_id} is inactive`,
        };
      }
    }

    // Create transaction with lines atomically
    const result = this.repo.create(
      data.userId,
      data.date,
      data.description,
      data.type,
      data.lines
    );

    const accountIds = new Set(data.lines.map((line) => line.accountId));
    for (const accountId of accountIds) {
      const activeReconciliation = this.reconciliationRepo.getActiveReconciliation(accountId);
      if (!activeReconciliation) {
        continue;
      }

      const calculatedCurrent = this.reconciliationRepo.computeCalculatedBalance(
        accountId,
        activeReconciliation.date
      );
      const differenceCurrent = activeReconciliation.real_balance - calculatedCurrent;
      if (Math.abs(differenceCurrent) <= 0.01) {
        this.reconciliationRepo.closeReconciliation(activeReconciliation.id);
      }
    }

    return result;
  }

  findWithFilters(params: {
    userId: number;
    from?: string;
    to?: string;
    type?: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
    accountId?: number;
    categoryId?: number;
    q?: string;
    amountMin?: number;
    amountMax?: number;
    page: number;
    pageSize: number;
    sortBy: 'date' | 'amount' | 'createdAt';
    sortDir: 'asc' | 'desc';
  }): {
    data: Array<{
      id: number;
      userId: number;
      date: string;
      description: string;
      type: Transaction['type'];
      accountId: number | null;
      accountName: string | null;
      categoryId: number | null;
      categoryName: string | null;
      amount: number;
      createdAt?: string;
      lines: Array<{
        id: number;
        transactionId: number;
        accountId: number;
        accountName: string | null;
        envelopeId: number;
        categoryId: number | null;
        categoryName: string | null;
        amount: number;
      }>;
    }>;
    meta: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  } {
    const result = this.repo.findWithFilters(params);
    const data = result.data.map((transaction) => {
      const primaryLine = transaction.lines.length === 1 ? transaction.lines[0] : null;
      return {
        id: transaction.id,
        userId: transaction.user_id,
        date: transaction.date,
        description: transaction.description,
        type: transaction.type,
        accountId: primaryLine?.account_id ?? null,
        accountName: primaryLine?.account_name ?? null,
        categoryId: primaryLine?.category_id ?? null,
        categoryName: primaryLine?.category_name ?? null,
        amount: transaction.amount,
        createdAt: transaction.created_at,
        lines: transaction.lines.map((line) => ({
          id: line.id,
          transactionId: line.transaction_id,
          accountId: line.account_id,
          accountName: line.account_name ?? null,
          envelopeId: line.envelope_id,
          categoryId: line.category_id ?? null,
          categoryName: line.category_name ?? null,
          amount: line.amount,
        })),
      };
    });

    return { data, meta: result.meta };
  }
}

