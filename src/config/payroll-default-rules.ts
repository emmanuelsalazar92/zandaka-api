export const DEFAULT_COSTA_RICA_PAYROLL_RULES_2026 = {
  ccssWorker: {
    name: 'CCSS Worker 2026',
    country_code: 'CR',
    effective_from: '2026-01-01',
    effective_to: '2026-12-31',
    employee_rate: 0.1083,
    employer_rate: null,
    base_type: 'GROSS_SALARY',
  },
  incomeTax: {
    name: 'Income Tax 2026',
    country_code: 'CR',
    effective_from: '2026-01-01',
    effective_to: '2026-12-31',
    brackets: [
      { range_order: 1, amount_from: 0, amount_to: 918000, tax_rate: 0, is_exempt: 1 },
      { range_order: 2, amount_from: 918000, amount_to: 1347000, tax_rate: 0.1, is_exempt: 0 },
      { range_order: 3, amount_from: 1347000, amount_to: 2364000, tax_rate: 0.15, is_exempt: 0 },
      { range_order: 4, amount_from: 2364000, amount_to: 4727000, tax_rate: 0.2, is_exempt: 0 },
      { range_order: 5, amount_from: 4727000, amount_to: null, tax_rate: 0.25, is_exempt: 0 },
    ],
  },
} as const;
