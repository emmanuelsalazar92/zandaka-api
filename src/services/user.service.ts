import { UserRepository } from '../repositories/user.repo';

export interface PreferredCurrencyResponse {
  userId: number;
  baseCurrency: string;
}

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
}
