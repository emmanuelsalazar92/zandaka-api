const CURRENCY_SYMBOLS: Record<string, string> = {
  CRC: '₡',
  USD: '$',
};

export function formatMoney(value: number | null, currency: string): string {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  const normalizedCurrency = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[normalizedCurrency] ?? `${normalizedCurrency} `;
  const absolute = Math.abs(value);
  const formatted = absolute.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${value < 0 ? '-' : ''}${symbol} ${formatted}`;
}
