export const PAYROLL_MONEY_PRECISION = 2;
export const PAYROLL_RATE_PRECISION = 6;

export type ProgressiveTaxBracketInput = {
  range_order: number;
  amount_from: number;
  amount_to: number | null;
  tax_rate: number;
  is_exempt: number;
};

export type ProgressiveTaxBreakdownLine = {
  rangeOrder: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  isExempt: boolean;
  amountFrom: number;
  amountTo: number | null;
};

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function roundPayrollMoney(value: number) {
  return roundTo(value, PAYROLL_MONEY_PRECISION);
}

export function roundPayrollRate(value: number) {
  return roundTo(value, PAYROLL_RATE_PRECISION);
}

export function calculateCcssWorkerAmount(grossSalary: number, employeeRate: number) {
  return roundPayrollMoney(grossSalary * employeeRate);
}

export function calculateTaxableBase(grossSalary: number, _ccssWorkerAmount: number) {
  // Current business rule: both CCSS and salary income tax are calculated from gross salary.
  // We keep the taxableBase field in the response for API compatibility.
  return roundPayrollMoney(grossSalary);
}

/**
 * Brackets use a lower-inclusive, upper-exclusive convention:
 * [amount_from, amount_to) and the last open bracket is [amount_from, +inf).
 * This keeps thresholds stable without requiring `0.01` gaps between ranges.
 */
export function calculateProgressiveIncomeTax(
  taxableBase: number,
  brackets: ProgressiveTaxBracketInput[],
) {
  const safeTaxableBase = Math.max(roundPayrollMoney(taxableBase), 0);
  const breakdown: ProgressiveTaxBreakdownLine[] = [];
  let totalTax = 0;

  for (const bracket of brackets) {
    if (safeTaxableBase <= bracket.amount_from) {
      breakdown.push({
        rangeOrder: bracket.range_order,
        taxableAmount: 0,
        taxRate: bracket.tax_rate,
        taxAmount: 0,
        isExempt: bracket.is_exempt === 1,
        amountFrom: bracket.amount_from,
        amountTo: bracket.amount_to,
      });
      continue;
    }

    const upperBound = bracket.amount_to ?? safeTaxableBase;
    const taxableAmount = roundPayrollMoney(
      Math.max(Math.min(safeTaxableBase, upperBound) - bracket.amount_from, 0),
    );
    const taxAmount =
      bracket.is_exempt === 1 ? 0 : roundPayrollMoney(taxableAmount * bracket.tax_rate);

    totalTax = roundPayrollMoney(totalTax + taxAmount);
    breakdown.push({
      rangeOrder: bracket.range_order,
      taxableAmount,
      taxRate: bracket.tax_rate,
      taxAmount,
      isExempt: bracket.is_exempt === 1,
      amountFrom: bracket.amount_from,
      amountTo: bracket.amount_to,
    });
  }

  return {
    incomeTaxAmount: totalTax,
    breakdown,
  };
}

export function calculateNetSalary(params: {
  grossSalary: number;
  ccssWorkerRate: number;
  incomeTaxBrackets: ProgressiveTaxBracketInput[];
}) {
  const ccssWorkerAmount = calculateCcssWorkerAmount(params.grossSalary, params.ccssWorkerRate);
  const taxableBase = calculateTaxableBase(params.grossSalary, ccssWorkerAmount);
  const incomeTax = calculateProgressiveIncomeTax(taxableBase, params.incomeTaxBrackets);
  const netSalary = roundPayrollMoney(
    params.grossSalary - ccssWorkerAmount - incomeTax.incomeTaxAmount,
  );

  return {
    ccssWorkerAmount,
    taxableBase,
    incomeTaxAmount: incomeTax.incomeTaxAmount,
    taxBreakdown: incomeTax.breakdown,
    netSalary,
  };
}
