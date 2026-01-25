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
    account_id: z.string().regex(/^\d+$/).transform(Number).optional(),
    accountId: z.string().regex(/^\d+$/).transform(Number).optional(),
    status: z.enum(['OPEN', 'BALANCED']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

export const getReconciliationByIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const getActiveReconciliationSchema = z.object({
  params: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const updateReconciliationSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z
    .object({
      note: z.string().max(1000).nullable(),
    })
    .strict(),
});

export const getReconciliationSummarySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

