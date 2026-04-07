import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  getAccountBalancesSchema,
  getEnvelopeBalancesSchema,
  getEnvelopeTotalByCurrencySchema,
  generateReportSnapshotSchema,
  getReportSnapshotPdfSchema,
  getReportSnapshotSchema,
  archiveReportSnapshotSchema,
  getMonthlyExpensesSchema,
  getInconsistenciesSchema,
  listReportSnapshotsSchema,
} from '../validators/report.validator';

const router = Router();

router.get('/', validate(listReportSnapshotsSchema), ReportController.listSnapshots);
router.patch('/:id/archive', validate(archiveReportSnapshotSchema), ReportController.archiveSnapshot);

/**
 * @swagger
 * /api/reports/generate:
 *   post:
 *     summary: Generate a historical report snapshot for a month
 *     description: |
 *       Creates a frozen financial snapshot for a specific user and month using the current live balances
 *       of active accounts and active envelopes. The snapshot is persisted into `report_snapshot` and
 *       `report_snapshot_line` so future reads do not depend on recalculating from mutable operational data.
 *
 *       The operation is atomic:
 *       1. Validates the request
 *       2. Resolves the exchange rate required by the user's base currency
 *       3. Calculates account totals and envelope totals
 *       4. Marks previous snapshots of the same user and month as `is_latest = 0`
 *       5. Inserts the new snapshot header and all detail lines
 *       6. Commits the transaction
 *
 *       Historical payroll provenance:
 *       - `ccss_rule_set_id` and `income_tax_rule_set_id` are optional references
 *       - when provided, they are frozen into the snapshot header so later rule changes do not alter historical context
 *
 *       Versioning behavior:
 *       - If no prior snapshot exists for the same `user_id` and `report_month`, the new snapshot gets `version = 1`
 *       - Otherwise it gets `MAX(version) + 1`
 *       - The newly created snapshot is always stored with `is_latest = 1`
 *
 *       Exchange-rate resolution priority:
 *       - The snapshot always consolidates into the user's `base_currency`
 *       - If `exchange_rate_id` is provided, the backend uses that date as the anchor and resolves the matching direction needed by the user's base currency
 *       - Otherwise, if `usd_to_crc_rate` is provided, it is used only for users whose base currency is `CRC`
 *       - Otherwise, the backend tries to reuse stored `USD -> CRC` and `CRC -> USD` rates for the last day of `report_month`
 *       - If those stored rates do not exist, the backend queries the external CRC exchange-rate service for that month-end date, stores both directions, and uses the one required by the user's base currency
 *       - If no rate can be resolved after those attempts, the snapshot is still generated, but the consolidated amount remains `null`
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReportSnapshotRequest'
 *           examples:
 *             usingExchangeRate:
 *               summary: Generate with stored exchange rate
 *               value:
 *                 user_id: 1
 *                 report_month: "2026-03"
 *                 base_currency: "CRC"
 *                 exchange_rate_id: 5
 *                 ccss_rule_set_id: 11
 *                 income_tax_rule_set_id: 12
 *                 notes: "Reporte mensual de marzo"
 *             usingManualRate:
 *               summary: Generate with manual rate
 *               value:
 *                 user_id: 1
 *                 report_month: "2026-03"
 *                 base_currency: "CRC"
 *                 usd_to_crc_rate: 512.34
 *                 ccss_rule_set_id: 11
 *                 income_tax_rule_set_id: 12
 *                 notes: "Snapshot manual"
 *             withoutRate:
 *               summary: Generate with automatic month-end rate lookup
 *               value:
 *                 user_id: 1
 *                 report_month: "2026-03"
 *                 notes: "Snapshot con tasa resuelta automáticamente"
 *     responses:
 *       201:
 *         description: Report snapshot generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Report snapshot generated successfully
 *                 data:
 *                   $ref: '#/components/schemas/ReportSnapshotSummary'
 *             examples:
 *               success:
 *                 value:
 *                   message: "Report snapshot generated successfully"
 *                   data:
 *                     id: 12
 *                     user_id: 1
 *                     report_month: "2026-03"
 *                     version: 2
 *                     is_latest: 1
 *                     base_currency: "CRC"
 *                     total_crc: 1250000
 *                     total_usd: 2430
 *                     exchange_rate_used: 512.34
 *                     exchange_rate_id: 5
 *                     consolidated_amount: 2494986.2
 *                     ccss_rule_set_id: 11
 *                     income_tax_rule_set_id: 12
 *                     line_count: 9
 *                     generated_at: "2026-03-31 18:00:00"
 *       400:
 *         description: Invalid body, unsupported base currency, invalid month format, or invalid exchange-rate direction
 *       404:
 *         description: User not found or the provided exchange rate does not exist for that user
 *       500:
 *         description: Unexpected server error while generating the snapshot
 */
router.post(
  '/generate',
  validate(generateReportSnapshotSchema),
  ReportController.generateSnapshot,
);

/**
 * @swagger
 * /api/reports/{id}/pdf:
 *   get:
 *     summary: Download an executive PDF for a stored report snapshot
 *     description: |
 *       Generates a print-ready PDF directly from the persisted historical snapshot tables
 *       `report_snapshot` and `report_snapshot_line`. This endpoint does not recalculate values
 *       from live transactions, accounts, envelopes, categories, or current exchange rates.
 *
 *       The generated document is intended for download, printing, and historical evidence.
 *       It includes branded header information, executive summary totals, grouped account detail,
 *       nested envelope lines, and a formal footer suitable for archival use.
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Existing `report_snapshot.id` to export as PDF.
 *         example: 12
 *     responses:
 *       200:
 *         description: PDF generated successfully from the historical snapshot
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Report snapshot not found
 *       500:
 *         description: Unexpected server error while generating the PDF
 */
router.get('/:id/pdf', validate(getReportSnapshotPdfSchema), ReportController.downloadSnapshotPdf);

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
 *                 $ref: '#/components/schemas/AccountBalance'
 */
router.get(
  '/account-balances',
  validate(getAccountBalancesSchema),
  ReportController.getAccountBalances,
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
 *                   currency:
 *                     type: string
 */
router.get(
  '/envelope-balances',
  validate(getEnvelopeBalancesSchema),
  ReportController.getEnvelopeBalances,
);

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
router.get(
  '/monthly-expenses',
  validate(getMonthlyExpensesSchema),
  ReportController.getMonthlyExpenses,
);

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
 * /api/reports/envelope-total:
 *   get:
 *     summary: Get total balance across active envelopes for a currency
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         description: Account currency to aggregate envelopes by, for example CRC or USD
 *     responses:
 *       200:
 *         description: Total envelope balance for the requested currency
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currency:
 *                   type: string
 *                 total:
 *                   type: number
 */
router.get(
  '/envelope-total',
  validate(getEnvelopeTotalByCurrencySchema),
  ReportController.getEnvelopeTotalByCurrency,
);

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
router.get(
  '/inconsistencies',
  validate(getInconsistenciesSchema),
  ReportController.getInconsistencies,
);

/**
 * @swagger
 * /api/reports/active-inconsistencies:
 *   get:
 *     summary: Get reconciliation inconsistencies for all active accounts
 *     description: Returns inconsistencies only for accounts where account.is_active = 1
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: List of inconsistencies for active accounts
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
router.get('/active-inconsistencies', ReportController.getActiveAccountInconsistencies);

router.get('/:id', validate(getReportSnapshotSchema), ReportController.getSnapshotById);

export default router;



