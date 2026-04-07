import { ExchangeRateRepository } from '../repositories/exchange-rate.repo';
import { UserRepository } from '../repositories/user.repo';
import { ExchangeRate } from '../types';

export interface ExchangeRateApiResponse {
  compra: number;
  venta: number;
  fecha: string;
}

export class ExchangeRateService {
  private repo = new ExchangeRateRepository();
  private userRepo = new UserRepository();

  async getByDate(day: number, month: number, year: number): Promise<ExchangeRateApiResponse> {
    if (!this.isValidDate(day, month, year)) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'The provided date is invalid',
        details: [{ field: 'date', message: 'Use a real date in DD/MM/YYYY format' }],
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const url = `https://tipodecambio.paginasweb.cr/api/${this.pad(day)}/${this.pad(month)}/${year}`;

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve exchange rate from external service',
          details: [{ status: response.status, source: 'tipodecambio.paginasweb.cr' }],
        };
      }

      const data = (await response.json()) as Partial<ExchangeRateApiResponse>;

      if (
        typeof data.compra !== 'number' ||
        typeof data.venta !== 'number' ||
        typeof data.fecha !== 'string'
      ) {
        throw {
          code: 'INTERNAL_ERROR',
          message: 'External service returned an invalid exchange rate payload',
          details: [{ source: 'tipodecambio.paginasweb.cr' }],
        };
      }

      return {
        compra: data.compra,
        venta: data.venta,
        fecha: data.fecha,
      };
    } catch (error: any) {
      if (error?.code) {
        throw error;
      }

      if (error?.name === 'AbortError') {
        throw {
          code: 'INTERNAL_ERROR',
          message: 'External exchange rate service timed out',
          details: [{ source: 'tipodecambio.paginasweb.cr' }],
        };
      }

      throw {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve exchange rate',
        details: [{ source: 'tipodecambio.paginasweb.cr', reason: error?.message ?? 'unknown' }],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  list(params: {
    userId: number;
    fromCurrency?: string;
    toCurrency?: string;
    effectiveDate?: string;
  }): ExchangeRate[] {
    this.ensureUserExists(params.userId);
    return this.repo.list(params);
  }

  findById(id: number, userId: number): ExchangeRate {
    this.ensureUserExists(userId);
    const exchangeRate = this.repo.findById(id);

    if (!exchangeRate || exchangeRate.user_id !== userId) {
      throw {
        code: 'NOT_FOUND',
        message: 'Exchange rate not found',
      };
    }

    return exchangeRate;
  }

  create(input: {
    userId: number;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveDate: string;
  }): ExchangeRate {
    this.ensureValidStoredRate(input);

    const duplicate = this.repo.findDuplicate({
      userId: input.userId,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      effectiveDate: input.effectiveDate,
    });

    if (duplicate) {
      throw {
        code: 'CONFLICT',
        message: 'An exchange rate already exists for this currency pair and effective date.',
        details: [
          {
            field: 'effectiveDate',
            detail: 'Use a different effective date or update the existing rate.',
          },
        ],
      };
    }

    return this.repo.create({
      userId: input.userId,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
    });
  }

  update(
    id: number,
    input: {
      userId: number;
      fromCurrency?: string;
      toCurrency?: string;
      rate?: number;
      effectiveDate?: string;
    },
  ): ExchangeRate {
    const existing = this.findById(id, input.userId);

    const nextRecord = {
      userId: input.userId,
      fromCurrency: input.fromCurrency ?? existing.from_currency,
      toCurrency: input.toCurrency ?? existing.to_currency,
      rate: input.rate ?? existing.rate,
      effectiveDate: input.effectiveDate ?? existing.effective_date,
    };

    this.ensureValidStoredRate(nextRecord);

    const duplicate = this.repo.findDuplicate({
      userId: nextRecord.userId,
      fromCurrency: nextRecord.fromCurrency,
      toCurrency: nextRecord.toCurrency,
      effectiveDate: nextRecord.effectiveDate,
      excludeId: id,
    });

    if (duplicate) {
      throw {
        code: 'CONFLICT',
        message: 'An exchange rate already exists for this currency pair and effective date.',
        details: [
          {
            field: 'effectiveDate',
            detail: 'Use a different effective date or update the existing rate.',
          },
        ],
      };
    }

    const updated = this.repo.update(id, {
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
    });

    if (!updated) {
      throw {
        code: 'NOT_FOUND',
        message: 'Exchange rate not found',
      };
    }

    return updated;
  }

  delete(id: number, userId: number): void {
    this.findById(id, userId);

    const deleted = this.repo.delete(id);
    if (!deleted) {
      throw {
        code: 'NOT_FOUND',
        message: 'Exchange rate not found',
      };
    }
  }

  private ensureValidStoredRate(input: {
    userId: number;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveDate: string;
  }): void {
    this.ensureUserExists(input.userId);

    if (input.fromCurrency === input.toCurrency) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'fromCurrency and toCurrency must be different.',
        details: [{ field: 'toCurrency', detail: 'Choose a different destination currency.' }],
      };
    }

    if (!Number.isFinite(input.rate) || input.rate <= 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'rate must be greater than 0.',
        details: [{ field: 'rate', detail: 'Use a positive numeric rate.' }],
      };
    }

    if (!this.isValidDateOnly(input.effectiveDate)) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'effectiveDate is invalid.',
        details: [{ field: 'effectiveDate', detail: 'Use a valid YYYY-MM-DD date.' }],
      };
    }
  }

  private ensureUserExists(userId: number): void {
    const user = this.userRepo.findById(userId);
    if (!user) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found`,
      };
    }
  }

  private isValidDate(day: number, month: number, year: number): boolean {
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private isValidDateOnly(value: string): boolean {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  private pad(value: number): string {
    return value.toString().padStart(2, '0');
  }
}
