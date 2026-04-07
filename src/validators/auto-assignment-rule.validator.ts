import { z } from 'zod';

const numberFromQuery = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

const idFromPath = z.string().regex(/^\d+$/).transform(Number);
const nullableId = z.number().int().positive().nullable();
const matchType = z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT', 'REGEX']);

export const listAutoAssignmentRulesSchema = z.object({
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});

export const getAutoAssignmentRuleSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});

export const createAutoAssignmentRuleSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    pattern: z.string(),
    matchType: matchType.default('CONTAINS'),
    accountId: nullableId.optional().default(null),
    accountEnvelopeId: nullableId.optional().default(null),
    priority: z.number().int().default(100),
    isActive: z.boolean().default(true),
    notes: z.string().nullable().optional(),
  }),
});

export const updateAutoAssignmentRuleSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  body: z
    .object({
      userId: z.number().int().positive(),
      pattern: z.string().optional(),
      matchType: matchType.optional(),
      accountId: nullableId.optional(),
      accountEnvelopeId: nullableId.optional(),
      priority: z.number().int().optional(),
      isActive: z.boolean().optional(),
      notes: z.string().nullable().optional(),
    })
    .refine(
      (value) =>
        value.pattern !== undefined ||
        value.matchType !== undefined ||
        value.accountId !== undefined ||
        value.accountEnvelopeId !== undefined ||
        value.priority !== undefined ||
        value.isActive !== undefined ||
        value.notes !== undefined,
      {
        message: 'Provide at least one field to update.',
        path: ['general'],
      },
    ),
});

export const updateAutoAssignmentRuleStatusSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  body: z.object({
    userId: z.number().int().positive(),
    isActive: z.boolean(),
  }),
});

export const deleteAutoAssignmentRuleSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});

export const testAutoAssignmentRuleSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    description: z.string().trim().min(1),
  }),
});
