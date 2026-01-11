import { Router } from 'express';
import { AccountController } from '../controllers/account.controller';
import { EnvelopeController } from '../controllers/envelope.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createAccountSchema,
  updateAccountSchema,
  deactivateAccountSchema,
} from '../validators/account.validator';
import { createEnvelopeSchema } from '../validators/envelope.validator';

const router = Router();

/**
 * @swagger
 * /api/accounts:
 *   post:
 *     summary: Create a new account
 *     tags: [Accounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - institutionId
 *               - name
 *               - currency
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 1
 *               institutionId:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: "Checking Account"
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *                 example: "USD"
 *               allowOverdraft:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Account'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Institution not found
 *       409:
 *         description: Institution is inactive
 */
router.post('/', validate(createAccountSchema), AccountController.create);

/**
 * @swagger
 * /api/accounts/{id}:
 *   patch:
 *     summary: Update an account
 *     tags: [Accounts]
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Account Name"
 *     responses:
 *       200:
 *         description: Account updated successfully
 *       404:
 *         description: Account not found
 */
router.patch('/:id', validate(updateAccountSchema), AccountController.update);

/**
 * @swagger
 * /api/accounts/{id}/deactivate:
 *   post:
 *     summary: Deactivate an account
 *     tags: [Accounts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Account deactivated successfully
 *       404:
 *         description: Account not found
 */
router.post('/:id/deactivate', validate(deactivateAccountSchema), AccountController.deactivate);

/**
 * @swagger
 * /api/accounts/{accountId}/envelopes:
 *   post:
 *     summary: Create an envelope (link category to account)
 *     tags: [Envelopes]
 *     parameters:
 *       - in: path
 *         name: accountId
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
 *               - categoryId
 *             properties:
 *               categoryId:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       201:
 *         description: Envelope created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Envelope'
 *       404:
 *         description: Account or category not found
 *       409:
 *         description: Envelope already exists or resource is inactive
 */
router.post('/:accountId/envelopes', validate(createEnvelopeSchema), EnvelopeController.create);

/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: Get all active accounts
 *     tags: [Accounts]
 *     responses:
 *       200:
 *         description: All active accounts successfully retrieved    
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AccountInfo'
 */
router.get('/', AccountController.getAllActive);

export default router;

