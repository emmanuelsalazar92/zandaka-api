import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    name: z.string().min(1).max(255),
    parentId: z.number().int().positive().nullable().optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.number().int().positive().nullable().optional(),
  }),
});

export const deactivateCategorySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

