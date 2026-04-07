import { Router } from 'express';
import { CashDenominationController } from '../controllers/cash-denomination.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createCashDenominationSchema,
  deactivateCashDenominationSchema,
  listCashDenominationsSchema,
  updateCashDenominationSchema,
} from '../validators/cash-denomination.validator';

const router = Router();

/**
 * @swagger
 * /api/settings/cash-denominations:
 *   get:
 *     summary: List cash denominations configured for a user
 *     description: Returns cash denominations for the requested user, optionally filtered by currency. By default both active and inactive denominations are returned for settings management.
 *     tags: [Cash Denominations]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: currency
 *         required: false
 *         schema:
 *           type: string
 *           example: CRC
 *       - in: query
 *         name: includeInactive
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Cash denomination catalog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CashDenominationList'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', validate(listCashDenominationsSchema), CashDenominationController.list);

/**
 * @swagger
 * /api/settings/cash-denominations:
 *   post:
 *     summary: Create a cash denomination
 *     description: Creates a user-managed denomination. Active denominations cannot be duplicated by user, currency, and nominal value.
 *     tags: [Cash Denominations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCashDenominationRequest'
 *           example:
 *             userId: 1
 *             currency: CRC
 *             value: 500
 *             type: COIN
 *             label: ₡500
 *             sortOrder: 6
 *             isActive: true
 *     responses:
 *       201:
 *         description: Denomination created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CashDenomination'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Duplicate active denomination
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', validate(createCashDenominationSchema), CashDenominationController.create);

/**
 * @swagger
 * /api/settings/cash-denominations/{id}:
 *   put:
 *     summary: Update a cash denomination
 *     description: Updates value, type, label, sort order, and active status for a denomination owned by the user.
 *     tags: [Cash Denominations]
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
 *             $ref: '#/components/schemas/UpdateCashDenominationRequest'
 *     responses:
 *       200:
 *         description: Denomination updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CashDenomination'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Denomination or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Denomination does not belong to the user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Duplicate active denomination
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', validate(updateCashDenominationSchema), CashDenominationController.update);

/**
 * @swagger
 * /api/settings/cash-denominations/{id}:
 *   delete:
 *     summary: Deactivate a cash denomination
 *     description: Performs a soft delete by setting the denomination as inactive. Historical reconciliations are preserved.
 *     tags: [Cash Denominations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Denomination deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CashDenomination'
 *       404:
 *         description: Denomination or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Denomination does not belong to the user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/:id',
  validate(deactivateCashDenominationSchema),
  CashDenominationController.deactivate,
);

export default router;
