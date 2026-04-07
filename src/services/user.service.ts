import { UserRepository } from '../repositories/user.repo';
import { PreferredCurrencyResponse, UserSettingsResponse } from '../types';

export class UserService {
  private repo = new UserRepository();
  private readonly hardcodedUserId = 1;

  getPreferredCurrency(): PreferredCurrencyResponse {
    const user = this.repo.findById(this.hardcodedUserId);

    if (!user) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${this.hardcodedUserId} not found`,
      };
    }

    return {
      userId: user.id,
      baseCurrency: user.base_currency,
    };
  }

  getSettings(userId: number): UserSettingsResponse {
    const user = this.repo.findById(userId);

    if (!user) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found`,
      };
    }

    return {
      id: user.id,
      name: user.name,
      baseCurrency: user.base_currency,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  updateSettings(
    userId: number,
    input: { name?: string; baseCurrency?: string },
  ): UserSettingsResponse {
    const existing = this.repo.findById(userId);

    if (!existing) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found`,
      };
    }

    const updated = this.repo.update(userId, {
      name: input.name?.trim(),
      baseCurrency: input.baseCurrency?.trim().toUpperCase(),
    });

    if (!updated) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found`,
      };
    }

    return {
      id: updated.id,
      name: updated.name,
      baseCurrency: updated.base_currency,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }
}
