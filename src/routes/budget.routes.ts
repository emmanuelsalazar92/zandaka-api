import { Router } from 'express';
import { BudgetController } from '../controllers/budget.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  copyBudgetSchema,
  createBudgetSchema,
  deleteBudgetSchema,
  finalizeBudgetSchema,
  fundBudgetSchema,
  getBudgetSchema,
  getFundingPlanSchema,
  historyBudgetsSchema,
  listBudgetsSchema,
  replaceBudgetLinesSchema,
  saveFundingPlanSchema,
} from '../validators/budget.validator';

const router = Router();

/**
 * @swagger
 * /api/budgets:
 *   post:
 *     summary: Create a monthly budget header
 *     description: Creates a new budget in `draft` status for a specific user, month, and currency. Use this endpoint at the start of the planning phase, before any category distribution exists. The API blocks duplicates by `(userId, month, currency)` so the same user cannot create two monthly plans in the same currency for the same month. When a budget is derived from a payroll net-salary calculation, optional `ccssRuleSetId` and `incomeTaxRuleSetId` can be stored to preserve the exact fiscal rule versions used.
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBudgetRequest'
 *           example:
 *             userId: 1
 *             month: '2026-03'
 *             currency: USD
 *             totalIncome: 2450.75
 *             ccssRuleSetId: 11
 *             incomeTaxRuleSetId: 12
 *     responses:
 *       201:
 *         description: Budget created in draft status. No lines are created yet and no funding has been executed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetSummary'
 *             example:
 *               message: Budget created in draft status.
 *               data:
 *                 id: 18
 *                 userId: 1
 *                 month: '2026-03'
 *                 currency: USD
 *                 totalIncome: 2450.75
 *                 ccssRuleSetId: 11
 *                 incomeTaxRuleSetId: 12
 *                 status: draft
 *                 sourceAccountId: null
 *                 createdAt: '2026-03-26T21:30:00.000Z'
 *                 updatedAt: '2026-03-26T21:30:00.000Z'
 *                 linesCount: 0
 *                 distributedAmount: 0
 *                 distributedPercentage: 0
 *                 remainingAmount: 2450.75
 *                 remainingPercentage: 100
 *       400:
 *         description: Invalid month format, invalid currency shape, or non-positive total income.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: The provided user does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: A budget already exists for the same user, month, and currency.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', validate(createBudgetSchema), BudgetController.create);

/**
 * @swagger
 * /api/budgets/history:
 *   get:
 *     summary: Get budget history
 *     description: Returns the user's budget history ordered by month descending. This endpoint is intended for archive screens, monthly comparisons, and backtracking prior budget cycles. It supports month-range filters and the same status filter used by the regular list endpoint.
 *     tags: [Budgets]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User that owns the budget history.
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Optional 3-letter currency filter.
 *       - in: query
 *         name: fromMonth
 *         schema:
 *           type: string
 *           example: '2026-01'
 *         description: Optional inclusive lower bound in `YYYY-MM`.
 *       - in: query
 *         name: toMonth
 *         schema:
 *           type: string
 *           example: '2026-03'
 *         description: Optional inclusive upper bound in `YYYY-MM`.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, finalized, funded]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           enum: [10, 25, 50, 100]
 *           default: 10
 *     responses:
 *       200:
 *         description: Historical budgets retrieved successfully.
 *         content:
 *           application/json:
 *             example:
 *               message: Budget history retrieved successfully.
 *               data:
 *                 items:
 *                   - id: 18
 *                     userId: 1
 *                     month: '2026-03'
 *                     currency: USD
 *                     totalIncome: 2450.75
 *                     status: funded
 *                     sourceAccountId: 5
 *                     sourceAccountName: Checking
 *                     linesCount: 6
 *                     distributedAmount: 2450.75
 *                     distributedPercentage: 100
 *                     remainingAmount: 0
 *                     remainingPercentage: 0
 *                 meta:
 *                   page: 1
 *                   pageSize: 10
 *                   totalItems: 3
 *                   totalPages: 1
 *                   hasNextPage: false
 *                   hasPrevPage: false
 *       400:
 *         description: Invalid month range or invalid query parameter.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/history', validate(historyBudgetsSchema), BudgetController.history);

/**
 * @swagger
 * /api/budgets:
 *   get:
 *     summary: List budgets for a user
 *     description: Lists the current user's budgets ordered by month descending. Use this endpoint for the main budgets index when the frontend needs current monthly plans, optional filtering by month/currency/status, and summary distribution metrics without fetching every line.
 *     tags: [Budgets]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: '2026-03'
 *         description: Exact month filter in `YYYY-MM`.
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Optional currency filter.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, finalized, funded]
 *         description: Optional workflow status filter.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           enum: [10, 25, 50, 100]
 *           default: 10
 *     responses:
 *       200:
 *         description: Budgets retrieved successfully with summary totals.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BudgetSummary'
 *                     meta:
 *                       type: object
 *             example:
 *               message: Budgets retrieved successfully.
 *               data:
 *                 items:
 *                   - id: 18
 *                     userId: 1
 *                     month: '2026-03'
 *                     currency: USD
 *                     totalIncome: 2450.75
 *                     status: finalized
 *                     sourceAccountId: 5
 *                     sourceAccountName: Checking
 *                     linesCount: 6
 *                     distributedAmount: 2450.75
 *                     distributedPercentage: 100
 *                     remainingAmount: 0
 *                     remainingPercentage: 0
 *                 meta:
 *                   page: 1
 *                   pageSize: 10
 *                   totalItems: 1
 *                   totalPages: 1
 *                   hasNextPage: false
 *                   hasPrevPage: false
 *       400:
 *         description: Invalid query parameter.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', validate(listBudgetsSchema), BudgetController.list);
router.delete('/:id', validate(deleteBudgetSchema), BudgetController.remove);

/**
 * @swagger
 * /api/budgets/{id}:
 *   get:
 *     summary: Get one budget with distribution summary
 *     description: Returns the budget header plus calculated distribution totals. This endpoint is useful when the frontend needs the budget status, income target, and current completion percentages without fetching the funding options or full line list.
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ownership check for the requested budget.
 *     responses:
 *       200:
 *         description: Budget found and returned with computed summary fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetSummary'
 *       403:
 *         description: The budget exists but belongs to another user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Budget not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', validate(getBudgetSchema), BudgetController.getById);

/**
 * @swagger
 * /api/budgets/{id}/lines:
 *   get:
 *     summary: List budget lines
 *     description: Returns the budget planning lines ordered by `sortOrder`. Each line includes category naming data and, if a funding plan already exists, the assigned `accountEnvelopeId` and friendly account information needed by the frontend.
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Budget lines returned in UI order.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     budgetId:
 *                       type: integer
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BudgetLine'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget not found.
 */
