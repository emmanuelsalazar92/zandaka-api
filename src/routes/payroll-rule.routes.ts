import { Router } from 'express';
import { PayrollRuleController } from '../controllers/payroll-rule.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createPayrollCcssRuleSchema,
  createPayrollIncomeTaxRuleSchema,
  deactivatePayrollRuleSchema,
  getActivePayrollRuleSchema,
  getPayrollRuleByIdSchema,
  listPayrollRuleHistorySchema,
  updatePayrollRuleSchema,
} from '../validators/payroll.validator';

const router = Router();

/**
 * @swagger
 * /api/payroll-rules/active:
 *   get:
 *     summary: Get the active payroll rule set for a specific date
 *     description: >
 *       Resolves the active rule set for a user, rule type, and period date using the validity window:
 *       `effective_from <= date` and `(effective_to is null OR effective_to >= date)` while `is_active = 1`.
 *       If the user has never configured payroll rules before, the backend auto-seeds Costa Rica 2026 defaults
 *       the first time this payroll module is used.
 *     tags: [Payroll Rules]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [CCSS_WORKER, INCOME_TAX]
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Active rule set resolved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleSet'
 *       400:
 *         description: Invalid query parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found or no active rule applies for that date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/active', validate(getActivePayrollRuleSchema), PayrollRuleController.getActive);

/**
 * @swagger
 * /api/payroll-rules/history:
 *   get:
 *     summary: List payroll rule set history
 *     description: Returns historical rule set versions ordered by `effective_from DESC`. Use this endpoint in Settings to review past and future payroll configurations.
 *     tags: [Payroll Rules]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [CCSS_WORKER, INCOME_TAX]
 *     responses:
 *       200:
 *         description: Payroll rule history returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleHistory'
 *       400:
 *         description: Invalid query parameters.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/history', validate(listPayrollRuleHistorySchema), PayrollRuleController.history);

/**
 * @swagger
 * /api/payroll-rules/ccss:
 *   post:
 *     summary: Create a CCSS worker rule set version
 *     description: Creates a versioned `CCSS_WORKER` rule set for a user. The backend blocks overlapping active validity ranges of the same rule type.
 *     tags: [Payroll Rules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePayrollCcssRuleRequest'
 *           example:
 *             user_id: 1
 *             name: CCSS Worker 2026
 *             effective_from: '2026-01-01'
 *             effective_to: null
 *             employee_rate: 0.1083
 *             employer_rate: null
 *             base_type: GROSS_SALARY
 *     responses:
 *       201:
 *         description: Payroll rule set created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleSet'
 *       400:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Active validity overlap detected.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/ccss', validate(createPayrollCcssRuleSchema), PayrollRuleController.createCcss);

/**
 * @swagger
 * /api/payroll-rules/income-tax:
 *   post:
 *     summary: Create an income tax rule set version
 *     description: >
 *       Creates a versioned `INCOME_TAX` rule set with progressive brackets.
 *       Brackets use a lower-inclusive, upper-exclusive convention:
 *       `[amount_from, amount_to)` and the final open range is `[amount_from, +inf)`.
 *       This avoids `0.01` boundary hacks and keeps threshold math deterministic.
 *     tags: [Payroll Rules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePayrollIncomeTaxRuleRequest'
 *     responses:
 *       201:
 *         description: Payroll rule set created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleSet'
 *       400:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found.
 *       409:
 *         description: Active validity overlap detected.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/income-tax',
  validate(createPayrollIncomeTaxRuleSchema),
  PayrollRuleController.createIncomeTax,
);

/**
 * @swagger
 * /api/payroll-rules/{id}:
 *   get:
 *     summary: Get one payroll rule set version with detail
 *     description: Returns the rule set header plus its CCSS detail or progressive income-tax brackets.
 *     tags: [Payroll Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rule set returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleSet'
 *       400:
 *         description: Invalid path or query parameters.
 *       404:
 *         description: Rule set not found for the user.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', validate(getPayrollRuleByIdSchema), PayrollRuleController.getById);

/**
 * @swagger
 * /api/payroll-rules/{id}:
 *   put:
 *     summary: Update a payroll rule set version
 *     description: >
 *       Updates name, validity, activation state, and the corresponding detail payload.
 *       `rule_type` itself is immutable. When brackets are replaced, the entire progressive table is rewritten atomically.
 *     tags: [Payroll Rules]
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
 *             $ref: '#/components/schemas/UpdatePayrollRuleRequest'
 *     responses:
 *       200:
 *         description: Rule set updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleSet'
 *       400:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User or rule set not found.
 *       409:
 *         description: Overlap or consistency conflict.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', validate(updatePayrollRuleSchema), PayrollRuleController.update);

/**
 * @swagger
 * /api/payroll-rules/{id}:
 *   delete:
 *     summary: Deactivate a payroll rule set version
 *     description: >
 *       Performs a soft delete by setting `is_active = 0`. Historical budgets and report snapshots keep their original rule references.
 *       This endpoint never physically deletes the row because payroll rules are versioned business records.
 *     tags: [Payroll Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rule set deactivated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollRuleSet'
 *       404:
 *         description: User or rule set not found.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', validate(deactivatePayrollRuleSchema), PayrollRuleController.deactivate);

export default router;
