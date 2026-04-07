import { Router } from 'express';
import { ReconciliationController } from '../controllers/reconciliation.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createReconciliationSchema,
  getCashDenominationsForAccountSchema,
  getExpectedTotalForAccountSchema,
  getReconciliationsSchema,
  getReconciliationByIdSchema,
  updateReconciliationSchema,
  getReconciliationSummarySchema,
  ignoreReconciliationSchema,
} from '../validators/reconciliation.validator';

const router = Router();

/**
 * @swagger
 * /api/reconciliations/accounts/{accountId}/denominations:
 *   get:
 *     summary: List active cash denominations for an account
 *     description: Returns the active denomination catalog for the account currency. This endpoint only applies to CASH accounts.
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Active cash denominations for the account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccountCashDenominations'
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Account is inactive or not CASH
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/accounts/:accountId/denominations',
  validate(getCashDenominationsForAccountSchema),
  ReconciliationController.getCashDenominationsForAccount,
);

/**
 * @swagger
 * /api/reconciliations/accounts/{accountId}/expected-total:
 *   get:
 *     summary: Compute expected total for an account and date
 *     description: Returns the calculated account balance as of the requested date so the client can preview reconciliation differences before saving.
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Expected total for the requested account/date
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReconciliationExpectedTotal'
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Account is inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/accounts/:accountId/expected-total',
  validate(getExpectedTotalForAccountSchema),
  ReconciliationController.getExpectedTotalForAccount,
);

/**
 * @swagger
 * /api/reconciliations:
 *   post:
 *     summary: Create a reconciliation
 *     description: |
 *       Creates a reconciliation record. Existing manual reconciliations continue to work with `countMethod=MANUAL_TOTAL`.
 *       For CASH accounts, `countMethod=DENOMINATION_COUNT` accepts denomination lines, recalculates every line total on the backend,
 *       stores a snapshot of each denomination used, and derives the final counted total automatically.
 *       Duplicate denomination lines are rejected.
 *     tags: [Reconciliations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReconciliationRequest'
 *           examples:
 *             manual:
 *               summary: Manual counted total
 *               value:
 *                 accountId: 1
 *                 date: "2026-04-01"
 *                 countMethod: MANUAL_TOTAL
 *                 realBalance: 123456.78
 *                 note: "Month end reconciliation"
 *             denominationCount:
 *               summary: Denomination count for a CASH account
 *               value:
 *                 accountId: 12
 *                 date: "2026-04-01"
 *                 countMethod: DENOMINATION_COUNT
 *                 notes: "Conteo físico de caja"
 *                 lines:
 *                   - denominationId: 1
 *                     quantity: 4
 *                   - denominationId: 2
 *                     quantity: 3
 *                   - denominationId: 7
 *                     quantity: 11
 *                   - denominationId: 8
 *                     quantity: 127
 *     responses:
 *       201:
 *         description: Reconciliation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reconciliation'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Account or denomination not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Denomination does not belong to the account owner
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Active reconciliation already exists, account is inactive, denomination is inactive, currency mismatch, or account is not CASH for denomination count
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', validate(createReconciliationSchema), ReconciliationController.create);

/**
 * @swagger
 * /api/reconciliations:
 *   get:
 *     summary: List reconciliations
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: query
 *         name: account_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Account ID
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [OPEN, BALANCED, IGNORED]
 *         description: Filter by status
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of reconciliations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reconciliation'
 */
router.get('/', validate(getReconciliationsSchema), ReconciliationController.list);

/**
 * @swagger
 * /api/reconciliations/{id}/summary:
 *   get:
 *     summary: Get reconciliation summary
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Reconciliation summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReconciliationSummary'
 *       404:
 *         description: Reconciliation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/:id/summary',
  validate(getReconciliationSummarySchema),
  ReconciliationController.getSummary,
);

/**
 * @swagger
 * /api/reconciliations/{id}:
 *   get:
 *     summary: Get reconciliation by id
 *     description: Returns the reconciliation header and, when it was created with denomination count, the stored denomination breakdown ordered by sort order.
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Reconciliation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reconciliation'
 *       404:
 *         description: Reconciliation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', validate(getReconciliationByIdSchema), ReconciliationController.getById);

/**
 * @swagger
 * /api/reconciliations/{id}:
 *   patch:
 *     summary: Update reconciliation note
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Reconciliation updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reconciliation'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Reconciliation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id', validate(updateReconciliationSchema), ReconciliationController.update);

/**
 * @swagger
 * /api/reconciliations/{id}/ignore:
 *   post:
 *     summary: Ignore an active reconciliation
 *     description: Marks an active reconciliation as ignored, deactivates it, and sets closed_at.
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Reconciliation ignored successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reconciliation'
 *       404:
 *         description: Reconciliation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Reconciliation is not active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/ignore', validate(ignoreReconciliationSchema), ReconciliationController.ignore);

/**
 * @swagger
 * /api/reconciliations/{id}:
 *   delete:
 *     summary: Delete reconciliation
 *     description: Deletion is intentionally blocked to preserve reconciliation history
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       409:
 *         description: Reconciliations cannot be deleted
 *       404:
 *         description: Reconciliation not found
 */
router.delete('/:id', validate(getReconciliationByIdSchema), ReconciliationController.remove);

export default router;
