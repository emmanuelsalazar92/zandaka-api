import { EnvelopeRepository } from '../repositories/envelope.repo';
import { AccountRepository } from '../repositories/account.repo';
import { CategoryRepository } from '../repositories/category.repo';
import { AccountEnvelope } from '../types';

export class EnvelopeService {
  private repo = new EnvelopeRepository();
  private accountRepo = new AccountRepository();
  private categoryRepo = new CategoryRepository();

  create(accountId: number, categoryId: number): AccountEnvelope {
    // Verify account exists and is active
    const account = this.accountRepo.findById(accountId);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }
    if (!this.accountRepo.isActive(accountId)) {
      throw { code: 'INACTIVE_RESOURCE', message: 'Account is inactive' };
    }

    // Verify category exists and is active
    const category = this.categoryRepo.findById(categoryId);
    if (!category) {
      throw { code: 'NOT_FOUND', message: 'Category not found' };
    }
    if (!this.categoryRepo.isActive(categoryId)) {
      throw { code: 'INACTIVE_RESOURCE', message: 'Category is inactive' };
    }

    // Check if envelope already exists
    const existing = this.repo.findByAccountAndCategory(accountId, categoryId);
    if (existing) {
      if (existing.is_active === 1) {
        throw { code: 'CONFLICT', message: 'Envelope already exists' };
      }
      // Reactivate if it was deactivated
      // For simplicity, we'll just create a new one, but in production you might want to reactivate
      throw { code: 'CONFLICT', message: 'Envelope was previously deactivated' };
    }

    return this.repo.create(accountId, categoryId);
  }

  deactivate(id: number): void {
    const envelope = this.repo.findById(id);
    if (!envelope) {
      throw { code: 'NOT_FOUND', message: 'Envelope not found' };
    }

    const balance = this.repo.getBalance(id);
    if (balance !== 0) {
      throw { code: 'CONFLICT', message: 'Envelope has a non-zero balance' };
    }

    const success = this.repo.deactivate(id);
    if (!success) {
      throw { code: 'NOT_FOUND', message: 'Envelope not found' };
    }
  }

  isActive(id: number): boolean {
    return this.repo.isActive(id);
  }

  belongsToAccount(envelopeId: number, accountId: number): boolean {
    return this.repo.belongsToAccount(envelopeId, accountId);
  }

  findById(id: number): AccountEnvelope {
    const envelope = this.repo.findById(id);
    if (!envelope) {
      throw { code: 'NOT_FOUND', message: 'Envelope not found' };
    }
    return envelope;
  }
}

