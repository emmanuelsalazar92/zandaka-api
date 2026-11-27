import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import db from '../db/db';
import { TransactionDetailRepository } from '../repositories/transaction-detail.repo';
import { ProjectPdfService } from '../services/project-pdf.service';
import { ProjectService } from '../services/project.service';

const router = Router();
const service = new ProjectService(db, Number(process.env.ZANDAKA_PROJECT_OWNER_ID ?? '1'));
const transactionDetails = new TransactionDetailRepository();
const pdfReports = new ProjectPdfService();
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
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const movementPage = z.union([
  z.object({ page }).strict(),
  z
    .object({
      page,
      currency: currencyCode,
      categoryId: z.union([
        z.literal('none').transform(() => null),
        z.coerce.number().int().positive().safe(),
      ]),
    })
    .strict(),
]);
const search = z
  .object({
    q: z.string().trim().max(1000).optional(),
    kind: movementKind.default('expense'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    accountId: z.coerce.number().int().positive().safe().optional(),
    categoryId: z.coerce.number().int().positive().safe().optional(),
    currency: currencyCode.optional(),
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
  'PROJECT_PDF_LIMIT',
  'PDF_BUSY',
  'PDF_TIMEOUT',
];
function handle(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      await handler(req, res, next);
    } catch (error) {
      if (res.destroyed) return;
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
    const query = movementPage.parse(req.query);
    const filter =
      'currency' in query ? { currency: query.currency, categoryId: query.categoryId } : undefined;
    res.json(service.listMovements(id.parse(req.params.id), query.page, filter));
  }),
);
router.get(
  '/:id/analysis',
  handle((req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(service.analysis(id.parse(req.params.id)));
  }),
);
router.get(
  '/:id/pdf',
  handle(async (req, res) => {
    z.strictObject({}).parse(req.query);
    const data = service.pdfSnapshot(id.parse(req.params.id));
    const connection = new AbortController();
    const onClose = () => connection.abort();
    res.once('close', onClose);
    try {
      const { fileName, pdf } = await pdfReports.generate(data, connection.signal);
      if (!res.destroyed) {
        res
          .attachment(fileName)
          .type('application/pdf')
          .set('X-Content-Type-Options', 'nosniff')
          .send(pdf);
      }
    } finally {
      res.off('close', onClose);
    }
  }),
);
router.get(
  '/:id/movements/:transactionId',
  handle((req, res) => {
    z.strictObject({}).parse(req.query);
    const transactionId = z.coerce.number().int().positive().safe().parse(req.params.transactionId);
    res.json(
      service.linkedTransaction(id.parse(req.params.id), transactionId, (owner) =>
        transactionDetails.findForUser(transactionId, owner),
      ),
    );
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
