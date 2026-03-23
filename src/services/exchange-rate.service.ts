export interface ExchangeRateApiResponse {
  compra: number;
  venta: number;
  fecha: string;
}

export class ExchangeRateService {
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

  private isValidDate(day: number, month: number, year: number): boolean {
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private pad(value: number): string {
    return value.toString().padStart(2, '0');
  }
}
