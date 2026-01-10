import { z } from 'zod';

export const createInstitutionSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    name: z.string().min(1).max(255),
    type: z.string().min(1).max(100),
  }),
});

export const updateInstitutionSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    type: z.string().min(1).max(100).optional(),
  }),
});

export const deactivateInstitutionSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

