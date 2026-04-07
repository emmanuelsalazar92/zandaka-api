import { CashDenominationRepository } from '../repositories/cash-denomination.repo';
import { UserRepository } from '../repositories/user.repo';
import {
  CashDenominationResponse,
  CashDenominationListResponse,
} from '../types';

export class CashDenominationService {
  private repo = new CashDenominationRepository();
  private userRepo = new UserRepository();

  list(params: {
    userId: number;
    currency?: string;
    includeInactive?: boolean;
  }): CashDenominationListResponse {
    this.assertUserExists(params.userId);

    const currency = params.currency?.trim().toUpperCase() || undefined;
    const items = this.repo.findByUserAndCurrency({
      userId: params.userId,
      currency,
      includeInactive: params.includeInactive ?? true,
    });

    return {
      userId: params.userId,
      currency: currency ?? null,
      items: items.map((item) => this.toResponse(item)),
    };
  }

  create(input: {
    userId: number;
    currency: string;
    value: number;
    type: 'BILL' | 'COIN';
    label?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): CashDenominationResponse {
    this.assertUserExists(input.userId);

    const currency = input.currency.trim().toUpperCase();
    const value = input.value;
    const isActive = input.isActive ?? true;

    if (isActive) {
      this.assertNoActiveDuplicate({
        userId: input.userId,
        currency,
        value,
      });
    }

    const denomination = this.repo.create({
      userId: input.userId,
      currency,
      value,
      type: input.type,
      label: this.normalizeLabel(input.label),
      sortOrder: input.sortOrder ?? 0,
      isActive,
    });

    return this.toResponse(denomination);
  }

  update(
    id: number,
    input: {
      userId: number;
      currency: string;
      value: number;
      type: 'BILL' | 'COIN';
      label?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): CashDenominationResponse {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw { code: 'NOT_FOUND', message: 'Cash denomination not found' };
    }

    if (existing.user_id !== input.userId) {
      throw { code: 'FORBIDDEN', message: 'Cash denomination does not belong to the user' };
    }

    this.assertUserExists(input.userId);

    const currency = input.currency.trim().toUpperCase();
    const value = input.value;
    const isActive = input.isActive ?? existing.is_active === 1;

    if (isActive) {
      this.assertNoActiveDuplicate({
        userId: input.userId,
        currency,
        value,
        excludeId: id,
      });
    }

    const updated = this.repo.update(id, {
      currency,
      value,
      type: input.type,
      label: this.normalizeLabel(input.label),
      sortOrder: input.sortOrder ?? existing.sort_order,
      isActive,
    });

    if (!updated) {
      throw { code: 'NOT_FOUND', message: 'Cash denomination not found' };
    }

    return this.toResponse(updated);
  }

  deactivate(id: number, userId: number): CashDenominationResponse {
    this.assertUserExists(userId);

    const existing = this.repo.findById(id);
    if (!existing) {
      throw { code: 'NOT_FOUND', message: 'Cash denomination not found' };
    }

    if (existing.user_id !== userId) {
      throw { code: 'FORBIDDEN', message: 'Cash denomination does not belong to the user' };
    }

    const updated = this.repo.deactivate(id);
    if (!updated) {
      throw { code: 'NOT_FOUND', message: 'Cash denomination not found' };
    }

    return this.toResponse(updated);
  }

  private assertUserExists(userId: number): void {
    if (!this.userRepo.findById(userId)) {
      throw { code: 'NOT_FOUND', message: `User ${userId} not found` };
    }
  }

  private assertNoActiveDuplicate(params: {
    userId: number;
    currency: string;
    value: number;
    excludeId?: number;
  }): void {
    if (
      this.repo.findActiveDuplicate({
        userId: params.userId,
        currency: params.currency,
        value: params.value,
        excludeId: params.excludeId,
      })
    ) {
      throw {
        code: 'CONFLICT',
        message: 'An active cash denomination with the same currency and value already exists',
      };
    }
  }

  private normalizeLabel(label?: string | null): string | null {
    const value = label?.trim() ?? '';
    return value.length > 0 ? value : null;
  }

  private toResponse(denomination: {
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
