import { assertMoney, currencyDigits, decimal, MoneyError, type DecimalInput } from './money';

// Read policy for legacy aggregates, never for individual entries or new inputs:
// retain seven guard decimal places beyond the currency's minor unit. Only when
// that guarded aggregate is itself valid money may its representation noise be
// discarded. CRC/USD therefore use 9 calculation decimals and 2 money decimals.
// A material fraction (e.g. 0.001 CRC) is rejected, not rounded away. This is a
// calculation-scale policy, not a claim about the origin of a historical entry.
const BALANCE_GUARD_DIGITS = 7;

export function monetaryBalance(value: DecimalInput, currency: string): number {
  const digits = currencyDigits(currency);
  const guarded = decimal(value).toDecimalPlaces(digits + BALANCE_GUARD_DIGITS);
  if (guarded.dp() > digits) {
    throw new MoneyError(
      `Calculated balance contains a material fraction of a ${currency} minor unit`,
    );
  }
  return assertMoney(guarded, currency);
}
