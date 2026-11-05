import { z } from 'zod';

const month = z.string().regex(/^(?:20\d{2})-(?:0[1-9]|1[0-2])$/);
const date = z
  .string()
  .refine(
    (value) =>
      /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
const numberText = z
  .string()
  .max(20)
  .regex(/^(?:|(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?)$/);
const moneyText = numberText.refine(
  (value) => value === '' || (value.split('.')[1]?.length ?? 0) <= 2,
);
const id = z.number().int().positive().safe();
export const planDocumentSchema = z
  .object({
    version: z.literal(1),
    month,
    incomeMonth: z.union([month, z.literal('')]),
    incomeMode: z.enum(['net', 'receipts']),
    income: z
      .object({
        net: moneyText,
        gross: moneyText,
        ccss: moneyText,
        tax: moneyText,
        q1: moneyText,
        q2: moneyText,
      })
      .strict(),
    exchange: z
      .object({
        source: z.string().trim().max(100),
        date: z.union([date, z.literal('')]),
        buy: numberText,
        sell: numberText,
        margin: numberText,
      })
      .strict(),
    incomeAccountId: id.nullable(),
    retainedAccountId: id.nullable(),
    sources: z.array(z.object({ accountId: id, envelopeId: id }).strict()).max(100),
    lines: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().trim().min(1).max(80),
            group: z.union([z.literal(50), z.literal(30), z.literal(20)]),
            kind: z.enum(['fixed', 'percent', 'subscription']),
            currency: z.enum(['USD', 'CRC']),
            payCurrency: z.enum(['USD', 'CRC']),
            amount: numberText,
            iva: numberText,
            roundUsd: z.enum(['up', 'none']),
            targetEnvelopeId: id.nullable(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (new Set(doc.lines.map((l) => l.id)).size !== doc.lines.length)
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Duplicate assignment identifiers',
      });
    if (new Set(doc.sources.map((s) => s.accountId)).size !== doc.sources.length)
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'One source envelope per account is required',
      });
    doc.lines.forEach((line, index) => {
      if (line.kind !== 'percent' && line.amount && (line.amount.split('.')[1]?.length ?? 0) > 2)
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'amount'],
          message: 'Fixed prices use at most two decimals',
        });
    });
  });
export const planIdentitySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ userId: z.coerce.number().int().positive().safe() }),
});
export const savePlanSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      userId: id,
      expectedRevision: z.number().int().min(0).safe(),
      document: planDocumentSchema,
    })
    .strict(),
});
export const planActionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ userId: id, revision: z.number().int().positive().safe() }).strict(),
});
export const applyPlanSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      userId: id,
      revision: z.number().int().positive().safe(),
      requestId: z.string().uuid(),
      date,
    })
    .strict(),
});
export const listPlansSchema = z.object({
  query: z.object({
    userId: z.coerce.number().int().positive().safe(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});
