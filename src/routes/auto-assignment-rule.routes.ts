import { Router } from 'express';
import { AutoAssignmentRuleController } from '../controllers/auto-assignment-rule.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createAutoAssignmentRuleSchema,
  deleteAutoAssignmentRuleSchema,
  getAutoAssignmentRuleSchema,
  listAutoAssignmentRulesSchema,
  testAutoAssignmentRuleSchema,
  updateAutoAssignmentRuleSchema,
  updateAutoAssignmentRuleStatusSchema,
} from '../validators/auto-assignment-rule.validator';

const router = Router();

/**
 * @swagger
 * /api/auto-assignment-rules:
 *   get:
 *     summary: List auto assignment rules
 *     tags: [Auto Assignment Rules]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Auto assignment rules
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AutoAssignmentRule'
 */
router.get('/', validate(listAutoAssignmentRulesSchema), AutoAssignmentRuleController.list);

/**
 * @swagger
 * /api/auto-assignment-rules/test:
 *   post:
 *     summary: Test a description against active auto assignment rules
 *     tags: [Auto Assignment Rules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AutoAssignmentRuleTestRequest'
 *     responses:
 *       200:
 *         description: Rule test result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AutoAssignmentRuleTestResult'
 */
router.post('/test', validate(testAutoAssignmentRuleSchema), AutoAssignmentRuleController.test);

/**
 * @swagger
 * /api/auto-assignment-rules/{id}:
 *   get:
 *     summary: Get an auto assignment rule by ID
 *     tags: [Auto Assignment Rules]
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
 *         description: Auto assignment rule found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AutoAssignmentRule'
 *       404:
 *         description: Rule not found
 */
router.get('/:id', validate(getAutoAssignmentRuleSchema), AutoAssignmentRuleController.getById);

/**
 * @swagger
 * /api/auto-assignment-rules:
 *   post:
 *     summary: Create an auto assignment rule
 *     tags: [Auto Assignment Rules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAutoAssignmentRuleRequest'
 *     responses:
 *       201:
 *         description: Rule created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AutoAssignmentRule'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Account or envelope not found
 *       409:
 *         description: Inactive or inconsistent targets
 */
router.post('/', validate(createAutoAssignmentRuleSchema), AutoAssignmentRuleController.create);

/**
 * @swagger
 * /api/auto-assignment-rules/{id}:
 *   put:
 *     summary: Update an auto assignment rule
 *     tags: [Auto Assignment Rules]
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
 *             $ref: '#/components/schemas/UpdateAutoAssignmentRuleRequest'
 *     responses:
 *       200:
 *         description: Rule updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AutoAssignmentRule'
 */
router.put('/:id', validate(updateAutoAssignmentRuleSchema), AutoAssignmentRuleController.update);

/**
 * @swagger
 * /api/auto-assignment-rules/{id}/status:
 *   patch:
 *     summary: Activate or deactivate an auto assignment rule
 *     tags: [Auto Assignment Rules]
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
 *             required: [userId, isActive]
 *             properties:
 *               userId:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Rule status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AutoAssignmentRule'
 */
router.patch(
  '/:id/status',
  validate(updateAutoAssignmentRuleStatusSchema),
  AutoAssignmentRuleController.updateStatus,
);

/**
 * @swagger
 * /api/auto-assignment-rules/{id}:
 *   delete:
 *     summary: Soft delete an auto assignment rule
 *     description: This endpoint disables the rule by setting is_active = 0.
 *     tags: [Auto Assignment Rules]
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
 *       204:
 *         description: Rule deactivated successfully
 */
router.delete(
  '/:id',
  validate(deleteAutoAssignmentRuleSchema),
  AutoAssignmentRuleController.remove,
);

export default router;
