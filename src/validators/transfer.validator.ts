import { z } from 'zod';
import { createTransactionSchema } from './transaction.validator';

const endpoint = z
  .object({
    accountId: z.number().int().positive().safe(),
    envelopeId: z.number().int().positive().safe(),
  })
  .strict();

export const createTransferSchema = z.object({
  body: z
    .object({
      requestId: z
        .string()
        .uuid()
        .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
        .transform((value) => value.toLowerCase()),
      userId: z.number().int().positive().safe(),
      date: createTransactionSchema.shape.body.shape.date,
      description: z.string().trim().min(1).max(1000),
      from: endpoint,
      to: endpoint,
      amount: z.number().finite().positive(),
    })
    .strict(),
});
export type CreateTransferRequest = z.infer<typeof createTransferSchema>['body'];
