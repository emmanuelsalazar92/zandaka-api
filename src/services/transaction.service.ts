import { TransactionRepository } from '../repositories/transaction.repo';
import { EnvelopeRepository } from '../repositories/envelope.repo';
import { AccountRepository } from '../repositories/account.repo';
import { CategoryRepository } from '../repositories/category.repo';
import { InstitutionRepository } from '../repositories/institution.repo';
import { CreateTransactionRequest, Transaction, TransactionLine } from '../types';

export class TransactionService {
  private repo = new TransactionRepository();
  private envelopeRepo = new EnvelopeRepository();
  private accountRepo = new AccountRepository();
  private categoryRepo = new CategoryRepository();
  private institutionRepo = new InstitutionRepository();

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
    return this.repo.create(data.userId, data.date, data.description, data.type, data.lines);
  }

  findWithFilters(params: {
    from?: string;
    to?: string;
    accountId?: number;
    categoryId?: number;
    q?: string;
    userId?: number;
  }): Array<Transaction & { lines: TransactionLine[] }> {
    return this.repo.findWithFilters(params);
  }
}

