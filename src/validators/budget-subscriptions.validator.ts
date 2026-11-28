import { z } from 'zod';
import { planIdentitySchema } from './budget-plan.validator';

const id = z.number().int().positive().safe();
const currency = z.enum(['CRC', 'USD']);
const definition = z
  .object({
    name: z.string().trim().min(1).max(80),
    amount: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/)
      .refine((value) => Number(value) > 0),
    currency,
    payCurrency: currency,
    iva: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,6})?$/)
      .refine((value) => Number(value) <= 100),
    roundUsd: z.enum(['none', 'up']),
  })
  .strict()
  .refine((value) => value.currency !== 'CRC' || value.payCurrency === 'CRC');
export type SubscriptionDefinition = z.infer<typeof definition>;

export const subscriptionCatalogQuery = planIdentitySchema.pick({ query: true });
export const saveSubscriptionDefinitionSchema = planIdentitySchema.pick({ params: true }).extend({
  body: z
    .object({ userId: id, revision: z.number().int().nonnegative().safe(), definition })
    .strict(),
});
export const linkSubscriptionChargeSchema = z.object({
  params: z.object({ id: z.guid(), lineId: z.guid() }),
  body: z.object({ userId: id, revision: id, transactionId: id, transactionLineId: id }).strict(),
});