router.get('/:id/lines', validate(getBudgetSchema), BudgetController.getLines);

/**
 * @swagger
 * /api/budgets/{id}/lines/bulk:
 *   put:
 *     summary: Replace all budget planning lines
 *     description: Replaces the entire planning distribution for a draft budget in a single transaction. Use this endpoint after the user finishes editing the allocation table. The API rejects duplicate categories, inactive categories, and parent categories because monthly planning must target active child categories only. Replacing lines also clears any previously saved funding source metadata so planning and funding stay consistent.
 *     tags: [Budgets]
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
 *             $ref: '#/components/schemas/ReplaceBudgetLinesRequest'
 *           example:
 *             userId: 1
 *             lines:
 *               - categoryId: 12
 *                 amount: 900
 *                 percentage: 36.73
 *                 notes: Rent
 *                 sortOrder: 1
 *               - categoryId: 13
 *                 amount: 400
 *                 percentage: 16.32
 *                 notes: Groceries and household
 *                 sortOrder: 2
 *     responses:
 *       200:
 *         description: Lines replaced successfully and validation summary recalculated.
 *         content:
 *           application/json:
 *             example:
 *               message: Budget lines replaced successfully.
 *               data:
 *                 budget:
 *                   id: 18
 *                   userId: 1
 *                   month: '2026-03'
 *                   currency: USD
 *                   totalIncome: 2450.75
 *                   status: draft
 *                   sourceAccountId: null
 *                   linesCount: 2
 *                   distributedAmount: 1300
 *                   distributedPercentage: 53.05
 *                   remainingAmount: 1150.75
 *                   remainingPercentage: 46.95
 *                 lines:
 *                   - id: 101
 *                     budgetId: 18
 *                     categoryId: 12
 *                     categoryName: Housing
 *                     amount: 900
 *                     percentage: 36.73
 *                     notes: Rent
 *                     sortOrder: 1
 *                 validation:
 *                   isValid: false
 *                   distributedAmount: 1300
 *                   distributedPercentage: 53.05
 *                   remainingAmount: 1150.75
 *                   remainingPercentage: 46.95
 *                   errors:
 *                     - field: totalIncome
 *                       detail: 'Distributed amount is 1300, but the budget total income is 2450.75. Remaining amount: 1150.75.'
 *       400:
 *         description: Invalid payload such as negative amounts or malformed fields.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget or category not found for the user.
 *       409:
 *         description: The budget is no longer draft, a category is duplicated, or a business rule blocks the replacement.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id/lines/bulk', validate(replaceBudgetLinesSchema), BudgetController.replaceLines);

/**
 * @swagger
 * /api/budgets/{id}/validation:
 *   get:
 *     summary: Validate whether a budget can be finalized
 *     description: Calculates whether the planning phase is complete. The response explains if the budget has lines, whether the distributed amount matches `totalIncome`, whether the percentages total exactly `100`, and whether any stored lines now reference invalid categories.
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Validation result returned regardless of whether the budget is currently valid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetValidation'
 *             example:
 *               message: Budget validation calculated successfully.
 *               data:
 *                 isValid: true
 *                 distributedAmount: 2450.75
 *                 distributedPercentage: 100
 *                 remainingAmount: 0
 *                 remainingPercentage: 0
 *                 errors: []
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget not found.
 */
