import { AccountRepository } from '../repositories/account.repo';
import { InstitutionRepository } from '../repositories/institution.repo';
import { Account, AccountsInfo } from '../types';

export class AccountService {
  private repo = new AccountRepository();
  private institutionRepo = new InstitutionRepository();

  create(
    userId: number,
    institutionId: number,
    name: string,
    currency: string,
    allowOverdraft: boolean = false
  ): Account {
    // Verify institution exists and is active
    const institution = this.institutionRepo.findById(institutionId);
    if (!institution) {
      throw { code: 'NOT_FOUND', message: 'Institution not found' };
    }
    if (!this.institutionRepo.isActive(institutionId)) {
      throw { code: 'INACTIVE_RESOURCE', message: 'Institution is inactive' };
    }

    return this.repo.create(userId, institutionId, name, currency, allowOverdraft);
  }

  update(id: number, name?: string): Account {
    const account = this.repo.update(id, name);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }
    return account;
  }

  deactivate(id: number): void {
    const success = this.repo.deactivate(id);
    if (!success) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }
  }

  isActive(id: number): boolean {
    return this.repo.isActive(id);
  }

  findById(id: number): Account {
    const account = this.repo.findById(id);
    if (!account) {
      throw { code: 'NOT_FOUND', message: 'Account not found' };
    }
    return account;
  }

  findAllActive(): AccountsInfo[] {
    const accounts = this.repo.findAllActive();
    if (accounts.length === 0) {
      throw { code: 'NOT_FOUND', message: 'No accounts found' };
    }
    return accounts;
  }
}

