import { z } from 'zod';

const monthRegex = /^\d{4}-\d{2}$/;

const numberFromQuery = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

const monthString = z
  .string()
  .regex(monthRegex, 'Month must use YYYY-MM format')
  .refine((value) => {
    const parsed = new Date(`${value}-01T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 7) === value;
  }, 'Invalid month value');

const currencyString = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter code')
  .transform((value) => value.toUpperCase());

const budgetStatus = z.enum(['draft', 'finalized', 'funded']);

const pagingQuery = {
  page: z.preprocess(numberFromQuery, z.number().int().min(1)).default(1),
  pageSize: z
    .preprocess(numberFromQuery, z.number().int())
    .refine((value) => [10, 25, 50, 100].includes(value), 'Invalid pageSize')
    .default(10),
};

const idParams = z.object({
  id: z.preprocess(numberFromQuery, z.number().int().positive()),
});

export const createBudgetSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    month: monthString,
    currency: currencyString,
    totalIncome: z.number().positive(),
  }),
});

export const listBudgetsSchema = z.object({
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
    month: monthString.optional(),
    currency: currencyString.optional(),
    status: budgetStatus.optional(),
    ...pagingQuery,
  }),
});

export const getBudgetSchema = z.object({
  params: idParams,
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});

export const replaceBudgetLinesSchema = z.object({
  params: idParams,
  body: z.object({
    userId: z.number().int().positive(),
    lines: z.array(
      z.object({
        categoryId: z.number().int().positive(),
        amount: z.number().positive(),
        percentage: z.number().positive().max(100),
        notes: z.string().trim().max(500).optional(),
        sortOrder: z.number().int().min(0),
      }),
    ),
  }),
});

export const finalizeBudgetSchema = z.object({
  params: idParams,
  body: z.object({
    userId: z.number().int().positive(),
  }),
});

export const copyBudgetSchema = z.object({
  params: idParams,
  body: z.object({
    userId: z.number().int().positive(),
    sourceBudgetId: z.number().int().positive().optional(),
  }),
});

export const historyBudgetsSchema = z.object({
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
    currency: currencyString.optional(),
    fromMonth: monthString.optional(),
    toMonth: monthString.optional(),
    status: budgetStatus.optional(),
    ...pagingQuery,
  }),
});

export const saveFundingPlanSchema = z.object({
  params: idParams,
  body: z.object({
    userId: z.number().int().positive(),
    sourceAccountId: z.number().int().positive(),
    lines: z
      .array(
        z.object({
          budgetLineId: z.number().int().positive(),
          accountEnvelopeId: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
});

export const getFundingPlanSchema = z.object({
  params: idParams,
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});

export const fundBudgetSchema = z.object({
  params: idParams,
  body: z.object({
    userId: z.number().int().positive(),
    description: z.string().trim().max(255).optional(),
  }),
});