router.get('/:id/validation', validate(getBudgetSchema), BudgetController.validate);

/**
 * @swagger
 * /api/budgets/{id}/finalize:
 *   post:
 *     summary: Finalize a budget
 *     description: Moves a budget from `draft` to `finalized` when the planning phase is complete. Finalization does not create transactions and does not fund the budget yet. It only freezes planning until the funding plan is prepared.
 *     tags: [Budgets]
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
 *             $ref: '#/components/schemas/BudgetFinalizeRequest'
 *           example:
 *             userId: 1
 *     responses:
 *       200:
 *         description: Budget finalized successfully. The next step is saving the funding plan and executing funding.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetSummary'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget not found.
 *       409:
 *         description: The budget is not draft or the planning totals are still incomplete.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/finalize', validate(finalizeBudgetSchema), BudgetController.finalize);

/**
 * @swagger
 * /api/budgets/{id}/copy-from-previous:
 *   post:
 *     summary: Copy planning lines from a previous budget
 *     description: Copies the latest previous budget for the same user and currency, or a specific `sourceBudgetId` if provided. The copy operation runs in one transaction and replaces the destination lines. The implementation also carries the saved funding source account metadata when it exists so copied envelope assignments stay coherent.
 *     tags: [Budgets]
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
 *             $ref: '#/components/schemas/BudgetCopyRequest'
 *           example:
 *             userId: 1
 *             sourceBudgetId: 14
 *     responses:
 *       200:
 *         description: Destination budget updated with copied lines.
 *         content:
 *           application/json:
 *             example:
 *               message: Budget lines copied successfully from the selected source budget.
 *               data:
 *                 budget:
 *                   id: 18
 *                   userId: 1
 *                   month: '2026-03'
 *                   currency: USD
 *                   totalIncome: 2450.75
 *                   status: draft
 *                   sourceAccountId: 5
 *                 sourceBudgetId: 14
 *                 lines:
 *                   - id: 101
 *                     categoryId: 12
 *                     categoryName: Housing
 *                     amount: 900
 *                     percentage: 36.73
 *                     accountEnvelopeId: 55
 *       403:
 *         description: Source or destination budget belongs to another user.
 *       404:
 *         description: Source budget not found, or there is no earlier budget to copy from.
 *       409:
 *         description: Destination budget is not draft, the source is the same budget, or the currencies do not match.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/:id/copy-from-previous',
  validate(copyBudgetSchema),
  BudgetController.copyFromPrevious,
);

/**
 * @swagger
 * /api/budgets/{id}/funding-options:
 *   get:
 *     summary: Get valid funding options
 *     description: 'Returns the accounts and account envelopes that are valid funding targets for the finalized budget. The query enforces budget currency rules: only active accounts with the same currency as the budget are returned, and only active account envelopes attached to active categories are exposed. No currency conversion happens here.'
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Funding options returned for the current budget lines.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetFundingOptions'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget not found.
 *       409:
 *         description: The budget is still in draft, so funding options are not available yet.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/funding-options', validate(getBudgetSchema), BudgetController.getFundingOptions);

/**
 * @swagger
 * /api/budgets/{id}/funding-plan:
 *   put:
 *     summary: Save the funding plan
 *     description: Saves the single-source funding plan for a finalized budget. The request must include one assignment for every budget line. The API validates ownership, source-account currency, source-account activity, envelope activity, and category matching. Because the current ledger operates with a single selected source account for this workflow, every assigned account envelope must belong to that same source account.
 *     tags: [Budgets]
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
 *             $ref: '#/components/schemas/BudgetFundingPlanRequest'
 *           example:
 *             userId: 1
 *             sourceAccountId: 5
 *             lines:
 *               - budgetLineId: 101
 *                 accountEnvelopeId: 55
 *               - budgetLineId: 102
 *                 accountEnvelopeId: 56
 *     responses:
 *       200:
 *         description: Funding plan saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetFundingPlan'
 *       400:
 *         description: Invalid payload, duplicate budget lines, or incomplete assignment count.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Source account or assigned account envelope was not found for this user.
 *       409:
 *         description: The budget is not finalized, is already funded, currencies do not match, or the envelope/category/source-account rules fail.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id/funding-plan', validate(saveFundingPlanSchema), BudgetController.saveFundingPlan);

/**
 * @swagger
 * /api/budgets/{id}/funding-plan:
 *   get:
 *     summary: Get the saved funding plan
 *     description: Returns the currently saved funding plan, including the selected source account, per-line envelope assignments, friendly account names, and whether the plan is complete enough to execute funding.
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Funding plan returned even if it is still incomplete.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BudgetFundingPlan'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget not found.
 */
