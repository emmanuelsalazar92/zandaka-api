import Decimal from 'decimal.js';

// Keep this module identical to zandaka-web/lib/money.ts (covered by contract tests).
// 80 significant digits exceed the bounded input domain; money is rounded only at settlement.
const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
export type DecimalInput = number | string | Decimal;

export class MoneyError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly details: Array<{ field: string; detail: string }>;
  constructor(message: string) {
    super(message);
    this.details = [{ field: 'amount', detail: message }];
  }
}

export function decimal(value: DecimalInput): Decimal {
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    throw new MoneyError('Invalid decimal amount');
  }
  const result = new Exact(value);
  if (
    !result.isFinite() ||
    (!(value instanceof Decimal) && result.sd() > 40) ||
    Math.abs(result.e) > 40
  ) {
    throw new MoneyError('Decimal value exceeds the supported range');
  }
  return result;
}

export function decimalText(value: DecimalInput): string {
  const result = decimal(value);
  return result.isZero() ? '0' : result.toFixed();
}

// Numbers remain the public API transport. Never silently lose a decimal on that boundary.
export function decimalNumber(value: DecimalInput): number {
  const result = decimal(value);
  const number = result.toNumber();
  if (
    !Number.isFinite(number) ||
    !new Exact(String(number)).eq(result) ||
    result.abs().gt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new MoneyError('Amount cannot be represented safely by the numeric API');
  }
  return Object.is(number, -0) ? 0 : number;
}

export function currencyDigits(currency: string): number {
  const code = currency.toUpperCase();
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const supported = intl.supportedValuesOf?.('currency') ?? [
    'CRC',
    'USD',
    'EUR',
    'JPY',
    'BHD',
    'KWD',
  ];
  // CLDR excludes these ISO 4217 units of account from supportedValuesOf, but defines their scale.
  if (!/^[A-Z]{3}$/.test(code) || ![...supported, 'CLF', 'UYW'].includes(code)) {
    throw new MoneyError(`Unsupported currency: ${currency}`);
  }
  return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
    .maximumFractionDigits!;
}

export function assertMoney(value: DecimalInput, currency: string): number {
  const result = decimal(value);
  const digits = currencyDigits(currency);
  if (
    result.dp() > digits ||
    result.mul(new Exact(10).pow(digits)).abs().gt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new MoneyError(
      `Amount must use at most ${digits} decimals and safe minor units for ${currency}`,
    );
  }
  return decimalNumber(result);
}

export function currencyStep(currency: string): string {
  const digits = currencyDigits(currency);
  return digits === 0 ? '1' : `0.${'0'.repeat(digits - 1)}1`;
}

export function sumMoney(values: DecimalInput[]): number {
  return decimalNumber(
    values.reduce<Decimal>((sum, value) => sum.plus(decimal(value)), new Exact(0)),
  );
}

export function subtractMoney(value: DecimalInput, ...deductions: DecimalInput[]): number {
  return decimalNumber(
    deductions.reduce<Decimal>((total, item) => total.minus(decimal(item)), decimal(value)),
  );
}

export function roundDecimal(value: DecimalInput, digits: number): number {
  return decimalNumber(decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP));
}

export function roundMoney(value: DecimalInput, currency = 'CRC'): number {
  return assertMoney(
    decimal(value).toDecimalPlaces(currencyDigits(currency), Decimal.ROUND_HALF_UP),
    currency,
  );
}

export function multiplyMoney(value: DecimalInput, factor: DecimalInput): number {
  return decimalNumber(decimal(value).mul(decimal(factor)));
}

export function convertMoney(
  value: DecimalInput,
  rate: DecimalInput,
  currency: string,
  divide = false,
): number {
  const exactRate = decimal(rate);
  if (!exactRate.gt(0)) throw new MoneyError('Exchange rate must be positive');
  return roundMoney(
    divide ? decimal(value).div(exactRate) : decimal(value).mul(exactRate),
    currency,
  );
}

export function amountFromPercentage(
  total: DecimalInput,
  percentage: DecimalInput,
  currency: string,
): number {
  return roundMoney(decimal(total).mul(decimal(percentage)).div(100), currency);
}

export function percentageFromAmount(amount: DecimalInput, total: DecimalInput): number {
  return decimal(total).isZero()
    ? 0
    : roundDecimal(decimal(amount).div(decimal(total)).mul(100), 2);
}

export function parseMoneyInput(value: string, currency: string): number {
  return assertMoney(value.trim(), currency);
}

// Form drafts may be empty or incomplete; callers can render their usual validation state.
export function tryDecimalInput(value: string, currency?: string): number {
  try {
    return currency ? parseMoneyInput(value, currency) : decimalNumber(value.trim());
  } catch {
    return Number.NaN;
  }
}
