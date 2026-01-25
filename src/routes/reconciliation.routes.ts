import { Router } from 'express';
import { ReconciliationController } from '../controllers/reconciliation.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createReconciliationSchema,
  getReconciliationsSchema,
  getReconciliationByIdSchema,
  updateReconciliationSchema,
  getReconciliationSummarySchema,
} from '../validators/reconciliation.validator';

const router = Router();

/**
 * @swagger
 * /api/reconciliations:
 *   post:
 *     summary: Create a reconciliation
 *     description: Creates a reconciliation record and automatically calculates the difference between real balance and calculated balance.
 *     tags: [Reconciliations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *               - date
 *               - realBalance
 *             properties:
 *               accountId:
 *                 type: integer
 *                 example: 1
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-31"
 *               realBalance:
 *                 type: number
 *                 example: 123456.78
 *               note:
 *                 type: string
 *                 example: "End of month reconciliation"
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
 *         description: Account not found
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
 *           enum: [OPEN, BALANCED]
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
  ReconciliationController.getSummary
);

/**
 * @swagger
 * /api/reconciliations/{id}:
 *   get:
 *     summary: Get reconciliation by id
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

export default router;

