import { Router } from 'express';
import { PayrollController } from '../controllers/payroll.controller';
import { validate } from '../middlewares/validator.middleware';
import { calculateNetSalarySchema } from '../validators/payroll.validator';

const router = Router();

/**
 * @swagger
 * /api/payroll/calculate-net-salary:
 *   post:
 *     summary: Calculate net salary using versioned payroll rules
 *     description: >
 *       Resolves the active CCSS worker rate and progressive income-tax brackets for `period_date`,
 *       calculates the worker CCSS amount, uses `gross_salary` as the income-tax base,
 *       applies progressive tax bracket by bracket,
 *       and returns the final net salary plus a tax breakdown and the exact rule set ids used.
 *     tags: [Payroll]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CalculateNetSalaryRequest'
 *           example:
 *             user_id: 1
 *             gross_salary: 1500000
 *             period_date: '2026-04-01'
 *     responses:
 *       200:
 *         description: Net salary calculated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NetSalaryCalculation'
 *       400:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found or no active payroll rule applies for the requested date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: The resolved rule set is structurally inconsistent.
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
  '/calculate-net-salary',
  validate(calculateNetSalarySchema),
  PayrollController.calculateNetSalary,
);

export default router;
