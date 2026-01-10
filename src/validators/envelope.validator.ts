import { z } from 'zod';

export const createEnvelopeSchema = z.object({
  params: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    categoryId: z.number().int().positive(),
  }),
});

export const deactivateEnvelopeSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

