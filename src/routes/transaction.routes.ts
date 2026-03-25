import { Router } from 'express';
import { TransactionController } from '../controllers/transaction.controller';
import { validate } from '../middlewares/validator.middleware';
import {
  createTransactionSchema,
  getTransactionsSchema,
} from '../validators/transaction.validator';

const router = Router();

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Create a new transaction
 *     description: Creates a transaction with one or more lines. For TRANSFER type, must have exactly 2 lines that sum to zero. For INCOME, all line amounts must be positive. For EXPENSE, all line amounts must be negative.
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - date
 *               - type
 *               - description
 *               - lines
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 1
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-15"
 *               type:
 *                 type: string
 *                 enum: [INCOME, EXPENSE, TRANSFER, ADJUSTMENT]
 *                 example: "TRANSFER"
 *               description:
 *                 type: string
 *                 example: "Transfer from checking to savings"
 *               lines:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - accountId
 *                     - envelopeId
 *                     - amount
 *                   properties:
 *                     accountId:
 *                       type: integer
 *                       example: 1
 *                     envelopeId:
 *                       type: integer
 *                       example: 10
 *                     amount:
 *                       type: number
 *                       example: -50000
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transaction:
 *                   $ref: '#/components/schemas/Transaction'
 *                 lines:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               expensePositive:
 *                 summary: Expense must be negative
 *                 value:
 *                   error:
 *                     code: VALIDATION_ERROR
 *                     message: EXPENSE transaction lines must have negative amounts
 *                     details:
 *                       - field: lines
 *                         accountId: 1
 *                         envelopeId: 10
 *                         amount: 100
 *               incomeNegative:
 *                 summary: Income must be positive
 *                 value:
 *                   error:
 *                     code: VALIDATION_ERROR
 *                     message: INCOME transaction lines must have positive amounts
 *                     details:
 *                       - field: lines
 *                         accountId: 1
 *                         envelopeId: 10
 *                         amount: -100
 *               transferLineCount:
 *                 summary: Transfer requires exactly 2 lines
 *                 value:
 *                   error:
 *                     code: VALIDATION_ERROR
 *                     message: TRANSFER transactions must have exactly 2 lines
 *                     details: []
 *               transferNotBalanced:
 *                 summary: Transfer lines must sum to zero
 *                 value:
 *                   error:
 *                     code: VALIDATION_ERROR
 *                     message: TRANSFER transaction lines must sum to zero
 *                     details: []
 *       404:
 *         description: Resource not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               accountMissing:
 *                 summary: Account not found
 *                 value:
 *                   error:
 *                     code: NOT_FOUND
 *                     message: Account 1 not found
 *                     details:
 *                       - field: lines
 *                         accountId: 1
 *               envelopeMissing:
 *                 summary: Envelope not found
 *                 value:
 *                   error:
 *                     code: NOT_FOUND
 *                     message: Envelope 10 not found
 *                     details:
 *                       - field: lines
 *                         envelopeId: 10
 *               categoryMissing:
 *                 summary: Category not found
 *                 value:
 *                   error:
 *                     code: NOT_FOUND
 *                     message: Category 5 not found
 *                     details: []
 *       409:
 *         description: Inactive resource or conflict
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               inactiveAccount:
 *                 summary: Account inactive
 *                 value:
 *                   error:
 *                     code: INACTIVE_RESOURCE
 *                     message: Account 1 is inactive
 *                     details:
 *                       - field: lines
 *                         accountId: 1
 *               inactiveEnvelope:
 *                 summary: Envelope inactive
 *                 value:
 *                   error:
 *                     code: INACTIVE_RESOURCE
 *                     message: Envelope 10 is inactive
 *                     details:
 *                       - field: lines
 *                         envelopeId: 10
 *               inactiveCategory:
 *                 summary: Category inactive
 *                 value:
 *                   error:
 *                     code: INACTIVE_RESOURCE
 *                     message: Category 5 is inactive
 *                     details: []
 *               inactiveInstitution:
 *                 summary: Institution inactive
 *                 value:
 *                   error:
 *                     code: INACTIVE_RESOURCE
 *                     message: Institution 2 is inactive
 *                     details: []
 */
router.post('/', validate(createTransactionSchema), TransactionController.create);

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: List transactions with filters
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: Filter by account ID
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *         description: Filter by category ID
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search in description
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [INCOME, EXPENSE, TRANSFER, ADJUSTMENT, ALL]
 *         description: Filter by transaction type (use ALL for no filter)
 *       - in: query
 *         name: amountMin
 *         schema:
 *           type: number
 *           default: 0
 *         description: Minimum transaction amount
 *       - in: query
 *         name: amountMax
 *         schema:
 *           type: number
 *         description: Maximum transaction amount
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           enum: [10, 25, 50, 100]
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, amount, createdAt]
 *           default: date
 *         description: Sort field
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: List of transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       userId:
 *                         type: integer
 *                       date:
 *                         type: string
 *                         format: date
 *                       description:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [INCOME, EXPENSE, TRANSFER, ADJUSTMENT]
 *                       accountId:
 *                         type: integer
 *                         nullable: true
 *                       accountName:
 *                         type: string
 *                         nullable: true
 *                       accountCurrency:
 *                         type: string
 *                         nullable: true
 *                       categoryId:
 *                         type: integer
 *                         nullable: true
 *                       categoryName:
 *                         type: string
 *                         nullable: true
 *                       amount:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lines:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             transactionId:
 *                               type: integer
 *                             accountId:
 *                               type: integer
 *                             accountName:
 *                               type: string
 *                               nullable: true
 *                             accountCurrency:
 *                               type: string
 *                               nullable: true
 *                             envelopeId:
 *                               type: integer
 *                             categoryId:
 *                               type: integer
 *                               nullable: true
 *                             categoryName:
 *                               type: string
 *                               nullable: true
 *                             amount:
 *                               type: number
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     pageSize:
 *                       type: integer
 *                     totalItems:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 */
router.get('/', validate(getTransactionsSchema), TransactionController.list);

export default router;
