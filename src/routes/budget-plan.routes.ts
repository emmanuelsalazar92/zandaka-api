import { Router, type NextFunction, type Request, type Response } from 'express';
import { validate } from '../middlewares/validator.middleware';
import { BudgetMonthStartService } from '../services/budget-month-start.service';
import { BudgetPlanService } from '../services/budget-plan.service';
import { BudgetSubscriptionsService } from '../services/budget-subscriptions.service';
import {
  applyPlanSchema,
  listPlansSchema,
  linkMonthStartSchema,
  planActionSchema,
  planIdentitySchema,
  savePlanSchema,
} from '../validators/budget-plan.validator';
import { createTransferSchema } from '../validators/transfer.validator';
import {
  linkSubscriptionChargeSchema,
  saveSubscriptionDefinitionSchema,
  subscriptionCatalogQuery,
} from '../validators/budget-subscriptions.validator';

const router = Router(),
  service = new BudgetPlanService();
const monthStart = new BudgetMonthStartService();
const subscriptions = new BudgetSubscriptionsService();
const monthStartTransfer = linkMonthStartSchema.extend({
  body: linkMonthStartSchema.shape.body.omit({ movementIds: true }).extend({
    transfer: createTransferSchema.shape.body.omit({ userId: true }),
  }),
});
router.get('/', validate(listPlansSchema), (req, res) => {
  const { query } = listPlansSchema.parse({ query: req.query });
  res.json(service.list(query.userId, query.page, query.pageSize));
});
router.get('/options', validate(listPlansSchema), (req, res) => {
  const { query } = listPlansSchema.parse({ query: req.query });
  res.json(service.options(query.userId));
});
router.get('/subscriptions', validate(subscriptionCatalogQuery), (req, res) => {
  const { query } = subscriptionCatalogQuery.parse({ query: req.query });
  res.setHeader('Cache-Control', 'no-store');
  res.json(subscriptions.catalog(query.userId));
});
router.put('/subscriptions/:id', validate(saveSubscriptionDefinitionSchema), (req, res) => {
  const { params, body } = saveSubscriptionDefinitionSchema.parse({
    params: req.params,
    body: req.body,
  });
  res.json(subscriptions.saveDefinition(params.id, body.userId, body.revision, body.definition));
});
router.get('/:id/subscriptions', validate(planIdentitySchema), (req, res) => {
  const { params, query } = planIdentitySchema.parse({ params: req.params, query: req.query });
  res.setHeader('Cache-Control', 'no-store');
  res.json(subscriptions.get(params.id, query.userId));
});
router.put('/:id/subscriptions/:lineId', validate(linkSubscriptionChargeSchema), (req, res) => {
  const { params, body } = linkSubscriptionChargeSchema.parse({
    params: req.params,
    body: req.body,
  });
  res.json(
    subscriptions.link(
      params.id,
      params.lineId,
      body.userId,
      body.revision,
      body.transactionId,
      body.transactionLineId,
    ),
  );
});
router.get('/:id', validate(planIdentitySchema), (req, res) => {
  const { params, query } = planIdentitySchema.parse({ params: req.params, query: req.query });
  res.json(service.get(params.id, query.userId));
});
router.put('/:id', validate(savePlanSchema), (req, res) => {
  const { params, body } = savePlanSchema.parse({ params: req.params, body: req.body });
  res.json(service.save(params.id, body.userId, body.expectedRevision, body.document));
});
router.post('/:id/finalize', validate(planActionSchema), (req, res) => {
  const { params, body } = planActionSchema.parse({ params: req.params, body: req.body });
  res.json(service.transition(params.id, body.userId, body.revision, 'finalized'));
});
router.post('/:id/reopen', validate(planActionSchema), (req, res) => {
  const { params, body } = planActionSchema.parse({ params: req.params, body: req.body });
  res.json(service.transition(params.id, body.userId, body.revision, 'draft'));
});
router.post('/:id/delete', validate(planActionSchema), (req, res) => {
  const { params, body } = planActionSchema.parse({ params: req.params, body: req.body });
  res.json(service.remove(params.id, body.userId, body.revision));
});
router.get('/:id/funding-preview', validate(planIdentitySchema), (req, res) => {
  const { params, query } = planIdentitySchema.parse({ params: req.params, query: req.query });
  res.json(service.funding(params.id, query.userId));
});
router.get('/:id/previous-assignments', validate(planIdentitySchema), (req, res) => {
  const { params, query } = planIdentitySchema.parse({ params: req.params, query: req.query });
  res.json(service.previousAssignments(params.id, query.userId));
});
router.get('/:id/month-start', validate(planIdentitySchema), (req, res) => {
  const { params, query } = planIdentitySchema.parse({ params: req.params, query: req.query });
  res.setHeader('Cache-Control', 'no-store');
  res.json(monthStart.get(params.id, query.userId));
});
router.put('/:id/month-start/link', validate(linkMonthStartSchema), (req, res) => {
  const { params, body } = linkMonthStartSchema.parse({ params: req.params, body: req.body });
  res.json(monthStart.link(params.id, body.userId, body.revision, body.step, body.movementIds));
});
router.get('/:id/tracking', validate(planIdentitySchema), (req, res) => {
  const { params, query } = planIdentitySchema.parse({ params: req.params, query: req.query });
  res.setHeader('Cache-Control', 'no-store');
  res.json(service.tracking(params.id, query.userId));
});
router.post('/:id/month-start/transfer', validate(monthStartTransfer), (req, res) => {
  const { params, body } = monthStartTransfer.parse({ params: req.params, body: req.body });
  res.json(
    monthStart.transfer(params.id, body.revision, body.step, {
      ...body.transfer,
      userId: body.userId,
    }),
  );
});
router.post('/:id/fund', validate(applyPlanSchema), (req, res) => {
  const { params, body } = applyPlanSchema.parse({ params: req.params, body: req.body });
  res.json(service.fund(params.id, body.userId, body.revision, body.requestId, body.date));
});
router.use((error: unknown, _req: Request, _res: Response, next: NextFunction) => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (
    [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'FORBIDDEN',
      'CONFLICT',
      'IDEMPOTENCY_CONFLICT',
      'FEATURE_NOT_READY',
      'INACTIVE_RESOURCE',
    ].includes(code)
  )
    next(error);
  else next({ code: 'INTERNAL_ERROR', message: 'Could not complete the budget operation' });
});
export default router;
