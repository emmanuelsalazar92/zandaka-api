import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const numberFromQuery = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

const dateString = z
  .string()
  .regex(dateRegex)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid date format');

export const createTransactionSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    date: dateString, // YYYY-MM-DD
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
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
    from: dateString.optional(),
    to: dateString.optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT', 'ALL']).optional(),
    accountId: z.preprocess(numberFromQuery, z.number().int().positive()).optional(),
    categoryId: z.preprocess(numberFromQuery, z.number().int().positive()).optional(),
    q: z.string().optional(),
    amountMin: z.preprocess(numberFromQuery, z.number()).default(0),
    amountMax: z.preprocess(numberFromQuery, z.number()).optional(),
    page: z.preprocess(numberFromQuery, z.number().int().min(1)).default(1),
    pageSize: z
      .preprocess(numberFromQuery, z.number().int())
      .refine((value) => [10, 25, 50, 100].includes(value), 'Invalid pageSize')
      .default(10),
    sortBy: z.enum(['date', 'amount', 'createdAt']).default('date'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  }),
});

