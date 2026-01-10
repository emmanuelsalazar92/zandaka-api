import { Router } from 'express';
import { ReconciliationController } from '../controllers/reconciliation.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createReconciliationSchema,
  getReconciliationsSchema,
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
 *     summary: List reconciliations for an account
 *     tags: [Reconciliations]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Account ID
 *     responses:
 *       200:
 *         description: List of reconciliations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reconciliation'
 *       400:
 *         description: accountId parameter is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', validate(getReconciliationsSchema), ReconciliationController.list);

export default router;

