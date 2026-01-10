import { z } from 'zod';

export const createTransactionSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT']),
    description: z.string().min(1).max(1000),
    lines: z
      .array(
        z.object({
          accountId: z.number().int().positive(),
          envelopeId: z.number().int().positive(),
          amount: z.number(),
        })
      )
      .min(1),
  }),
});

export const getTransactionsSchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    accountId: z.string().regex(/^\d+$/).transform(Number).optional(),
    categoryId: z.string().regex(/^\d+$/).transform(Number).optional(),
    q: z.string().optional(),
    userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

