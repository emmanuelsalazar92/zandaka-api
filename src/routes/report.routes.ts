import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  getAccountBalancesSchema,
  getEnvelopeBalancesSchema,
  getMonthlyExpensesSchema,
  getInconsistenciesSchema,
} from '../validators/report.validator';

const router = Router();

/**
 * @swagger
 * /api/reports/account-balances:
 *   get:
 *     summary: Get all account balances
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: isActive
 *         required: false
 *         schema:
 *           type: string
 *           enum: [true, false, 1, 0]
 *         description: Optional filter for active (true/1) or inactive (false/0) accounts
 *     responses:
 *       200:
 *         description: List of account balances
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   user_id:
 *                     type: integer
 *                   institution_id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   currency:
 *                     type: string
 *                   is_active:
 *                     type: integer
 *                   allow_overdraft:
 *                     type: integer
 *                   institution:
 *                     type: string
 *                     nullable: true
 *                   type:
 *                     type: string
 *                     nullable: true
 *                   balance:
 *                     type: number
 */
router.get(
  '/account-balances',
  validate(getAccountBalancesSchema),
  ReportController.getAccountBalances
);

/**
 * @swagger
 * /api/reports/envelope-balances:
 *   get:
 *     summary: Get envelope balances for an account
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Account ID
 *     responses:
 *       200:
 *         description: List of envelope balances
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   envelopeId:
 *                     type: integer
 *                   categoryId:
 *                     type: integer
 *                   categoryName:
 *                     type: string
 *                   balance:
 *                     type: number
 */
router.get('/envelope-balances', validate(getEnvelopeBalancesSchema), ReportController.getEnvelopeBalances);

/**
 * @swagger
 * /api/reports/negative-envelopes:
 *   get:
 *     summary: Get all envelopes with negative balances
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: List of negative envelopes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   envelopeId:
 *                     type: integer
 *                   accountId:
 *                     type: integer
 *                   accountName:
 *                     type: string
 *                   categoryId:
 *                     type: integer
 *                   categoryName:
 *                     type: string
 *                   balance:
 *                     type: number
 */
router.get('/negative-envelopes', ReportController.getNegativeEnvelopes);

/**
 * @swagger
 * /api/reports/monthly-expenses:
 *   get:
 *     summary: Get monthly expenses by category
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: Month in YYYY-MM format
 *         example: "2024-01"
 *     responses:
 *       200:
 *         description: Monthly expenses by category
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   categoryId:
 *                     type: integer
 *                   categoryName:
 *                     type: string
 *                   total:
 *                     type: number
 */
router.get('/monthly-expenses', validate(getMonthlyExpensesSchema), ReportController.getMonthlyExpenses);

/**
 * @swagger
 * /api/reports/category-totals:
 *   get:
 *     summary: Get total amounts by category
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Category totals
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   categoryId:
 *                     type: integer
 *                   categoryName:
 *                     type: string
 *                   total:
 *                     type: number
 */
router.get('/category-totals', ReportController.getCategoryTotals);

/**
 * @swagger
 * /api/reports/inconsistencies:
 *   get:
 *     summary: Get reconciliation inconsistencies
 *     description: Returns accounts where real balance differs from calculated balance
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: Optional account ID filter
 *     responses:
 *       200:
 *         description: List of inconsistencies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   accountId:
 *                     type: integer
 *                   accountName:
 *                     type: string
 *                   reconciliationDate:
 *                     type: string
 *                     format: date
 *                   realBalance:
 *                     type: number
 *                   calculatedBalance:
 *                     type: number
 *                   difference:
 *                     type: number
 */
router.get('/inconsistencies', validate(getInconsistenciesSchema), ReportController.getInconsistencies);

export default router;

