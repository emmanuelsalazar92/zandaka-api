import { z } from 'zod';

export const createReconciliationSchema = z.object({
  body: z.object({
    accountId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    realBalance: z.number(),
    note: z.string().max(1000).optional(),
  }),
});

export const getReconciliationsSchema = z.object({
  query: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

