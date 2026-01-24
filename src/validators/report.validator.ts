import { z } from 'zod';

export const getEnvelopeBalancesSchema = z.object({
  query: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const getAccountBalancesSchema = z.object({
  query: z.object({
    isActive: z
      .string()
      .regex(/^(true|false|1|0)$/i)
      .optional(),
  }),
});

export const getMonthlyExpensesSchema = z.object({
  query: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  }),
});

export const getInconsistenciesSchema = z.object({
  query: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

