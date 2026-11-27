import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import db from '../db/db';
import { ProjectService } from '../services/project.service';

const router = Router();
const service = new ProjectService(db, Number(process.env.ZANDAKA_PROJECT_OWNER_ID ?? '1'));
const id = z.string().uuid();
const title = z.string().trim().min(1).max(120);
const revision = z.number().int().positive().safe();
const newProject = z.object({ title, requestId: id.optional() }).strict();
const rename = z.object({ title, expectedRevision: revision }).strict();
const transition = z.object({ expectedRevision: revision }).strict();
const page = z.coerce.number().int().min(1).max(1_000_000).default(1);
const movementKind = z.enum(['expense', 'refund']);
const lineId = z.number().int().positive().safe();
const linkBatch = z
  .object({
    expectedRevision: revision,
    lineIds: z.array(lineId).min(1).max(100),
  })
  .strict();
const addLinks = linkBatch.extend({ kind: movementKind });
const movementPage = z.object({ page }).strict();
const search = z
  .object({
    q: z.string().trim().max(1000).optional(),
    kind: movementKind.default('expense'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    accountId: z.coerce.number().int().positive().safe().optional(),
    categoryId: z.coerce.number().int().positive().safe().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    page,
  })
  .strict()
  .refine(({ from, to }) => !from || !to || from <= to)
  .refine(
    ({ q }) =>
      !q?.startsWith('#') || (/^#[1-9][0-9]*$/.test(q) && Number.isSafeInteger(Number(q.slice(1)))),
  );
const list = z
  .object({
    view: z.enum(['visible', 'archived']).default('visible'),
    page,
  })
  .strict();

const known = [
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'FEATURE_NOT_READY',
  'VALIDATION_ERROR',
];
function handle(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      handler(req, res, next);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next({ code: 'VALIDATION_ERROR', message: 'Invalid project request' });
      }
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        known.includes(String(error.code))
      )
        return next(error);
      next({ code: 'INTERNAL_ERROR', message: 'Could not complete the project operation' });
    }
  };
}

router.get(
  '/',
  handle((req, res) => {
    const { view, page } = list.parse(req.query);
    res.json(service.list(view, page));
  }),
);
router.post(
  '/',
  handle((req, res) => {
    const body = newProject.parse(req.body);
    res.status(201).json(service.create(body.title, body.requestId));
  }),
);
router.get(
  '/:id',
  handle((req, res) => {
    res.json(service.get(id.parse(req.params.id)));
  }),
);
router.patch(
  '/:id',
  handle((req, res) => {
    const body = rename.parse(req.body);
    res.json(
      service.change(id.parse(req.params.id), body.expectedRevision, {
        action: 'rename',
        title: body.title,
      }),
    );
  }),
);

router.get(
  '/:id/movements',
  handle((req, res) => {
    const { page } = movementPage.parse(req.query);
    res.json(service.listMovements(id.parse(req.params.id), page));
  }),
);
router.get(
  '/:id/movement-search',
  handle((req, res) => {
    const { q, ...filters } = search.parse(req.query);
    const term = q?.startsWith('#') ? { transactionId: Number(q.slice(1)) } : { q };
    res.json(service.searchMovements(id.parse(req.params.id), { ...filters, ...term }));
  }),
);
router.get(
  '/:id/movement-filters',
  handle((req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(service.movementFilters(id.parse(req.params.id)));
  }),
);
router.post(
  '/:id/movements',
  handle((req, res) => {
    const { expectedRevision, lineIds, kind } = addLinks.parse(req.body);
    res.json(service.changeMovements(id.parse(req.params.id), expectedRevision, lineIds, kind));
  }),
);
router.delete(
  '/:id/movements',
  handle((req, res) => {
    const { expectedRevision, lineIds } = linkBatch.parse(req.body);
    res.json(service.changeMovements(id.parse(req.params.id), expectedRevision, lineIds));
  }),
);

for (const action of ['finalize', 'reopen', 'archive', 'restore'] as const) {
  router.post(
    `/:id/${action}`,
    handle((req, res) => {
      const body = transition.parse(req.body);
      res.json(service.change(id.parse(req.params.id), body.expectedRevision, { action }));
    }),
  );
}

export default router;