router.get('/:id/funding-plan', validate(getFundingPlanSchema), BudgetController.getFundingPlan);

/**
 * @swagger
 * /api/budgets/{id}/fund:
 *   post:
 *     summary: Execute real budget funding
 *     description: Executes the funding phase exactly once. The budget must already be finalized and must have a complete funding plan. The current transaction model requires every transaction line to point to an `account_envelope`, and there is no standalone “unassigned cash” bucket. For that reason this implementation records funding as one atomic `ADJUSTMENT` transaction that seeds the assigned envelopes inside the selected source account. If any validation fails, no transaction lines are inserted and the budget remains unfunded.
 *     tags: [Budgets]
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
 *             $ref: '#/components/schemas/BudgetFundRequest'
 *           example:
 *             userId: 1
 *             description: Fund March budget after payroll deposit
 *     responses:
 *       200:
 *         description: Funding executed successfully and the budget status changed to `funded`.
 *         content:
 *           application/json:
 *             example:
 *               message: Budget funding executed successfully. The ledger records one ADJUSTMENT transaction because the current model does not maintain a separate unassigned-cash bucket.
 *               data:
 *                 budget:
 *                   id: 18
 *                   userId: 1
 *                   month: '2026-03'
 *                   currency: USD
 *                   totalIncome: 2450.75
 *                   status: funded
 *                   sourceAccountId: 5
 *                   linesCount: 6
 *                   distributedAmount: 2450.75
 *                   distributedPercentage: 100
 *                   remainingAmount: 0
 *                   remainingPercentage: 0
 *                 fundingTransactionId: 702
 *                 transactionType: ADJUSTMENT
 *                 postedDate: '2026-03-26'
 *       403:
 *         description: The budget belongs to another user.
 *       404:
 *         description: Budget, source account, or assigned envelope not found.
 *       409:
 *         description: The budget is still draft, already funded, missing assignments, or violates source-account/category/currency rules.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/fund', validate(fundBudgetSchema), BudgetController.fund);

export default router;
